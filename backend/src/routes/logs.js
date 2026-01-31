import express from 'express';
import { Client } from 'ssh2';
import { getServer } from '../models/database.js';

const router = express.Router();

// Common log file locations
const LOG_LOCATIONS = {
  nginx_access: '/var/log/nginx/access.log',
  nginx_error: '/var/log/nginx/error.log',
  apache_access: '/var/log/apache2/access.log',
  apache_error: '/var/log/apache2/error.log',
  syslog: '/var/log/syslog',
  auth: '/var/log/auth.log',
  pm2: '/root/.pm2/logs',
  journal: 'journalctl'
};

// Check if server is local
function isLocalServer(server) {
  return server.is_local === 1 ||
         server.host === 'localhost' ||
         server.host === '127.0.0.1' ||
         server.name?.toLowerCase().includes('claude dev hub server');
}

// Execute command locally
function executeLocally(command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout);

    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      clearTimeout(timer);
      if (err && !stdout) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

// Execute command via SSH
function executeSSH(server, command, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });

        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();
          if (errorOutput && !output) {
            reject(new Error(errorOutput));
          } else {
            resolve(output);
          }
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    const config = {
      host: server.host,
      port: server.port || 22,
      username: server.username
    };

    if (server.auth_type === 'key' && server.private_key) {
      config.privateKey = server.private_key;
    } else {
      config.password = server.password;
    }

    conn.connect(config);
  });
}

// Execute command on server (local or remote)
async function executeOnServer(server, command) {
  if (isLocalServer(server)) {
    return executeLocally(command);
  }
  return executeSSH(server, command);
}

// GET /api/logs/servers/:id/files - List available log files
router.get('/servers/:id/files', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check which log files exist
    const checkCommand = `
      echo "nginx_access:$(test -f /var/log/nginx/access.log && echo 'exists' || echo 'missing')"
      echo "nginx_error:$(test -f /var/log/nginx/error.log && echo 'exists' || echo 'missing')"
      echo "apache_access:$(test -f /var/log/apache2/access.log && echo 'exists' || echo 'missing')"
      echo "apache_error:$(test -f /var/log/apache2/error.log && echo 'exists' || echo 'missing')"
      echo "syslog:$(test -f /var/log/syslog && echo 'exists' || echo 'missing')"
      echo "auth:$(test -f /var/log/auth.log && echo 'exists' || echo 'missing')"
      echo "pm2:$(test -d /root/.pm2/logs && echo 'exists' || echo 'missing')"
      echo "journal:$(which journalctl >/dev/null 2>&1 && echo 'exists' || echo 'missing')"
    `;

    const output = await executeOnServer(server, checkCommand);
    const files = [];

    output.split('\n').forEach(line => {
      const [name, status] = line.split(':');
      if (status?.trim() === 'exists') {
        files.push({
          id: name.trim(),
          name: name.trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          path: LOG_LOCATIONS[name.trim()] || name.trim()
        });
      }
    });

    // If PM2 exists, list individual log files
    if (files.find(f => f.id === 'pm2')) {
      try {
        const pm2Output = await executeOnServer(server, 'ls -1 /root/.pm2/logs/*.log 2>/dev/null | head -20');
        const pm2Files = pm2Output.split('\n').filter(f => f.trim());

        // Remove generic pm2 entry and add specific files
        const pm2Index = files.findIndex(f => f.id === 'pm2');
        if (pm2Index > -1) files.splice(pm2Index, 1);

        pm2Files.forEach(filePath => {
          const fileName = filePath.split('/').pop();
          files.push({
            id: `pm2_${fileName.replace('.log', '')}`,
            name: `PM2: ${fileName.replace('.log', '').replace(/-/g, ' ')}`,
            path: filePath
          });
        });
      } catch (e) {
        // Keep generic pm2 entry if listing fails
      }
    }

    res.json({ files });
  } catch (err) {
    console.error('Error listing log files:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/servers/:id/tail - Tail a log file
router.get('/servers/:id/tail', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { file, lines = 100 } = req.query;
    if (!file) {
      return res.status(400).json({ error: 'File parameter required' });
    }

    // Sanitize lines parameter
    const numLines = Math.min(Math.max(parseInt(lines) || 100, 10), 1000);

    let command;
    if (file === 'journal') {
      command = `journalctl -n ${numLines} --no-pager`;
    } else if (file.startsWith('pm2_')) {
      const logFile = `/root/.pm2/logs/${file.replace('pm2_', '')}.log`;
      command = `tail -n ${numLines} "${logFile}" 2>/dev/null || echo "Log file not found"`;
    } else {
      const logPath = LOG_LOCATIONS[file];
      if (!logPath) {
        return res.status(400).json({ error: 'Invalid log file' });
      }
      command = `tail -n ${numLines} "${logPath}" 2>/dev/null || echo "Log file not found or empty"`;
    }

    const output = await executeOnServer(server, command);

    res.json({
      server: { id: server.id, name: server.name },
      file,
      lines: numLines,
      content: output,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error tailing log file:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/servers/:id/search - Search in log files
router.get('/servers/:id/search', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { file, query, lines = 100 } = req.query;
    if (!file || !query) {
      return res.status(400).json({ error: 'File and query parameters required' });
    }

    // Sanitize query - escape special characters
    const safeQuery = query.replace(/['"\\]/g, '\\$&');
    const numLines = Math.min(Math.max(parseInt(lines) || 100, 10), 500);

    let command;
    if (file === 'journal') {
      command = `journalctl --no-pager | grep -i "${safeQuery}" | tail -n ${numLines}`;
    } else if (file.startsWith('pm2_')) {
      const logFile = `/root/.pm2/logs/${file.replace('pm2_', '')}.log`;
      command = `grep -i "${safeQuery}" "${logFile}" 2>/dev/null | tail -n ${numLines}`;
    } else {
      const logPath = LOG_LOCATIONS[file];
      if (!logPath) {
        return res.status(400).json({ error: 'Invalid log file' });
      }
      command = `grep -i "${safeQuery}" "${logPath}" 2>/dev/null | tail -n ${numLines}`;
    }

    const output = await executeOnServer(server, command);
    const matchCount = output.split('\n').filter(l => l.trim()).length;

    res.json({
      server: { id: server.id, name: server.name },
      file,
      query,
      matches: matchCount,
      content: output || 'No matches found',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error searching log file:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/servers/:id/download - Download a log file
router.get('/servers/:id/download', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { file, lines = 10000 } = req.query;
    if (!file) {
      return res.status(400).json({ error: 'File parameter required' });
    }

    const numLines = Math.min(Math.max(parseInt(lines) || 10000, 100), 100000);

    let command;
    let filename;

    if (file === 'journal') {
      command = `journalctl -n ${numLines} --no-pager`;
      filename = `journal-${server.name}.log`;
    } else if (file.startsWith('pm2_')) {
      const logName = file.replace('pm2_', '');
      const logFile = `/root/.pm2/logs/${logName}.log`;
      command = `tail -n ${numLines} "${logFile}"`;
      filename = `${logName}-${server.name}.log`;
    } else {
      const logPath = LOG_LOCATIONS[file];
      if (!logPath) {
        return res.status(400).json({ error: 'Invalid log file' });
      }
      command = `tail -n ${numLines} "${logPath}"`;
      filename = `${file}-${server.name}.log`;
    }

    const output = await executeOnServer(server, command);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(output);
  } catch (err) {
    console.error('Error downloading log file:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
