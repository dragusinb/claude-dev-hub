import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Server, Shield, Clock, Lock, Database, Activity, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, ChevronRight, Zap, TrendingUp,
  TrendingDown, DollarSign, Globe, Rocket, FileText, Coffee,
  ArrowUpRight, ArrowDownRight, Minus, Bell, Calendar
} from 'lucide-react';
import {
  getServers, getSecurityOverview, getSSLCertificates,
  getUptimeSummary, getAlertHistory, getRecentDeploymentRuns,
  getBackupHistory, getContaboInstances
} from '../services/api';

function Home() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Data states
  const [servers, setServers] = useState([]);
  const [security, setSecurity] = useState(null);
  const [sslCerts, setSslCerts] = useState([]);
  const [uptime, setUptime] = useState(null);
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

    try {
      const [
        serversData,
        securityData,
        sslData,
        uptimeData,
        alertsData,
        deploymentsData,
        backupsData,
        contaboData
      ] = await Promise.allSettled([
        getServers(),
        getSecurityOverview(),
        getSSLCertificates(),
        getUptimeSummary(),
        getAlertHistory(10),
        getRecentDeploymentRuns(5),
        getBackupHistory(5),
        getContaboInstances()
      ]);

      if (serversData.status === 'fulfilled') setServers(serversData.value || []);
      if (securityData.status === 'fulfilled') {
        // Security overview returns { stats: { avgScore, ... }, servers: [...] }
        const secData = securityData.value;
        setSecurity({
          averageScore: secData?.stats?.avgScore || 0,
          ...secData
        });
      }
      if (sslData.status === 'fulfilled') {
        // Map snake_case to camelCase for SSL certs
        const certs = (sslData.value || []).map(cert => ({
          ...cert,
          daysUntilExpiry: cert.days_until_expiry,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          lastChecked: cert.last_checked,
          alertDays: cert.alert_days
        }));
        setSslCerts(certs);
      }
      if (uptimeData.status === 'fulfilled') {
        // Uptime returns array, calculate average
        const uptimeArr = uptimeData.value || [];
        const validUptimes = uptimeArr.filter(s => s.uptime24h !== null);
        const avgUptime = validUptimes.length > 0
          ? validUptimes.reduce((sum, s) => sum + s.uptime24h, 0) / validUptimes.length
          : 99.9;
        setUptime({
          servers: uptimeArr,
          averageUptime: avgUptime
        });
      }
      if (alertsData.status === 'fulfilled') {
        // Add severity based on alert_type if not present
        const alertsWithSeverity = (alertsData.value || []).map(alert => ({
          ...alert,
          severity: alert.severity || (
            alert.alert_type === 'server_down' ? 'critical' :
            alert.alert_type?.includes('critical') ? 'critical' :
            alert.alert_type?.includes('warning') ? 'warning' : 'info'
          )
        }));
        setAlerts(alertsWithSeverity);
      }
      if (deploymentsData.status === 'fulfilled') setDeployments(deploymentsData.value || []);
      if (backupsData.status === 'fulfilled') setBackups(backupsData.value || []);
      if (contaboData.status === 'fulfilled') {
        const instances = contaboData.value || [];
        const totalMonthly = instances.reduce((sum, i) => sum + (parseFloat(i.productPrice) || 0), 0);
        setCosts({ monthly: totalMonthly, instances: instances.length });
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Calculate stats
  const onlineServers = servers.filter(s => s.lastHealth?.status === 'healthy').length;
  const offlineServers = servers.filter(s => s.lastHealth?.status === 'critical').length;
  const avgHealth = servers.length > 0
    ? Math.round(servers.reduce((sum, s) => sum + (s.lastHealth?.score || 0), 0) / servers.length)
    : 0;

  const expiringSSL = sslCerts.filter(c => c.daysUntilExpiry <= 30).length;
  const criticalSSL = sslCerts.filter(c => c.daysUntilExpiry <= 7).length;

  const recentAlerts = alerts.filter(a => {
    const alertTime = new Date(a.created_at);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return alertTime > hourAgo;
  });

  const failedDeployments = deployments.filter(d => d.status === 'failed').length;
  const failedBackups = backups.filter(b => b.status === 'failed').length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Coffee className="w-16 h-16 text-orange-500 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Brewing your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              Dashboard
            </span>
          </h1>
          <p className="text-slate-400 mt-1">
            Welcome back! Here's your infrastructure overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value={0}>Manual</option>
            <option value={10}>10s</option>
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

      {/* Critical Alerts Banner */}
      {(criticalSSL > 0 || offlineServers > 0 || recentAlerts.length > 0) && (
        <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-400">Attention Required</h3>
              <div className="flex flex-wrap gap-4 mt-1 text-sm">
                {offlineServers > 0 && (
                  <span className="text-red-300">{offlineServers} server(s) offline</span>
                )}
                {criticalSSL > 0 && (
                  <span className="text-orange-300">{criticalSSL} SSL cert(s) expiring within 7 days</span>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Server}
          label="Servers"
          value={`${onlineServers}/${servers.length}`}
          subtext="online"
          color="blue"
          trend={offlineServers === 0 ? 'up' : 'down'}
          link="/servers"
        />
        <StatCard
          icon={Shield}
          label="Security Score"
          value={security?.averageScore || 0}
          subtext="avg score"
          color="green"
          trend={(security?.averageScore || 0) >= 70 ? 'up' : 'down'}
          link="/security"
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={`${uptime?.averageUptime?.toFixed(1) || 99.9}%`}
          subtext="30-day avg"
          color="purple"
          trend={(uptime?.averageUptime || 100) >= 99 ? 'up' : 'neutral'}
          link="/servers"
        />
        <StatCard
          icon={DollarSign}
          label="Monthly Cost"
          value={`€${costs?.monthly?.toFixed(0) || 0}`}
          subtext={`${costs?.instances || 0} instances`}
          color="orange"
          trend="neutral"
          link="/costs"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Health */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Server Health
            </h2>
            <Link to="/servers" className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-3">
            {servers.slice(0, 5).map(server => {
              const health = server.lastHealth || {};
              const score = health.score || 0;
              const status = health.status || 'unknown';

              return (
                <div
                  key={server.id}
                  className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                >
                  <div className={`w-3 h-3 rounded-full ${
                    status === 'healthy' ? 'bg-green-500' :
                    status === 'warning' ? 'bg-yellow-500' :
                    status === 'critical' ? 'bg-red-500' : 'bg-slate-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{server.name}</div>
                    <div className="text-xs text-slate-500">{server.host}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm">
                        CPU: <span className={health.cpu > 80 ? 'text-red-400' : 'text-slate-300'}>{health.cpu?.toFixed(0) || 0}%</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Mem: {health.memory?.toFixed(0) || 0}%
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${
                      score >= 80 ? 'text-green-400' :
                      score >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {score}
                    </div>
                  </div>
                </div>
              );
            })}
            {servers.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No servers configured</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <QuickActionButton icon={Shield} label="Security Audit" to="/security" color="green" />
            <QuickActionButton icon={Lock} label="SSL Check" to="/ssl" color="purple" />
            <QuickActionButton icon={Database} label="Backups" to="/backups" color="blue" />
            <QuickActionButton icon={FileText} label="View Logs" to="/logs" color="orange" />
            <QuickActionButton icon={Globe} label="DNS Manager" to="/dns" color="cyan" />
            <QuickActionButton icon={Rocket} label="Deployments" to="/deployments" color="pink" />
          </div>

          {/* SSL Certificates Status */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              SSL Certificates
            </h3>
            <div className="space-y-2">
              {sslCerts.slice(0, 4).map(cert => (
                <div key={cert.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1 text-slate-300">{cert.domain}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    cert.daysUntilExpiry <= 7 ? 'bg-red-500/20 text-red-400' :
                    cert.daysUntilExpiry <= 30 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {cert.daysUntilExpiry}d
                  </span>
                </div>
              ))}
              {sslCerts.length === 0 && (
                <p className="text-slate-500 text-sm">No certificates monitored</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Activity & Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              Recent Activity
            </h2>
          </div>
          <div className="space-y-3">
            {/* Combine deployments and backups into activity feed */}
            {[
              ...deployments.map(d => ({
                type: 'deployment',
                name: d.pipeline_name,
                status: d.status,
                time: d.started_at,
                icon: Rocket
              })),
              ...backups.map(b => ({
                type: 'backup',
                name: b.job_name,
                status: b.status,
                time: b.started_at,
                icon: Database
              }))
            ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={`p-1.5 rounded-lg ${
                  item.status === 'success' ? 'bg-green-500/20' :
                  item.status === 'failed' ? 'bg-red-500/20' :
                  'bg-blue-500/20'
                }`}>
                  <item.icon className={`w-4 h-4 ${
                    item.status === 'success' ? 'text-green-400' :
                    item.status === 'failed' ? 'text-red-400' :
                    'text-blue-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{item.name}</span>
                  <span className="text-xs text-slate-500">{item.type}</span>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.status === 'success' ? 'bg-green-500/20 text-green-400' :
                    item.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {item.status}
                  </span>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(item.time).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            {deployments.length === 0 && backups.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-4">No recent activity</p>
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-400" />
              Recent Alerts
            </h2>
            <Link to="/servers" className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg">
                <div className={`p-1.5 rounded-lg ${
                  alert.severity === 'critical' ? 'bg-red-500/20' :
                  alert.severity === 'warning' ? 'bg-yellow-500/20' :
                  'bg-blue-500/20'
                }`}>
                  <AlertTriangle className={`w-4 h-4 ${
                    alert.severity === 'critical' ? 'text-red-400' :
                    alert.severity === 'warning' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{alert.message}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center py-6 text-slate-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500/50" />
                <p>No recent alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color, trend, link }) {
  const colors = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/5 border-green-500/30',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30',
    red: 'from-red-500/20 to-red-600/5 border-red-500/30',
  };

  const iconColors = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
  };

  return (
    <Link
      to={link}
      className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-4 hover:scale-[1.02] transition-transform`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg bg-slate-800/50`}>
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
        </div>
        {trend && (
          <div className={`${
            trend === 'up' ? 'text-green-400' :
            trend === 'down' ? 'text-red-400' :
            'text-slate-400'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> :
             trend === 'down' ? <ArrowDownRight className="w-4 h-4" /> :
             <Minus className="w-4 h-4" />}
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-slate-400 mt-0.5">{label} · {subtext}</div>
      </div>
    </Link>
  );
}

function QuickActionButton({ icon: Icon, label, to, color }) {
  const colors = {
    green: 'hover:bg-green-500/20 hover:border-green-500/30',
    purple: 'hover:bg-purple-500/20 hover:border-purple-500/30',
    blue: 'hover:bg-blue-500/20 hover:border-blue-500/30',
    orange: 'hover:bg-orange-500/20 hover:border-orange-500/30',
    cyan: 'hover:bg-cyan-500/20 hover:border-cyan-500/30',
    pink: 'hover:bg-pink-500/20 hover:border-pink-500/30',
  };

  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg transition-all ${colors[color]}`}
    >
      <Icon className="w-5 h-5 text-slate-400" />
      <span className="text-xs text-slate-300">{label}</span>
    </Link>
  );
}

export default Home;
