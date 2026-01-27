import express from 'express';
import { getActivityLog, getDeployHistory, getAlertSettings, upsertAlertSettings, getAlertHistory } from '../models/database.js';
import { sendTestEmail } from '../services/alertService.js';

const router = express.Router();

// Get activity log
router.get('/activity', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activity = getActivityLog(req.user.id, limit);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get deploy history
router.get('/deploy-history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getDeployHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get alert settings
router.get('/alerts/settings', (req, res) => {
  try {
    const settings = getAlertSettings(req.user.id);
    res.json(settings || {
      enabled: false,
      email: null,
      webhook_url: null,
      cpu_threshold: 90,
      memory_threshold: 90,
      disk_threshold: 85,
      notify_on_down: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update alert settings
router.post('/alerts/settings', (req, res) => {
  try {
    const { enabled, email, webhookUrl, cpuThreshold, memoryThreshold, diskThreshold, notifyOnDown } = req.body;

    upsertAlertSettings(req.user.id, {
      enabled: enabled !== false,
      email,
      webhookUrl,
      cpuThreshold: cpuThreshold || 90,
      memoryThreshold: memoryThreshold || 90,
      diskThreshold: diskThreshold || 85,
      notifyOnDown: notifyOnDown !== false
    });

    const settings = getAlertSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get alert history
router.get('/alerts/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getAlertHistory(req.user.id, limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send test email
router.post('/alerts/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const result = await sendTestEmail(email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
