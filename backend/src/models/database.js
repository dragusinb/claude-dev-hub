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
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          git_url TEXT NOT NULL,
          local_path TEXT NOT NULL,
          description TEXT,
          target_server_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER DEFAULT 22,
          username TEXT NOT NULL,
          auth_type TEXT DEFAULT 'password',
          password TEXT,
          private_key TEXT,
          deploy_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('Database initialized at:', DB_PATH);
      resolve(db);
    } catch (err) {
      reject(err);
    }
  });
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
    INSERT INTO projects (id, name, git_url, local_path, description, target_server_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(project.id, project.name, project.gitUrl, project.localPath, project.description, project.targetServerId);
}

export function getProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

export function getProject(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function updateProject(id, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  const stmt = getDb().prepare(`UPDATE projects SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  return stmt.run(...values, id);
}

export function deleteProject(id) {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// Server operations
export function createServer(server) {
  const stmt = getDb().prepare(`
    INSERT INTO servers (id, name, host, port, username, auth_type, password, private_key, deploy_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(server.id, server.name, server.host, server.port, server.username,
                  server.authType, server.password, server.privateKey, server.deployPath);
}

export function getServers() {
  return getDb().prepare('SELECT id, name, host, port, username, auth_type, deploy_path, created_at FROM servers').all();
}

export function getServer(id) {
  return getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id);
}

export function deleteServer(id) {
  return getDb().prepare('DELETE FROM servers WHERE id = ?').run(id);
}

// Settings operations
export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  const stmt = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  return stmt.run(key, value);
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
