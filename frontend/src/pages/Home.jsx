import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Server, Shield, Clock, Lock, Database, Activity, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, ChevronRight, Zap, TrendingUp,
  DollarSign, Globe, Rocket, FileText, Coffee, Bell, Calendar,
  Cpu, HardDrive, Wifi, WifiOff
} from 'lucide-react';
import * as api from '../services/api';

function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(60);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Data states
  const [servers, setServers] = useState([]);
  const [security, setSecurity] = useState(null);
  const [sslCerts, setSslCerts] = useState([]);
  const [uptime, setUptime] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [backups, setBackups] = useState([]);
  const [costs, setCosts] = useState(null);

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
    setError(null);

    try {
      // Load data with individual error handling
      const results = await Promise.allSettled([
        api.getServers().catch(() => []),
        api.getSecurityOverview().catch(() => null),
        api.getSSLCertificates().catch(() => []),
        api.getUptimeSummary().catch(() => []),
        api.getAlertHistory(10).catch(() => []),
        api.getRecentDeploymentRuns(5).catch(() => []),
        api.getBackupHistory(5).catch(() => []),
        api.getContaboInstances().catch(() => ({ instances: [] }))
      ]);

      const [
        serversData,
        securityData,
        sslData,
        uptimeData,
        alertsData,
        deploymentsData,
        backupsData,
        contaboData
      ] = results;

      // Process each result with try-catch
      try {
        if (serversData.status === 'fulfilled') {
          setServers(Array.isArray(serversData.value) ? serversData.value : []);
        }
      } catch (e) { console.error('Error processing servers:', e); }

      try {
        if (securityData.status === 'fulfilled' && securityData.value) {
          setSecurity({
            averageScore: securityData.value?.stats?.avgScore || 0,
            ...securityData.value
          });
        }
      } catch (e) { console.error('Error processing security:', e); }

      try {
        if (sslData.status === 'fulfilled') {
          const certs = Array.isArray(sslData.value) ? sslData.value.map(cert => ({
            ...cert,
            daysUntilExpiry: cert?.days_until_expiry ?? 0,
          })) : [];
          setSslCerts(certs);
        }
      } catch (e) { console.error('Error processing SSL:', e); }

      try {
        if (uptimeData.status === 'fulfilled') {
          setUptime(Array.isArray(uptimeData.value) ? uptimeData.value : []);
        }
      } catch (e) { console.error('Error processing uptime:', e); }

      try {
        if (alertsData.status === 'fulfilled') {
          setAlerts(Array.isArray(alertsData.value) ? alertsData.value : []);
        }
      } catch (e) { console.error('Error processing alerts:', e); }

      try {
        if (deploymentsData.status === 'fulfilled') {
          setDeployments(Array.isArray(deploymentsData.value) ? deploymentsData.value : []);
        }
      } catch (e) { console.error('Error processing deployments:', e); }

      try {
        if (backupsData.status === 'fulfilled') {
          setBackups(Array.isArray(backupsData.value) ? backupsData.value : []);
        }
      } catch (e) { console.error('Error processing backups:', e); }

      try {
        if (contaboData.status === 'fulfilled' && contaboData.value?.instances) {
          const instances = Array.isArray(contaboData.value.instances) ? contaboData.value.instances : [];
          const totalMonthly = instances.reduce((sum, i) => sum + (parseFloat(i?.monthlyPrice) || 0), 0);
          setCosts({ monthly: totalMonthly, instances: instances.length });
        }
      } catch (e) { console.error('Error processing contabo:', e); }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard load error:', err);
      if (!silent) setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Calculate stats safely
  const healthyServers = (servers || []).filter(s => s?.lastHealth?.status === 'healthy').length;
  const warningServers = (servers || []).filter(s => s?.lastHealth?.status === 'warning').length;
  const criticalServers = (servers || []).filter(s => s?.lastHealth?.status === 'critical').length;

  // Calculate avgUptime safely to avoid NaN
  const validUptimeServers = (uptime || []).filter(s => s?.uptime24h != null && !isNaN(s.uptime24h));
  const avgUptime = validUptimeServers.length > 0
    ? Math.round(validUptimeServers.reduce((sum, s) => sum + s.uptime24h, 0) / validUptimeServers.length * 10) / 10
    : null;

  const expiringSSL = (sslCerts || []).filter(c => (c?.daysUntilExpiry ?? 999) <= 30).length;
  const criticalSSL = (sslCerts || []).filter(c => (c?.daysUntilExpiry ?? 999) <= 7).length;

  const recentAlerts = (alerts || []).filter(a => {
    try {
      const alertTime = new Date(a?.created_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return alertTime > hourAgo;
    } catch { return false; }
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <Coffee className="w-16 h-16 text-orange-500 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              Dashboard
            </span>
          </h1>
          <p className="text-slate-400 mt-1">
            Infrastructure overview · Updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value={0}>Manual</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
          </select>
          <button
            onClick={() => loadAllData()}
            disabled={refreshing}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          {error}
        </div>
      )}

      {/* Critical Alerts Banner */}
      {(criticalSSL > 0 || criticalServers > 0 || recentAlerts.length > 0) && (
        <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-400">Attention Required</h3>
              <div className="flex flex-wrap gap-4 mt-1 text-sm">
                {criticalServers > 0 && (
                  <span className="text-red-300">{criticalServers} server(s) critical</span>
                )}
                {criticalSSL > 0 && (
                  <span className="text-orange-300">{criticalSSL} SSL cert(s) expiring in 7 days</span>
                )}
                {recentAlerts.length > 0 && (
                  <span className="text-yellow-300">{recentAlerts.length} alert(s) in last hour</span>
                )}
              </div>
            </div>
            <Link
              to="/servers"
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-sm transition-colors"
            >
              View Details
            </Link>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Servers"
          value={`${healthyServers}/${servers.length}`}
          subtext={criticalServers > 0 ? `${criticalServers} critical` : 'all healthy'}
          color={criticalServers > 0 ? 'red' : 'green'}
          link="/servers"
        />
        <StatCard
          icon={Shield}
          label="Security"
          value={security?.averageScore || '-'}
          subtext="avg score"
          color={security?.averageScore >= 70 ? 'green' : security?.averageScore >= 50 ? 'yellow' : 'red'}
          link="/security"
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={avgUptime != null && !isNaN(avgUptime) ? `${avgUptime}%` : '-'}
          subtext="24h average"
          color={avgUptime != null && !isNaN(avgUptime) ? (avgUptime >= 99 ? 'green' : avgUptime >= 95 ? 'yellow' : 'red') : 'blue'}
          link="/servers"
        />
        <StatCard
          icon={DollarSign}
          label="Monthly Cost"
          value={costs?.monthly != null ? `€${costs.monthly.toFixed(0)}` : '-'}
          subtext={costs?.instances ? `${costs.instances} instances` : 'not connected'}
          color="blue"
          link="/costs"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Overview */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Server Health
            </h2>
            <Link to="/servers" className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {!servers || servers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No servers configured</p>
              <Link to="/servers" className="text-orange-400 text-sm mt-2 inline-block">Add a server</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.slice(0, 5).map(server => {
                if (!server) return null;
                const health = server.lastHealth || {};
                const status = health.status || 'unknown';
                const uptimeInfo = (uptime || []).find(u => u?.id === server.id);
                const cpuVal = typeof health.cpu === 'number' ? health.cpu : null;
                const memVal = typeof health.memory === 'number' ? health.memory : null;

                return (
                  <div
                    key={server.id || Math.random()}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                      status === 'healthy' ? 'bg-green-500/5 border-green-500/20' :
                      status === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                      status === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                      'bg-slate-900/50 border-slate-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${
                      status === 'healthy' ? 'bg-green-500' :
                      status === 'warning' ? 'bg-yellow-500' :
                      status === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{server.name || 'Unknown'}</div>
                      <div className="text-xs text-slate-500">{server.host || '-'}</div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className={`font-medium ${cpuVal > 80 ? 'text-red-400' : 'text-slate-300'}`}>
                          {cpuVal != null ? `${cpuVal.toFixed(0)}%` : '-'}
                        </div>
                        <div className="text-xs text-slate-500">CPU</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-medium ${memVal > 80 ? 'text-red-400' : 'text-slate-300'}`}>
                          {memVal != null ? `${memVal.toFixed(0)}%` : '-'}
                        </div>
                        <div className="text-xs text-slate-500">RAM</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-medium ${
                          uptimeInfo?.uptime24h >= 99 ? 'text-green-400' :
                          uptimeInfo?.uptime24h >= 95 ? 'text-yellow-400' :
                          uptimeInfo?.uptime24h != null ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {uptimeInfo?.uptime24h != null ? `${uptimeInfo.uptime24h}%` : '-'}
                        </div>
                        <div className="text-xs text-slate-500">Uptime</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions & SSL */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={Server} label="Servers" to="/servers" />
              <QuickAction icon={Shield} label="Security" to="/security" />
              <QuickAction icon={Lock} label="SSL" to="/ssl" />
              <QuickAction icon={Database} label="Backups" to="/backups" />
              <QuickAction icon={Rocket} label="Deploy" to="/deployments" />
              <QuickAction icon={FileText} label="Logs" to="/logs" />
            </div>
          </div>

          {/* SSL Status */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-400" />
                SSL Certificates
              </h2>
              <Link to="/ssl" className="text-sm text-orange-400 hover:text-orange-300">
                View All
              </Link>
            </div>
            {!sslCerts || sslCerts.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No certificates monitored</p>
            ) : (
              <div className="space-y-2">
                {sslCerts.slice(0, 5).filter(c => c).map((cert, idx) => (
                  <div key={cert.id || idx} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1 text-slate-300">{cert.domain || 'Unknown'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      (cert.daysUntilExpiry ?? 999) <= 7 ? 'bg-red-500/20 text-red-400' :
                      (cert.daysUntilExpiry ?? 999) <= 30 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {cert.daysUntilExpiry ?? '?'}d
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-400" />
            Recent Activity
          </h2>
          {(!deployments || deployments.length === 0) && (!backups || backups.length === 0) ? (
            <p className="text-slate-500 text-sm text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {[
                ...(deployments || []).filter(d => d).map(d => ({ type: 'deploy', name: d.pipeline_name || 'Deployment', status: d.status || 'unknown', time: d.started_at, icon: Rocket })),
                ...(backups || []).filter(b => b).map(b => ({ type: 'backup', name: b.job_name || 'Backup', status: b.status || 'unknown', time: b.started_at, icon: Database }))
              ].filter(item => item.time).sort((a, b) => {
                try { return new Date(b.time) - new Date(a.time); } catch { return 0; }
              }).slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={`p-2 rounded-lg ${
                    item.status === 'success' ? 'bg-green-500/20' :
                    item.status === 'failed' ? 'bg-red-500/20' : 'bg-blue-500/20'
                  }`}>
                    <item.icon className={`w-4 h-4 ${
                      item.status === 'success' ? 'text-green-400' :
                      item.status === 'failed' ? 'text-red-400' : 'text-blue-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.type}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === 'success' ? 'bg-green-500/20 text-green-400' :
                      item.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {item.status}
                    </span>
                    <div className="text-xs text-slate-500 mt-1">
                      {item.time ? new Date(item.time).toLocaleTimeString() : '-'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Alerts */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-400" />
              Recent Alerts
            </h2>
            <Link to="/servers" className="text-sm text-orange-400 hover:text-orange-300">
              View All
            </Link>
          </div>
          {!alerts || alerts.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500/50" />
              <p>No recent alerts</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).filter(a => a).map((alert, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                  alert.alert_type === 'server_down' ? 'bg-red-500/10' :
                  alert.alert_type === 'server_up' ? 'bg-green-500/10' : 'bg-yellow-500/10'
                }`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                    alert.alert_type === 'server_down' ? 'text-red-400' :
                    alert.alert_type === 'server_up' ? 'text-green-400' : 'text-yellow-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{alert.message || 'Alert'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {alert.created_at ? new Date(alert.created_at).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color, link }) {
  const colors = {
    green: 'from-green-500/20 to-green-600/5 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/5 border-red-500/30',
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
  };

  const iconColors = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  return (
    <Link
      to={link}
      className={`bg-gradient-to-br ${colors[color] || colors.blue} border rounded-xl p-4 hover:scale-[1.02] transition-transform`}
    >
      <div className="flex items-start justify-between">
        <div className="p-2 bg-slate-800/50 rounded-lg">
          <Icon className={`w-5 h-5 ${iconColors[color] || 'text-slate-400'}`} />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-slate-400 mt-0.5">{label} · {subtext}</div>
      </div>
    </Link>
  );
}

function QuickAction({ icon: Icon, label, to }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg hover:bg-slate-700/50 hover:border-slate-600 transition-all"
    >
      <Icon className="w-5 h-5 text-slate-400" />
      <span className="text-xs text-slate-300">{label}</span>
    </Link>
  );
}

export default Home;
