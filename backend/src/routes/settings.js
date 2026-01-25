import express from 'express';
import { getSetting, setSetting } from '../models/database.js';

const router = express.Router();

// Get all settings (excluding sensitive ones from direct list)
router.get('/', (req, res) => {
  try {
    const settings = {
      anthropicApiKey: getSetting('anthropic_api_key') ? '***configured***' : null,
      githubToken: getSetting('github_token') ? '***configured***' : null
    };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings
router.post('/', (req, res) => {
  try {
    const { anthropicApiKey, githubToken } = req.body;

    if (anthropicApiKey !== undefined) {
      setSetting('anthropic_api_key', anthropicApiKey);
    }
    if (githubToken !== undefined) {
      setSetting('github_token', githubToken);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if Claude CLI is available
router.get('/claude-status', async (req, res) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('claude --version');
      res.json({ installed: true, version: stdout.trim() });
    } catch {
      res.json({ installed: false, version: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
