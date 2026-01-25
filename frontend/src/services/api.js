const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

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
