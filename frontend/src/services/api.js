import { getToken, logout } from './auth.js';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = getToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Projects
export function getProjects() {
  return request('/projects');
}

export function getProject(id) {
  return request(`/projects/${id}`);
}

export function createProject(data) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function updateProject(id, data) {
  return request(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export function deleteProject(id) {
  return request(`/projects/${id}`, {
    method: 'DELETE'
  });
}

// Git operations
export function gitPull(projectId) {
  return request(`/projects/${projectId}/git/pull`, {
    method: 'POST'
  });
}

export function gitStatus(projectId) {
  return request(`/projects/${projectId}/git/status`);
}

export function gitPush(projectId) {
  return request(`/projects/${projectId}/git/push`, {
    method: 'POST'
  });
}

// Files
export function getProjectFiles(projectId, path = '') {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  return request(`/projects/${projectId}/files${params}`);
}

export function getFileContent(projectId, path) {
  return request(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`);
}

// Servers
export function getServers() {
  return request('/servers');
}

export function getServer(id) {
  return request(`/servers/${id}`);
}

export function createServer(data) {
  return request('/servers', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function deleteServer(id) {
  return request(`/servers/${id}`, {
    method: 'DELETE'
  });
}

export function testServer(id) {
  return request(`/servers/${id}/test`, {
    method: 'POST'
  });
}

export function execOnServer(id, command) {
  return request(`/servers/${id}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command })
  });
}

// Settings
export function getSettings() {
  return request('/settings');
}

export function updateSettings(data) {
  return request('/settings', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function getClaudeStatus() {
  return request('/settings/claude-status');
}

// GitHub
export function getGitHubStatus() {
  return request('/github/status');
}

export function getGitHubRepos() {
  return request('/github/repos');
}

export function getRepoBranches(owner, repo) {
  return request(`/github/repos/${owner}/${repo}/branches`);
}

// Additional Git operations
export function gitCommit(projectId, message, files = null) {
  return request(`/projects/${projectId}/git/commit`, {
    method: 'POST',
    body: JSON.stringify({ message, files })
  });
}

export function gitLog(projectId, limit = 20) {
  return request(`/projects/${projectId}/git/log?limit=${limit}`);
}

export function gitBranches(projectId) {
  return request(`/projects/${projectId}/git/branches`);
}

export function gitCheckout(projectId, branch) {
  return request(`/projects/${projectId}/git/checkout`, {
    method: 'POST',
    body: JSON.stringify({ branch })
  });
}

export function gitDiff(projectId) {
  return request(`/projects/${projectId}/git/diff`);
}

// File editing
export function saveFileContent(projectId, filePath, content) {
  return request(`/projects/${projectId}/files/content`, {
    method: 'PUT',
    body: JSON.stringify({ path: filePath, content })
  });
}
