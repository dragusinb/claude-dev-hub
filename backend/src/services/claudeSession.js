import * as pty from 'node-pty';
import jwt from 'jsonwebtoken';
import { getProject, getUserById } from '../models/database.js';
import { spawn, execSync } from 'child_process';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'claude-dev-hub-secret-key-change-in-production';
const USE_DOCKER = process.env.USE_DOCKER !== 'false'; // Default to true
const DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'claude-session:latest';
const CLAUDE_CREDENTIALS_PATH = process.env.CLAUDE_CREDENTIALS_PATH || '/root/.claude';

// Store active sessions
const sessions = new Map();

// Generate unique container name for a session
function getContainerName(projectId, userId) {
  // Use short hash to keep container name reasonable length
  const shortProjectId = projectId.substring(0, 8);
  const shortUserId = userId.substring(0, 8);
  return `claude-session-${shortUserId}-${shortProjectId}`;
}

// Check if a container exists and is running
function isContainerRunning(containerName) {
  try {
    const result = execSync(`docker inspect -f '{{.State.Running}}' ${containerName} 2>/dev/null`, {
      encoding: 'utf-8'
    }).trim();
    return result === 'true';
  } catch {
    return false;
  }
}

// Stop and remove a container
function removeContainer(containerName) {
  try {
    execSync(`docker rm -f ${containerName} 2>/dev/null`, { encoding: 'utf-8' });
  } catch {
    // Container might not exist, that's ok
  }
}

// Start a Docker container for a session
function startDockerContainer(containerName, projectPath, userId) {
  // Remove any existing container with the same name
  removeContainer(containerName);

  // Build docker run command
  const dockerArgs = [
    'run',
    '-d',
    '--name', containerName,
    // Resource limits to prevent abuse
    '--memory=2g',
    '--cpus=2',
    '--pids-limit=256',
    // Mount project directory
    '-v', `${projectPath}:/workspace:rw`,
    // Mount only Claude credentials file (read-only) - let container manage its own .claude dir
    '-v', `${CLAUDE_CREDENTIALS_PATH}/.credentials.json:/home/claude/.claude/.credentials.json:ro`,
    // Set working directory
    '-w', '/workspace',
    // Environment
    '-e', 'TERM=xterm-256color',
    '-e', `USER_ID=${userId}`,
    '-e', 'HOME=/home/claude',
    // Use the claude-session image
    DOCKER_IMAGE
  ];

  try {
    execSync(`docker ${dockerArgs.join(' ')}`, { encoding: 'utf-8' });
    console.log(`Started Docker container: ${containerName}`);
    return true;
  } catch (err) {
    console.error(`Failed to start Docker container: ${err.message}`);
    return false;
  }
}

// Create a PTY attached to docker exec
function createDockerPty(containerName, cols, rows) {
  const shell = '/bin/bash';

  // Use docker exec to attach to the container
  const ptyProcess = pty.spawn('docker', [
    'exec',
    '-it',
    '-e', 'TERM=xterm-256color',
    containerName,
    shell
  ], {
    name: 'xterm-color',
    cols: cols || 120,
    rows: rows || 30,
    env: {
      ...process.env,
      TERM: 'xterm-256color'
    }
  });

  return ptyProcess;
}

// Create a direct PTY (non-Docker, for development/fallback)
function createDirectPty(projectPath, cols, rows) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';

  return pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: cols || 120,
    rows: rows || 30,
    cwd: projectPath,
    env: {
      ...process.env,
      TERM: 'xterm-256color'
    }
  });
}

export async function handleWebSocket(ws, req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const projectId = url.searchParams.get('projectId');
  const token = url.searchParams.get('token');

  if (!projectId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Project ID required' }));
    ws.close();
    return;
  }

  // Verify JWT token
  let userId;
  try {
    if (!token) {
      throw new Error('Authentication required');
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.id;
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
    ws.close();
    return;
  }

  const project = getProject(projectId, userId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: 'Project not found' }));
    ws.close();
    return;
  }

  // Create session key that includes user ID for isolation
  const sessionKey = `${userId}:${projectId}`;

  // Check if there's an existing session for THIS user's project
  let session = sessions.get(sessionKey);

  if (!session) {
    // Create new session
    try {
      let ptyProcess;
      let containerName = null;

      if (USE_DOCKER) {
        // Docker-based isolation
        containerName = getContainerName(projectId, userId);

        // Start container if not running
        if (!isContainerRunning(containerName)) {
          const started = startDockerContainer(containerName, project.local_path, userId);
          if (!started) {
            throw new Error('Failed to start isolated container');
          }
          // Give container a moment to fully start
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        ptyProcess = createDockerPty(containerName, 120, 30);
      } else {
        // Direct PTY (development mode or Docker not available)
        ptyProcess = createDirectPty(project.local_path, 120, 30);
      }

      session = {
        pty: ptyProcess,
        clients: new Set(),
        buffer: '',
        projectId,
        userId,
        containerName,
        useDocker: USE_DOCKER,
        themeSelected: false,
        welcomeHandled: false,
        autoResponsePending: false,
        lastAutoResponse: 0
      };

      // Handle PTY output
      session.pty.onData((data) => {
        session.buffer += data;
        // Keep buffer limited
        if (session.buffer.length > 100000) {
          session.buffer = session.buffer.slice(-50000);
        }

        // Recent buffer for prompt detection (last 2000 chars)
        const recentBuffer = session.buffer.slice(-2000).toLowerCase();
        const now = Date.now();

        // Debounce auto-responses (at least 500ms between responses)
        const canAutoRespond = !session.autoResponsePending && (now - session.lastAutoResponse > 500);

        // Auto-respond to Claude's theme selection prompt
        // Various patterns Claude might use for theme selection
        if (canAutoRespond && !session.themeSelected && (
          recentBuffer.includes('pick a theme') ||
          recentBuffer.includes('choose a theme') ||
          recentBuffer.includes('select a theme') ||
          recentBuffer.includes('which theme') ||
          (recentBuffer.includes('theme') && recentBuffer.includes('1)') && recentBuffer.includes('2)'))
        )) {
          session.themeSelected = true;
          session.autoResponsePending = true;
          console.log(`[Claude Session ${sessionKey}] Auto-selecting theme (Dark)`);
          setTimeout(() => {
            session.pty.write('1\r'); // Select first theme option (usually Dark)
            session.autoResponsePending = false;
            session.lastAutoResponse = Date.now();
          }, 400);
        }

        // Handle "Welcome to Claude" first-run prompts
        if (canAutoRespond && !session.welcomeHandled && (
          recentBuffer.includes('press enter to continue') ||
          recentBuffer.includes('press enter to start') ||
          recentBuffer.includes('press any key')
        )) {
          session.welcomeHandled = true;
          session.autoResponsePending = true;
          console.log(`[Claude Session ${sessionKey}] Auto-continuing welcome prompt`);
          setTimeout(() => {
            session.pty.write('\r');
            session.autoResponsePending = false;
            session.lastAutoResponse = Date.now();
          }, 400);
        }

        // Handle trust project prompt (Claude asks if you trust this project)
        if (canAutoRespond && (
          recentBuffer.includes('do you trust') ||
          recentBuffer.includes('trust this') ||
          (recentBuffer.includes('y/n') && recentBuffer.includes('trust'))
        )) {
          session.autoResponsePending = true;
          console.log(`[Claude Session ${sessionKey}] Auto-accepting trust prompt`);
          setTimeout(() => {
            session.pty.write('y\r');
            session.autoResponsePending = false;
            session.lastAutoResponse = Date.now();
          }, 400);
        }

        // Handle first-time setup prompts that might ask for confirmation
        if (canAutoRespond && (
          (recentBuffer.includes('continue') && recentBuffer.includes('y/n')) ||
          (recentBuffer.includes('proceed') && recentBuffer.includes('y/n'))
        )) {
          session.autoResponsePending = true;
          console.log(`[Claude Session ${sessionKey}] Auto-accepting continue prompt`);
          setTimeout(() => {
            session.pty.write('y\r');
            session.autoResponsePending = false;
            session.lastAutoResponse = Date.now();
          }, 400);
        }

        // Send to all connected clients
        for (const client of session.clients) {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({ type: 'output', data }));
          }
        }
      });

      session.pty.onExit(({ exitCode }) => {
        console.log(`Session ${sessionKey} exited with code ${exitCode}`);

        // Clean up container if using Docker
        if (session.containerName) {
          removeContainer(session.containerName);
        }

        sessions.delete(sessionKey);

        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'exit', exitCode }));
          }
        }
      });

      sessions.set(sessionKey, session);

      // Start Claude in the terminal
      setTimeout(() => {
        session.pty.write('claude\r');
      }, USE_DOCKER ? 1000 : 500);

    } catch (err) {
      console.error('Failed to create session:', err);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to start session: ${err.message}` }));
      ws.close();
      return;
    }
  }

  // Add this client to the session
  session.clients.add(ws);

  // Send session info
  ws.send(JSON.stringify({
    type: 'connected',
    projectId,
    projectName: project.name,
    projectPath: project.local_path,
    isolated: USE_DOCKER
  }));

  // Send buffered output
  if (session.buffer) {
    ws.send(JSON.stringify({ type: 'output', data: session.buffer }));
  }

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.type) {
        case 'input':
          // Send input to PTY
          session.pty.write(msg.data);
          break;

        case 'resize':
          // Resize terminal
          if (msg.cols && msg.rows) {
            session.pty.resize(msg.cols, msg.rows);
          }
          break;

        case 'restart':
          // Restart Claude session
          session.themeSelected = false;
          session.welcomeHandled = false;
          session.autoResponsePending = false;
          session.lastAutoResponse = 0;
          session.buffer = ''; // Clear buffer for fresh detection
          console.log(`[Claude Session ${sessionKey}] Restarting Claude`);
          session.pty.write('\x03'); // Ctrl+C
          setTimeout(() => {
            session.pty.write('claude\r');
          }, 500);
          break;

        default:
          console.log('Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    session.clients.delete(ws);
    console.log(`Client disconnected from session ${sessionKey}. Remaining clients: ${session.clients.size}`);

    // Optionally close session and container if no clients after timeout
    if (session.clients.size === 0) {
      setTimeout(() => {
        const currentSession = sessions.get(sessionKey);
        if (currentSession && currentSession.clients.size === 0) {
          console.log(`Cleaning up idle session: ${sessionKey}`);
          currentSession.pty.kill();
          if (currentSession.containerName) {
            removeContainer(currentSession.containerName);
          }
          sessions.delete(sessionKey);
        }
      }, 300000); // 5 minutes idle timeout
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    session.clients.delete(ws);
  });
}

// Get active session info
export function getActiveSession(projectId, userId) {
  const sessionKey = `${userId}:${projectId}`;
  return sessions.get(sessionKey);
}

// Kill a session
export function killSession(projectId, userId) {
  const sessionKey = `${userId}:${projectId}`;
  const session = sessions.get(sessionKey);
  if (session) {
    session.pty.kill();
    if (session.containerName) {
      removeContainer(session.containerName);
    }
    sessions.delete(sessionKey);
    return true;
  }
  return false;
}

// Get all active sessions
export function getActiveSessions() {
  return Array.from(sessions.entries()).map(([key, session]) => ({
    key,
    projectId: session.projectId,
    userId: session.userId,
    containerName: session.containerName,
    clientCount: session.clients.size
  }));
}

// Cleanup all containers on shutdown
export function cleanupAllSessions() {
  console.log('Cleaning up all sessions...');
  for (const [key, session] of sessions) {
    try {
      session.pty.kill();
      if (session.containerName) {
        removeContainer(session.containerName);
      }
    } catch (err) {
      console.error(`Error cleaning up session ${key}:`, err);
    }
  }
  sessions.clear();
}

// Handle process exit
process.on('SIGTERM', cleanupAllSessions);
process.on('SIGINT', cleanupAllSessions);
