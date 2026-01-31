import { useState, useEffect } from 'react';
import { Save, Check, AlertCircle, Plus, Trash2, Server, TestTube } from 'lucide-react';
import { getSettings, updateSettings, getClaudeStatus, getSvnCredentials, createSvnCredential, deleteSvnCredential, testSvnCredential } from '../services/api';

function Settings() {
  const [settings, setSettings] = useState({
    anthropicApiKey: '',
    githubToken: ''
  });
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // SVN state
  const [svnCredentials, setSvnCredentials] = useState([]);
  const [showSvnModal, setShowSvnModal] = useState(false);
  const [svnForm, setSvnForm] = useState({ name: '', url: '', username: '', password: '' });
  const [creatingSvn, setCreatingSvn] = useState(false);
  const [testingId, setTestingId] = useState(null);

  useEffect(() => {
    loadSettings();
    checkClaudeStatus();
    loadSvnCredentials();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSettings();
      setSettings({
        anthropicApiKey: data.anthropicApiKey || '',
        githubToken: data.githubToken || ''
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkClaudeStatus() {
    try {
      const status = await getClaudeStatus();
      setClaudeStatus(status);
    } catch (err) {
      console.error('Failed to check Claude status:', err);
    }
  }

  async function loadSvnCredentials() {
    try {
      const creds = await getSvnCredentials();
      setSvnCredentials(creds);
    } catch (err) {
      console.error('Failed to load SVN credentials:', err);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        anthropicApiKey: settings.anthropicApiKey === '***configured***' ? undefined : settings.anthropicApiKey,
        githubToken: settings.githubToken === '***configured***' ? undefined : settings.githubToken
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSvn(e) {
    e.preventDefault();
    setCreatingSvn(true);
    try {
      await createSvnCredential(svnForm);
      setShowSvnModal(false);
      setSvnForm({ name: '', url: '', username: '', password: '' });
      await loadSvnCredentials();
    } catch (err) {
      alert('Failed to create SVN credential: ' + err.message);
    } finally {
      setCreatingSvn(false);
    }
  }

  async function handleDeleteSvn(id, name) {
    if (!confirm(`Delete SVN credential "${name}"?`)) return;
    try {
      await deleteSvnCredential(id);
      await loadSvnCredentials();
    } catch (err) {
      alert('Failed to delete SVN credential: ' + err.message);
    }
  }

  async function handleTestSvn(id) {
    setTestingId(id);
    try {
      const result = await testSvnCredential(id);
      if (result.success) {
        alert('Connection successful!');
      } else {
        alert('Connection failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Test failed: ' + err.message);
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Claude Status */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-6">
        <h2 className="font-semibold mb-2">Claude CLI Status</h2>
        {claudeStatus === null ? (
          <p className="text-slate-400 text-sm">Checking...</p>
        ) : claudeStatus.installed ? (
          <div className="flex items-center gap-2 text-green-500">
            <Check className="w-4 h-4" />
            <span>Installed - {claudeStatus.version}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span>Not installed</span>
          </div>
        )}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
        <h2 className="font-semibold mb-4">API Keys</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={settings.anthropicApiKey}
              onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 hover:text-orange-400"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              GitHub Token
            </label>
            <input
              type="password"
              value={settings.githubToken}
              onChange={(e) => setSettings({ ...settings, githubToken: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
              placeholder="ghp_..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Used for cloning private repositories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-green-500 text-sm">
              <Check className="w-4 h-4" />
              Saved!
            </span>
          )}
        </div>
      </form>

      {/* SVN Credentials */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">SVN Credentials</h2>
          <button
            onClick={() => setShowSvnModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add SVN Server
          </button>
        </div>

        {svnCredentials.length === 0 ? (
          <p className="text-slate-400 text-sm">No SVN credentials configured</p>
        ) : (
          <div className="space-y-2">
            {svnCredentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between p-3 bg-slate-900 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-slate-500" />
                  <div>
                    <p className="font-medium">{cred.name}</p>
                    <p className="text-sm text-slate-400 truncate max-w-xs">{cred.url}</p>
                    <p className="text-xs text-slate-500">User: {cred.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestSvn(cred.id)}
                    disabled={testingId !== null}
                    className="p-2 text-slate-400 hover:text-green-500 transition-colors disabled:opacity-50"
                    title="Test connection"
                  >
                    <TestTube className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteSvn(cred.id, cred.name)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
        <h3 className="font-medium mb-2">About CoffeePot DevOps</h3>
        <p className="text-sm text-slate-400">
          CoffeePot DevOps is a web-based development and operations platform that lets you manage
          servers, monitor SSL certificates, schedule backups, run security audits, and more.
          Each project gets its own terminal session where you can interact with AI to develop,
          debug, and deploy your code.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Version 1.0.0
        </p>
      </div>

      {/* SVN Modal */}
      {showSvnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold mb-4">Add SVN Server</h3>
            <form onSubmit={handleCreateSvn}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={svnForm.name}
                    onChange={(e) => setSvnForm({ ...svnForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="My SVN Server"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL</label>
                  <input
                    type="url"
                    value={svnForm.url}
                    onChange={(e) => setSvnForm({ ...svnForm, url: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="https://svn.example.com/repos"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input
                    type="text"
                    value={svnForm.username}
                    onChange={(e) => setSvnForm({ ...svnForm, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="username"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input
                    type="password"
                    value={svnForm.password}
                    onChange={(e) => setSvnForm({ ...svnForm, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="password"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowSvnModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSvn}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creatingSvn ? 'Adding...' : 'Add Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
