import { useState, useEffect } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { getSettings, updateSettings, getClaudeStatus } from '../services/api';

function Settings() {
  const [settings, setSettings] = useState({
    anthropicApiKey: '',
    githubToken: ''
  });
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    checkClaudeStatus();
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
      <form onSubmit={handleSave} className="bg-slate-800 rounded-lg border border-slate-700 p-6">
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

      {/* Info */}
      <div className="mt-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
        <h3 className="font-medium mb-2">About Claude Dev Hub</h3>
        <p className="text-sm text-slate-400">
          Claude Dev Hub is a web-based development environment that lets you manage
          multiple projects with AI assistance. Each project gets its own Claude
          terminal session where you can interact with the AI to develop, debug,
          and deploy your code.
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Version 1.0.0
        </p>
      </div>
    </div>
  );
}

export default Settings;
