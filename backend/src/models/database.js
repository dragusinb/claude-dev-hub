import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { encrypt, decrypt } from '../services/encryption.js';

// List of user settings keys that should be encrypted
const SENSITIVE_SETTINGS = ['github_token', 'anthropic_api_key', 'claude_api_key', 'openai_api_key'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy-load paths to ensure env vars are available
function getDataDir() {
  return process.env.DATA_DIR || path.join(__dirname, '../../data');
}

function getDbPath() {
  return path.join(getDataDir(), 'claude-dev-hub.db');
}

let db;

export function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const dataDir = getDataDir();
      const dbPath = getDbPath();

      // Ensure data directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      db = new Database(dbPath);

      // Create tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          git_url TEXT NOT NULL,
          local_path TEXT NOT NULL,
          description TEXT,
          target_server_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER DEFAULT 22,
          username TEXT NOT NULL,
          auth_type TEXT DEFAULT 'password',
          password TEXT,
          private_key TEXT,
          deploy_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (user_id, key),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE IF NOT EXISTS deploy_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          server_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id),
          FOREIGN KEY (server_id) REFERENCES servers(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS svn_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS server_health_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL,
          cpu REAL,
          memory_used INTEGER,
          memory_total INTEGER,
          memory_percent REAL,
          disk_used TEXT,
          disk_total TEXT,
          disk_percent REAL,
          load_one REAL,
          load_five REAL,
          load_fifteen REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        CREATE INDEX IF NOT EXISTS idx_health_server_time ON server_health_history(server_id, created_at);

        CREATE TABLE IF NOT EXISTS alert_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          email TEXT,
          webhook_url TEXT,
          cpu_threshold INTEGER DEFAULT 90,
          memory_threshold INTEGER DEFAULT 90,
          disk_threshold INTEGER DEFAULT 85,
          notify_on_down INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS alert_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          server_id TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          message TEXT NOT NULL,
          value REAL,
          threshold REAL,
          notified INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        CREATE TABLE IF NOT EXISTS vault (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          encrypted_username TEXT,
          encrypted_password TEXT NOT NULL,
          encrypted_url TEXT,
          encrypted_notes TEXT,
          category TEXT DEFAULT 'general',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        -- Uptime tracking tables
        CREATE TABLE IF NOT EXISTS uptime_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL,
          status TEXT NOT NULL,
          response_time INTEGER,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        CREATE INDEX IF NOT EXISTS idx_uptime_events_server_time ON uptime_events(server_id, created_at);

        CREATE TABLE IF NOT EXISTS uptime_daily_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL,
          date TEXT NOT NULL,
          total_checks INTEGER DEFAULT 0,
          successful_checks INTEGER DEFAULT 0,
          failed_checks INTEGER DEFAULT 0,
          uptime_percent REAL DEFAULT 100,
          avg_response_time INTEGER,
          min_response_time INTEGER,
          max_response_time INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(server_id, date),
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        -- SSL Certificate monitoring table
        CREATE TABLE IF NOT EXISTS ssl_certificates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          domain TEXT NOT NULL,
          port INTEGER DEFAULT 443,
          enabled INTEGER DEFAULT 1,
          issuer TEXT,
          subject TEXT,
          valid_from DATETIME,
          valid_to DATETIME,
          days_until_expiry INTEGER,
          last_checked DATETIME,
          last_error TEXT,
          alert_days INTEGER DEFAULT 30,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        -- Backup scheduler tables
        CREATE TABLE IF NOT EXISTS backup_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          server_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          schedule TEXT NOT NULL,
          source_path TEXT,
          database_name TEXT,
          database_user TEXT,
          database_password TEXT,
          destination_path TEXT NOT NULL,
          retention_days INTEGER DEFAULT 7,
          last_run DATETIME,
          next_run DATETIME,
          last_status TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        CREATE TABLE IF NOT EXISTS backup_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          server_id TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at DATETIME,
          finished_at DATETIME,
          duration_seconds INTEGER,
          file_size INTEGER,
          file_path TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES backup_jobs(id),
          FOREIGN KEY (server_id) REFERENCES servers(id)
        );

        -- Security audit tables
        CREATE TABLE IF NOT EXISTS security_audits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          score INTEGER DEFAULT 0,
          open_ports TEXT,
          pending_updates INTEGER DEFAULT 0,
          security_updates INTEGER DEFAULT 0,
          failed_ssh_attempts INTEGER DEFAULT 0,
          findings TEXT,
          recommendations TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES servers(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS security_audit_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL UNIQUE,
          auto_audit_enabled INTEGER DEFAULT 0,
          audit_interval_hours INTEGER DEFAULT 24,
          score_threshold INTEGER DEFAULT 70,
          alert_on_critical INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      // Run migrations for existing databases
      runMigrations();

      console.log('Database initialized at:', dbPath);
      resolve(db);
    } catch (err) {
      reject(err);
    }
  });
}

function runMigrations() {
  // Check if user_id column exists in projects table
  const projectCols = db.prepare("PRAGMA table_info(projects)").all();
  const hasUserIdInProjects = projectCols.some(col => col.name === 'user_id');

  if (!hasUserIdInProjects && projectCols.length > 0) {
    console.log('Running migration: Adding user_id to projects table');
    db.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT`);
  }

  // Check if user_id column exists in servers table
  const serverCols = db.prepare("PRAGMA table_info(servers)").all();
  const hasUserIdInServers = serverCols.some(col => col.name === 'user_id');

  if (!hasUserIdInServers && serverCols.length > 0) {
    console.log('Running migration: Adding user_id to servers table');
    db.exec(`ALTER TABLE servers ADD COLUMN user_id TEXT`);
  }

  // Assign orphaned projects and servers to the first user
  const firstUser = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (firstUser) {
    const orphanedProjects = db.prepare("UPDATE projects SET user_id = ? WHERE user_id IS NULL OR user_id = ''").run(firstUser.id);
    if (orphanedProjects.changes > 0) {
      console.log(`Assigned ${orphanedProjects.changes} orphaned projects to user ${firstUser.id}`);
    }

    const orphanedServers = db.prepare("UPDATE servers SET user_id = ? WHERE user_id IS NULL OR user_id = ''").run(firstUser.id);
    if (orphanedServers.changes > 0) {
      console.log(`Assigned ${orphanedServers.changes} orphaned servers to user ${firstUser.id}`);
    }

    // Migrate old settings to user_settings for first user
    try {
      const oldSettings = db.prepare('SELECT key, value FROM settings').all();
      if (oldSettings.length > 0) {
        const existingUserSettings = db.prepare('SELECT COUNT(*) as count FROM user_settings WHERE user_id = ?').get(firstUser.id);
        if (existingUserSettings.count === 0) {
          for (const setting of oldSettings) {
            db.prepare('INSERT OR IGNORE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)').run(firstUser.id, setting.key, setting.value);
          }
          console.log(`Migrated ${oldSettings.length} settings to user ${firstUser.id}`);
        }
      }
    } catch (err) {
      // Old settings table might not exist, that's ok
    }
  }

  // Migrate plain-text credentials to encrypted format
  migrateToEncrypted();
}

// Check if a value looks like it's already encrypted (base64:base64:base64 format)
function isEncrypted(value) {
  if (!value) return true; // null/empty is fine
  const parts = value.split(':');
  // Encrypted format is iv:authTag:ciphertext (3 parts, all base64)
  if (parts.length === 3) {
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return parts.every(p => base64Regex.test(p));
  }
  return false;
}

function migrateToEncrypted() {
  try {
    // Migrate server passwords and private keys
    const servers = db.prepare('SELECT id, password, private_key FROM servers').all();
    for (const server of servers) {
      const updates = [];
      const values = [];

      if (server.password && !isEncrypted(server.password)) {
        updates.push('password = ?');
        values.push(encrypt(server.password));
      }
      if (server.private_key && !isEncrypted(server.private_key)) {
        updates.push('private_key = ?');
        values.push(encrypt(server.private_key));
      }

      if (updates.length > 0) {
        values.push(server.id);
        db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        console.log(`Encrypted credentials for server ${server.id}`);
      }
    }

    // Migrate SVN credentials
    const svnCreds = db.prepare('SELECT id, password FROM svn_credentials').all();
    for (const cred of svnCreds) {
      if (cred.password && !isEncrypted(cred.password)) {
        db.prepare('UPDATE svn_credentials SET password = ? WHERE id = ?').run(encrypt(cred.password), cred.id);
        console.log(`Encrypted SVN credential ${cred.id}`);
      }
    }

    // Migrate sensitive user settings
    const settings = db.prepare('SELECT user_id, key, value FROM user_settings').all();
    for (const setting of settings) {
      if (SENSITIVE_SETTINGS.includes(setting.key) && setting.value && !isEncrypted(setting.value)) {
        db.prepare('UPDATE user_settings SET value = ? WHERE user_id = ? AND key = ?')
          .run(encrypt(setting.value), setting.user_id, setting.key);
        console.log(`Encrypted setting ${setting.key} for user ${setting.user_id}`);
      }
    }
  } catch (err) {
    console.error('Migration to encrypted format failed:', err.message);
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Project operations
export function createProject(project) {
  const stmt = getDb().prepare(`
    INSERT INTO projects (id, user_id, name, git_url, local_path, description, target_server_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(project.id, project.userId, project.name, project.gitUrl, project.localPath, project.description, project.targetServerId);
}

export function getProjects(userId) {
  return getDb().prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function getProject(id, userId) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
}

export function updateProject(id, userId, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  const stmt = getDb().prepare(`UPDATE projects SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`);
  return stmt.run(...values, id, userId);
}

export function deleteProject(id, userId) {
  return getDb().prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
}

// Server operations - passwords and private keys are encrypted
export function createServer(server) {
  const stmt = getDb().prepare(`
    INSERT INTO servers (id, user_id, name, host, port, username, auth_type, password, private_key, deploy_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Encrypt sensitive fields
  const encryptedPassword = server.password ? encrypt(server.password) : null;
  const encryptedPrivateKey = server.privateKey ? encrypt(server.privateKey) : null;
  return stmt.run(server.id, server.userId, server.name, server.host, server.port, server.username,
                  server.authType, encryptedPassword, encryptedPrivateKey, server.deployPath);
}

export function getServers(userId) {
  return getDb().prepare('SELECT id, name, host, port, username, auth_type, deploy_path, created_at FROM servers WHERE user_id = ?').all(userId);
}

export function getServer(id, userId) {
  const server = getDb().prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(id, userId);
  if (server) {
    // Decrypt sensitive fields
    server.password = server.password ? decrypt(server.password) : null;
    server.private_key = server.private_key ? decrypt(server.private_key) : null;
  }
  return server;
}

export function updateServer(id, userId, updates) {
  const fields = [];
  const values = [];

  // Handle each field, encrypting sensitive ones
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.host !== undefined) {
    fields.push('host = ?');
    values.push(updates.host);
  }
  if (updates.port !== undefined) {
    fields.push('port = ?');
    values.push(updates.port);
  }
  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.authType !== undefined) {
    fields.push('auth_type = ?');
    values.push(updates.authType);
  }
  if (updates.password !== undefined) {
    fields.push('password = ?');
    values.push(updates.password ? encrypt(updates.password) : null);
  }
  if (updates.privateKey !== undefined) {
    fields.push('private_key = ?');
    values.push(updates.privateKey ? encrypt(updates.privateKey) : null);
  }
  if (updates.deployPath !== undefined) {
    fields.push('deploy_path = ?');
    values.push(updates.deployPath);
  }

  if (fields.length === 0) return { changes: 0 };

  const stmt = getDb().prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`);
  return stmt.run(...values, id, userId);
}

export function deleteServer(id, userId) {
  return getDb().prepare('DELETE FROM servers WHERE id = ? AND user_id = ?').run(id, userId);
}

// User settings operations - sensitive keys are encrypted
export function getUserSetting(userId, key) {
  const row = getDb().prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key);
  if (!row) return null;
  // Decrypt if this is a sensitive setting
  if (SENSITIVE_SETTINGS.includes(key)) {
    return decrypt(row.value);
  }
  return row.value;
}

export function setUserSetting(userId, key, value) {
  const stmt = getDb().prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
  // Encrypt if this is a sensitive setting
  const storedValue = SENSITIVE_SETTINGS.includes(key) && value ? encrypt(value) : value;
  return stmt.run(userId, key, storedValue);
}

export function getUserSettings(userId) {
  const rows = getDb().prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
  const settings = {};
  rows.forEach(row => {
    // Decrypt sensitive settings
    if (SENSITIVE_SETTINGS.includes(row.key)) {
      settings[row.key] = decrypt(row.value);
    } else {
      settings[row.key] = row.value;
    }
  });
  return settings;
}

// Deploy history operations
export function addDeployHistory(deploy) {
  const stmt = getDb().prepare(`
    INSERT INTO deploy_history (project_id, server_id, user_id, status, message)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(deploy.projectId, deploy.serverId, deploy.userId, deploy.status, deploy.message);
}

export function getDeployHistory(userId, limit = 50) {
  return getDb().prepare(`
    SELECT dh.*, p.name as project_name, s.name as server_name
    FROM deploy_history dh
    LEFT JOIN projects p ON dh.project_id = p.id
    LEFT JOIN servers s ON dh.server_id = s.id
    WHERE dh.user_id = ?
    ORDER BY dh.created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

export function getProjectDeployHistory(projectId, userId, limit = 20) {
  return getDb().prepare(`
    SELECT dh.*, s.name as server_name
    FROM deploy_history dh
    LEFT JOIN servers s ON dh.server_id = s.id
    WHERE dh.project_id = ? AND dh.user_id = ?
    ORDER BY dh.created_at DESC
    LIMIT ?
  `).all(projectId, userId, limit);
}

// Activity log operations
export function addActivityLog(activity) {
  const stmt = getDb().prepare(`
    INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(activity.userId, activity.action, activity.entityType, activity.entityId, activity.details);
}

export function getActivityLog(userId, limit = 100) {
  return getDb().prepare(`
    SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

// Chat history operations
export function addChatMessage(projectId, role, content) {
  const stmt = getDb().prepare('INSERT INTO chat_history (project_id, role, content) VALUES (?, ?, ?)');
  return stmt.run(projectId, role, content);
}

export function getChatHistory(projectId, limit = 100) {
  return getDb().prepare('SELECT * FROM chat_history WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?').all(projectId, limit);
}

export function clearChatHistory(projectId) {
  return getDb().prepare('DELETE FROM chat_history WHERE project_id = ?').run(projectId);
}

// User operations
export function createUser(user) {
  const stmt = getDb().prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)');
  return stmt.run(user.id, user.email, user.passwordHash, user.name);
}

export function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(id) {
  return getDb().prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
}

export function getUsers() {
  return getDb().prepare('SELECT id, email, name, created_at FROM users').all();
}

// SVN credentials operations - passwords are encrypted
export function createSvnCredential(cred) {
  const stmt = getDb().prepare(`
    INSERT INTO svn_credentials (id, user_id, name, url, username, password)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  // Encrypt password
  const encryptedPassword = cred.password ? encrypt(cred.password) : null;
  return stmt.run(cred.id, cred.userId, cred.name, cred.url, cred.username, encryptedPassword);
}

export function getSvnCredentials(userId) {
  return getDb().prepare('SELECT id, name, url, username, created_at FROM svn_credentials WHERE user_id = ?').all(userId);
}

export function getSvnCredential(id, userId) {
  const cred = getDb().prepare('SELECT * FROM svn_credentials WHERE id = ? AND user_id = ?').get(id, userId);
  if (cred) {
    // Decrypt password
    cred.password = cred.password ? decrypt(cred.password) : null;
  }
  return cred;
}

export function deleteSvnCredential(id, userId) {
  return getDb().prepare('DELETE FROM svn_credentials WHERE id = ? AND user_id = ?').run(id, userId);
}

// Server health history operations
export function addServerHealthHistory(health) {
  const stmt = getDb().prepare(`
    INSERT INTO server_health_history (server_id, cpu, memory_used, memory_total, memory_percent, disk_used, disk_total, disk_percent, load_one, load_five, load_fifteen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    health.serverId,
    health.cpu,
    health.memoryUsed,
    health.memoryTotal,
    health.memoryPercent,
    health.diskUsed,
    health.diskTotal,
    health.diskPercent,
    health.loadOne,
    health.loadFive,
    health.loadFifteen
  );
}

export function getServerHealthHistory(serverId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT * FROM server_health_history
    WHERE server_id = ? AND created_at >= ?
    ORDER BY created_at ASC
  `).all(serverId, since);
}

export function cleanupOldHealthHistory(daysToKeep = 7) {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare('DELETE FROM server_health_history WHERE created_at < ?').run(cutoff);
}

export function getAllServersForMonitoring() {
  const servers = getDb().prepare('SELECT * FROM servers').all();
  // Decrypt passwords and private keys for SSH connections
  return servers.map(server => ({
    ...server,
    password: server.password ? decrypt(server.password) : null,
    private_key: server.private_key ? decrypt(server.private_key) : null
  }));
}

// Alert settings operations
export function getAlertSettings(userId) {
  return getDb().prepare('SELECT * FROM alert_settings WHERE user_id = ?').get(userId);
}

export function upsertAlertSettings(userId, settings) {
  const existing = getAlertSettings(userId);
  if (existing) {
    const stmt = getDb().prepare(`
      UPDATE alert_settings SET
        enabled = ?, email = ?, webhook_url = ?,
        cpu_threshold = ?, memory_threshold = ?, disk_threshold = ?,
        notify_on_down = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);
    return stmt.run(
      settings.enabled ? 1 : 0,
      settings.email || null,
      settings.webhookUrl || null,
      settings.cpuThreshold || 90,
      settings.memoryThreshold || 90,
      settings.diskThreshold || 85,
      settings.notifyOnDown ? 1 : 0,
      userId
    );
  } else {
    const stmt = getDb().prepare(`
      INSERT INTO alert_settings (user_id, enabled, email, webhook_url, cpu_threshold, memory_threshold, disk_threshold, notify_on_down)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userId,
      settings.enabled ? 1 : 0,
      settings.email || null,
      settings.webhookUrl || null,
      settings.cpuThreshold || 90,
      settings.memoryThreshold || 90,
      settings.diskThreshold || 85,
      settings.notifyOnDown ? 1 : 0
    );
  }
}

export function getAllAlertSettings() {
  return getDb().prepare('SELECT * FROM alert_settings WHERE enabled = 1').all();
}

// Alert history operations
export function addAlertHistory(alert) {
  const stmt = getDb().prepare(`
    INSERT INTO alert_history (user_id, server_id, alert_type, message, value, threshold, notified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    alert.userId,
    alert.serverId,
    alert.alertType,
    alert.message,
    alert.value,
    alert.threshold,
    alert.notified ? 1 : 0
  );
}

export function getAlertHistory(userId, limit = 50) {
  return getDb().prepare(`
    SELECT ah.*, s.name as server_name, s.host as server_host
    FROM alert_history ah
    LEFT JOIN servers s ON ah.server_id = s.id
    WHERE ah.user_id = ?
    ORDER BY ah.created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

export function getRecentAlert(userId, serverId, alertType, minutesAgo = 30) {
  const since = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT * FROM alert_history
    WHERE user_id = ? AND server_id = ? AND alert_type = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, serverId, alertType, since);
}

export function getServerOwner(serverId) {
  const server = getDb().prepare('SELECT user_id FROM servers WHERE id = ?').get(serverId);
  return server?.user_id;
}

// Vault operations
export function createVaultEntry(entry) {
  const stmt = getDb().prepare(`
    INSERT INTO vault (id, user_id, name, encrypted_username, encrypted_password, encrypted_url, encrypted_notes, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    entry.id,
    entry.userId,
    entry.name,
    entry.encryptedUsername || null,
    entry.encryptedPassword,
    entry.encryptedUrl || null,
    entry.encryptedNotes || null,
    entry.category || 'general'
  );
}

export function getVaultEntries(userId) {
  return getDb().prepare(`
    SELECT id, name, category, created_at, updated_at
    FROM vault WHERE user_id = ?
    ORDER BY name ASC
  `).all(userId);
}

export function getVaultEntry(id, userId) {
  return getDb().prepare('SELECT * FROM vault WHERE id = ? AND user_id = ?').get(id, userId);
}

export function updateVaultEntry(id, userId, updates) {
  const allowedFields = ['name', 'encrypted_username', 'encrypted_password', 'encrypted_url', 'encrypted_notes', 'category'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return { changes: 0 };

  const stmt = getDb().prepare(`
    UPDATE vault SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  return stmt.run(...values, id, userId);
}

export function deleteVaultEntry(id, userId) {
  return getDb().prepare('DELETE FROM vault WHERE id = ? AND user_id = ?').run(id, userId);
}

// ==================== UPTIME TRACKING ====================

// Add uptime event
export function addUptimeEvent(event) {
  const stmt = getDb().prepare(`
    INSERT INTO uptime_events (server_id, status, response_time, error_message)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(event.serverId, event.status, event.responseTime, event.errorMessage);
}

// Get uptime events for a server
export function getUptimeEvents(serverId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return getDb().prepare(`
    SELECT * FROM uptime_events
    WHERE server_id = ? AND created_at >= ?
    ORDER BY created_at DESC
  `).all(serverId, since);
}

// Update or create daily uptime stats
export function updateDailyUptimeStats(serverId, date, stats) {
  const existing = getDb().prepare(`
    SELECT * FROM uptime_daily_stats WHERE server_id = ? AND date = ?
  `).get(serverId, date);

  if (existing) {
    const stmt = getDb().prepare(`
      UPDATE uptime_daily_stats SET
        total_checks = ?, successful_checks = ?, failed_checks = ?,
        uptime_percent = ?, avg_response_time = ?, min_response_time = ?, max_response_time = ?
      WHERE server_id = ? AND date = ?
    `);
    return stmt.run(
      stats.totalChecks, stats.successfulChecks, stats.failedChecks,
      stats.uptimePercent, stats.avgResponseTime, stats.minResponseTime, stats.maxResponseTime,
      serverId, date
    );
  } else {
    const stmt = getDb().prepare(`
      INSERT INTO uptime_daily_stats (server_id, date, total_checks, successful_checks, failed_checks,
        uptime_percent, avg_response_time, min_response_time, max_response_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      serverId, date, stats.totalChecks, stats.successfulChecks, stats.failedChecks,
      stats.uptimePercent, stats.avgResponseTime, stats.minResponseTime, stats.maxResponseTime
    );
  }
}

// Get daily uptime stats for a server
export function getDailyUptimeStats(serverId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return getDb().prepare(`
    SELECT * FROM uptime_daily_stats
    WHERE server_id = ? AND date >= ?
    ORDER BY date ASC
  `).all(serverId, since);
}

// Get uptime summary for all servers
export function getUptimeSummary(userId) {
  return getDb().prepare(`
    SELECT
      s.id, s.name, s.host,
      (SELECT COUNT(*) FROM uptime_events ue WHERE ue.server_id = s.id AND ue.created_at >= datetime('now', '-24 hours')) as checks_24h,
      (SELECT COUNT(*) FROM uptime_events ue WHERE ue.server_id = s.id AND ue.status = 'up' AND ue.created_at >= datetime('now', '-24 hours')) as up_24h,
      (SELECT AVG(response_time) FROM uptime_events ue WHERE ue.server_id = s.id AND ue.status = 'up' AND ue.created_at >= datetime('now', '-24 hours')) as avg_response_24h,
      (SELECT status FROM uptime_events ue WHERE ue.server_id = s.id ORDER BY ue.created_at DESC LIMIT 1) as current_status
    FROM servers s
    WHERE s.user_id = ?
  `).all(userId);
}

// Cleanup old uptime events
export function cleanupOldUptimeEvents(daysToKeep = 30) {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
  return getDb().prepare('DELETE FROM uptime_events WHERE created_at < ?').run(cutoff);
}

// ==================== SSL CERTIFICATES ====================

// Create SSL certificate entry
export function createSSLCertificate(cert) {
  const stmt = getDb().prepare(`
    INSERT INTO ssl_certificates (id, user_id, domain, port, enabled, alert_days)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(cert.id, cert.userId, cert.domain, cert.port || 443, cert.enabled !== false ? 1 : 0, cert.alertDays || 30);
}

// Get all SSL certificates for a user
export function getSSLCertificates(userId) {
  return getDb().prepare(`
    SELECT * FROM ssl_certificates WHERE user_id = ? ORDER BY domain ASC
  `).all(userId);
}

// Get SSL certificate by ID
export function getSSLCertificate(id, userId) {
  return getDb().prepare('SELECT * FROM ssl_certificates WHERE id = ? AND user_id = ?').get(id, userId);
}

// Update SSL certificate
export function updateSSLCertificate(id, userId, updates) {
  const allowedFields = ['domain', 'port', 'enabled', 'issuer', 'subject', 'valid_from', 'valid_to',
    'days_until_expiry', 'last_checked', 'last_error', 'alert_days'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return { changes: 0 };

  const stmt = getDb().prepare(`
    UPDATE ssl_certificates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  return stmt.run(...values, id, userId);
}

// Delete SSL certificate
export function deleteSSLCertificate(id, userId) {
  return getDb().prepare('DELETE FROM ssl_certificates WHERE id = ? AND user_id = ?').run(id, userId);
}

// Get all enabled SSL certificates (for collector)
export function getAllEnabledSSLCertificates() {
  return getDb().prepare('SELECT * FROM ssl_certificates WHERE enabled = 1').all();
}

// ==================== BACKUP SCHEDULER ====================

// Create backup job
export function createBackupJob(job) {
  const stmt = getDb().prepare(`
    INSERT INTO backup_jobs (id, user_id, server_id, name, type, enabled, schedule,
      source_path, database_name, database_user, database_password, destination_path, retention_days, next_run)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const encryptedDbPass = job.databasePassword ? encrypt(job.databasePassword) : null;
  return stmt.run(
    job.id, job.userId, job.serverId, job.name, job.type, job.enabled !== false ? 1 : 0, job.schedule,
    job.sourcePath, job.databaseName, job.databaseUser, encryptedDbPass, job.destinationPath,
    job.retentionDays || 7, job.nextRun
  );
}

// Get backup jobs for a user
export function getBackupJobs(userId) {
  return getDb().prepare(`
    SELECT bj.*, s.name as server_name, s.host as server_host
    FROM backup_jobs bj
    LEFT JOIN servers s ON bj.server_id = s.id
    WHERE bj.user_id = ?
    ORDER BY bj.name ASC
  `).all(userId);
}

// Get backup job by ID (with decrypted password)
export function getBackupJob(id, userId) {
  const job = getDb().prepare('SELECT * FROM backup_jobs WHERE id = ? AND user_id = ?').get(id, userId);
  if (job && job.database_password) {
    job.database_password = decrypt(job.database_password);
  }
  return job;
}

// Update backup job
export function updateBackupJob(id, userId, updates) {
  const allowedFields = ['name', 'type', 'enabled', 'schedule', 'source_path', 'database_name',
    'database_user', 'destination_path', 'retention_days', 'last_run', 'next_run', 'last_status'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  // Handle password separately for encryption
  if (updates.database_password !== undefined) {
    fields.push('database_password = ?');
    values.push(updates.database_password ? encrypt(updates.database_password) : null);
  }

  if (fields.length === 0) return { changes: 0 };

  const stmt = getDb().prepare(`
    UPDATE backup_jobs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);
  return stmt.run(...values, id, userId);
}

// Delete backup job
export function deleteBackupJob(id, userId) {
  return getDb().prepare('DELETE FROM backup_jobs WHERE id = ? AND user_id = ?').run(id, userId);
}

// Get due backup jobs
export function getDueBackupJobs() {
  const now = new Date().toISOString();
  const jobs = getDb().prepare(`
    SELECT bj.*, s.host, s.port, s.username, s.auth_type, s.password, s.private_key
    FROM backup_jobs bj
    LEFT JOIN servers s ON bj.server_id = s.id
    WHERE bj.enabled = 1 AND bj.next_run <= ?
  `).all(now);

  // Decrypt credentials
  return jobs.map(job => ({
    ...job,
    database_password: job.database_password ? decrypt(job.database_password) : null,
    password: job.password ? decrypt(job.password) : null,
    private_key: job.private_key ? decrypt(job.private_key) : null
  }));
}

// Add backup history entry
export function addBackupHistory(history) {
  const stmt = getDb().prepare(`
    INSERT INTO backup_history (job_id, server_id, status, started_at, finished_at,
      duration_seconds, file_size, file_path, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    history.jobId, history.serverId, history.status, history.startedAt, history.finishedAt,
    history.durationSeconds, history.fileSize, history.filePath, history.errorMessage
  );
}

// Get backup history
export function getBackupHistory(userId, limit = 50) {
  return getDb().prepare(`
    SELECT bh.*, bj.name as job_name, s.name as server_name
    FROM backup_history bh
    LEFT JOIN backup_jobs bj ON bh.job_id = bj.id
    LEFT JOIN servers s ON bh.server_id = s.id
    WHERE bj.user_id = ?
    ORDER BY bh.created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

// Get backup history for a job
export function getBackupHistoryForJob(jobId, limit = 20) {
  return getDb().prepare(`
    SELECT * FROM backup_history WHERE job_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(jobId, limit);
}

// ==================== SECURITY AUDIT ====================

// Add security audit
export function addSecurityAudit(audit) {
  const stmt = getDb().prepare(`
    INSERT INTO security_audits (server_id, user_id, score, open_ports, pending_updates,
      security_updates, failed_ssh_attempts, findings, recommendations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    audit.serverId, audit.userId, audit.score,
    JSON.stringify(audit.openPorts), audit.pendingUpdates, audit.securityUpdates,
    audit.failedSshAttempts, JSON.stringify(audit.findings), JSON.stringify(audit.recommendations)
  );
}

// Get latest security audit for a server
export function getLatestSecurityAudit(serverId, userId) {
  const audit = getDb().prepare(`
    SELECT * FROM security_audits WHERE server_id = ? AND user_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(serverId, userId);

  if (audit) {
    audit.open_ports = JSON.parse(audit.open_ports || '[]');
    audit.findings = JSON.parse(audit.findings || '[]');
    audit.recommendations = JSON.parse(audit.recommendations || '[]');
  }
  return audit;
}

// Get all security audits for a user
export function getSecurityAudits(userId, limit = 50) {
  const audits = getDb().prepare(`
    SELECT sa.*, s.name as server_name, s.host as server_host
    FROM security_audits sa
    LEFT JOIN servers s ON sa.server_id = s.id
    WHERE sa.user_id = ?
    ORDER BY sa.created_at DESC
    LIMIT ?
  `).all(userId, limit);

  return audits.map(audit => ({
    ...audit,
    open_ports: JSON.parse(audit.open_ports || '[]'),
    findings: JSON.parse(audit.findings || '[]'),
    recommendations: JSON.parse(audit.recommendations || '[]')
  }));
}

// Get security audit settings
export function getSecurityAuditSettings(userId) {
  return getDb().prepare('SELECT * FROM security_audit_settings WHERE user_id = ?').get(userId);
}

// Upsert security audit settings
export function upsertSecurityAuditSettings(userId, settings) {
  const existing = getSecurityAuditSettings(userId);
  if (existing) {
    const stmt = getDb().prepare(`
      UPDATE security_audit_settings SET
        auto_audit_enabled = ?, audit_interval_hours = ?, score_threshold = ?,
        alert_on_critical = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);
    return stmt.run(
      settings.autoAuditEnabled ? 1 : 0, settings.auditIntervalHours || 24,
      settings.scoreThreshold || 70, settings.alertOnCritical ? 1 : 0, userId
    );
  } else {
    const stmt = getDb().prepare(`
      INSERT INTO security_audit_settings (user_id, auto_audit_enabled, audit_interval_hours,
        score_threshold, alert_on_critical)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userId, settings.autoAuditEnabled ? 1 : 0, settings.auditIntervalHours || 24,
      settings.scoreThreshold || 70, settings.alertOnCritical ? 1 : 0
    );
  }
}
