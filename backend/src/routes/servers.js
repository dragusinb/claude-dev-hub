import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'ssh2';
import { createServer, getServers, getServer, deleteServer, getServerHealthHistory, updateServer } from '../models/database.js';

const router = express.Router();

// List all servers
router.get('/', (req, res) => {
  try {
    const servers = getServers(req.user.id);
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single server
router.get('/:id', (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }
    // Don't send password/private key
    const { password, private_key, ...safeServer } = server;
    res.json(safeServer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new server
router.post('/', (req, res) => {
  try {
    const { name, host, port, username, authType, password, privateKey, deployPath } = req.body;

    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required' });
    }

    const id = uuidv4();
    createServer({
      id,
      userId: req.user.id,
      name,
      host,
      port: port || 22,
      username,
      authType: authType || 'password',
      password: password || null,
      privateKey: privateKey || null,
      deployPath: deployPath || '/home'
    });

    const server = getServer(id, req.user.id);
    const { password: _, private_key, ...safeServer } = server;
    res.status(201).json(safeServer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update server
router.patch('/:id', (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { name, host, port, username, authType, password, privateKey, deployPath } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (host !== undefined) updates.host = host;
    if (port !== undefined) updates.port = port;
    if (username !== undefined) updates.username = username;
    if (authType !== undefined) updates.authType = authType;
    if (password !== undefined) updates.password = password;
    if (privateKey !== undefined) updates.privateKey = privateKey;
    if (deployPath !== undefined) updates.deployPath = deployPath;

    updateServer(req.params.id, req.user.id, updates);

    const updated = getServer(req.params.id, req.user.id);
    const { password: _, private_key, ...safeServer } = updated;
    res.json(safeServer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete server
router.delete('/:id', (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    deleteServer(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test server connection
router.post('/:id/test', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const conn = new Client();

    const connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        conn.exec('echo "Connection successful"', (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          let output = '';
          stream.on('data', (data) => {
            output += data.toString();
          });
          stream.on('close', () => {
            conn.end();
            resolve(output.trim());
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const config = {
      host: server.host,
      port: server.port,
      username: server.username
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    conn.connect(config);

    const result = await connectionPromise;
    res.json({ success: true, message: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute command on server
router.post('/:id/exec', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    const conn = new Client();

    const execPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Command timeout'));
      }, 60000);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data) => {
            stdout += data.toString();
          });
          stream.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          stream.on('close', (code) => {
            clearTimeout(timeout);
            conn.end();
            resolve({ stdout, stderr, exitCode: code });
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const config = {
      host: server.host,
      port: server.port,
      username: server.username
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    conn.connect(config);

    const result = await execPromise;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get server health stats (CPU, memory, disk)
router.get('/:id/health', async (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const conn = new Client();

    const healthPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('Connection timeout'));
      }, 15000);

      conn.on('ready', () => {
        // Run multiple commands to get system stats
        const commands = `
          echo "===CPU==="
          top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
          echo "===MEMORY==="
          free -m | awk 'NR==2{printf "%s %s %s", $2, $3, $4}'
          echo "===DISK==="
          df -h / | awk 'NR==2{printf "%s %s %s %s", $2, $3, $4, $5}'
          echo "===UPTIME==="
          uptime -p
          echo "===LOAD==="
          cat /proc/loadavg | awk '{print $1, $2, $3}'
        `;

        conn.exec(commands, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            reject(err);
            return;
          }

          let output = '';
          stream.on('data', (data) => {
            output += data.toString();
          });
          stream.on('close', () => {
            clearTimeout(timeout);
            conn.end();

            // Parse the output
            const sections = output.split('===');
            const stats = {};

            for (let i = 0; i < sections.length; i++) {
              const section = sections[i].trim();
              if (section.startsWith('CPU')) {
                const cpuValue = sections[i + 1]?.trim();
                stats.cpu = parseFloat(cpuValue) || 0;
              } else if (section.startsWith('MEMORY')) {
                const memParts = sections[i + 1]?.trim().split(' ');
                if (memParts && memParts.length >= 3) {
                  stats.memory = {
                    total: parseInt(memParts[0]) || 0,
                    used: parseInt(memParts[1]) || 0,
                    free: parseInt(memParts[2]) || 0,
                    percent: memParts[0] > 0 ? Math.round((memParts[1] / memParts[0]) * 100) : 0
                  };
                }
              } else if (section.startsWith('DISK')) {
                const diskParts = sections[i + 1]?.trim().split(' ');
                if (diskParts && diskParts.length >= 4) {
                  stats.disk = {
                    total: diskParts[0],
                    used: diskParts[1],
                    free: diskParts[2],
                    percent: parseInt(diskParts[3]) || 0
                  };
                }
              } else if (section.startsWith('UPTIME')) {
                stats.uptime = sections[i + 1]?.trim() || 'Unknown';
              } else if (section.startsWith('LOAD')) {
                const loadParts = sections[i + 1]?.trim().split(' ');
                if (loadParts && loadParts.length >= 3) {
                  stats.load = {
                    one: parseFloat(loadParts[0]) || 0,
                    five: parseFloat(loadParts[1]) || 0,
                    fifteen: parseFloat(loadParts[2]) || 0
                  };
                }
              }
            }

            resolve(stats);
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const config = {
      host: server.host,
      port: server.port,
      username: server.username
    };

    if (server.auth_type === 'password') {
      config.password = server.password;
    } else {
      config.privateKey = server.private_key;
    }

    conn.connect(config);

    const stats = await healthPromise;
    res.json({
      success: true,
      server: { id: server.id, name: server.name, host: server.host },
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get server health history for graphs
router.get('/:id/health/history', (req, res) => {
  try {
    const server = getServer(req.params.id, req.user.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const hours = parseInt(req.query.hours) || 24;
    const history = getServerHealthHistory(server.id, hours);

    res.json({
      success: true,
      server: { id: server.id, name: server.name, host: server.host },
      history,
      hours
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
