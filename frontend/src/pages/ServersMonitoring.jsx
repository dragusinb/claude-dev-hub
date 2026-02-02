import { useState, useEffect } from 'react';
import { Plus, Server, Trash2, Check, X, Loader2, Edit, RefreshCw, Activity, Cpu, HardDrive, Clock, TrendingUp, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp, Bell, Plug, AlertCircle, Wifi, WifiOff, Circle, Gauge, MemoryStick, Database } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import * as api from '../services/api';

// Circular Progress Component
function CircularProgress({ value, size = 80, strokeWidth = 8, color = 'orange', label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const colors = {
    green: { stroke: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
    yellow: { stroke: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' },
    orange: { stroke: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
    red: { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
    blue: { stroke: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    purple: { stroke: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  };

  const c = colors[color] || colors.orange;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-700"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={c.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color: c.stroke }}>{value}%</span>
        </div>
      </div>
      {label && <span className="text-xs text-slate-400 mt-1">{label}</span>}
      {sublabel && <span className="text-xs text-slate-500">{sublabel}</span>}
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ value, color = 'orange', height = 8, showLabel = false }) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className="w-full">
      <div className={`w-full bg-slate-700 rounded-full overflow-hidden`} style={{ height }}>
        <div
          className={`h-full ${colors[color]} transition-all duration-500 rounded-full`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      {showLabel && <span className="text-xs text-slate-400 mt-1">{value}%</span>}
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }) {
  const configs = {
    healthy: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: 'Healthy', icon: Check },
    warning: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Warning', icon: AlertCircle },
    critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'Critical', icon: X },
    unknown: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', label: 'Unknown', icon: Circle },
  };

  const config = configs[status] || configs.unknown;
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bg} ${config.text} border ${config.border}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{config.label}</span>
    </div>
  );
}

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
  function getStatusColor(value, thresholds = { warning: 70, critical: 90 }) {
    if (value >= thresholds.critical) return 'red';
    if (value >= thresholds.warning) return 'yellow';
    return 'green';
  }

  function getUptimeColor(percent) {
    if (percent === null || percent === undefined) return 'slate';
    if (percent >= 99) return 'green';
    if (percent >= 95) return 'yellow';
    return 'red';
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
          <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Server className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Servers Monitoring</h1>
            <p className="text-slate-400 text-sm">
              {servers.length} server{servers.length !== 1 ? 's' : ''} · Last updated: {lastRefresh.toLocaleTimeString()}
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
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg transition-all shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{servers.length}</div>
              <div className="text-xs text-slate-400">Total Servers</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-900/30 to-slate-900 rounded-xl p-4 border border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Check className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{healthyServers}</div>
              <div className="text-xs text-slate-400">Healthy</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-yellow-900/30 to-slate-900 rounded-xl p-4 border border-yellow-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{warningServers}</div>
              <div className="text-xs text-slate-400">Warning</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-900/30 to-slate-900 rounded-xl p-4 border border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <X className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{criticalServers}</div>
              <div className="text-xs text-slate-400">Critical</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-900/30 to-slate-900 rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className={`text-2xl font-bold ${avgUptime != null ? (avgUptime >= 99 ? 'text-green-400' : avgUptime >= 95 ? 'text-yellow-400' : 'text-red-400') : 'text-slate-400'}`}>
                {avgUptime != null ? `${avgUptime}%` : 'N/A'}
              </div>
              <div className="text-xs text-slate-400">Avg Uptime</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700 overflow-x-auto">
        {['overview', 'history', 'alerts'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap capitalize ${
              activeTab === tab
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? 'All Servers' : tab === 'history' ? 'History' : 'Alerts'}
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
          <div className="grid gap-4 lg:grid-cols-2">
            {servers.map(server => {
              const health = healthData[server.id] || server.lastHealth;
              const uptime = uptimeData[server.id];
              const isExpanded = expandedServer === server.id;
              const serverHistory = historyData[server.id] || [];
              const testResult = testResults[server.id];
              const isTesting = testing[server.id];

              const cpu = health?.stats?.cpu ?? server.lastHealth?.cpu ?? 0;
              const memory = health?.stats?.memory?.percent ?? server.lastHealth?.memory ?? 0;
              const disk = health?.stats?.disk?.percent ?? server.lastHealth?.disk ?? 0;
              const status = health?.status || server.lastHealth?.status || 'unknown';

              return (
                <div key={server.id} className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border ${
                  status === 'healthy' ? 'border-green-500/20' :
                  status === 'warning' ? 'border-yellow-500/20' :
                  status === 'critical' ? 'border-red-500/20' :
                  'border-slate-700'
                } overflow-hidden transition-all hover:shadow-lg`}>
                  {/* Server Header */}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          status === 'healthy' ? 'bg-green-500 shadow-lg shadow-green-500/50' :
                          status === 'warning' ? 'bg-yellow-500 shadow-lg shadow-yellow-500/50' :
                          status === 'critical' ? 'bg-red-500 shadow-lg shadow-red-500/50 animate-pulse' :
                          'bg-slate-500'
                        }`} />
                        <div>
                          <h3 className="font-semibold text-lg">{server.name}</h3>
                          <p className="text-slate-400 text-sm font-mono">
                            {server.username}@{server.host}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                      </div>
                    </div>

                    {/* Visual Stats Grid */}
                    <div className="flex justify-around items-center py-4 mb-4 bg-slate-900/50 rounded-xl">
                      <CircularProgress
                        value={Math.round(cpu)}
                        color={getStatusColor(cpu)}
                        label="CPU"
                        size={70}
                      />
                      <CircularProgress
                        value={Math.round(memory)}
                        color={getStatusColor(memory)}
                        label="Memory"
                        size={70}
                      />
                      <CircularProgress
                        value={Math.round(disk)}
                        color={getStatusColor(disk)}
                        label="Disk"
                        size={70}
                      />
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          uptime?.uptime24h >= 99 ? 'text-green-400' :
                          uptime?.uptime24h >= 95 ? 'text-yellow-400' :
                          uptime?.uptime24h != null ? 'text-red-400' :
                          'text-slate-500'
                        }`}>
                          {uptime?.uptime24h != null ? `${uptime.uptime24h}%` : '-'}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Uptime 24h</div>
                      </div>
                    </div>

                    {/* Quick Stats Row */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-medium text-slate-300">
                          {server.lastHealth?.score ?? '-'}
                        </div>
                        <div className="text-xs text-slate-500">Health Score</div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-medium text-slate-300">
                          {uptime?.avgResponse24h ? `${uptime.avgResponse24h}ms` : '-'}
                        </div>
                        <div className="text-xs text-slate-500">Response</div>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-medium text-slate-300">
                          {health?.stats?.load?.one?.toFixed(2) ?? '-'}
                        </div>
                        <div className="text-xs text-slate-500">Load Avg</div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                      <div className="flex items-center gap-2">
                        {/* Test Connection Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTestConnection(server.id); }}
                          disabled={isTesting}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
                            testResult?.success
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : testResult?.error
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                          }`}
                        >
                          {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : testResult?.success ? (
                            <><Wifi className="w-4 h-4" /> Connected</>
                          ) : testResult?.error ? (
                            <><WifiOff className="w-4 h-4" /> Failed</>
                          ) : (
                            <><Plug className="w-4 h-4" /> Test</>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(server); }}
                          className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(server.id, server.name); }}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => toggleExpand(server.id)}
                        className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <>Less <ChevronUp className="w-4 h-4" /></>
                        ) : (
                          <>Details <ChevronDown className="w-4 h-4" /></>
                        )}
                      </button>
                    </div>

                    {/* Connection Error */}
                    {testResult?.error && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        {testResult.error}
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 p-5 bg-slate-900/50 space-y-6">
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

                      {/* Resource Chart */}
                      {serverHistory.length > 0 ? (
                        <div>
                          <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Resource Usage Over Time
                          </h4>
                          <div className="h-52 bg-slate-800/50 rounded-xl p-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={serverHistory}>
                                <defs>
                                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="diskGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                                <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} unit="%" />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#f97316" fill="url(#cpuGradient)" strokeWidth={2} />
                                <Area type="monotone" dataKey="memory" name="Memory" stroke="#3b82f6" fill="url(#memGradient)" strokeWidth={2} />
                                <Area type="monotone" dataKey="disk" name="Disk" stroke="#22c55e" fill="url(#diskGradient)" strokeWidth={2} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500 bg-slate-800/30 rounded-xl">
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
                          <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> 24h Uptime Timeline
                          </h4>
                          <div className="flex gap-0.5 bg-slate-800/50 p-3 rounded-xl">
                            {serverUptime.timeline.map((hour, idx) => (
                              <div
                                key={idx}
                                className={`flex-1 h-8 rounded ${getTimelineStatusColor(hour.status)} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
                                title={`${new Date(hour.hour).toLocaleTimeString()}: ${hour.status} (${hour.upCount}/${hour.totalCount} checks)`}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 mt-2 px-3">
                            <span>24h ago</span>
                            <span>Now</span>
                          </div>
                        </div>
                      )}

                      {/* Uptime Stats */}
                      {serverUptime?.stats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-slate-800 rounded-xl p-3">
                            <div className="text-xs text-slate-400 mb-1">Total Checks</div>
                            <div className="text-xl font-bold">{serverUptime.stats.totalChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-xl p-3">
                            <div className="text-xs text-slate-400 mb-1">Successful</div>
                            <div className="text-xl font-bold text-green-400">{serverUptime.stats.upChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-xl p-3">
                            <div className="text-xs text-slate-400 mb-1">Failed</div>
                            <div className="text-xl font-bold text-red-400">{serverUptime.stats.downChecks}</div>
                          </div>
                          <div className="bg-slate-800 rounded-xl p-3">
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
      ) : activeTab === 'history' ? (
        /* History Tab */
        <div className="space-y-6">
          {/* Server selector for history */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-48">
                <label className="block text-sm text-slate-400 mb-1">Select Server</label>
                <select
                  value={expandedServer || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setExpandedServer(id || null);
                    if (id) {
                      loadServerHistory(id);
                      loadServerUptimeDetails(id);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="">Choose a server...</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Time Range</label>
                <select
                  value={historyHours}
                  onChange={(e) => {
                    setHistoryHours(parseInt(e.target.value));
                    if (expandedServer) loadServerHistory(expandedServer);
                  }}
                  className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value={1}>Last 1 hour</option>
                  <option value={6}>Last 6 hours</option>
                  <option value={24}>Last 24 hours</option>
                  <option value={168}>Last 7 days</option>
                </select>
              </div>
            </div>
          </div>

          {!expandedServer ? (
            <div className="text-center py-16 text-slate-500">
              <Clock className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select a server to view its history</p>
            </div>
          ) : (
            <>
              {/* Resource Usage Chart */}
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                  Resource Usage History
                </h3>
                {historyData[expandedServer]?.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyData[expandedServer]}>
                        <defs>
                          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="cpu" name="CPU" stroke="#f97316" fill="url(#cpuGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="memory" name="Memory" stroke="#3b82f6" fill="url(#memGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="disk" name="Disk" stroke="#22c55e" fill="url(#diskGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>No resource data available for this period</p>
                  </div>
                )}
              </div>

              {/* Uptime Timeline */}
              {detailsLoading ? (
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                </div>
              ) : serverUptime?.timeline?.length > 0 && (
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-400" />
                    Uptime Timeline (24h)
                  </h3>
                  <div className="flex gap-1 mb-2">
                    {serverUptime.timeline.map((hour, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-10 rounded ${getTimelineStatusColor(hour.status)} opacity-80 hover:opacity-100 transition-opacity cursor-help`}
                        title={`${new Date(hour.hour).toLocaleTimeString()}: ${hour.status.toUpperCase()} (${hour.upCount}/${hour.totalCount} successful)`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>24 hours ago</span>
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Up</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> Partial</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> Down</span>
                    </div>
                    <span>Now</span>
                  </div>
                </div>
              )}

              {/* Uptime Statistics */}
              {serverUptime?.stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
                    <div className="text-slate-400 text-sm mb-1">Total Checks</div>
                    <div className="text-3xl font-bold">{serverUptime.stats.totalChecks}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-900/20 to-slate-900 rounded-xl p-4 border border-green-500/20">
                    <div className="text-slate-400 text-sm mb-1">Successful</div>
                    <div className="text-3xl font-bold text-green-400">{serverUptime.stats.upChecks}</div>
                  </div>
                  <div className="bg-gradient-to-br from-red-900/20 to-slate-900 rounded-xl p-4 border border-red-500/20">
                    <div className="text-slate-400 text-sm mb-1">Failed</div>
                    <div className="text-3xl font-bold text-red-400">{serverUptime.stats.downChecks}</div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-900/20 to-slate-900 rounded-xl p-4 border border-blue-500/20">
                    <div className="text-slate-400 text-sm mb-1">Avg Response</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {serverUptime.stats.avgResponseTime ? `${serverUptime.stats.avgResponseTime}ms` : '-'}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Events */}
              {serverUptime?.recentEvents?.length > 0 && (
                <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Recent Events
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {serverUptime.recentEvents.map((event, idx) => (
                      <div key={idx} className={`flex items-center gap-4 p-3 rounded-lg ${
                        event.status === 'up' ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}>
                        {event.status === 'up' ? (
                          <ArrowUpCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <ArrowDownCircle className="w-5 h-5 text-red-400" />
                        )}
                        <div className="flex-1">
                          <span className={`font-medium ${event.status === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                            {event.status.toUpperCase()}
                          </span>
                          {event.error_message && (
                            <p className="text-sm text-slate-400 mt-0.5">{event.error_message}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-300">{new Date(event.created_at).toLocaleTimeString()}</div>
                          <div className="text-xs text-slate-500">{new Date(event.created_at).toLocaleDateString()}</div>
                        </div>
                        {event.response_time && (
                          <div className="text-sm text-slate-400 w-16 text-right">{event.response_time}ms</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
              <div key={alert.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-4 border border-slate-700">
                <div className={`p-3 rounded-xl ${
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
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
