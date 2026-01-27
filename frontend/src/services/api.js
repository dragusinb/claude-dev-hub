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

export function updateServer(id, data) {
  return request(`/servers/${id}`, {
    method: 'PATCH',
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

// SVN operations
export function getSvnCredentials() {
  return request('/svn/credentials');
}

export function getSvnCredential(id) {
  return request(`/svn/credentials/${id}`);
}

export function createSvnCredential(data) {
  return request('/svn/credentials', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function deleteSvnCredential(id) {
  return request(`/svn/credentials/${id}`, {
    method: 'DELETE'
  });
}

export function testSvnCredential(id) {
  return request(`/svn/credentials/${id}/test`, {
    method: 'POST'
  });
}

export function getSvnRepos(credentialId, path = '') {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  return request(`/svn/credentials/${credentialId}/repos${params}`);
}

export function checkoutSvn(data) {
  return request('/svn/checkout', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// Server monitoring
export function getServerHealth(id) {
  return request(`/servers/${id}/health`);
}

export function getServerHealthHistory(id, hours = 24) {
  return request(`/servers/${id}/health/history?hours=${hours}`);
}

// Activity log
export function getActivityLog(limit = 50) {
  return request(`/activity?limit=${limit}`);
}

// Deploy history
export function getDeployHistory(limit = 50) {
  return request(`/deploy-history?limit=${limit}`);
}

// Alert settings
export function getAlertSettings() {
  return request('/alerts/settings');
}

export function updateAlertSettings(settings) {
  return request('/alerts/settings', {
    method: 'POST',
    body: JSON.stringify(settings)
  });
}

export function getAlertHistory(limit = 50) {
  return request(`/alerts/history?limit=${limit}`);
}

export function sendTestEmail(email) {
  return request('/alerts/test-email', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

// Vault operations
export function getVaultStatus() {
  return request('/vault/status');
}

export function getVaultEntries() {
  return request('/vault');
}

export function getVaultEntry(id) {
  return request(`/vault/${id}`);
}

export function createVaultEntry(data) {
  return request('/vault', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function updateVaultEntry(id, data) {
  return request(`/vault/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

export function deleteVaultEntry(id) {
  return request(`/vault/${id}`, {
    method: 'DELETE'
  });
}

export function syncVaultCredentials() {
  return request('/vault/sync', {
    method: 'POST'
  });
}
