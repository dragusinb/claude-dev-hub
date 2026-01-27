import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, XCircle, Server, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '../services/api';

function Security() {
  const [overview, setOverview] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverAudit, setServerAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [runningAudit, setRunningAudit] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [overviewData, serversData] = await Promise.all([
        api.getSecurityOverview(),
        api.getServers()
      ]);
      setOverview(overviewData);
      setServers(serversData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadServerAudit(serverId) {
    try {
      setAuditLoading(true);
      const data = await api.getLatestSecurityAudit(serverId);
      setServerAudit(data);
    } catch (err) {
      console.error('Failed to load audit:', err);
    } finally {
      setAuditLoading(false);
    }
  }

  async function runAudit(serverId) {
    try {
      setRunningAudit(serverId);
      await api.runSecurityAudit(serverId);
      loadData();
      if (expandedServer === serverId) {
        loadServerAudit(serverId);
      }
    } catch (err) {
      alert('Audit failed: ' + err.message);
    } finally {
      setRunningAudit(null);
    }
  }

  function toggleExpand(serverId) {
    if (expandedServer === serverId) {
      setExpandedServer(null);
      setServerAudit(null);
    } else {
      setExpandedServer(serverId);
      loadServerAudit(serverId);
    }
  }

  function getScoreColor(score) {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getScoreBg(score) {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getSeverityColor(severity) {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-900/30';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30';
      case 'info': return 'text-blue-400 bg-blue-900/30';
      default: return 'text-slate-400 bg-slate-900/30';
    }
  }

  // Find audit data for each server
  function getServerAuditInfo(serverId) {
    if (!overview) return null;
    return overview.servers.find(s => s.serverId === serverId);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Security Audit</h1>
            <p className="text-slate-400 text-sm">Server security assessment and recommendations</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <>
          {/* Overview Stats */}
          {overview && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-sm mb-1">Average Score</div>
                <div className={`text-3xl font-bold ${getScoreColor(overview.stats.avgScore)}`}>
                  {overview.stats.avgScore}/100
                </div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-sm mb-1">Healthy</div>
                <div className="text-2xl font-bold text-green-400">{overview.stats.healthyServers}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-sm mb-1">Warning</div>
                <div className="text-2xl font-bold text-yellow-400">{overview.stats.warningServers}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-sm mb-1">Critical</div>
                <div className="text-2xl font-bold text-red-400">{overview.stats.criticalServers}</div>
              </div>
            </div>
          )}

          {/* Server List */}
          {servers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No servers configured</p>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map(server => {
                const auditInfo = getServerAuditInfo(server.id);
                return (
                  <div key={server.id} className="bg-slate-800 rounded-xl overflow-hidden">
                    {/* Server Row */}
                    <div className="p-4 flex items-center justify-between">
                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1"
                        onClick={() => toggleExpand(server.id)}
                      >
                        {/* Score Circle */}
                        <div className="relative w-14 h-14">
                          <svg className="w-14 h-14 transform -rotate-90">
                            <circle
                              cx="28"
                              cy="28"
                              r="24"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                              className="text-slate-700"
                            />
                            {auditInfo && (
                              <circle
                                cx="28"
                                cy="28"
                                r="24"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                                strokeDasharray={`${auditInfo.score * 1.51} 151`}
                                className={getScoreColor(auditInfo.score)}
                              />
                            )}
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-sm font-bold ${auditInfo ? getScoreColor(auditInfo.score) : 'text-slate-400'}`}>
                              {auditInfo ? auditInfo.score : '?'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium">{server.name}</div>
                          <div className="text-sm text-slate-400">{server.host}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {auditInfo && (
                          <div className="text-right text-sm">
                            {auditInfo.criticalFindings > 0 && (
                              <div className="text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                {auditInfo.criticalFindings} critical
                              </div>
                            )}
                            {auditInfo.securityUpdates > 0 && (
                              <div className="text-yellow-400 text-xs">
                                {auditInfo.securityUpdates} security updates
                              </div>
                            )}
                            {auditInfo.lastAudit && (
                              <div className="text-xs text-slate-500">
                                {new Date(auditInfo.lastAudit).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); runAudit(server.id); }}
                          disabled={runningAudit === server.id}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-orange-600 rounded transition-colors disabled:opacity-50"
                        >
                          {runningAudit === server.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            'Run Audit'
                          )}
                        </button>

                        <div onClick={() => toggleExpand(server.id)} className="cursor-pointer">
                          {expandedServer === server.id ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedServer === server.id && (
                      <div className="border-t border-slate-700 p-4">
                        {auditLoading ? (
                          <div className="text-center py-8 text-slate-400">Loading audit details...</div>
                        ) : serverAudit ? (
                          <div className="space-y-4">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-xs text-slate-400 mb-1">Open Ports</div>
                                <div className="text-xl font-bold">{serverAudit.open_ports?.length || 0}</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-xs text-slate-400 mb-1">Pending Updates</div>
                                <div className="text-xl font-bold">{serverAudit.pending_updates}</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-xs text-slate-400 mb-1">Security Updates</div>
                                <div className="text-xl font-bold text-yellow-400">{serverAudit.security_updates}</div>
                              </div>
                              <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-xs text-slate-400 mb-1">Failed SSH (24h)</div>
                                <div className="text-xl font-bold">{serverAudit.failed_ssh_attempts}</div>
                              </div>
                            </div>

                            {/* Open Ports */}
                            {serverAudit.open_ports?.length > 0 && (
                              <div>
                                <div className="text-sm text-slate-400 mb-2">Open Ports</div>
                                <div className="flex flex-wrap gap-2">
                                  {serverAudit.open_ports.map(port => (
                                    <span key={port} className="px-2 py-1 bg-slate-900 rounded text-sm">
                                      {port}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Findings */}
                            {serverAudit.findings?.length > 0 && (
                              <div>
                                <div className="text-sm text-slate-400 mb-2">Findings</div>
                                <div className="space-y-2">
                                  {serverAudit.findings.map((finding, idx) => (
                                    <div key={idx} className={`p-3 rounded-lg ${getSeverityColor(finding.severity)}`}>
                                      <div className="flex items-center gap-2">
                                        {finding.severity === 'high' && <AlertTriangle className="w-4 h-4" />}
                                        {finding.severity === 'info' && <CheckCircle className="w-4 h-4" />}
                                        <span className="text-sm">{finding.message}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recommendations */}
                            {serverAudit.recommendations?.length > 0 && (
                              <div>
                                <div className="text-sm text-slate-400 mb-2">Recommendations</div>
                                <ul className="space-y-1">
                                  {serverAudit.recommendations.map((rec, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm">
                                      <span className="text-orange-400 mt-1">•</span>
                                      <span className="text-slate-300">{rec}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-400">
                            <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No audit data available</p>
                            <p className="text-sm mt-2">Click "Run Audit" to perform a security scan</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Security;
