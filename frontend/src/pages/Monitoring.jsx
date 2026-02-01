import { useState, useEffect } from 'react';
import { Activity, Server, Cpu, HardDrive, Clock, RefreshCw, Loader2, AlertCircle, TrendingUp, Bell, Settings, Wifi, Gauge } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getServers, getServerHealth, getServerHealthHistory, getActivityLog, getDeployHistory, getAlertSettings, updateAlertSettings, getAlertHistory } from '../services/api';

function Monitoring() {
  const [servers, setServers] = useState([]);
  const [healthData, setHealthData] = useState({});
  const [historyData, setHistoryData] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState({});
  const [activityLog, setActivityLog] = useState([]);
  const [deployHistory, setDeployHistory] = useState([]);
  const [alertSettings, setAlertSettings] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('health');
  const [historyHours, setHistoryHours] = useState(24);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh === 0) return;
    const timer = setInterval(() => {
      loadData(true);
    }, autoRefresh * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  useEffect(() => {
    // Load history for all servers when time range changes
    servers.forEach(server => loadServerHistory(server.id));
  }, [servers, historyHours]);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [serversData, activityData, deployData, alertSettingsData, alertHistoryData] = await Promise.all([
        getServers(),
        getActivityLog(30).catch(() => []),
        getDeployHistory(30).catch(() => []),
        getAlertSettings().catch(() => null),
        getAlertHistory(50).catch(() => [])
      ]);
      setServers(serversData);
      setActivityLog(activityData);
      setDeployHistory(deployData);
      setAlertSettings(alertSettingsData);
      setAlertHistory(alertHistoryData);
      setLastRefresh(new Date());

      // Load health for all servers
      for (const server of serversData) {
        loadServerHealth(server.id);
      }
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadServerHealth(serverId) {
    setRefreshing(prev => ({ ...prev, [serverId]: true }));
    try {
      const health = await getServerHealth(serverId);
      setHealthData(prev => ({ ...prev, [serverId]: health }));
    } catch (err) {
      setHealthData(prev => ({
        ...prev,
        [serverId]: { success: false, error: err.message }
      }));
    } finally {
      setRefreshing(prev => ({ ...prev, [serverId]: false }));
    }
  }

  async function loadServerHistory(serverId) {
    try {
      const result = await getServerHealthHistory(serverId, historyHours);
      if (result.success) {
        const formattedHistory = result.history.map(h => ({
          time: new Date(h.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }),
          fullTime: new Date(h.created_at).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }),
          cpu: h.cpu,
          memory: h.memory_percent,
          disk: h.disk_percent,
          load: h.load_one,
          // Convert bytes/s to KB/s for better readability
          networkRx: (h.network_rx_rate || 0) / 1024,
          networkTx: (h.network_tx_rate || 0) / 1024
        }));
        setHistoryData(prev => ({ ...prev, [serverId]: formattedHistory }));
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  async function handleSaveAlertSettings() {
    setSavingAlerts(true);
    try {
      const result = await updateAlertSettings({
        enabled: alertSettings.enabled,
        email: alertSettings.email,
        webhookUrl: alertSettings.webhook_url,
        cpuThreshold: alertSettings.cpu_threshold,
        memoryThreshold: alertSettings.memory_threshold,
        diskThreshold: alertSettings.disk_threshold,
        notifyOnDown: alertSettings.notify_on_down
      });
      setAlertSettings(result);
      alert('Alert settings saved!');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSavingAlerts(false);
    }
  }

  function getStatusColor(percent) {
    if (percent >= 90) return 'text-red-500';
    if (percent >= 70) return 'text-yellow-500';
    return 'text-green-500';
  }

  function getProgressColor(percent) {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
  }

  function getAlertTypeColor(type) {
    switch (type) {
      case 'server_down': return 'text-red-500 bg-red-500/10';
      case 'server_up': return 'text-green-500 bg-green-500/10';
      case 'cpu_high': return 'text-orange-500 bg-orange-500/10';
      case 'memory_high': return 'text-blue-500 bg-blue-500/10';
      case 'disk_high': return 'text-purple-500 bg-purple-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  }

  function formatAlertType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Calculate overall health
  const totalServers = servers.length;
  const healthyServers = Object.values(healthData).filter(h => h?.success && h?.stats?.cpu < 80).length;
  const avgCpu = totalServers > 0 ? Object.values(healthData).reduce((sum, h) => sum + (h?.stats?.cpu || 0), 0) / totalServers : 0;
  const avgMemory = totalServers > 0 ? Object.values(healthData).reduce((sum, h) => sum + (h?.stats?.memory?.percent || 0), 0) / totalServers : 0;

  return (
    <div className="p-6">
      {/* Enhanced Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl">
            <Activity className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Server Monitoring</h1>
            <p className="text-slate-400 text-sm">
              {healthyServers}/{totalServers} servers healthy · Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value={0}>Manual refresh</option>
            <option value={10}>Every 10s</option>
            <option value={30}>Every 30s</option>
            <option value={60}>Every 1m</option>
            <option value={300}>Every 5m</option>
          </select>
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {!loading && totalServers > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Server className="w-4 h-4" />
              Servers Online
            </div>
            <div className="text-2xl font-bold">
              <span className="text-green-400">{healthyServers}</span>
              <span className="text-slate-500">/{totalServers}</span>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Cpu className="w-4 h-4" />
              Avg CPU
            </div>
            <div className={`text-2xl font-bold ${avgCpu > 80 ? 'text-red-400' : avgCpu > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
              {avgCpu.toFixed(1)}%
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <HardDrive className="w-4 h-4" />
              Avg Memory
            </div>
            <div className={`text-2xl font-bold ${avgMemory > 80 ? 'text-red-400' : avgMemory > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
              {avgMemory.toFixed(1)}%
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
              <Bell className="w-4 h-4" />
              Active Alerts
            </div>
            <div className={`text-2xl font-bold ${alertHistory.length > 0 ? 'text-orange-400' : 'text-green-400'}`}>
              {alertHistory.length}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === 'health'
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            Server Health
          </span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === 'history'
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            History
          </span>
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === 'alerts'
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Alerts
            {alertHistory.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {alertHistory.length}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('deploys')}
          className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === 'deploys'
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Deploys
          </span>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 -mb-px transition-colors whitespace-nowrap ${
            activeTab === 'activity'
              ? 'text-orange-500 border-b-2 border-orange-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity
          </span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading monitoring data...
        </div>
      ) : (
        <>
          {/* Server Health Tab */}
          {activeTab === 'health' && (
            <div>
              {servers.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">No servers configured</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {servers.map((server) => {
                    const health = healthData[server.id];
                    const isLoading = refreshing[server.id];

                    return (
                      <div
                        key={server.id}
                        className="bg-slate-800 rounded-lg border border-slate-700 p-4"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold">{server.name}</h3>
                            <p className="text-slate-400 text-sm">{server.host}</p>
                          </div>
                          <button
                            onClick={() => loadServerHealth(server.id)}
                            disabled={isLoading}
                            className="p-1.5 text-slate-400 hover:text-white transition-colors"
                          >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>

                        {!health ? (
                          <div className="text-slate-500 text-sm py-4 text-center">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" />
                            Loading...
                          </div>
                        ) : !health.success ? (
                          <div className="text-red-400 text-sm py-4 text-center">
                            <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                            {health.error || 'Connection failed'}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* CPU */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-1.5">
                                  <Cpu className="w-3.5 h-3.5" />
                                  CPU
                                </span>
                                <span className={getStatusColor(health.stats?.cpu || 0)}>
                                  {health.stats?.cpu?.toFixed(1) || 0}%
                                </span>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${getProgressColor(health.stats?.cpu || 0)} transition-all`}
                                  style={{ width: `${Math.min(100, health.stats?.cpu || 0)}%` }}
                                />
                              </div>
                            </div>

                            {/* Memory */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-1.5">
                                  <HardDrive className="w-3.5 h-3.5" />
                                  Memory
                                </span>
                                <span className={getStatusColor(health.stats?.memory?.percent || 0)}>
                                  {health.stats?.memory?.used || 0}MB / {health.stats?.memory?.total || 0}MB
                                </span>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${getProgressColor(health.stats?.memory?.percent || 0)} transition-all`}
                                  style={{ width: `${Math.min(100, health.stats?.memory?.percent || 0)}%` }}
                                />
                              </div>
                            </div>

                            {/* Disk */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-1.5">
                                  <HardDrive className="w-3.5 h-3.5" />
                                  Disk
                                </span>
                                <span className={getStatusColor(health.stats?.disk?.percent || 0)}>
                                  {health.stats?.disk?.used || '0'} / {health.stats?.disk?.total || '0'}
                                </span>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${getProgressColor(health.stats?.disk?.percent || 0)} transition-all`}
                                  style={{ width: `${Math.min(100, health.stats?.disk?.percent || 0)}%` }}
                                />
                              </div>
                            </div>

                            {/* Uptime & Load */}
                            <div className="pt-2 border-t border-slate-700 space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-slate-300">{health.stats?.uptime || 'Unknown'}</span>
                              </div>
                              <div className="text-xs text-slate-400">
                                Load: {health.stats?.load?.one || 0}, {health.stats?.load?.five || 0}, {health.stats?.load?.fifteen || 0}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* History Graphs Tab */}
          {activeTab === 'history' && (
            <div>
              {servers.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">No servers configured</p>
                </div>
              ) : (
                <div>
                  <div className="flex justify-end mb-6">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-400">Time Range</label>
                      <select
                        value={historyHours}
                        onChange={(e) => setHistoryHours(parseInt(e.target.value))}
                        className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      >
                        <option value={1}>Last 1 hour</option>
                        <option value={6}>Last 6 hours</option>
                        <option value={12}>Last 12 hours</option>
                        <option value={24}>Last 24 hours</option>
                        <option value={48}>Last 48 hours</option>
                        <option value={168}>Last 7 days</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {servers.map(server => {
                      const serverHistory = historyData[server.id] || [];
                      return (
                        <div key={server.id} className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Server className="w-5 h-5 text-orange-500" />
                            {server.name}
                            <span className="text-sm font-normal text-slate-400">({server.host})</span>
                          </h3>
                          {serverHistory.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p>No history data yet</p>
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {/* CPU/Memory/Disk Chart */}
                              <div>
                                <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                  <Cpu className="w-4 h-4" />
                                  CPU / Memory / Disk Usage
                                </h4>
                                <div className="h-64">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={serverHistory}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} unit="%" />
                                      <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                        labelStyle={{ color: '#e2e8f0' }}
                                        formatter={(value, name) => [`${value?.toFixed(1)}%`, name]}
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

                              {/* Network Traffic Chart */}
                              <div>
                                <h4 className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                  <Wifi className="w-4 h-4" />
                                  Network Traffic (KB/s)
                                </h4>
                                <div className="h-48">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={serverHistory}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                                      <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                        labelStyle={{ color: '#e2e8f0' }}
                                        formatter={(value, name) => [`${value?.toFixed(2)} KB/s`, name]}
                                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullTime || label}
                                      />
                                      <Legend />
                                      <Line type="monotone" dataKey="networkRx" name="Download (RX)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                      <Line type="monotone" dataKey="networkTx" name="Upload (TX)" stroke="#ec4899" strokeWidth={2} dot={false} />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-6">
              {/* Alert Settings */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Alert Settings
                </h3>

                {alertSettings && (
                  <div className="space-y-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={alertSettings.enabled}
                        onChange={(e) => setAlertSettings({ ...alertSettings, enabled: e.target.checked })}
                        className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                      />
                      <span>Enable Alerts</span>
                    </label>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-400">Notification Email</label>
                        <input
                          type="email"
                          value={alertSettings.email || ''}
                          onChange={(e) => setAlertSettings({ ...alertSettings, email: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                          placeholder="alerts@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-400">Webhook URL (Slack, Discord, etc.)</label>
                        <input
                          type="url"
                          value={alertSettings.webhook_url || ''}
                          onChange={(e) => setAlertSettings({ ...alertSettings, webhook_url: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                          placeholder="https://hooks.slack.com/..."
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-400">CPU Threshold (%)</label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          value={alertSettings.cpu_threshold || 90}
                          onChange={(e) => setAlertSettings({ ...alertSettings, cpu_threshold: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-400">Memory Threshold (%)</label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          value={alertSettings.memory_threshold || 90}
                          onChange={(e) => setAlertSettings({ ...alertSettings, memory_threshold: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-400">Disk Threshold (%)</label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          value={alertSettings.disk_threshold || 85}
                          onChange={(e) => setAlertSettings({ ...alertSettings, disk_threshold: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={alertSettings.notify_on_down}
                        onChange={(e) => setAlertSettings({ ...alertSettings, notify_on_down: e.target.checked })}
                        className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                      />
                      <span>Notify when server goes down</span>
                    </label>

                    <button
                      onClick={handleSaveAlertSettings}
                      disabled={savingAlerts}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {savingAlerts ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                )}
              </div>

              {/* Alert History */}
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Recent Alerts
                </h3>

                {alertHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No alerts yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertHistory.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getAlertTypeColor(alert.alert_type)}`}>
                            {formatAlertType(alert.alert_type)}
                          </span>
                          <div>
                            <div className="font-medium">{alert.server_name || 'Unknown Server'}</div>
                            <div className="text-sm text-slate-400">{alert.message}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">{formatDate(alert.created_at)}</div>
                          {alert.notified ? (
                            <span className="text-xs text-green-500">Notified</span>
                          ) : (
                            <span className="text-xs text-slate-500">Not sent</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deploy History Tab */}
          {activeTab === 'deploys' && (
            <div>
              {deployHistory.length === 0 ? (
                <div className="text-center py-12">
                  <HardDrive className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">No deployments yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deployHistory.map((deploy) => (
                    <div
                      key={deploy.id}
                      className="bg-slate-800 rounded-lg border border-slate-700 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full ${
                          deploy.status === 'success' ? 'bg-green-500' :
                          deploy.status === 'failed' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`} />
                        <div>
                          <div className="font-medium">{deploy.project_name || 'Unknown Project'}</div>
                          <div className="text-sm text-slate-400">to {deploy.server_name || 'Unknown Server'}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm ${
                          deploy.status === 'success' ? 'text-green-500' :
                          deploy.status === 'failed' ? 'text-red-500' :
                          'text-yellow-500'
                        }`}>
                          {deploy.status}
                        </div>
                        <div className="text-xs text-slate-500">{formatDate(deploy.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity Log Tab */}
          {activeTab === 'activity' && (
            <div>
              {activityLog.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                  <p className="text-slate-400">No activity recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activityLog.map((activity) => (
                    <div
                      key={activity.id}
                      className="bg-slate-800 rounded-lg border border-slate-700 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <Activity className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-medium">{activity.action}</div>
                          {activity.entity_type && (
                            <div className="text-sm text-slate-400">
                              {activity.entity_type}: {activity.details || activity.entity_id}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">{formatDate(activity.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Monitoring;
