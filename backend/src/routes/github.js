import express from 'express';
import { getSetting } from '../models/database.js';

const router = express.Router();

// Get user's GitHub repos
router.get('/repos', async (req, res) => {
  try {
    const token = getSetting('github_token');
    if (!token) {
      return res.status(400).json({ error: 'GitHub token not configured' });
    }

    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Dev-Hub'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();

    // Return simplified repo info
    const simplified = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.clone_url,
      htmlUrl: repo.html_url,
      private: repo.private,
      language: repo.language,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch
    }));

    res.json(simplified);
  } catch (err) {
    console.error('GitHub API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get repo branches
router.get('/repos/:owner/:repo/branches', async (req, res) => {
  try {
    const token = getSetting('github_token');
    if (!token) {
      return res.status(400).json({ error: 'GitHub token not configured' });
    }

    const { owner, repo } = req.params;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Dev-Hub'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const branches = await response.json();
    res.json(branches.map(b => ({ name: b.name, protected: b.protected })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check GitHub connection status
router.get('/status', async (req, res) => {
  try {
    const token = getSetting('github_token');
    if (!token) {
      return res.json({ connected: false, message: 'No token configured' });
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Dev-Hub'
      }
    });

    if (!response.ok) {
      return res.json({ connected: false, message: 'Invalid token' });
    }

    const user = await response.json();
    res.json({
      connected: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      }
    });
  } catch (err) {
    res.json({ connected: false, message: err.message });
  }
});

export default router;
