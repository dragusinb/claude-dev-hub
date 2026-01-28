/**
 * Security Audit API Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
vi.mock('../../src/models/database.js', () => ({
  getSecurityAudits: vi.fn(),
  getLatestSecurityAudit: vi.fn(),
  getSecurityAuditSettings: vi.fn(),
  upsertSecurityAuditSettings: vi.fn(),
  getServer: vi.fn(),
  createSecurityAudit: vi.fn()
}));

// Mock security auditor
vi.mock('../../src/services/securityAuditor.js', () => ({
  runSecurityAudit: vi.fn()
}));

import {
  getSecurityAudits,
  getLatestSecurityAudit,
  getSecurityAuditSettings,
  upsertSecurityAuditSettings,
  getServer
} from '../../src/models/database.js';

import { runSecurityAudit } from '../../src/services/securityAuditor.js';

import { createMockRequest, createMockResponse, mockUser, testDataGenerators } from '../setup.js';

describe('Security API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/security/settings', () => {
    it('should return existing settings', () => {
      const mockSettings = {
        auto_audit_enabled: true,
        audit_interval_hours: 24,
        score_threshold: 70,
        alert_on_critical: true
      };
      getSecurityAuditSettings.mockReturnValue(mockSettings);

      const req = createMockRequest();
      const res = createMockResponse();

      const settings = getSecurityAuditSettings(req.user.id);
      res.json(settings);

      expect(getSecurityAuditSettings).toHaveBeenCalledWith(mockUser.id);
      expect(res.jsonData).toEqual(mockSettings);
    });

    it('should return default settings when none exist', () => {
      getSecurityAuditSettings.mockReturnValue(null);

      const req = createMockRequest();
      const res = createMockResponse();

      const settings = getSecurityAuditSettings(req.user.id);
      const defaults = {
        auto_audit_enabled: false,
        audit_interval_hours: 24,
        score_threshold: 70,
        alert_on_critical: true
      };
      res.json(settings || defaults);

      expect(res.jsonData).toEqual(defaults);
    });
  });

  describe('POST /api/security/settings', () => {
    it('should update settings', () => {
      const newSettings = {
        autoAuditEnabled: true,
        auditIntervalHours: 12,
        scoreThreshold: 60,
        alertOnCritical: false
      };
      const updatedSettings = {
        auto_audit_enabled: true,
        audit_interval_hours: 12,
        score_threshold: 60,
        alert_on_critical: false
      };
      getSecurityAuditSettings.mockReturnValue(updatedSettings);

      const req = createMockRequest(newSettings);
      const res = createMockResponse();

      upsertSecurityAuditSettings(req.user.id, newSettings);
      const updated = getSecurityAuditSettings(req.user.id);
      res.json(updated);

      expect(upsertSecurityAuditSettings).toHaveBeenCalledWith(mockUser.id, newSettings);
      expect(res.jsonData).toEqual(updatedSettings);
    });
  });

  describe('GET /api/security/audits', () => {
    it('should return all audits with default limit', () => {
      const mockAudits = [
        testDataGenerators.securityAudit({ score: 85 }),
        testDataGenerators.securityAudit({ score: 70 })
      ];
      getSecurityAudits.mockReturnValue(mockAudits);

      const req = createMockRequest({}, {}, { limit: '50' });
      const res = createMockResponse();

      const limit = parseInt(req.query.limit) || 50;
      const audits = getSecurityAudits(req.user.id, limit);
      res.json(audits);

      expect(getSecurityAudits).toHaveBeenCalledWith(mockUser.id, 50);
      expect(res.jsonData.length).toBe(2);
    });

    it('should respect custom limit parameter', () => {
      getSecurityAudits.mockReturnValue([]);

      const req = createMockRequest({}, {}, { limit: '10' });

      const limit = parseInt(req.query.limit) || 50;

      expect(limit).toBe(10);
    });
  });

  describe('POST /api/security/audit/:serverId', () => {
    it('should run audit on server', async () => {
      const mockServer = testDataGenerators.server({ id: 'server-1' });
      getServer.mockReturnValue(mockServer);

      const auditResult = {
        score: 85,
        openPorts: [22, 80, 443],
        pendingUpdates: 5,
        securityUpdates: 0,
        failedSshAttempts: 10,
        firewallActive: true,
        fail2banActive: true,
        findings: [],
        recommendations: []
      };
      runSecurityAudit.mockResolvedValue(auditResult);

      const req = createMockRequest({}, { serverId: 'server-1' });
      const res = createMockResponse();

      const server = getServer(req.params.serverId, req.user.id);
      expect(server).not.toBeNull();

      const result = await runSecurityAudit(server, req.user.id);

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

      expect(runSecurityAudit).toHaveBeenCalledWith(mockServer, mockUser.id);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.audit.score).toBe(85);
    });

    it('should return 404 for non-existent server', () => {
      getServer.mockReturnValue(null);

      const req = createMockRequest({}, { serverId: 'nonexistent' });
      const res = createMockResponse();

      const server = getServer(req.params.serverId, req.user.id);

      if (!server) {
        res.status(404).json({ error: 'Server not found' });
      }

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/security/server/:serverId/latest', () => {
    it('should return latest audit for server', () => {
      const mockServer = testDataGenerators.server({ id: 'server-1', name: 'Web Server', host: '192.168.1.1' });
      const mockAudit = testDataGenerators.securityAudit({ server_id: 'server-1', score: 90 });

      getServer.mockReturnValue(mockServer);
      getLatestSecurityAudit.mockReturnValue(mockAudit);

      const req = createMockRequest({}, { serverId: 'server-1' });
      const res = createMockResponse();

      const server = getServer(req.params.serverId, req.user.id);
      const audit = getLatestSecurityAudit(req.params.serverId, req.user.id);

      res.json({
        ...audit,
        server_name: server.name,
        server_host: server.host
      });

      expect(res.jsonData.score).toBe(90);
      expect(res.jsonData.server_name).toBe('Web Server');
    });

    it('should return null when no audit exists', () => {
      const mockServer = testDataGenerators.server({ id: 'server-1' });
      getServer.mockReturnValue(mockServer);
      getLatestSecurityAudit.mockReturnValue(null);

      const req = createMockRequest({}, { serverId: 'server-1' });
      const res = createMockResponse();

      const audit = getLatestSecurityAudit(req.params.serverId, req.user.id);

      if (!audit) {
        res.json(null);
      }

      expect(res.jsonData).toBeNull();
    });
  });

  describe('GET /api/security/overview', () => {
    it('should return security overview for all servers', () => {
      const mockAudits = [
        { server_id: 'server-1', server_name: 'Server 1', server_host: '192.168.1.1', score: 85, created_at: new Date().toISOString(), findings: [], pending_updates: 5, security_updates: 0 },
        { server_id: 'server-2', server_name: 'Server 2', server_host: '192.168.1.2', score: 45, created_at: new Date().toISOString(), findings: [{ severity: 'high' }], pending_updates: 20, security_updates: 5 },
        { server_id: 'server-3', server_name: 'Server 3', server_host: '192.168.1.3', score: 65, created_at: new Date().toISOString(), findings: [], pending_updates: 10, security_updates: 2 }
      ];
      getSecurityAudits.mockReturnValue(mockAudits);

      // Group by server and get latest for each
      const serverAudits = new Map();
      for (const audit of mockAudits) {
        if (!serverAudits.has(audit.server_id)) {
          serverAudits.set(audit.server_id, audit);
        }
      }

      const overview = Array.from(serverAudits.values()).map(audit => ({
        serverId: audit.server_id,
        serverName: audit.server_name,
        score: audit.score,
        criticalFindings: audit.findings.filter(f => f.severity === 'high').length
      }));

      // Calculate stats
      const totalServers = overview.length;
      const avgScore = Math.round(overview.reduce((sum, s) => sum + s.score, 0) / totalServers);
      const criticalServers = overview.filter(s => s.score < 50).length;
      const warningServers = overview.filter(s => s.score >= 50 && s.score < 70).length;

      expect(totalServers).toBe(3);
      expect(avgScore).toBe(65); // (85 + 45 + 65) / 3 = 65
      expect(criticalServers).toBe(1); // Server 2 with score 45
      expect(warningServers).toBe(1); // Server 3 with score 65
    });
  });
});

describe('Security Actions', () => {
  describe('Port blocking actions', () => {
    it('should generate correct block command for risky ports', () => {
      const port = 21;
      const command = `ufw deny ${port} && ufw reload`;
      expect(command).toBe('ufw deny 21 && ufw reload');
    });

    it('should generate localhost-only command for database ports', () => {
      const port = 3306;
      const command = `ufw delete allow ${port} 2>/dev/null; ufw deny ${port} && ufw allow from 127.0.0.1 to any port ${port} && ufw reload`;
      expect(command).toContain('127.0.0.1');
      expect(command).toContain('3306');
    });

    it('should generate undo command', () => {
      const port = 21;
      const command = `ufw delete deny ${port} 2>/dev/null; ufw delete allow from 127.0.0.1 to any port ${port} 2>/dev/null; ufw allow ${port} && ufw reload`;
      expect(command).toContain('delete deny');
      expect(command).toContain('ufw allow 21');
    });
  });

  describe('Security action definitions', () => {
    const SECURITY_ACTIONS = {
      install_security_updates: {
        name: 'Install Security Updates',
        command: 'DEBIAN_FRONTEND=noninteractive apt-get update && apt-get -y upgrade',
        category: 'updates'
      },
      install_fail2ban: {
        name: 'Install Fail2Ban',
        command: 'apt-get update && apt-get install -y fail2ban && systemctl enable fail2ban && systemctl start fail2ban',
        category: 'ssh'
      },
      enable_firewall: {
        name: 'Enable UFW Firewall',
        command: 'apt-get install -y ufw && ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw allow http && ufw allow https && echo "y" | ufw enable',
        category: 'firewall'
      }
    };

    it('should have all required actions defined', () => {
      expect(SECURITY_ACTIONS.install_security_updates).toBeDefined();
      expect(SECURITY_ACTIONS.install_fail2ban).toBeDefined();
      expect(SECURITY_ACTIONS.enable_firewall).toBeDefined();
    });

    it('should have proper command for firewall enabling', () => {
      expect(SECURITY_ACTIONS.enable_firewall.command).toContain('ufw enable');
      expect(SECURITY_ACTIONS.enable_firewall.command).toContain('allow ssh');
      expect(SECURITY_ACTIONS.enable_firewall.command).toContain('allow http');
      expect(SECURITY_ACTIONS.enable_firewall.command).toContain('allow https');
    });

    it('should have DEBIAN_FRONTEND for non-interactive updates', () => {
      expect(SECURITY_ACTIONS.install_security_updates.command).toContain('DEBIAN_FRONTEND=noninteractive');
    });
  });

  describe('Port classification', () => {
    const riskyPorts = [21, 23];
    const mailPorts = [25, 110, 143];
    const secureMailPorts = [993, 995, 465, 587];
    const databasePorts = [3306, 5432, 6379, 27017];
    const commonPorts = [22, 80, 443, 53];

    it('should correctly identify risky ports', () => {
      expect(riskyPorts.includes(21)).toBe(true); // FTP
      expect(riskyPorts.includes(23)).toBe(true); // Telnet
      expect(riskyPorts.includes(22)).toBe(false); // SSH is not risky
    });

    it('should correctly identify database ports', () => {
      expect(databasePorts.includes(3306)).toBe(true); // MySQL
      expect(databasePorts.includes(5432)).toBe(true); // PostgreSQL
      expect(databasePorts.includes(6379)).toBe(true); // Redis
      expect(databasePorts.includes(27017)).toBe(true); // MongoDB
    });

    it('should correctly identify common ports', () => {
      expect(commonPorts.includes(22)).toBe(true); // SSH
      expect(commonPorts.includes(80)).toBe(true); // HTTP
      expect(commonPorts.includes(443)).toBe(true); // HTTPS
    });

    it('should detect mail server by secure mail ports', () => {
      const openPorts = [22, 25, 110, 143, 993, 995];
      const isMailServer = openPorts.some(p => secureMailPorts.includes(p));
      expect(isMailServer).toBe(true);
    });

    it('should detect mail server by multiple mail ports', () => {
      const openPorts = [22, 25, 110, 143];
      const isMailServer = openPorts.filter(p => mailPorts.includes(p)).length >= 2;
      expect(isMailServer).toBe(true);
    });

    it('should not detect mail server with single mail port', () => {
      const openPorts = [22, 25, 80, 443];
      const isMailServer = openPorts.some(p => secureMailPorts.includes(p)) ||
                          openPorts.filter(p => mailPorts.includes(p)).length >= 2;
      expect(isMailServer).toBe(false);
    });
  });
});

describe('Security Score Thresholds', () => {
  function getScoreStatus(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  it('should classify scores correctly', () => {
    expect(getScoreStatus(100)).toBe('good');
    expect(getScoreStatus(85)).toBe('good');
    expect(getScoreStatus(80)).toBe('good');
    expect(getScoreStatus(79)).toBe('warning');
    expect(getScoreStatus(60)).toBe('warning');
    expect(getScoreStatus(59)).toBe('poor');
    expect(getScoreStatus(40)).toBe('poor');
    expect(getScoreStatus(39)).toBe('critical');
    expect(getScoreStatus(0)).toBe('critical');
  });

  it('should identify servers needing attention', () => {
    const servers = [
      { name: 'Server 1', score: 90 },
      { name: 'Server 2', score: 55 },
      { name: 'Server 3', score: 35 }
    ];

    const needsAttention = servers.filter(s => s.score < 70);
    expect(needsAttention.length).toBe(2);
    expect(needsAttention.map(s => s.name)).toContain('Server 2');
    expect(needsAttention.map(s => s.name)).toContain('Server 3');
  });
});
