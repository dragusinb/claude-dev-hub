import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, RefreshCw, Server, AlertCircle, X, Play, Pause, Terminal } from 'lucide-react';
import { getServers, getCronJobs, addCronJob, deleteCronJob, getCronPresets } from '../services/api';

function CronJobs() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [presets, setPresets] = useState([]);

  useEffect(() => {
    loadServers();
    loadPresets();
  }, []);

  async function loadServers() {
    try {
      const data = await getServers();
      setServers(data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPresets() {
    try {
      const data = await getCronPresets();
      setPresets(data.presets || []);
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  }

  async function loadJobs(server) {
    setLoading(true);
    setError(null);
    try {
      const data = await getCronJobs(server.id);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  function handleServerSelect(server) {
    setSelectedServer(server);
    loadJobs(server);
  }

  async function handleDeleteJob(job) {
    if (!confirm(`Delete cron job?\n\n${job.rawLine}`)) return;

    try {
      await deleteCronJob(selectedServer.id, job.rawLine);
      loadJobs(selectedServer);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Cron Job Manager</h1>
        </div>
        {selectedServer && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Cron Job
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Server Selection */}
        <div className="lg:col-span-1">
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" />
              Select Server
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedServer?.id === server.id
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-medium truncate">{server.name}</div>
                  <div className="text-xs text-slate-500 truncate">{server.host}</div>
                </button>
              ))}
              {servers.length === 0 && (
                <div className="text-slate-500 text-sm text-center py-4">
                  No servers available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cron Jobs List */}
        <div className="lg:col-span-3">
          {selectedServer ? (
            <div className="bg-slate-800 rounded-lg">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedServer.name}</h2>
                  <p className="text-sm text-slate-400">{jobs.length} cron jobs found</p>
                </div>
                <button
                  onClick={() => loadJobs(selectedServer)}
                  disabled={loading}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                  Loading cron jobs...
                </div>
              ) : jobs.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No cron jobs found on this server</p>
                  <p className="text-sm mt-2">Click "Add Cron Job" to create one</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {jobs.map(job => (
                    <div key={job.id} className="p-4 hover:bg-slate-700/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <code className="px-2 py-1 bg-slate-900 rounded text-orange-400 text-sm font-mono">
                              {job.schedule.expression}
                            </code>
                            <span className="text-sm text-slate-400">{job.description}</span>
                            {job.isSystem && (
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                System
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm font-mono text-slate-300 bg-slate-900 p-2 rounded overflow-x-auto">
                            <Terminal className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            <span className="whitespace-nowrap">{job.command}</span>
                          </div>
                        </div>
                        {!job.isSystem && (
                          <button
                            onClick={() => handleDeleteJob(job)}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg flex items-center justify-center h-64">
              <div className="text-center text-slate-500">
                <Server className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a server to view cron jobs</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Cron Job Modal */}
      {showModal && selectedServer && (
        <AddCronJobModal
          server={selectedServer}
          presets={presets}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); loadJobs(selectedServer); }}
        />
      )}
    </div>
  );
}

function AddCronJobModal({ server, presets, onClose, onSave }) {
  const [form, setForm] = useState({
    minute: '*',
    hour: '*',
    dayOfMonth: '*',
    month: '*',
    dayOfWeek: '*',
    command: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('');

  function applyPreset(expression) {
    const parts = expression.split(' ');
    if (parts.length === 5) {
      setForm({
        ...form,
        minute: parts[0],
        hour: parts[1],
        dayOfMonth: parts[2],
        month: parts[3],
        dayOfWeek: parts[4]
      });
    }
  }

  function handlePresetChange(e) {
    const value = e.target.value;
    setSelectedPreset(value);
    if (value) {
      applyPreset(value);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.command.trim()) {
      setError('Command is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addCronJob(server.id, form);
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const cronExpression = `${form.minute} ${form.hour} ${form.dayOfMonth} ${form.month} ${form.dayOfWeek}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-xl">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Cron Job</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Preset Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Quick Preset</label>
            <select
              value={selectedPreset}
              onChange={handlePresetChange}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
            >
              <option value="">Custom schedule...</option>
              {presets.map(preset => (
                <option key={preset.expression} value={preset.expression}>
                  {preset.name} ({preset.expression})
                </option>
              ))}
            </select>
          </div>

          {/* Cron Expression Builder */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Schedule (Cron Expression)</label>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Minute</label>
                <input
                  type="text"
                  value={form.minute}
                  onChange={(e) => { setForm({ ...form, minute: e.target.value }); setSelectedPreset(''); }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                  placeholder="*"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hour</label>
                <input
                  type="text"
                  value={form.hour}
                  onChange={(e) => { setForm({ ...form, hour: e.target.value }); setSelectedPreset(''); }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                  placeholder="*"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Day</label>
                <input
                  type="text"
                  value={form.dayOfMonth}
                  onChange={(e) => { setForm({ ...form, dayOfMonth: e.target.value }); setSelectedPreset(''); }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                  placeholder="*"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Month</label>
                <input
                  type="text"
                  value={form.month}
                  onChange={(e) => { setForm({ ...form, month: e.target.value }); setSelectedPreset(''); }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                  placeholder="*"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Weekday</label>
                <input
                  type="text"
                  value={form.dayOfWeek}
                  onChange={(e) => { setForm({ ...form, dayOfWeek: e.target.value }); setSelectedPreset(''); }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-mono"
                  placeholder="*"
                />
              </div>
            </div>
            <div className="mt-2 p-2 bg-slate-900 rounded text-center font-mono text-orange-400">
              {cronExpression}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Format: minute (0-59), hour (0-23), day (1-31), month (1-12), weekday (0-7, 0 or 7 is Sunday)
            </p>
          </div>

          {/* Command */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Command *</label>
            <textarea
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm h-24"
              placeholder="/usr/bin/php /var/www/myapp/artisan schedule:run >> /var/log/cron.log 2>&1"
            />
          </div>

          {/* Preview */}
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Full crontab entry:</div>
            <code className="text-sm text-green-400 font-mono break-all">
              {cronExpression} {form.command || '[command]'}
            </code>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Cron Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CronJobs;
