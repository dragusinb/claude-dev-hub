import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createVaultEntry, getVaultEntries, getVaultEntry, updateVaultEntry, deleteVaultEntry, getServers, getServer, getSvnCredentials, getSvnCredential, getUserSettings } from '../models/database.js';
import { encrypt, decrypt, isKeyConfigured, generateKey } from '../services/encryption.js';

const router = express.Router();

// Get vault status (is encryption configured?)
router.get('/status', (req, res) => {
  res.json({
    configured: isKeyConfigured(),
    message: isKeyConfigured()
      ? 'Vault is configured and ready'
      : 'Vault is using auto-generated key. Set VAULT_KEY in .env for persistent encryption.'
  });
});

// Generate a new vault key (one-time setup helper)
router.post('/generate-key', (req, res) => {
  const key = generateKey();
  res.json({
    key,
    message: 'Add this to your .env file as VAULT_KEY=' + key
  });
});

// Get all vault entries (only name and category - no sensitive data)
router.get('/', (req, res) => {
  try {
    const entries = getVaultEntries(req.user.id);
    // Only return non-sensitive metadata for listing
    const safeEntries = entries.map(e => ({
      id: e.id,
      name: e.name,
      category: e.category,
      createdAt: e.created_at,
      updatedAt: e.updated_at
    }));
    res.json(safeEntries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single vault entry with ALL fields decrypted
router.get('/:id', (req, res) => {
  try {
    const entry = getVaultEntry(req.params.id, req.user.id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Decrypt all sensitive fields
    res.json({
      id: entry.id,
      name: entry.name,
      username: decrypt(entry.encrypted_username) || '',
      password: decrypt(entry.encrypted_password) || '',
      url: decrypt(entry.encrypted_url) || '',
      notes: decrypt(entry.encrypted_notes) || '',
      category: entry.category,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new vault entry - encrypt all sensitive fields
router.post('/', (req, res) => {
  try {
    const { name, username, password, url, notes, category } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    // Encrypt all sensitive fields
    const entry = {
      id: uuidv4(),
      userId: req.user.id,
      name,
      encryptedUsername: username ? encrypt(username) : null,
      encryptedPassword: encrypt(password),
      encryptedUrl: url ? encrypt(url) : null,
      encryptedNotes: notes ? encrypt(notes) : null,
      category
    };

    createVaultEntry(entry);

    res.status(201).json({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      message: 'Entry created successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update vault entry - encrypt all sensitive fields
router.patch('/:id', (req, res) => {
  try {
    const existing = getVaultEntry(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const { name, username, password, url, notes, category } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (username !== undefined) updates.encrypted_username = username ? encrypt(username) : null;
    if (password !== undefined && password) updates.encrypted_password = encrypt(password);
    if (url !== undefined) updates.encrypted_url = url ? encrypt(url) : null;
    if (notes !== undefined) updates.encrypted_notes = notes ? encrypt(notes) : null;
    if (category !== undefined) updates.category = category;

    updateVaultEntry(req.params.id, req.user.id, updates);

    const updated = getVaultEntry(req.params.id, req.user.id);
    res.json({
      id: updated.id,
      name: updated.name,
      category: updated.category,
      updatedAt: updated.updated_at,
      message: 'Entry updated successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete vault entry
router.delete('/:id', (req, res) => {
  try {
    const existing = getVaultEntry(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    deleteVaultEntry(req.params.id, req.user.id);
    res.json({ message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync all credentials to vault (import existing servers, API keys, etc.)
router.post('/sync', async (req, res) => {
  try {
    const userId = req.user.id;
    const existingEntries = getVaultEntries(userId);
    const existingNames = existingEntries.map(e => e.name.toLowerCase());
    let synced = 0;

    // Sync server credentials
    const servers = getServers(userId);
    for (const serverBasic of servers) {
      const server = getServer(serverBasic.id, userId);
      if (!server) continue;

      const vaultName = `Server: ${server.name}`;
      if (existingNames.includes(vaultName.toLowerCase())) continue;

      if (server.password || server.private_key) {
        createVaultEntry({
          id: uuidv4(),
          userId,
          name: vaultName,
          encryptedUsername: server.username ? encrypt(server.username) : null,
          encryptedPassword: encrypt(server.password || server.private_key || ''),
          encryptedUrl: encrypt(`${server.host}:${server.port}`),
          encryptedNotes: encrypt(`Auth type: ${server.auth_type}\nDeploy path: ${server.deploy_path || 'N/A'}`),
          category: 'server'
        });
        synced++;
      }
    }

    // Sync SVN credentials
    const svnCreds = getSvnCredentials(userId);
    for (const svnBasic of svnCreds) {
      const svn = getSvnCredential(svnBasic.id, userId);
      if (!svn) continue;

      const vaultName = `SVN: ${svn.name}`;
      if (existingNames.includes(vaultName.toLowerCase())) continue;

      createVaultEntry({
        id: uuidv4(),
        userId,
        name: vaultName,
        encryptedUsername: svn.username ? encrypt(svn.username) : null,
        encryptedPassword: encrypt(svn.password || ''),
        encryptedUrl: encrypt(svn.url),
        encryptedNotes: null,
        category: 'database'
      });
      synced++;
    }

    // Sync API keys from settings
    const settings = getUserSettings(userId);

    if (settings.anthropic_api_key && !existingNames.includes('anthropic api key')) {
      createVaultEntry({
        id: uuidv4(),
        userId,
        name: 'Anthropic API Key',
        encryptedUsername: null,
        encryptedPassword: encrypt(settings.anthropic_api_key),
        encryptedUrl: encrypt('https://console.anthropic.com'),
        encryptedNotes: encrypt('Claude API key for AI features'),
        category: 'api'
      });
      synced++;
    }

    if (settings.github_token && !existingNames.includes('github token')) {
      createVaultEntry({
        id: uuidv4(),
        userId,
        name: 'GitHub Token',
        encryptedUsername: null,
        encryptedPassword: encrypt(settings.github_token),
        encryptedUrl: encrypt('https://github.com/settings/tokens'),
        encryptedNotes: encrypt('Personal access token for GitHub integration'),
        category: 'api'
      });
      synced++;
    }

    res.json({
      message: `Synced ${synced} credentials to vault`,
      synced
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
