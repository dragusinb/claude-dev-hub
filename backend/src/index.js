import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import projectRoutes from './routes/projects.js';
import serverRoutes from './routes/servers.js';
import settingsRoutes from './routes/settings.js';
import authRoutes, { authenticateToken } from './routes/auth.js';
import githubRoutes from './routes/github.js';
import svnRoutes from './routes/svn.js';
import monitoringRoutes from './routes/monitoring.js';
import vaultRoutes from './routes/vault.js';
import uptimeRoutes from './routes/uptime.js';
import sslRoutes from './routes/ssl.js';
import backupsRoutes from './routes/backups.js';
import securityRoutes from './routes/security.js';
import contaboRoutes from './routes/contabo.js';
import logsRoutes from './routes/logs.js';
import deploymentsRoutes from './routes/deployments.js';
import cronRoutes from './routes/cron.js';
import { initDatabase, getUserByEmail } from './models/database.js';
import { handleWebSocket } from './services/claudeSession.js';
import { startHealthCollector } from './services/healthCollector.js';
import { startSSLCollector } from './services/sslCollector.js';
import { startBackupScheduler } from './services/backupScheduler.js';
import { startSecurityAuditor } from './services/securityAuditor.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createUser } from './models/database.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend in production
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected API Routes
app.use('/api/projects', authenticateToken, projectRoutes);
app.use('/api/servers', authenticateToken, serverRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/github', authenticateToken, githubRoutes);
app.use('/api/svn', authenticateToken, svnRoutes);
app.use('/api/vault', authenticateToken, vaultRoutes);
app.use('/api/uptime', authenticateToken, uptimeRoutes);
app.use('/api/ssl', authenticateToken, sslRoutes);
app.use('/api/backups', authenticateToken, backupsRoutes);
app.use('/api/security', authenticateToken, securityRoutes);
app.use('/api/contabo', authenticateToken, contaboRoutes);
app.use('/api/logs', authenticateToken, logsRoutes);
app.use('/api/deployments', authenticateToken, deploymentsRoutes);
app.use('/api/cron', authenticateToken, cronRoutes);
app.use('/api', authenticateToken, monitoringRoutes);

// WebSocket for Claude sessions
wss.on('connection', (ws, req) => {
  console.log('WebSocket connection established');
  handleWebSocket(ws, req);
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

async function createInitialUser() {
  const email = 'dragusinb@gmail.com';
  const password = 'aibuddy123';

  const existingUser = getUserByEmail(email);
  if (!existingUser) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    createUser({
      id: uuidv4(),
      email,
      passwordHash,
      name: 'Bogdan'
    });
    console.log(`Initial user created: ${email}`);
  }
}

initDatabase().then(async () => {
  await createInitialUser();

  // Start health collector (every 5 minutes)
  startHealthCollector(5);

  // Start SSL certificate collector (every 6 hours)
  startSSLCollector(6);

  // Start backup scheduler (checks every minute)
  startBackupScheduler();

  // Start security auditor (runs every 24 hours)
  startSecurityAuditor(24);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
