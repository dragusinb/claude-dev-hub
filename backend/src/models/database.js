import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'claude-dev-hub.db');

let db;

export function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      db = new Database(DB_PATH);

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
      `);

      // Run migrations for existing databases
      runMigrations();

      console.log('Database initialized at:', DB_PATH);
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

// Server operations
export function createServer(server) {
  const stmt = getDb().prepare(`
    INSERT INTO servers (id, user_id, name, host, port, username, auth_type, password, private_key, deploy_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(server.id, server.userId, server.name, server.host, server.port, server.username,
                  server.authType, server.password, server.privateKey, server.deployPath);
}

export function getServers(userId) {
  return getDb().prepare('SELECT id, name, host, port, username, auth_type, deploy_path, created_at FROM servers WHERE user_id = ?').all(userId);
}

export function getServer(id, userId) {
  return getDb().prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(id, userId);
}

export function deleteServer(id, userId) {
  return getDb().prepare('DELETE FROM servers WHERE id = ? AND user_id = ?').run(id, userId);
}

// User settings operations
export function getUserSetting(userId, key) {
  const row = getDb().prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : null;
}

export function setUserSetting(userId, key, value) {
  const stmt = getDb().prepare('INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)');
  return stmt.run(userId, key, value);
}

export function getUserSettings(userId) {
  const rows = getDb().prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
  const settings = {};
  rows.forEach(row => { settings[row.key] = row.value; });
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

// SVN credentials operations
export function createSvnCredential(cred) {
  const stmt = getDb().prepare(`
    INSERT INTO svn_credentials (id, user_id, name, url, username, password)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(cred.id, cred.userId, cred.name, cred.url, cred.username, cred.password);
}

export function getSvnCredentials(userId) {
  return getDb().prepare('SELECT id, name, url, username, created_at FROM svn_credentials WHERE user_id = ?').all(userId);
}

export function getSvnCredential(id, userId) {
  return getDb().prepare('SELECT * FROM svn_credentials WHERE id = ? AND user_id = ?').get(id, userId);
}

export function deleteSvnCredential(id, userId) {
  return getDb().prepare('DELETE FROM svn_credentials WHERE id = ? AND user_id = ?').run(id, userId);
}
