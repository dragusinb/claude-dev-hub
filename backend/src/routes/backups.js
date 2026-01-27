import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createBackupJob,
  getBackupJobs,
  getBackupJob,
  updateBackupJob,
  deleteBackupJob,
  getBackupHistory,
  getBackupHistoryForJob,
  getServer
} from '../models/database.js';
import { runBackupJob } from '../services/backupScheduler.js';
import { getNextRun, describeCron } from '../utils/cron.js';

const router = express.Router();

// GET /api/backups/jobs - List all backup jobs
router.get('/jobs', (req, res) => {
  try {
    const userId = req.user.id;
    const jobs = getBackupJobs(userId);

    // Enrich with schedule description
    const enrichedJobs = jobs.map(job => ({
      ...job,
      schedule_description: describeCron(job.schedule)
    }));

    res.json(enrichedJobs);
  } catch (err) {
    console.error('Error getting backup jobs:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backups/jobs - Create backup job
router.post('/jobs', (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      serverId,
      type,
      schedule,
      sourcePath,
      databaseName,
      databaseUser,
      databasePassword,
      destinationPath,
      retentionDays,
      enabled
    } = req.body;

    // Validate required fields
    if (!name || !serverId || !type || !schedule || !destinationPath) {
      return res.status(400).json({
        error: 'Missing required fields: name, serverId, type, schedule, destinationPath'
      });
    }

    // Validate server belongs to user
    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Validate type
    const validTypes = ['mysql', 'postgres', 'files', 'directory'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Validate schedule
    let nextRun;
    try {
      nextRun = getNextRun(schedule);
      if (!nextRun) {
        return res.status(400).json({ error: 'Invalid cron schedule' });
      }
    } catch (err) {
      return res.status(400).json({ error: `Invalid cron schedule: ${err.message}` });
    }

    const job = {
      id: uuidv4(),
      userId,
      serverId,
      name,
      type,
      schedule,
      sourcePath: sourcePath || null,
      databaseName: databaseName || null,
      databaseUser: databaseUser || null,
      databasePassword: databasePassword || null,
      destinationPath,
      retentionDays: retentionDays || 7,
      enabled: enabled !== false,
      nextRun: nextRun.toISOString()
    };

    createBackupJob(job);

    const created = getBackupJob(job.id, userId);
    res.status(201).json({
      ...created,
      schedule_description: describeCron(schedule)
    });
  } catch (err) {
    console.error('Error creating backup job:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/jobs/:id - Get single backup job
router.get('/jobs/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const job = getBackupJob(req.params.id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Backup job not found' });
    }

    // Don't return decrypted password to frontend
    delete job.database_password;

    res.json({
      ...job,
      schedule_description: describeCron(job.schedule)
    });
  } catch (err) {
    console.error('Error getting backup job:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/backups/jobs/:id - Update backup job
router.patch('/jobs/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const job = getBackupJob(req.params.id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Backup job not found' });
    }

    const {
      name,
      type,
      schedule,
      sourcePath,
      databaseName,
      databaseUser,
      databasePassword,
      destinationPath,
      retentionDays,
      enabled
    } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (sourcePath !== undefined) updates.source_path = sourcePath;
    if (databaseName !== undefined) updates.database_name = databaseName;
    if (databaseUser !== undefined) updates.database_user = databaseUser;
    if (databasePassword !== undefined) updates.database_password = databasePassword;
    if (destinationPath !== undefined) updates.destination_path = destinationPath;
    if (retentionDays !== undefined) updates.retention_days = retentionDays;
    if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;

    if (schedule !== undefined) {
      const nextRun = getNextRun(schedule);
      if (!nextRun) {
        return res.status(400).json({ error: 'Invalid cron schedule' });
      }
      updates.schedule = schedule;
      updates.next_run = nextRun.toISOString();
    }

    updateBackupJob(req.params.id, userId, updates);

    const updated = getBackupJob(req.params.id, userId);
    delete updated.database_password;

    res.json({
      ...updated,
      schedule_description: describeCron(updated.schedule)
    });
  } catch (err) {
    console.error('Error updating backup job:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/backups/jobs/:id - Delete backup job
router.delete('/jobs/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const job = getBackupJob(req.params.id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Backup job not found' });
    }

    deleteBackupJob(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting backup job:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backups/jobs/:id/run - Manual trigger
router.post('/jobs/:id/run', async (req, res) => {
  try {
    const userId = req.user.id;
    const job = getBackupJob(req.params.id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Backup job not found' });
    }

    // Get server details for the job
    const server = getServer(job.server_id, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Merge server details into job for execution
    const jobWithServer = {
      ...job,
      host: server.host,
      port: server.port,
      username: server.username,
      auth_type: server.auth_type,
      password: server.password,
      private_key: server.private_key
    };

    // Run the backup
    const result = await runBackupJob(jobWithServer);

    res.json(result);
  } catch (err) {
    console.error('Error running backup job:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/history - Get backup history
router.get('/history', (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const history = getBackupHistory(userId, limit);
    res.json(history);
  } catch (err) {
    console.error('Error getting backup history:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/jobs/:id/history - Get history for specific job
router.get('/jobs/:id/history', (req, res) => {
  try {
    const userId = req.user.id;
    const job = getBackupJob(req.params.id, userId);

    if (!job) {
      return res.status(404).json({ error: 'Backup job not found' });
    }

    const limit = parseInt(req.query.limit) || 20;
    const history = getBackupHistoryForJob(req.params.id, limit);
    res.json(history);
  } catch (err) {
    console.error('Error getting job backup history:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
