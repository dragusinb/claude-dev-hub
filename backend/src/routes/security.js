import express from 'express';
import { Client } from 'ssh2';
import {
  getSecurityAudits,
  getLatestSecurityAudit,
  getSecurityAuditSettings,
  upsertSecurityAuditSettings,
  getServer
} from '../models/database.js';
import { runSecurityAudit } from '../services/securityAuditor.js';

// Define fixable actions with their commands
const SECURITY_ACTIONS = {
  install_security_updates: {
    name: 'Install Security Updates',
    description: 'Install all pending security updates',
    command: 'DEBIAN_FRONTEND=noninteractive apt-get update && apt-get -y upgrade',
    category: 'updates'
  },
  install_all_updates: {
    name: 'Install All Updates',
    description: 'Install all pending package updates',
    command: 'DEBIAN_FRONTEND=noninteractive apt-get update && apt-get -y upgrade',
    category: 'updates'
  },
  install_fail2ban: {
    name: 'Install Fail2Ban',
    description: 'Install and enable fail2ban to protect against brute force attacks',
    command: 'apt-get update && apt-get install -y fail2ban && systemctl enable fail2ban && systemctl start fail2ban',
    category: 'ssh'
  },
  enable_firewall: {
    name: 'Enable UFW Firewall',
    description: 'Enable UFW firewall with default deny incoming, allow SSH/HTTP/HTTPS',
    command: 'apt-get install -y ufw && ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw allow http && ufw allow https && echo "y" | ufw enable',
    category: 'firewall'
  },
  disable_root_password: {
    name: 'Disable Root Password Login',
    description: 'Disable SSH password authentication for root (key-only)',
    command: 'sed -i "s/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config && systemctl restart sshd',
    category: 'ssh'
  }
};

// Port descriptions
const PORT_NAMES = {
  21: 'FTP', 23: 'Telnet', 25: 'SMTP', 110: 'POP3', 143: 'IMAP',
  3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB'
};

// Database ports that should be restricted to localhost rather than blocked
const DATABASE_PORTS = [3306, 5432, 6379, 27017];

// Check if UFW is enabled - prefix for port commands
const UFW_CHECK = 'ufw status | grep -q "Status: active" || { echo "ERROR: UFW firewall is not enabled. Please enable the firewall first using the Enable UFW Firewall action."; exit 1; }';

// Generate dynamic port action
function getPortAction(port, actionType = 'block') {
  const portName = PORT_NAMES[port] || `Port ${port}`;
  const isDbPort = DATABASE_PORTS.includes(port);

  if (actionType === 'undo' || actionType === 'allow') {
    return {
      id: `allow_port_${port}`,
      name: `Allow ${portName}`,
      description: `Remove firewall restrictions and allow ${portName} (port ${port}) from anywhere. Requires UFW to be enabled.`,
      command: `${UFW_CHECK} && ufw delete deny ${port} 2>/dev/null; ufw delete allow from 127.0.0.1 to any port ${port} 2>/dev/null; ufw allow ${port} && ufw reload`,
      category: 'ports',
      isUndo: true
    };
  }

  if (actionType === 'localhost' || (actionType === 'block' && isDbPort)) {
    return {
      id: `restrict_port_${port}_localhost`,
      name: `Restrict ${portName} to localhost`,
      description: `Allow ${portName} (port ${port}) only from localhost (127.0.0.1). Remote connections will be blocked. Requires UFW to be enabled.`,
      command: `${UFW_CHECK} && ufw delete allow ${port} 2>/dev/null; ufw deny ${port} && ufw allow from 127.0.0.1 to any port ${port} && ufw reload`,
      category: 'ports',
      undoAction: `allow_port_${port}`
    };
  }

  return {
    id: `block_port_${port}`,
    name: `Block ${portName}`,
    description: `Completely block port ${port} (${portName}) using UFW firewall. Requires UFW to be enabled.`,
    command: `${UFW_CHECK} && ufw deny ${port} && ufw reload`,
    category: 'ports',
    undoAction: `allow_port_${port}`
  };
}

// Execute command on server via SSH
function executeOnServer(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Command timeout'));
    }, 300000); // 5 minute timeout for updates

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
          resolve({ code, stdout, stderr });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
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
  });
}

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

// GET /api/security/actions - Get available security actions
router.get('/actions', (req, res) => {
  res.json(Object.entries(SECURITY_ACTIONS).map(([id, action]) => ({
    id,
    ...action
  })));
});

// POST /api/security/action/:serverId - Execute a security action
router.post('/action/:serverId', async (req, res) => {
  try {
    const userId = req.user.id;
    const serverId = req.params.serverId;
    const { actionId } = req.body;

    // Check for dynamic port actions
    let action;
    if (actionId.startsWith('allow_port_')) {
      const port = parseInt(actionId.replace('allow_port_', ''));
      if (isNaN(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
      }
      action = getPortAction(port, 'undo');
    } else if (actionId.startsWith('restrict_port_') && actionId.endsWith('_localhost')) {
      const port = parseInt(actionId.replace('restrict_port_', '').replace('_localhost', ''));
      if (isNaN(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
      }
      action = getPortAction(port, 'localhost');
    } else if (actionId.startsWith('block_port_')) {
      const port = parseInt(actionId.replace('block_port_', ''));
      if (isNaN(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
      }
      action = getPortAction(port, 'block');
    } else {
      action = SECURITY_ACTIONS[actionId];
    }

    if (!action) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Get server with credentials
    const server = getServer(serverId, userId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check credentials
    const hasCredentials = server.auth_type === 'password' ? !!server.password : !!server.private_key;
    if (!hasCredentials) {
      return res.status(400).json({ error: 'Server credentials not available' });
    }

    console.log(`Executing security action "${action.name}" on ${server.name}`);

    // Execute the command
    const result = await executeOnServer(server, action.command);

    res.json({
      success: result.code === 0,
      action: action.name,
      actionId: action.id,
      exitCode: result.code,
      output: result.stdout,
      error: result.stderr,
      undoAction: action.undoAction || null
    });
  } catch (err) {
    console.error('Error executing security action:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
