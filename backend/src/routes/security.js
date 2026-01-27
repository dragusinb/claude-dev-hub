import express from 'express';
import {
  getSecurityAudits,
  getLatestSecurityAudit,
  getSecurityAuditSettings,
  upsertSecurityAuditSettings,
  getServer
} from '../models/database.js';
import { runSecurityAudit } from '../services/securityAuditor.js';

const router = express.Router();

// GET /api/security/settings - Get audit settings
router.get('/settings', (req, res) => {
  try {
    const userId = req.user.id;
    const settings = getSecurityAuditSettings(userId);

    res.json(settings || {
      auto_audit_enabled: false,
      audit_interval_hours: 24,
      score_threshold: 70,
      alert_on_critical: true
    });
  } catch (err) {
    console.error('Error getting security settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/security/settings - Update audit settings
router.post('/settings', (req, res) => {
  try {
    const userId = req.user.id;
    const { autoAuditEnabled, auditIntervalHours, scoreThreshold, alertOnCritical } = req.body;

    upsertSecurityAuditSettings(userId, {
      autoAuditEnabled,
      auditIntervalHours,
      scoreThreshold,
      alertOnCritical
    });

    const updated = getSecurityAuditSettings(userId);
    res.json(updated);
  } catch (err) {
    console.error('Error updating security settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/security/audits - List all audits
router.get('/audits', (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const audits = getSecurityAudits(userId, limit);
    res.json(audits);
  } catch (err) {
    console.error('Error getting security audits:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/security/audit/:serverId - Run audit on server
router.post('/audit/:serverId', async (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.serverId;

    // Get server with decrypted credentials
    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Run the audit
    const result = await runSecurityAudit(server, userId);

    res.json({
      success: true,
      audit: {
        score: result.score,
        openPorts: result.openPorts,
        pendingUpdates: result.pendingUpdates,
        securityUpdates: result.securityUpdates,
        failedSshAttempts: result.failedSshAttempts,
        findings: result.findings,
        recommendations: result.recommendations
      }
    });
  } catch (err) {
    console.error('Error running security audit:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/security/server/:serverId/latest - Get latest audit for server
router.get('/server/:serverId/latest', (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.serverId;

    // Verify server belongs to user
    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const audit = getLatestSecurityAudit(serverId, userId);

    if (!audit) {
      return res.json(null);
    }

    res.json({
      ...audit,
      server_name: server.name,
      server_host: server.host
    });
  } catch (err) {
    console.error('Error getting latest security audit:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/security/overview - Get security overview for all servers
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user.id;
    const audits = getSecurityAudits(userId, 100);

    // Group by server and get latest for each
    const serverAudits = new Map();
    for (const audit of audits) {
      if (!serverAudits.has(audit.server_id)) {
        serverAudits.set(audit.server_id, audit);
      }
    }

    const overview = Array.from(serverAudits.values()).map(audit => ({
      serverId: audit.server_id,
      serverName: audit.server_name,
      serverHost: audit.server_host,
      score: audit.score,
      lastAudit: audit.created_at,
      criticalFindings: audit.findings.filter(f => f.severity === 'high').length,
      pendingUpdates: audit.pending_updates,
      securityUpdates: audit.security_updates
    }));

    // Calculate overall stats
    const totalServers = overview.length;
    const avgScore = totalServers > 0
      ? Math.round(overview.reduce((sum, s) => sum + s.score, 0) / totalServers)
      : 0;
    const criticalServers = overview.filter(s => s.score < 50).length;
    const warningServers = overview.filter(s => s.score >= 50 && s.score < 70).length;

    res.json({
      stats: {
        totalServers,
        avgScore,
        criticalServers,
        warningServers,
        healthyServers: totalServers - criticalServers - warningServers
      },
      servers: overview
    });
  } catch (err) {
    console.error('Error getting security overview:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
