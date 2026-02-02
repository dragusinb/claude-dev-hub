import { useState, useEffect } from 'react';
import { Plus, Server, Trash2, Check, X, Loader2, Edit, RefreshCw, Activity, Cpu, HardDrive, Clock, TrendingUp, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp, Bell, Settings, Plug, AlertCircle, Wifi } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as api from '../services/api';

function ServersMonitoring() {
  // Core state
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Health & Uptime
  const [healthData, setHealthData] = useState({});
  const [uptimeData, setUptimeData] = useState({});
  const [historyData, setHistoryData] = useState({});
  const [historyHours, setHistoryHours] = useState(24);

  // Server details (expanded view)
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverUptime, setServerUptime] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Connection testing
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});

  // Server management
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
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

  // Alerts
  const [alertSettings, setAlertSettings] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);

  // Active tab
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadAllData();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh === 0) return;
    const timer = setInterval(() => {
      loadAllData(true);
    }, autoRefresh * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  async function loadAllData(silent = false) {
    if (!silent) setLoading(true);
    setRefreshing(true);

    try {
      const [serversData, uptimeSummary, alertSettingsData, alertHistoryData] = await Promise.all([
        api.getServers(),
        api.getUptimeSummary().catch(() => []),
        api.getAlertSettings().catch(() => null),
        api.getAlertHistory(20).catch(() => [])
      ]);

      setServers(serversData);

      // Map uptime data by server ID
      const uptimeMap = {};
      uptimeSummary.forEach(u => {
        uptimeMap[u.id] = u;
      });
      setUptimeData(uptimeMap);

      setAlertSettings(alertSettingsData);
      setAlertHistory(alertHistoryData);

      // Load health for all servers
      for (const server of serversData) {
        loadServerHealth(server.id, silent);
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadServerHealth(serverId, silent = false) {
    if (!silent) {
      setHealthData(prev => ({ ...prev, [serverId]: { loading: true } }));
    }
    try {
      const health = await api.getServerHealth(serverId);
      setHealthData(prev => ({ ...prev, [serverId]: health }));

      // Also load history for expanded server
      if (expandedServer === serverId) {
        loadServerHistory(serverId);
      }
    } catch (err) {
      setHealthData(prev => ({
        ...prev,
        [serverId]: { success: false, error: err.message }
      }));
    }
  }

  async function loadServerHistory(serverId) {
    try {
      const result = await api.getServerHealthHistory(serverId, historyHours);
      if (result.success) {
        const formattedHistory = result.history.map(h => ({
          time: new Date(h.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          fullTime: new Date(h.created_at).toLocaleString(),
          cpu: h.cpu,
          memory: h.memory_percent,
          disk: h.disk_percent,
          load: h.load_one
        }));
        setHistoryData(prev => ({ ...prev, [serverId]: formattedHistory }));
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  async function loadServerUptimeDetails(serverId) {
    try {
      setDetailsLoading(true);
      const data = await api.getServerUptime(serverId, 24);
      setServerUptime(data);
    } catch (err) {
      console.error('Failed to load uptime details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }

  function toggleExpand(serverId) {
    if (expandedServer === serverId) {
      setExpandedServer(null);
      setServerUptime(null);
    } else {
      setExpandedServer(serverId);
      loadServerHistory(serverId);
      loadServerUptimeDetails(serverId);
    }
  }

  async function handleTestConnection(serverId) {
    setTesting(prev => ({ ...prev, [serverId]: true }));
    setTestResults(prev => ({ ...prev, [serverId]: null }));
    try {
      const result = await api.testServer(serverId);
      setTestResults(prev => ({ ...prev, [serverId]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [serverId]: { success: false, error: err.message } }));
    } finally {
      setTesting(prev => ({ ...prev, [serverId]: false }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    try {
      if (editingServer) {
        await api.updateServer(editingServer.id, formData);
      } else {
        await api.createServer(formData);
      }
      setShowModal(false);
      setEditingServer(null);
      resetForm();
      await loadAllData();
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

  function resetForm() {
    setFormData({
      name: '',
      host: '',
      port: 22,
      username: 'root',
      authType: 'password',
      password: '',
      privateKey: '',
      deployPath: '/home'
    });
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove server "${name}"?`)) return;
    try {
      await api.deleteServer(id);
      await loadAllData();
    } catch (err) {
      alert('Failed to delete server: ' + err.message);
    }
  }

  // Helpers
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

  function getUptimeColor(percent) {
    if (percent === null || percent === undefined) return 'text-slate-400';
    if (percent >= 99) return 'text-green-400';
    if (percent >= 95) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getProgressColor(percent) {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function getTimelineStatusColor(status) {
    switch (status) {
      case 'up': return 'bg-green-500';
      case 'down': return 'bg-red-500';
      case 'partial': return 'bg-yellow-500';
      default: return 'bg-slate-600';
    }
  }

  // Calculate stats
  const healthyServers = servers.filter(s => s.lastHealth?.status === 'healthy').length;
  const warningServers = servers.filter(s => s.lastHealth?.status === 'warning').length;
  const criticalServers = servers.filter(s => s.lastHealth?.status === 'critical').length;

  const uptimeValues = Object.values(uptimeData).filter(u => u.uptime24h != null);
  const avgUptime = uptimeValues.length > 0
    ? Math.round(uptimeValues.reduce((sum, u) => sum + u.uptime24h, 0) / uptimeValues.length * 10) / 10
    : null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
            <Server className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Servers Monitoring</h1>
            <p className="text-slate-400 text-sm">
              {servers.length} server{servers.length !== 1 ? 's' : ''} · {healthyServers} healthy · Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value={0}>Manual</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
          </select>
          <button
            onClick={() => loadAllData()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditingServer(null); resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="text-slate-400 text-sm mb-1">Total</div>
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700 overflow-x-auto">
        {['overview', 'alerts'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap capitalize ${
              activeTab === tab
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? 'All Servers' : 'Alerts'}
            {tab === 'alerts' && alertHistory.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {alertHistory.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading servers...
        </div>
      ) : activeTab === 'overview' ? (
        /* Server Cards */
        servers.length === 0 ? (
          <div className="text-center py-12">
            <Server className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400 mb-4">No servers configured</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg"
            >
              Add Your First Server
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {servers.map(server => {
              const health = healthData[server.id] || server.lastHealth;
              const uptime = uptimeData[server.id];
              const isExpanded = expandedServer === server.id;
              const serverHistory = historyData[server.id] || [];
              const testResult = testResults[server.id];
              const isTesting = testing[server.id];

              return (
                <div key={server.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  {/* Server Header */}
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(health?.status || server.lastHealth?.status)}`} />
                        <div>
                          <h3 className="font-semibold text-lg">{server.name}</h3>
                          <p className="text-slate-400 text-sm">
                            {server.username}@{server.host}:{server.port}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Test Connection Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTestConnection(server.id); }}
                          disabled={isTesting}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                            testResult?.success
                              ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                              : testResult?.error
                              ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                              : 'bg-slate-700 hover:bg-slate-600'
                          }`}
                          title="Test SSH Connection"
                        >
                          {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : testResult?.success ? (
                            <><Check className="w-4 h-4" /> Connected</>
                          ) : testResult?.error ? (
                            <><X className="w-4 h-4" /> Failed</>
                          ) : (
                            <><Plug className="w-4 h-4" /> Test</>
                          )}
                        </button>
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

                    {/* Show connection error if test failed */}
                    {testResult?.error && (
                      <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        {testResult.error}
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3">
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${health?.stats?.cpu != null ? (health.stats.cpu > 80 ? 'text-red-400' : 'text-green-400') : 'text-slate-500'}`}>
                          {health?.stats?.cpu?.toFixed(0) ?? server.lastHealth?.cpu?.toFixed(0) ?? '-'}%
                        </div>
                        <div className="text-xs text-slate-500 flex items-center justify-center gap-1">
                          <Cpu className="w-3 h-3" /> CPU
                        </div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${health?.stats?.memory?.percent != null ? (health.stats.memory.percent > 80 ? 'text-red-400' : 'text-green-400') : 'text-slate-500'}`}>
                          {health?.stats?.memory?.percent?.toFixed(0) ?? server.lastHealth?.memory?.toFixed(0) ?? '-'}%
                        </div>
                        <div className="text-xs text-slate-500 flex items-center justify-center gap-1">
                          <HardDrive className="w-3 h-3" /> Memory
                        </div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${health?.stats?.disk?.percent != null ? (health.stats.disk.percent > 80 ? 'text-red-400' : 'text-green-400') : 'text-slate-500'}`}>
                          {health?.stats?.disk?.percent?.toFixed(0) ?? server.lastHealth?.disk?.toFixed(0) ?? '-'}%
                        </div>
                        <div className="text-xs text-slate-500 flex items-center justify-center gap-1">
                          <Activity className="w-3 h-3" /> Disk
                        </div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${getScoreColor(server.lastHealth?.score ?? 0)}`}>
                          {server.lastHealth?.score ?? '-'}
                        </div>
                        <div className="text-xs text-slate-500">Health Score</div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-lg font-bold ${getUptimeColor(uptime?.uptime24h)}`}>
                          {uptime?.uptime24h != null ? `${uptime.uptime24h}%` : '-'}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> Uptime 24h
                        </div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-slate-300">
                          {uptime?.avgResponse24h != null ? `${uptime.avgResponse24h}ms` : '-'}
                        </div>
                        <div className="text-xs text-slate-500">Response</div>
                      </div>
                    </div>

                    {/* Expand Button */}
                    <button
                      onClick={() => toggleExpand(server.id)}
                      className="w-full mt-3 pt-2 text-center text-sm text-slate-400 hover:text-slate-300 flex items-center justify-center gap-1 border-t border-slate-700"
                    >
                      {isExpanded ? (
                        <>Hide Details <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>Show Charts & Timeline <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 p-4 bg-slate-900/50 space-y-6">
                      {/* Time Range Selector */}
                      <div className="flex justify-end">
                        <select
                          value={historyHours}
                          onChange={(e) => {
                            setHistoryHours(parseInt(e.target.value));
                            loadServerHistory(server.id);
                          }}
                          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value={1}>Last 1 hour</option>
                          <option value={6}>Last 6 hours</option>
                          <option value={24}>Last 24 hours</option>
                          <option value={168}>Last 7 days</option>
                        </select>
                      </div>

                      {/* CPU/Memory/Disk Chart */}
                      {serverHistory.length > 0 ? (
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Resource Usage
                          </h4>
                          <div className="h-48 bg-slate-800/50 rounded-lg p-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={serverHistory}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                                <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} unit="%" />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="cpu" name="CPU" stroke="#f97316" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="memory" name="Memory" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="disk" name="Disk" stroke="#22c55e" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>No historical data available yet</p>
                        </div>
                      )}

                      {/* Uptime Timeline */}
                      {detailsLoading ? (
                        <div className="text-center py-4 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        </div>
                      ) : serverUptime?.timeline?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> 24h Uptime Timeline
                          </h4>
                          <div className="flex gap-0.5">
                            {serverUptime.timeline.map((hour, idx) => (
                              <div
                                key={idx}
                                className={`flex-1 h-6 rounded-sm ${getTimelineStatusColor(hour.status)} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
                                title={`${new Date(hour.hour).toLocaleTimeString()}: ${hour.status} (${hour.upCount}/${hour.totalCount} checks)`}
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
                      {serverUptime?.recentEvents?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-2">Recent Events</h4>
                          <div className="space-y-1 max-h-32 overflow-auto">
                            {serverUptime.recentEvents.slice(0, 8).map((event, idx) => (
                              <div key={idx} className="flex items-center gap-3 text-sm py-1">
                                {event.status === 'up' ? (
                                  <ArrowUpCircle className="w-4 h-4 text-green-400" />
                                ) : (
                                  <ArrowDownCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className="text-slate-400">{new Date(event.created_at).toLocaleString()}</span>
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

                      {/* Uptime Stats */}
                      {serverUptime?.stats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Total Checks</div>
                            <div className="text-xl font-bold">{serverUptime.stats.totalChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Successful</div>
                            <div className="text-xl font-bold text-green-400">{serverUptime.stats.upChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Failed</div>
                            <div className="text-xl font-bold text-red-400">{serverUptime.stats.downChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-1">Avg Response</div>
                            <div className="text-xl font-bold">
                              {serverUptime.stats.avgResponseTime ? `${serverUptime.stats.avgResponseTime}ms` : '-'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Alerts Tab */
        <div className="space-y-4">
          {alertHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No recent alerts</p>
            </div>
          ) : (
            alertHistory.map(alert => (
              <div key={alert.id} className="bg-slate-800 rounded-lg p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg ${
                  alert.alert_type === 'server_down' ? 'bg-red-500/20' :
                  alert.alert_type === 'server_up' ? 'bg-green-500/20' :
                  'bg-yellow-500/20'
                }`}>
                  <AlertCircle className={`w-5 h-5 ${
                    alert.alert_type === 'server_down' ? 'text-red-400' :
                    alert.alert_type === 'server_up' ? 'text-green-400' :
                    'text-yellow-400'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{alert.server_name || 'Unknown'}</div>
                  <div className="text-sm text-slate-400">{alert.message}</div>
                </div>
                <div className="text-right text-sm text-slate-500">
                  {new Date(alert.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
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
                      placeholder="192.168.1.100"
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
                      placeholder={editingServer ? '(unchanged)' : ''}
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
                    placeholder="/var/www"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingServer(null); }}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? 'Saving...' : (editingServer ? 'Update Server' : 'Add Server')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServersMonitoring;
