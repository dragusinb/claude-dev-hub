import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { createSvnCredential, getSvnCredentials, getSvnCredential, deleteSvnCredential, createProject, getProject } from '../models/database.js';

const router = express.Router();
const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects');

// List all SVN credentials
router.get('/credentials', (req, res) => {
  try {
    const credentials = getSvnCredentials(req.user.id);
    res.json(credentials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single SVN credential
router.get('/credentials/:id', (req, res) => {
  try {
    const credential = getSvnCredential(req.params.id, req.user.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    // Don't send password
    const { password, ...safeCred } = credential;
    res.json(safeCred);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new SVN credential
router.post('/credentials', (req, res) => {
  try {
    const { name, url, username, password } = req.body;

    if (!name || !url || !username || !password) {
      return res.status(400).json({ error: 'Name, URL, username, and password are required' });
    }

    const id = uuidv4();
    createSvnCredential({
      id,
      userId: req.user.id,
      name,
      url,
      username,
      password
    });

    const credential = getSvnCredential(id, req.user.id);
    const { password: _, ...safeCred } = credential;
    res.status(201).json(safeCred);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete SVN credential
router.delete('/credentials/:id', (req, res) => {
  try {
    const credential = getSvnCredential(req.params.id, req.user.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    deleteSvnCredential(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test SVN connection
router.post('/credentials/:id/test', async (req, res) => {
  try {
    const credential = getSvnCredential(req.params.id, req.user.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Try to list the SVN repository
    const cmd = `svn list "${credential.url}" --username "${credential.username}" --password "${credential.password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other`;

    try {
      await execAsync(cmd, { timeout: 30000 });
      res.json({ success: true, message: 'Connection successful' });
    } catch (err) {
      res.json({ success: false, error: err.message || 'Connection failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List SVN repositories/folders
router.get('/credentials/:id/repos', async (req, res) => {
  try {
    const credential = getSvnCredential(req.params.id, req.user.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const subPath = req.query.path || '';
    const fullUrl = subPath ? `${credential.url}/${subPath}` : credential.url;

    const cmd = `svn list "${fullUrl}" --username "${credential.username}" --password "${credential.password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other`;

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const items = stdout.trim().split('\n').filter(Boolean).map(item => ({
        name: item.replace(/\/$/, ''),
        type: item.endsWith('/') ? 'directory' : 'file',
        path: subPath ? `${subPath}/${item.replace(/\/$/, '')}` : item.replace(/\/$/, '')
      }));
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to list repository' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checkout SVN repository and create project
router.post('/checkout', async (req, res) => {
  try {
    const { credentialId, svnPath, projectName, description } = req.body;

    if (!credentialId || !projectName) {
      return res.status(400).json({ error: 'Credential ID and project name are required' });
    }

    const credential = getSvnCredential(credentialId, req.user.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const projectId = uuidv4();
    const localPath = path.join(PROJECTS_DIR, projectId);
    const svnUrl = svnPath ? `${credential.url}/${svnPath}` : credential.url;

    // Ensure projects directory exists
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }

    // Checkout the repository
    const cmd = `svn checkout "${svnUrl}" "${localPath}" --username "${credential.username}" --password "${credential.password}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other`;

    console.log(`Checking out ${svnUrl} to ${localPath}`);
    await execAsync(cmd, { timeout: 300000 }); // 5 minute timeout for checkout

    // Create the project in the database
    createProject({
      id: projectId,
      userId: req.user.id,
      name: projectName,
      gitUrl: svnUrl, // Store SVN URL in git_url field
      localPath: localPath,
      description: description || `SVN project from ${svnUrl}`,
      targetServerId: null
    });

    const project = getProject(projectId, req.user.id);
    res.status(201).json(project);
  } catch (err) {
    console.error('SVN checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SVN update (like git pull)
router.post('/update/:projectPath', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);

    if (!projectPath.startsWith(PROJECTS_DIR)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    const cmd = `svn update "${projectPath}" --non-interactive --trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other`;

    try {
      const { stdout } = await execAsync(cmd, { timeout: 120000 });
      res.json({ success: true, output: stdout });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Update failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SVN status
router.get('/status/:projectPath', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);

    if (!projectPath.startsWith(PROJECTS_DIR)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    const cmd = `svn status "${projectPath}"`;

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      res.json({ status: stdout });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Status failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SVN info
router.get('/info/:projectPath', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);

    if (!projectPath.startsWith(PROJECTS_DIR)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    const cmd = `svn info "${projectPath}"`;

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      // Parse SVN info output
      const info = {};
      stdout.split('\n').forEach(line => {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          info[match[1].trim()] = match[2].trim();
        }
      });
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: err.message || 'Info failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
