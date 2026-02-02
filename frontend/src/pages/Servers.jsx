import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Server, Trash2, Check, X, Loader2, Edit, RefreshCw, Activity, Cpu, HardDrive, Wifi, Clock, TrendingUp, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { getServers, createServer, deleteServer, testServer, updateServer, getUptimeSummary, getServerUptime } from '../services/api';

function Servers() {
  const [servers, setServers] = useState([]);
  const [uptimeData, setUptimeData] = useState({});
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverDetails, setServerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [editingServer, setEditingServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    deployPath: '/home'
  });

  const defaultFormData = {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    deployPath: '/home'
  };

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    setLoading(true);
    try {
      const [serversData, uptimeSummary] = await Promise.all([
        getServers(),
        getUptimeSummary().catch(() => [])
      ]);
      setServers(serversData);

      // Map uptime data by server ID for easy lookup
      const uptimeMap = {};
      uptimeSummary.forEach(u => {
        uptimeMap[u.id] = u;
      });
      setUptimeData(uptimeMap);
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadServerDetails(serverId) {
    try {
      setDetailsLoading(true);
      const data = await getServerUptime(serverId, 24);
      setServerDetails(data);
    } catch (err) {
      console.error('Failed to load server details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }

  function toggleExpand(serverId) {
    if (expandedServer === serverId) {
      setExpandedServer(null);
      setServerDetails(null);
    } else {
      setExpandedServer(serverId);
      loadServerDetails(serverId);
    }
  }

  function getUptimeColor(percent) {
    if (percent === null || percent === undefined) return 'text-slate-400';
    if (percent >= 99) return 'text-green-400';
    if (percent >= 95) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getTimelineStatusColor(status) {
    switch (status) {
      case 'up': return 'bg-green-500';
      case 'down': return 'bg-red-500';
      case 'partial': return 'bg-yellow-500';
      default: return 'bg-slate-600';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    try {
      if (editingServer) {
        await updateServer(editingServer.id, formData);
      } else {
        await createServer(formData);
      }
      setShowModal(false);
      setEditingServer(null);
      setFormData(defaultFormData);
      await loadServers();
    } catch (err) {
      alert(`Failed to ${editingServer ? 'update' : 'add'} server: ` + err.message);
    } finally {
      setCreating(false);
    }
  }

  function handleEdit(server) {
    setEditingServer(server);
    setFormData({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.auth_type || 'password',
      password: '',
      privateKey: '',
      deployPath: server.deploy_path || '/home'
    });
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingServer(null);
    setFormData(defaultFormData);
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove server "${name}"?`)) return;
    try {
      await deleteServer(id);
      await loadServers();
    } catch (err) {
      alert('Failed to delete server: ' + err.message);
    }
  }

  async function handleTest(id) {
    setTesting(prev => ({ ...prev, [id]: true }));
    setTestResults(prev => ({ ...prev, [id]: null }));
    try {
      const result = await testServer(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, error: err.message } }));
    } finally {
      setTesting(prev => ({ ...prev, [id]: false }));
    }
  }

  // Calculate server stats
  const healthyServers = servers.filter(s => s.lastHealth?.status === 'healthy').length;
  const warningServers = servers.filter(s => s.lastHealth?.status === 'warning').length;
  const criticalServers = servers.filter(s => s.lastHealth?.status === 'critical').length;

  // Calculate uptime stats
  const uptimeValues = Object.values(uptimeData).filter(u => u.uptime24h != null);
  const avgUptime = uptimeValues.length > 0
    ? Math.round(uptimeValues.reduce((sum, u) => sum + u.uptime24h, 0) / uptimeValues.length * 10) / 10
    : null;

  function getStatusColor(status) {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  }

  function getScoreColor(score) {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
            <Server className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deployment Servers</h1>
            <p className="text-slate-400 text-sm">
              {servers.length} server{servers.length !== 1 ? 's' : ''} configured · {healthyServers} healthy
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadServers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingServer(null);
              setFormData(defaultFormData);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      {servers.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Total Servers</div>
            <div className="text-2xl font-bold">{servers.length}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Healthy</div>
            <div className="text-2xl font-bold text-green-400">{healthyServers}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Warning</div>
            <div className="text-2xl font-bold text-yellow-400">{warningServers}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-slate-400 text-sm mb-1">Critical</div>
            <div className="text-2xl font-bold text-red-400">{criticalServers}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-1 text-slate-400 text-sm mb-1">
              <Clock className="w-3 h-3" /> Avg Uptime
            </div>
            <div className={`text-2xl font-bold ${getUptimeColor(avgUptime)}`}>
              {avgUptime != null ? `${avgUptime}%` : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading servers...</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-12">
          <Server className="w-16 h-16 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400">No servers configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => {
            const health = server.lastHealth;
            const uptime = uptimeData[server.id];
            const isExpanded = expandedServer === server.id;

            return (
              <div
                key={server.id}
                className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(health?.status)}`} />
                      <div>
                        <h3 className="font-semibold text-lg">{server.name}</h3>
                        <p className="text-slate-400 text-sm">
                          {server.username}@{server.host}:{server.port}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {testResults[server.id] && (
                        <span className={`flex items-center gap-1 text-sm ${
                          testResults[server.id].success ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {testResults[server.id].success ? (
                            <><Check className="w-4 h-4" /> OK</>
                          ) : (
                            <><X className="w-4 h-4" /> Fail</>
                          )}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTest(server.id); }}
                        disabled={testing[server.id]}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm disabled:opacity-50"
                        title="Test Connection"
                      >
                        {testing[server.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wifi className="w-4 h-4" />
                        )}
                      </button>
                      <Link
                        to="/monitoring"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-slate-500 hover:text-blue-500 transition-colors"
                        title="View detailed monitoring"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(server); }}
                        className="p-1.5 text-slate-500 hover:text-orange-500 transition-colors"
                        title="Edit server"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(server.id, server.name); }}
                        className="p-1.5 text-slate-500 hover:text-red-500 transition-colors"
                        title="Delete server"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Combined Health & Uptime Stats */}
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="grid grid-cols-5 gap-3">
                      <div className="text-center">
                        <div className={`text-lg font-bold ${health ? getScoreColor(health.score) : 'text-slate-500'}`}>
                          {health?.score ?? '-'}
                        </div>
                        <div className="text-xs text-slate-500">Health</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Cpu className="w-3 h-3 text-slate-400" />
                          <span className={`font-medium ${health?.cpu > 80 ? 'text-red-400' : 'text-slate-300'}`}>
                            {health?.cpu?.toFixed(0) ?? '-'}%
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">CPU</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <HardDrive className="w-3 h-3 text-slate-400" />
                          <span className={`font-medium ${health?.memory > 80 ? 'text-red-400' : 'text-slate-300'}`}>
                            {health?.memory?.toFixed(0) ?? '-'}%
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">Memory</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span className={`font-medium ${getUptimeColor(uptime?.uptime24h)}`}>
                            {uptime?.uptime24h != null ? `${uptime.uptime24h}%` : '-'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">Uptime 24h</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="w-3 h-3 text-slate-400" />
                          <span className="font-medium text-slate-300">
                            {uptime?.avgResponse24h != null ? `${uptime.avgResponse24h}ms` : '-'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">Response</div>
                      </div>
                    </div>

                    {health?.lastChecked && (
                      <div className="text-xs text-slate-500 text-center mt-2">
                        Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  {/* Expand/Collapse Button */}
                  <button
                    onClick={() => toggleExpand(server.id)}
                    className="w-full mt-3 pt-2 text-center text-sm text-slate-400 hover:text-slate-300 flex items-center justify-center gap-1 border-t border-slate-700"
                  >
                    {isExpanded ? (
                      <>Hide details <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>Show uptime details <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                </div>

                {/* Expanded Uptime Details */}
                {isExpanded && (
                  <div className="border-t border-slate-700 p-4 bg-slate-900/50">
                    {detailsLoading ? (
                      <div className="text-center py-8 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading uptime details...
                      </div>
                    ) : serverDetails ? (
                      <div className="space-y-4">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Total Checks</div>
                            <div className="text-xl font-bold">{serverDetails.stats?.totalChecks ?? 0}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Successful</div>
                            <div className="text-xl font-bold text-green-400">{serverDetails.stats?.upChecks ?? 0}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Failed</div>
                            <div className="text-xl font-bold text-red-400">{serverDetails.stats?.downChecks ?? 0}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Avg Response</div>
                            <div className="text-xl font-bold">
                              {serverDetails.stats?.avgResponseTime ? `${serverDetails.stats.avgResponseTime}ms` : '-'}
                            </div>
                          </div>
                        </div>

                        {/* Timeline */}
                        {serverDetails.timeline && serverDetails.timeline.length > 0 && (
                          <div>
                            <div className="text-sm text-slate-400 mb-2">24h Timeline</div>
                            <div className="flex gap-0.5">
                              {serverDetails.timeline.map((hour, idx) => (
                                <div
                                  key={idx}
                                  className={`flex-1 h-6 rounded-sm ${getTimelineStatusColor(hour.status)} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
                                  title={`${new Date(hour.hour).toLocaleTimeString()}: ${hour.status} (${hour.upCount}/${hour.totalCount})`}
                                />
                              ))}
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                              <span>24h ago</span>
                              <span>Now</span>
                            </div>
                          </div>
                        )}

                        {/* Recent Events */}
                        {serverDetails.recentEvents && serverDetails.recentEvents.length > 0 && (
                          <div>
                            <div className="text-sm text-slate-400 mb-2">Recent Events</div>
                            <div className="space-y-1 max-h-32 overflow-auto">
                              {serverDetails.recentEvents.slice(0, 8).map((event, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-sm py-1">
                                  {event.status === 'up' ? (
                                    <ArrowUpCircle className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <ArrowDownCircle className="w-4 h-4 text-red-400" />
                                  )}
                                  <span className="text-slate-400">
                                    {new Date(event.created_at).toLocaleString()}
                                  </span>
                                  <span className={event.status === 'up' ? 'text-green-400' : 'text-red-400'}>
                                    {event.status.toUpperCase()}
                                  </span>
                                  {event.response_time && (
                                    <span className="text-slate-500">{event.response_time}ms</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
                          Deploy path: {server.deploy_path}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        No uptime data available yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Server Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editingServer ? 'Edit Server' : 'Add Server'}</h2>
            {editingServer && (
              <p className="text-sm text-yellow-500 mb-4">
                Leave password/key blank to keep existing credentials
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="Production Server"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Host</label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      placeholder="194.163.144.206"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Port</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Authentication</label>
                  <select
                    value={formData.authType}
                    onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="password">Password</option>
                    <option value="key">Private Key</option>
                  </select>
                </div>
                {formData.authType === 'password' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">Private Key</label>
                    <textarea
                      value={formData.privateKey}
                      onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500 font-mono text-xs"
                      rows={5}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Deploy Path</label>
                  <input
                    type="text"
                    value={formData.deployPath}
                    onChange={(e) => setFormData({ ...formData, deployPath: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="/home/projects"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? (editingServer ? 'Updating...' : 'Adding...') : (editingServer ? 'Update Server' : 'Add Server')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Servers;
