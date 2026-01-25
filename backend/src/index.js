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
import { initDatabase, getUserByEmail } from './models/database.js';
import { handleWebSocket } from './services/claudeSession.js';
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
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
