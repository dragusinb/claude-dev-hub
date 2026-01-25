import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { simpleGit } from 'simple-git';
import { createProject, getProjects, getProject, updateProject, deleteProject } from '../models/database.js';

const router = express.Router();
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// List all projects
router.get('/', (req, res) => {
  try {
    const projects = getProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project
router.get('/:id', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new project (clone from git)
router.post('/', async (req, res) => {
  try {
    const { name, gitUrl, description, targetServerId } = req.body;

    if (!name || !gitUrl) {
      return res.status(400).json({ error: 'Name and gitUrl are required' });
    }

    const id = uuidv4();
    const localPath = path.join(PROJECTS_DIR, id);

    // Clone the repository
    console.log(`Cloning ${gitUrl} to ${localPath}`);
    const git = simpleGit();
    await git.clone(gitUrl, localPath);

    // Save to database
    createProject({
      id,
      name,
      gitUrl,
      localPath,
      description: description || '',
      targetServerId: targetServerId || null
    });

    const project = getProject(id);
    res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update project
router.patch('/:id', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const allowedUpdates = ['name', 'description', 'target_server_id'];
    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    updateProject(req.params.id, updates);
    res.json(getProject(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete local files
    if (fs.existsSync(project.local_path)) {
      fs.rmSync(project.local_path, { recursive: true, force: true });
    }

    deleteProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Git operations
router.post('/:id/git/pull', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const git = simpleGit(project.local_path);
    const result = await git.pull();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/git/status', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const git = simpleGit(project.local_path);
    const status = await git.status();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/git/push', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const git = simpleGit(project.local_path);
    const result = await git.push();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List files in project
router.get('/:id/files', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const subPath = req.query.path || '';
    const fullPath = path.join(project.local_path, subPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const items = fs.readdirSync(fullPath, { withFileTypes: true }).map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      path: path.join(subPath, item.name)
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read file content
router.get('/:id/files/content', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const fullPath = path.join(project.local_path, filePath);

    // Security check - ensure path is within project
    if (!fullPath.startsWith(project.local_path)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
