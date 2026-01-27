import { useState, useEffect } from 'react';
import { Database, Plus, Play, Pause, Trash2, Edit, RefreshCw, Clock, CheckCircle, XCircle, History } from 'lucide-react';
import * as api from '../services/api';

function Backups() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [runningJob, setRunningJob] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    serverId: '',
    type: 'files',
    schedule: '0 0 * * *',
    sourcePath: '',
    databaseName: '',
    databaseUser: '',
    databasePassword: '',
    destinationPath: '/backups',
    retentionDays: 7,
    enabled: true
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [jobsData, historyData, serversData] = await Promise.all([
        api.getBackupJobs(),
        api.getBackupHistory(),
        api.getServers()
      ]);
      setJobs(jobsData);
      setHistory(historyData);
      setServers(serversData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingJob) {
        await api.updateBackupJob(editingJob.id, formData);
      } else {
        await api.createBackupJob(formData);
      }
      setShowModal(false);
      setEditingJob(null);
      resetForm();
      loadData();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this backup job?')) return;
    try {
      await api.deleteBackupJob(id);
      loadData();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  async function handleToggle(job) {
    try {
      await api.updateBackupJob(job.id, { enabled: !job.enabled });
      loadData();
    } catch (err) {
      alert('Failed to toggle: ' + err.message);
    }
  }

  async function handleRunNow(id) {
    try {
      setRunningJob(id);
      await api.runBackupJob(id);
      loadData();
    } catch (err) {
      alert('Backup failed: ' + err.message);
    } finally {
      setRunningJob(null);
    }
  }

  function openEdit(job) {
    setEditingJob(job);
    setFormData({
      name: job.name,
      serverId: job.server_id,
      type: job.type,
      schedule: job.schedule,
      sourcePath: job.source_path || '',
      databaseName: job.database_name || '',
      databaseUser: job.database_user || '',
      databasePassword: '',
      destinationPath: job.destination_path,
      retentionDays: job.retention_days,
      enabled: job.enabled
    });
    setShowModal(true);
  }

  function resetForm() {
    setFormData({
      name: '',
      serverId: '',
      type: 'files',
      schedule: '0 0 * * *',
      sourcePath: '',
      databaseName: '',
      databaseUser: '',
      databasePassword: '',
      destinationPath: '/backups',
      retentionDays: 7,
      enabled: true
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatDuration(seconds) {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  const schedulePresets = [
    { label: 'Daily at midnight', value: '0 0 * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
    { label: 'Monthly (1st)', value: '0 0 1 * *' },
    { label: 'Every hour', value: '0 * * * *' }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Backup Scheduler</h1>
            <p className="text-slate-400 text-sm">Automated database and file backups</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { resetForm(); setEditingJob(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Job
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'jobs' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'}`}
        >
          <Database className="w-4 h-4 inline mr-2" />
          Jobs ({jobs.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'}`}
        >
          <History className="w-4 h-4 inline mr-2" />
          History
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : activeTab === 'jobs' ? (
        /* Jobs List */
        jobs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No backup jobs configured</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${job.enabled ? 'bg-green-500' : 'bg-slate-500'}`} />
                    <div>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-sm text-slate-400">
                        {job.type} on {job.server_name || 'Unknown server'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        {job.schedule_description}
                      </div>
                      {job.next_run && (
                        <div className="text-xs text-slate-500">
                          Next: {new Date(job.next_run).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      {job.last_status === 'success' && (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Success
                        </span>
                      )}
                      {job.last_status === 'failed' && (
                        <span className="text-red-400 flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> Failed
                        </span>
                      )}
                      {job.last_run && (
                        <div className="text-xs text-slate-500">
                          {new Date(job.last_run).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRunNow(job.id)}
                        disabled={runningJob === job.id}
                        className="p-2 bg-slate-700 hover:bg-green-600 rounded transition-colors disabled:opacity-50"
                        title="Run Now"
                      >
                        <Play className={`w-4 h-4 ${runningJob === job.id ? 'animate-pulse' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleToggle(job)}
                        className={`p-2 rounded transition-colors ${job.enabled ? 'bg-slate-700 hover:bg-yellow-600' : 'bg-slate-700 hover:bg-green-600'}`}
                        title={job.enabled ? 'Disable' : 'Enable'}
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(job)}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="p-2 bg-slate-700 hover:bg-red-600 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* History Table */
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="text-left p-3 text-sm text-slate-400">Job</th>
                <th className="text-left p-3 text-sm text-slate-400">Server</th>
                <th className="text-left p-3 text-sm text-slate-400">Status</th>
                <th className="text-left p-3 text-sm text-slate-400">Duration</th>
                <th className="text-left p-3 text-sm text-slate-400">Size</th>
                <th className="text-left p-3 text-sm text-slate-400">Time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => (
                <tr key={idx} className="border-t border-slate-700">
                  <td className="p-3">{h.job_name || 'Unknown'}</td>
                  <td className="p-3 text-slate-400">{h.server_name || '-'}</td>
                  <td className="p-3">
                    {h.status === 'success' ? (
                      <span className="text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Success
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1" title={h.error_message}>
                        <XCircle className="w-4 h-4" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-400">{formatDuration(h.duration_seconds)}</td>
                  <td className="p-3 text-slate-400">{formatBytes(h.file_size)}</td>
                  <td className="p-3 text-slate-400 text-sm">
                    {new Date(h.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No backup history yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingJob ? 'Edit Backup Job' : 'New Backup Job'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Server</label>
                <select
                  value={formData.serverId}
                  onChange={e => setFormData({ ...formData, serverId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                  required
                >
                  <option value="">Select server...</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                >
                  <option value="files">Files (tar.gz)</option>
                  <option value="mysql">MySQL Database</option>
                  <option value="postgres">PostgreSQL Database</option>
                </select>
              </div>

              {formData.type === 'files' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Source Path</label>
                  <input
                    type="text"
                    value={formData.sourcePath}
                    onChange={e => setFormData({ ...formData, sourcePath: e.target.value })}
                    placeholder="/var/www/mysite"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>
              )}

              {(formData.type === 'mysql' || formData.type === 'postgres') && (
                <>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Database Name</label>
                    <input
                      type="text"
                      value={formData.databaseName}
                      onChange={e => setFormData({ ...formData, databaseName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">DB Username</label>
                      <input
                        type="text"
                        value={formData.databaseUser}
                        onChange={e => setFormData({ ...formData, databaseUser: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">DB Password</label>
                      <input
                        type="password"
                        value={formData.databasePassword}
                        onChange={e => setFormData({ ...formData, databasePassword: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                        required={!editingJob}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Destination Path</label>
                <input
                  type="text"
                  value={formData.destinationPath}
                  onChange={e => setFormData({ ...formData, destinationPath: e.target.value })}
                  placeholder="/backups"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Schedule</label>
                <select
                  value={schedulePresets.find(p => p.value === formData.schedule) ? formData.schedule : 'custom'}
                  onChange={e => {
                    if (e.target.value !== 'custom') {
                      setFormData({ ...formData, schedule: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500 mb-2"
                >
                  {schedulePresets.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                  <option value="custom">Custom (cron)</option>
                </select>
                <input
                  type="text"
                  value={formData.schedule}
                  onChange={e => setFormData({ ...formData, schedule: e.target.value })}
                  placeholder="0 0 * * *"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Retention (days)</label>
                <input
                  type="number"
                  value={formData.retentionDays}
                  onChange={e => setFormData({ ...formData, retentionDays: parseInt(e.target.value) || 7 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="enabled" className="text-sm text-slate-400">Enable job</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors"
                >
                  {editingJob ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Backups;
