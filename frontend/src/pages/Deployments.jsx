import { useState, useEffect } from 'react';
import { Rocket, Plus, Play, Clock, CheckCircle, XCircle, AlertCircle, X, Server, Trash2, Edit, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getDeploymentPipelines,
  createDeploymentPipeline,
  updateDeploymentPipeline,
  deleteDeploymentPipeline,
  triggerDeployment,
  getDeploymentRuns,
  getRecentDeploymentRuns,
  getDeploymentRun,
  getServers
} from '../services/api';

function Deployments() {
  const [pipelines, setPipelines] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState(null);
  const [showRunsModal, setShowRunsModal] = useState(null);
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [expandedPipeline, setExpandedPipeline] = useState(null);
  const [deploying, setDeploying] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [pipelinesRes, runsRes, serversRes] = await Promise.all([
        getDeploymentPipelines(),
        getRecentDeploymentRuns(20),
        getServers()
      ]);
      setPipelines(pipelinesRes.pipelines || []);
      setRecentRuns(runsRes.runs || []);
      setServers(serversRes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeploy(pipeline) {
    if (deploying[pipeline.id]) return;

    setDeploying(prev => ({ ...prev, [pipeline.id]: true }));
    try {
      await triggerDeployment(pipeline.id);
      // Refresh data after a short delay
      setTimeout(() => loadData(), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeploying(prev => ({ ...prev, [pipeline.id]: false }));
    }
  }

  async function handleDelete(pipeline) {
    if (!confirm(`Delete pipeline "${pipeline.name}"? This will also delete all deployment history.`)) return;

    try {
      await deleteDeploymentPipeline(pipeline.id);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPipelineRuns(pipelineId) {
    try {
      const res = await getDeploymentRuns(pipelineId, 20);
      setPipelineRuns(res.runs || []);
      setShowRunsModal(pipelineId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadRunDetails(runId) {
    try {
      const run = await getDeploymentRun(runId);
      setSelectedRun(run);
    } catch (err) {
      setError(err.message);
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'running': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  }

  function formatDuration(seconds) {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Rocket className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Deployment Pipeline</h1>
        </div>
        <button
          onClick={() => { setEditingPipeline(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Pipeline
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipelines List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-slate-300">Pipelines</h2>

          {pipelines.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-500">
              <Rocket className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No deployment pipelines configured</p>
              <p className="text-sm mt-2">Create a pipeline to automate your deployments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelines.map(pipeline => (
                <div key={pipeline.id} className="bg-slate-800 rounded-lg overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          {expandedPipeline === pipeline.id ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">
                            {pipeline.name}
                            {!pipeline.enabled && (
                              <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">Disabled</span>
                            )}
                          </h3>
                          <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                            <Server className="w-3 h-3" />
                            {pipeline.server_name || 'Unknown Server'}
                            {pipeline.project_name && (
                              <span className="text-slate-500">• {pipeline.project_name}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeploy(pipeline)}
                          disabled={deploying[pipeline.id] || !pipeline.enabled}
                          className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deploying[pipeline.id] ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Deploy
                        </button>
                        <button
                          onClick={() => loadPipelineRuns(pipeline.id)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
                        >
                          History
                        </button>
                        <button
                          onClick={() => { setEditingPipeline(pipeline); setShowModal(true); }}
                          className="p-1.5 text-slate-400 hover:text-white"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(pipeline)}
                          className="p-1.5 text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedPipeline === pipeline.id && (
                    <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        {pipeline.pre_deploy_script && (
                          <div>
                            <div className="text-slate-500 mb-1">Pre-Deploy Script</div>
                            <pre className="bg-slate-800 p-2 rounded text-xs text-slate-300 overflow-auto max-h-24">
                              {pipeline.pre_deploy_script}
                            </pre>
                          </div>
                        )}
                        <div>
                          <div className="text-slate-500 mb-1">Deploy Script</div>
                          <pre className="bg-slate-800 p-2 rounded text-xs text-slate-300 overflow-auto max-h-24">
                            {pipeline.deploy_script}
                          </pre>
                        </div>
                        {pipeline.post_deploy_script && (
                          <div>
                            <div className="text-slate-500 mb-1">Post-Deploy Script</div>
                            <pre className="bg-slate-800 p-2 rounded text-xs text-slate-300 overflow-auto max-h-24">
                              {pipeline.post_deploy_script}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Runs */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-300">Recent Deployments</h2>

          {recentRuns.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No deployments yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentRuns.map(run => (
                <button
                  key={run.id}
                  onClick={() => loadRunDetails(run.id)}
                  className="w-full text-left bg-slate-800 hover:bg-slate-700 rounded-lg p-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <span className="font-medium text-sm">{run.pipeline_name}</span>
                    </div>
                    <span className={`text-xs ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                    <span>{run.server_name}</span>
                    <span>{formatDuration(run.duration_seconds)}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {formatDate(run.started_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Pipeline Modal */}
      {showModal && (
        <PipelineModal
          pipeline={editingPipeline}
          servers={servers}
          onClose={() => { setShowModal(false); setEditingPipeline(null); }}
          onSave={() => { setShowModal(false); setEditingPipeline(null); loadData(); }}
        />
      )}

      {/* Pipeline Runs Modal */}
      {showRunsModal && (
        <RunsModal
          pipelineId={showRunsModal}
          runs={pipelineRuns}
          onClose={() => { setShowRunsModal(null); setPipelineRuns([]); }}
          onSelectRun={loadRunDetails}
        />
      )}

      {/* Run Details Modal */}
      {selectedRun && (
        <RunDetailsModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}

// Pipeline Create/Edit Modal
function PipelineModal({ pipeline, servers, onClose, onSave }) {
  const [form, setForm] = useState({
    name: pipeline?.name || '',
    serverId: pipeline?.server_id || '',
    enabled: pipeline?.enabled !== 0,
    preDeployScript: pipeline?.pre_deploy_script || '',
    deployScript: pipeline?.deploy_script || '',
    postDeployScript: pipeline?.post_deploy_script || '',
    rollbackScript: pipeline?.rollback_script || '',
    notifyOnSuccess: pipeline?.notify_on_success === 1,
    notifyOnFailure: pipeline?.notify_on_failure !== 0
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.serverId || !form.deployScript) {
      setError('Name, server, and deploy script are required');
      return;
    }

    setSaving(true);
    try {
      if (pipeline) {
        await updateDeploymentPipeline(pipeline.id, form);
      } else {
        await createDeploymentPipeline(form);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {pipeline ? 'Edit Pipeline' : 'Create Pipeline'}
          </h2>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Pipeline Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                placeholder="My Deployment"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Server *</label>
              <select
                value={form.serverId}
                onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              >
                <option value="">Select server...</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Pre-Deploy Script (optional)</label>
            <textarea
              value={form.preDeployScript}
              onChange={(e) => setForm({ ...form, preDeployScript: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm h-20"
              placeholder="# Commands to run before deployment&#10;cd /var/www/myapp&#10;git stash"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Deploy Script *</label>
            <textarea
              value={form.deployScript}
              onChange={(e) => setForm({ ...form, deployScript: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm h-32"
              placeholder="# Main deployment commands&#10;cd /var/www/myapp&#10;git pull origin main&#10;npm install&#10;npm run build&#10;pm2 restart myapp"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Post-Deploy Script (optional)</label>
            <textarea
              value={form.postDeployScript}
              onChange={(e) => setForm({ ...form, postDeployScript: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm h-20"
              placeholder="# Commands to run after deployment&#10;curl -X POST https://api.example.com/notify"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Rollback Script (optional)</label>
            <textarea
              value={form.rollbackScript}
              onChange={(e) => setForm({ ...form, rollbackScript: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 font-mono text-sm h-20"
              placeholder="# Commands to rollback deployment&#10;cd /var/www/myapp&#10;git checkout HEAD~1"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyOnSuccess}
                onChange={(e) => setForm({ ...form, notifyOnSuccess: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-300">Notify on success</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyOnFailure}
                onChange={(e) => setForm({ ...form, notifyOnFailure: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-300">Notify on failure</span>
            </label>
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
              {saving ? 'Saving...' : (pipeline ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pipeline Runs Modal
function RunsModal({ pipelineId, runs, onClose, onSelectRun }) {
  function getStatusIcon(status) {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Deployment History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {runs.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No deployments for this pipeline yet
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <button
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className="w-full text-left bg-slate-700/50 hover:bg-slate-700 rounded-lg p-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <span className="capitalize">{run.status}</span>
                    </div>
                    <span className="text-sm text-slate-400">
                      {run.duration_seconds ? `${run.duration_seconds}s` : '-'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex justify-between">
                    <span>By {run.user_name || run.user_email}</span>
                    <span>{new Date(run.started_at).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Run Details Modal
function RunDetailsModal({ run, onClose }) {
  const [activeTab, setActiveTab] = useState('deploy');

  function getStatusBadge(status) {
    const colors = {
      success: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      running: 'bg-blue-500/20 text-blue-400',
      pending: 'bg-slate-500/20 text-slate-400'
    };
    return colors[status] || colors.pending;
  }

  const tabs = [
    { id: 'pre', label: 'Pre-Deploy', content: run.pre_deploy_output },
    { id: 'deploy', label: 'Deploy', content: run.deploy_output },
    { id: 'post', label: 'Post-Deploy', content: run.post_deploy_output }
  ].filter(t => t.content);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{run.pipeline_name}</h2>
            <div className="text-sm text-slate-400 mt-1">
              {run.server_name} • {new Date(run.started_at).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm ${getStatusBadge(run.status)}`}>
              {run.status}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {run.error_message && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-400">
            <div className="font-semibold mb-1">Error</div>
            <div className="text-sm">{run.error_message}</div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {tabs.length > 0 && (
            <>
              <div className="flex border-b border-slate-700">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'text-orange-400 border-b-2 border-orange-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-4 bg-slate-900">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {tabs.find(t => t.id === activeTab)?.content || 'No output'}
                </pre>
              </div>
            </>
          )}

          {tabs.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              {run.status === 'running' ? 'Deployment in progress...' : 'No output available'}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800 text-sm text-slate-400 flex justify-between">
          <span>Duration: {run.duration_seconds ? `${run.duration_seconds}s` : '-'}</span>
          <span>Triggered by: {run.triggered_by}</span>
        </div>
      </div>
    </div>
  );
}

export default Deployments;
