// Mock data for testing

export const mockServers = [
  {
    id: 'server-1',
    user_id: 'user-1',
    name: 'Web Server',
    host: '192.168.1.1',
    port: 22,
    username: 'root',
    auth_type: 'password',
    password: 'test123'
  },
  {
    id: 'server-2',
    user_id: 'user-1',
    name: 'Mail Server',
    host: '192.168.1.2',
    port: 22,
    username: 'root',
    auth_type: 'password',
    password: 'test123'
  },
  {
    id: 'server-3',
    user_id: 'user-1',
    name: 'Database Server',
    host: '192.168.1.3',
    port: 22,
    username: 'root',
    auth_type: 'key',
    private_key: 'mock-key'
  }
];

export const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  password_hash: '$2a$10$mock-hash'
};

export const mockSSLCertificates = [
  {
    id: 'ssl-1',
    user_id: 'user-1',
    domain: 'example.com',
    port: 443,
    enabled: 1,
    alert_days: 30,
    days_until_expiry: 45,
    valid_to: '2026-03-15T00:00:00Z',
    issuer: "Let's Encrypt",
    last_checked: new Date().toISOString()
  },
  {
    id: 'ssl-2',
    user_id: 'user-1',
    domain: 'expiring-soon.com',
    port: 443,
    enabled: 1,
    alert_days: 30,
    days_until_expiry: 7,
    valid_to: '2026-02-03T00:00:00Z',
    issuer: "Let's Encrypt",
    last_checked: new Date().toISOString()
  }
];

export const mockSecurityAudit = {
  openPorts: [22, 80, 443],
  pendingUpdates: 5,
  securityUpdates: 0,
  failedSshAttempts: 3,
  firewallActive: true,
  fail2banActive: true,
  findings: [],
  recommendations: [],
  score: 100
};

export const mockSecurityAuditRisky = {
  openPorts: [22, 80, 443, 21, 23, 3306],
  pendingUpdates: 50,
  securityUpdates: 10,
  failedSshAttempts: 100,
  firewallActive: false,
  fail2banActive: false,
  findings: [],
  recommendations: [],
  score: 100
};

export const mockSecurityAuditMailServer = {
  openPorts: [22, 25, 80, 110, 143, 443, 465, 587, 993, 995],
  pendingUpdates: 5,
  securityUpdates: 0,
  failedSshAttempts: 20,
  firewallActive: true,
  fail2banActive: true,
  findings: [],
  recommendations: [],
  score: 100
};

export const mockBackupJob = {
  id: 'backup-1',
  user_id: 'user-1',
  server_id: 'server-1',
  name: 'Daily MySQL Backup',
  type: 'mysql',
  enabled: 1,
  schedule: '0 2 * * *',
  database_name: 'testdb',
  database_user: 'root',
  database_password: 'pass',
  destination_path: '/backups',
  retention_days: 7
};
