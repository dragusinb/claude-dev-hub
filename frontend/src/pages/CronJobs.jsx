import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, RefreshCw, Server, AlertCircle, X, Terminal, Calendar, Zap, Sun, Moon, CalendarDays, CalendarRange } from 'lucide-react';
import { getServers, getCronJobs, addCronJob, deleteCronJob, toggleCronJob, getCronPresets } from '../services/api';

// Parse cron expression to get human-readable next runs
function getNextRuns(expression, count = 3) {
  try {
    const parts = expression.split(' ');
    if (parts.length !== 5) return [];

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const runs = [];

    // Simple next run calculation for common patterns
    for (let i = 0; i < 24 * 7 && runs.length < count; i++) {
      const checkTime = new Date(now.getTime() + i * 60 * 60 * 1000);

      const matchMinute = minute === '*' || parseInt(minute) === checkTime.getMinutes();
      const matchHour = hour === '*' || parseInt(hour) === checkTime.getHours();
      const matchDay = dayOfMonth === '*' || parseInt(dayOfMonth) === checkTime.getDate();
      const matchMonth = month === '*' || parseInt(month) === (checkTime.getMonth() + 1);
      const matchWeekday = dayOfWeek === '*' || parseInt(dayOfWeek) === checkTime.getDay();

      if (matchMinute && matchHour && matchDay && matchMonth && matchWeekday) {
        if (checkTime > now) {
          runs.push(checkTime);
        }
      }
    }

    return runs;
  } catch {
    return [];
  }
}

// Get frequency category from cron expression
function getFrequency(expression) {
  const parts = expression.split(' ');
  if (parts.length !== 5) return { type: 'custom', label: 'Custom', color: 'slate' };

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { type: 'hourly', label: 'Hourly', color: 'blue', icon: Clock };
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { type: 'daily', label: 'Daily', color: 'green', icon: Sun };
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    return { type: 'weekly', label: 'Weekly', color: 'purple', icon: CalendarDays };
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return { type: 'monthly', label: 'Monthly', color: 'orange', icon: CalendarRange };
  }
  if (minute === '*/5' || minute === '*/10' || minute === '*/15' || minute === '*/30') {
    return { type: 'frequent', label: `Every ${minute.split('/')[1]}m`, color: 'cyan', icon: Zap };
  }

  return { type: 'custom', label: 'Custom', color: 'slate', icon: Calendar };
}

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
    if (!confirm(`Delete this cron job?\n\n${job.command}`)) return;

    try {
      await deleteCronJob(selectedServer.id, job.rawLine);
      loadJobs(selectedServer);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleJob(job) {
    try {
      await toggleCronJob(selectedServer.id, job.rawLine, !job.enabled);
      loadJobs(selectedServer);
    } catch (err) {
      setError(err.message);
    }
  }

  // Group jobs by frequency
  const groupedJobs = jobs.reduce((acc, job) => {
    const freq = getFrequency(job.schedule?.expression || '');
    if (!acc[freq.type]) acc[freq.type] = [];
    acc[freq.type].push({ ...job, frequency: freq });
    return acc;
  }, {});

  const frequencyOrder = ['frequent', 'hourly', 'daily', 'weekly', 'monthly', 'custom'];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cron Job Manager</h1>
            <p className="text-slate-400 text-sm">Schedule and manage automated tasks</p>
          </div>
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
          <div className="bg-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" />
              Select Server
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedServer?.id === server.id
                      ? 'bg-gradient-to-r from-orange-500/20 to-orange-600/10 text-orange-400 border border-orange-500/30 shadow-lg shadow-orange-500/10'
                      : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-transparent'
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

          {/* Quick Stats */}
          {selectedServer && !loading && jobs.length > 0 && (
            <div className="mt-4 bg-slate-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-3">Schedule Overview</h2>
              <div className="space-y-2">
                {frequencyOrder.map(type => {
                  const jobsOfType = groupedJobs[type] || [];
                  if (jobsOfType.length === 0) return null;
                  const freq = jobsOfType[0].frequency;
                  const FreqIcon = freq.icon || Clock;
                  return (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <FreqIcon className={`w-4 h-4 text-${freq.color}-400`} />
                        <span className="text-slate-300">{freq.label}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs bg-${freq.color}-500/20 text-${freq.color}-400`}>
                        {jobsOfType.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Cron Jobs List */}
        <div className="lg:col-span-3 overflow-auto">
          {selectedServer ? (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{selectedServer.name}</h2>
                  <p className="text-sm text-slate-400">
                    {jobs.length} cron job{jobs.length !== 1 ? 's' : ''} scheduled
                  </p>
                </div>
                <button
                  onClick={() => loadJobs(selectedServer)}
                  disabled={loading}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loading ? (
                <div className="bg-slate-800 rounded-xl p-12 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                  Loading cron jobs...
                </div>
              ) : jobs.length === 0 ? (
                <div className="bg-slate-800 rounded-xl p-12 text-center text-slate-500">
                  <Clock className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">No cron jobs found</p>
                  <p className="text-sm mt-2">Click "Add Cron Job" to schedule your first task</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {jobs.map(job => {
                    const freq = getFrequency(job.schedule?.expression || '');
                    const FreqIcon = freq.icon || Clock;
                    const nextRuns = getNextRuns(job.schedule?.expression || '');

                    return (
                      <div
                        key={job.id}
                        className={`bg-slate-800 rounded-xl p-4 border-l-4 transition-all hover:bg-slate-750 ${
                          job.enabled !== false
                            ? `border-${freq.color}-500`
                            : 'border-slate-600 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Header with frequency badge and schedule */}
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-${freq.color}-500/20`}>
                                <FreqIcon className={`w-3.5 h-3.5 text-${freq.color}-400`} />
                                <span className={`text-xs font-medium text-${freq.color}-400`}>{freq.label}</span>
                              </div>
                              <code className="px-2 py-1 bg-slate-900 rounded text-orange-400 text-sm font-mono">
                                {job.schedule?.expression}
                              </code>
                              {job.schedule?.description && (
                                <span className="text-sm text-slate-400 hidden sm:inline">
                                  {job.schedule.description}
                                </span>
                              )}
                              {job.isSystem && (
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                  System
                                </span>
                              )}
                            </div>

                            {/* Command */}
                            <div className="flex items-center gap-2 text-sm font-mono text-slate-300 bg-slate-900/80 p-3 rounded-lg overflow-x-auto">
                              <Terminal className="w-4 h-4 text-green-500 flex-shrink-0" />
                              <span className="whitespace-nowrap">{job.command}</span>
                            </div>

                            {/* Next runs */}
                            {nextRuns.length > 0 && job.enabled !== false && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                <span>Next: </span>
                                {nextRuns.slice(0, 2).map((run, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-slate-700 rounded">
                                    {run.toLocaleString('en-US', {
                                      weekday: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            {!job.isSystem && (
                              <>
                                <button
                                  onClick={() => handleToggleJob(job)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    job.enabled !== false
                                      ? 'text-green-400 hover:bg-green-500/20'
                                      : 'text-slate-500 hover:bg-slate-700'
                                  }`}
                                  title={job.enabled !== false ? 'Disable' : 'Enable'}
                                >
                                  {job.enabled !== false ? (
                                    <Zap className="w-4 h-4" />
                                  ) : (
                                    <Moon className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteJob(job)}
                                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl flex items-center justify-center h-full min-h-64">
              <div className="text-center text-slate-500">
                <Server className="w-16 h-16 mx-auto mb-4 opacity-30" />
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
    minute: '0',
    hour: '*',
    dayOfMonth: '*',
    month: '*',
    dayOfWeek: '*',
    command: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('visual');

  const quickSchedules = [
    { label: 'Every minute', expression: '* * * * *', icon: Zap },
    { label: 'Every 5 minutes', expression: '*/5 * * * *', icon: Zap },
    { label: 'Every 15 minutes', expression: '*/15 * * * *', icon: Zap },
    { label: 'Every hour', expression: '0 * * * *', icon: Clock },
    { label: 'Every 6 hours', expression: '0 */6 * * *', icon: Clock },
    { label: 'Daily at midnight', expression: '0 0 * * *', icon: Moon },
    { label: 'Daily at noon', expression: '0 12 * * *', icon: Sun },
    { label: 'Weekly (Sunday)', expression: '0 0 * * 0', icon: CalendarDays },
    { label: 'Monthly (1st)', expression: '0 0 1 * *', icon: CalendarRange },
  ];

  function applySchedule(expression) {
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
  const freq = getFrequency(cronExpression);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add Cron Job</h2>
            <p className="text-sm text-slate-400">Schedule a task on {server.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Schedule Tabs */}
          <div className="flex gap-2 p-1 bg-slate-900 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'visual' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Visual Builder
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('quick')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'quick' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Quick Schedules
            </button>
          </div>

          {activeTab === 'quick' ? (
            <div className="grid grid-cols-3 gap-2">
              {quickSchedules.map(({ label, expression, icon: Icon }) => {
                const isSelected = cronExpression === expression;
                return (
                  <button
                    key={expression}
                    type="button"
                    onClick={() => applySchedule(expression)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                        : 'bg-slate-700/50 border-slate-600 hover:border-slate-500 text-slate-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1 ${isSelected ? 'text-orange-400' : 'text-slate-400'}`} />
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-slate-500 font-mono">{expression}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Visual Schedule Builder */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { key: 'minute', label: 'Minute', hint: '0-59 or *', options: ['*', '0', '15', '30', '45', '*/5', '*/15'] },
                  { key: 'hour', label: 'Hour', hint: '0-23 or *', options: ['*', '0', '6', '12', '18', '*/2', '*/6'] },
                  { key: 'dayOfMonth', label: 'Day', hint: '1-31 or *', options: ['*', '1', '15', '*/2'] },
                  { key: 'month', label: 'Month', hint: '1-12 or *', options: ['*', '1', '*/3', '*/6'] },
                  { key: 'dayOfWeek', label: 'Weekday', hint: '0-7 or *', options: ['*', '0', '1', '1-5', '0,6'] },
                ].map(({ key, label, hint, options }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                    <select
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm font-mono focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    >
                      {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-center"
                      placeholder={hint}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Schedule Display */}
          <div className="p-4 bg-slate-900 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">Schedule Preview</span>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-${freq.color}-500/20`}>
                {freq.icon && <freq.icon className={`w-3 h-3 text-${freq.color}-400`} />}
                <span className={`text-xs font-medium text-${freq.color}-400`}>{freq.label}</span>
              </div>
            </div>
            <code className="block text-lg text-orange-400 font-mono text-center py-2">
              {cronExpression}
            </code>
            {freq.type !== 'custom' && (
              <p className="text-center text-sm text-slate-400 mt-1">
                {getScheduleDescription(cronExpression)}
              </p>
            )}
          </div>

          {/* Command Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Command to Execute <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Terminal className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <textarea
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-3 py-2 font-mono text-sm h-24 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                placeholder="/usr/bin/php /var/www/app/artisan schedule:run >> /var/log/cron.log 2>&1"
              />
            </div>
          </div>

          {/* Full Preview */}
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="text-xs text-green-400 mb-1">Full crontab entry:</div>
            <code className="text-sm text-green-300 font-mono break-all">
              {cronExpression} {form.command || '[command]'}
            </code>
          </div>
        </form>

        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.command.trim()}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Cron Job
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function getScheduleDescription(expression) {
  const parts = expression.split(' ');
  if (parts.length !== 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Helper to format time
  const formatTime = (h, m) => {
    const hour24 = parseInt(h);
    const min = m.padStart(2, '0');
    if (hour24 === 0) return `12:${min} AM`;
    if (hour24 === 12) return `12:${min} PM`;
    if (hour24 > 12) return `${hour24 - 12}:${min} PM`;
    return `${hour24}:${min} AM`;
  };

  // Common patterns
  if (expression === '* * * * *') return 'Every minute';
  if (minute.startsWith('*/')) return `Every ${minute.split('/')[1]} minutes`;
  if (minute === '0' && hour.startsWith('*/')) return `Every ${hour.split('/')[1]} hours`;

  // Every hour at specific minute
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '0') return 'Every hour, on the hour';
    return `Every hour at :${minute.padStart(2, '0')}`;
  }

  // Daily patterns
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (hour !== '*' && minute !== '*') {
      return `Daily at ${formatTime(hour, minute)}`;
    }
  }

  // Weekly patterns
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)] || d).join(', ');
    if (hour !== '*' && minute !== '*') {
      return `${days} at ${formatTime(hour, minute)}`;
    }
    return `Every ${days}`;
  }

  // Monthly patterns
  if (month === '*' && dayOfWeek === '*' && dayOfMonth !== '*') {
    const suffix = ['th', 'st', 'nd', 'rd'][(dayOfMonth % 10 > 3 || Math.floor(dayOfMonth / 10) === 1) ? 0 : dayOfMonth % 10];
    if (hour !== '*' && minute !== '*') {
      return `${dayOfMonth}${suffix} of each month at ${formatTime(hour, minute)}`;
    }
    return `${dayOfMonth}${suffix} of each month`;
  }

  // Yearly patterns
  if (dayOfMonth !== '*' && month !== '*' && dayOfWeek === '*') {
    const monthName = monthNames[parseInt(month) - 1] || month;
    if (hour !== '*' && minute !== '*') {
      return `${monthName} ${dayOfMonth} at ${formatTime(hour, minute)}`;
    }
    return `${monthName} ${dayOfMonth}`;
  }

  // Build description from parts
  const desc = [];

  if (minute !== '*' && hour !== '*') {
    desc.push(`at ${formatTime(hour, minute)}`);
  } else if (minute !== '*') {
    desc.push(`at minute ${minute}`);
  }

  if (dayOfMonth !== '*') {
    desc.push(`on day ${dayOfMonth}`);
  }

  if (month !== '*') {
    const monthName = monthNames[parseInt(month) - 1] || month;
    desc.push(`in ${monthName}`);
  }

  if (dayOfWeek !== '*') {
    const days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)] || d).join(', ');
    desc.push(`on ${days}`);
  }

  return desc.length > 0 ? desc.join(' ') : expression;
}

export default CronJobs;
