import * as pty from 'node-pty';
import { getProject } from '../models/database.js';
import { addChatMessage } from '../models/database.js';
import { URL } from 'url';

// Store active sessions
const sessions = new Map();

export function handleWebSocket(ws, req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Project ID required' }));
    ws.close();
    return;
  }

  const project = getProject(projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: 'Project not found' }));
    ws.close();
    return;
  }

  // Check if there's an existing session
  let session = sessions.get(projectId);

  if (!session) {
    // Create new Claude session
    try {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
      const shellArgs = process.platform === 'win32' ? [] : [];

      session = {
        pty: pty.spawn(shell, shellArgs, {
          name: 'xterm-color',
          cols: 120,
          rows: 30,
          cwd: project.local_path,
          env: {
            ...process.env,
            TERM: 'xterm-256color'
          }
        }),
        clients: new Set(),
        buffer: '',
        projectId
      };

      // Handle PTY output
      session.pty.onData((data) => {
        session.buffer += data;
        // Keep buffer limited
        if (session.buffer.length > 100000) {
          session.buffer = session.buffer.slice(-50000);
        }

        // Send to all connected clients
        for (const client of session.clients) {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({ type: 'output', data }));
          }
        }
      });

      session.pty.onExit(({ exitCode }) => {
        console.log(`Session for project ${projectId} exited with code ${exitCode}`);
        sessions.delete(projectId);

        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'exit', exitCode }));
          }
        }
      });

      sessions.set(projectId, session);

      // Start Claude in the terminal
      setTimeout(() => {
        session.pty.write('claude\r');
      }, 500);

    } catch (err) {
      console.error('Failed to create PTY session:', err);
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
    projectPath: project.local_path
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
    console.log(`Client disconnected from project ${projectId}. Remaining clients: ${session.clients.size}`);

    // Optionally close session if no clients
    // if (session.clients.size === 0) {
    //   session.pty.kill();
    //   sessions.delete(projectId);
    // }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    session.clients.delete(ws);
  });
}

// Get active session info
export function getActiveSession(projectId) {
  return sessions.get(projectId);
}

// Kill a session
export function killSession(projectId) {
  const session = sessions.get(projectId);
  if (session) {
    session.pty.kill();
    sessions.delete(projectId);
    return true;
  }
  return false;
}

// Get all active sessions
export function getActiveSessions() {
  return Array.from(sessions.keys());
}
