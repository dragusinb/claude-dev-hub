/**
 * Test Setup Helpers
 * Common utilities for integration and unit tests
 */

import { vi } from 'vitest';

// Mock user for authentication
export const mockUser = {
  id: 'test-user-1',
  email: 'test@example.com',
  name: 'Test User'
};

// Create a mock request with authentication
export function createMockRequest(body = {}, params = {}, query = {}, user = mockUser) {
  return {
    body,
    params,
    query,
    user
  };
}

// Create a mock response
export function createMockResponse() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status: vi.fn(function(code) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function(data) {
      this.jsonData = data;
      return this;
    })
  };
  return res;
}

// Mock SSH2 Client for testing without real SSH connections
export function createMockSSH2Client() {
  const mockStream = {
    on: vi.fn((event, callback) => {
      if (event === 'data') {
        // Store data callback for later use
        mockStream._dataCallback = callback;
      } else if (event === 'close') {
        mockStream._closeCallback = callback;
      }
      return mockStream;
    }),
    stderr: {
      on: vi.fn(() => mockStream.stderr)
    },
    // Helper to simulate data and close
    simulateOutput: (data, code = 0) => {
      if (mockStream._dataCallback) {
        mockStream._dataCallback(Buffer.from(data));
      }
      if (mockStream._closeCallback) {
        mockStream._closeCallback(code);
      }
    }
  };

  const mockClient = {
    on: vi.fn((event, callback) => {
      if (event === 'ready') {
        mockClient._readyCallback = callback;
      } else if (event === 'error') {
        mockClient._errorCallback = callback;
      }
      return mockClient;
    }),
    connect: vi.fn(() => {
      // Simulate ready event
      setTimeout(() => {
        if (mockClient._readyCallback) {
          mockClient._readyCallback();
        }
      }, 0);
    }),
    exec: vi.fn((command, callback) => {
      callback(null, mockStream);
      return mockClient;
    }),
    end: vi.fn(),
    // Helper to get the stream for testing
    getStream: () => mockStream
  };

  return mockClient;
}

// Database mock helpers
export function createMockDatabase() {
  const data = {
    servers: [],
    sslCertificates: [],
    securityAudits: [],
    backupJobs: [],
    users: [mockUser]
  };

  return {
    data,
    getServers: vi.fn((userId) => data.servers.filter(s => s.user_id === userId)),
    getServer: vi.fn((id, userId) => data.servers.find(s => s.id === id && s.user_id === userId)),
    createServer: vi.fn((server) => {
      data.servers.push(server);
      return server;
    }),
    deleteServer: vi.fn((id, userId) => {
      const idx = data.servers.findIndex(s => s.id === id && s.user_id === userId);
      if (idx !== -1) data.servers.splice(idx, 1);
    }),
    getSSLCertificates: vi.fn((userId) => data.sslCertificates.filter(c => c.user_id === userId)),
    getSSLCertificate: vi.fn((id, userId) => data.sslCertificates.find(c => c.id === id && c.user_id === userId)),
    getSSLCertificateByDomain: vi.fn((domain, port, userId) =>
      data.sslCertificates.find(c => c.domain === domain && c.port === port && c.user_id === userId)
    ),
    createSSLCertificate: vi.fn((cert) => {
      data.sslCertificates.push({ ...cert, user_id: cert.userId });
      return cert;
    }),
    deleteSSLCertificate: vi.fn((id, userId) => {
      const idx = data.sslCertificates.findIndex(c => c.id === id && c.user_id === userId);
      if (idx !== -1) data.sslCertificates.splice(idx, 1);
    }),
    updateSSLCertificate: vi.fn((id, userId, updates) => {
      const cert = data.sslCertificates.find(c => c.id === id && c.user_id === userId);
      if (cert) Object.assign(cert, updates);
      return cert;
    }),
    getSecurityAudits: vi.fn((userId) => data.securityAudits.filter(a => a.user_id === userId)),
    getLatestSecurityAudit: vi.fn((serverId, userId) =>
      data.securityAudits.find(a => a.server_id === serverId && a.user_id === userId)
    ),
    createSecurityAudit: vi.fn((audit) => {
      data.securityAudits.push(audit);
      return audit;
    }),
    reset: () => {
      data.servers = [];
      data.sslCertificates = [];
      data.securityAudits = [];
      data.backupJobs = [];
    }
  };
}

// Helper to generate test data
export const testDataGenerators = {
  server: (overrides = {}) => ({
    id: `server-${Date.now()}`,
    user_id: mockUser.id,
    name: 'Test Server',
    host: '192.168.1.100',
    port: 22,
    username: 'root',
    auth_type: 'password',
    password: 'test123',
    deploy_path: '/home',
    ...overrides
  }),

  sslCertificate: (overrides = {}) => ({
    id: `ssl-${Date.now()}`,
    user_id: mockUser.id,
    domain: 'example.com',
    port: 443,
    enabled: 1,
    alert_days: 30,
    days_until_expiry: 45,
    valid_to: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    issuer: "Let's Encrypt",
    last_checked: new Date().toISOString(),
    ...overrides
  }),

  securityAudit: (overrides = {}) => ({
    id: `audit-${Date.now()}`,
    server_id: 'server-1',
    user_id: mockUser.id,
    score: 85,
    open_ports: JSON.stringify([22, 80, 443]),
    pending_updates: 5,
    security_updates: 0,
    failed_ssh_attempts: 10,
    firewall_active: 1,
    fail2ban_active: 1,
    findings: JSON.stringify([]),
    recommendations: JSON.stringify([]),
    created_at: new Date().toISOString(),
    ...overrides
  }),

  backupJob: (overrides = {}) => ({
    id: `backup-${Date.now()}`,
    user_id: mockUser.id,
    server_id: 'server-1',
    name: 'Test Backup',
    type: 'mysql',
    enabled: 1,
    schedule: '0 2 * * *',
    database_name: 'testdb',
    database_user: 'root',
    database_password: 'pass',
    destination_path: '/backups',
    retention_days: 7,
    ...overrides
  })
};
