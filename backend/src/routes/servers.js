import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'ssh2';
import { createServer, getServers, getServer, deleteServer } from '../models/database.js';

const router = express.Router();

// List all servers
router.get('/', (req, res) => {
  try {
    const servers = getServers();
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single server
router.get('/:id', (req, res) => {
  try {
    const server = getServer(req.params.id);
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
      name,
      host,
      port: port || 22,
      username,
      authType: authType || 'password',
      password: password || null,
      privateKey: privateKey || null,
      deployPath: deployPath || '/home'
    });

    const server = getServer(id);
    const { password: _, private_key, ...safeServer } = server;
    res.status(201).json(safeServer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete server
router.delete('/:id', (req, res) => {
  try {
    const server = getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    deleteServer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test server connection
router.post('/:id/test', async (req, res) => {
  try {
    const server = getServer(req.params.id);
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
    const server = getServer(req.params.id);
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

export default router;
