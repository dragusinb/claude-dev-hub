import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, XCircle, Server, ChevronDown, ChevronUp, Play, X, Terminal, Undo2 } from 'lucide-react';
import * as api from '../services/api';

function Security() {
  const [overview, setOverview] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverAudit, setServerAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [runningAudit, setRunningAudit] = useState(null);
  const [actions, setActions] = useState([]);
  const [actionModal, setActionModal] = useState(null);
  const [actionRunning, setActionRunning] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [portActionType, setPortActionType] = useState('block'); // 'block', 'localhost', 'ip'
  const [allowedIP, setAllowedIP] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [overviewData, serversData, actionsData] = await Promise.all([
        api.getSecurityOverview(),
        api.getServers(),
        api.getSecurityActions()
      ]);
      setOverview(overviewData);
      setServers(serversData);
      setActions(actionsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function executeAction(serverId, actionId, customAllowedIP = null) {
    try {
      setActionRunning(true);
      setActionResult(null);
      const result = await api.executeSecurityAction(serverId, actionId, customAllowedIP);

      // After successful action, run a new audit to update findings/score
      if (result.success) {
        setActionResult({ ...result, auditRunning: true });
        // Run a new audit to refresh the findings
        try {
          await api.runSecurityAudit(serverId);
          setActionResult({ ...result, auditCompleted: true });
        } catch (auditErr) {
          console.log('Auto-audit after action failed:', auditErr.message);
          setActionResult({ ...result, auditFailed: true });
        }
        loadServerAudit(serverId);
        loadData();
      } else {
        setActionResult(result);
      }
    } catch (err) {
      setActionResult({ success: false, error: err.message });
    } finally {
      setActionRunning(false);
    }
  }

  async function executeUndo(serverId, undoActionId) {
    try {
      setActionRunning(true);
      const result = await api.executeSecurityAction(serverId, undoActionId);
      setActionResult({
        ...result,
        isUndo: true
      });
      if (result.success) {
        // Run a new audit to refresh the findings
        try {
          await api.runSecurityAudit(serverId);
        } catch (auditErr) {
          console.log('Auto-audit after undo failed:', auditErr.message);
        }
        loadServerAudit(serverId);
        loadData();
      }
    } catch (err) {
      setActionResult({ success: false, error: err.message, isUndo: true });
    } finally {
      setActionRunning(false);
    }
  }

  function getRecommendedActions(audit) {
    if (!audit) return [];
    const recommended = [];
    const addedActions = new Set();

    // Get actions from findings that have an action field
    if (audit.findings) {
      for (const finding of audit.findings) {
        if (finding.action && finding.severity !== 'info' && !addedActions.has(finding.action)) {
          addedActions.add(finding.action);

          // Find matching static action or create dynamic one for ports
          let action = actions.find(a => a.id === finding.action);

          // Handle dynamic port actions
          if (!action && finding.action.startsWith('restrict_port_') && finding.action.endsWith('_localhost')) {
            const port = finding.action.replace('restrict_port_', '').replace('_localhost', '');
            action = {
              id: finding.action,
              name: `Restrict Port ${port} to Localhost`,
              description: `Allow port ${port} only from localhost (127.0.0.1). Remote connections will be blocked.`,
              command: `ufw delete allow ${port} 2>/dev/null; ufw deny ${port} && ufw allow from 127.0.0.1 to any port ${port} && ufw reload`
            };
          } else if (!action && finding.action.startsWith('block_port_')) {
            const port = finding.action.replace('block_port_', '');
            action = {
              id: finding.action,
              name: `Block Port ${port}`,
              description: `Completely block port ${port} using UFW firewall`,
              command: `ufw deny ${port} && ufw reload`
            };
          } else if (!action && finding.action.startsWith('manage_port_')) {
            const port = finding.action.replace('manage_port_', '');
            action = {
              id: finding.action,
              name: `Manage Port ${port}`,
              description: `Choose how to restrict access to port ${port}: block completely, allow only localhost, or allow from a specific IP.`,
              isPortManagement: true,
              port: parseInt(port)
            };
          }

          if (action) {
            recommended.push({ ...action, reason: finding.message });
          }
        }
      }
    }

    return recommended;
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
      case 'low': return 'text-orange-400 bg-orange-900/30';
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

                            {/* Quick Actions */}
                            {getRecommendedActions(serverAudit).length > 0 && (
                              <div>
                                <div className="text-sm text-slate-400 mb-2">Quick Actions</div>
                                <div className="space-y-2">
                                  {getRecommendedActions(serverAudit).map((action) => (
                                    <div key={action.id} className="flex items-center justify-between bg-slate-900 rounded-lg p-3">
                                      <div>
                                        <div className="font-medium text-sm">{action.name}</div>
                                        <div className="text-xs text-slate-400">{action.reason}</div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setPortActionType('block');
                                          setAllowedIP('');
                                          setActionModal({ serverId: server.id, serverName: server.name, action });
                                        }}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-sm transition-colors"
                                      >
                                        <Play className="w-3 h-3" />
                                        Fix Now
                                      </button>
                                    </div>
                                  ))}
                                </div>
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

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold">{actionModal.action.name}</h3>
              </div>
              <button
                onClick={() => { setActionModal(null); setActionResult(null); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <div className="mb-4">
                <div className="text-sm text-slate-400 mb-1">Server</div>
                <div className="font-medium">{actionModal.serverName}</div>
              </div>

              <div className="mb-4">
                <div className="text-sm text-slate-400 mb-1">Description</div>
                <div className="text-sm">{actionModal.action.description}</div>
              </div>

              {/* Port management options */}
              {actionModal.action.isPortManagement && (
                <div className="mb-4">
                  <div className="text-sm text-slate-400 mb-2">Action Type</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700">
                      <input
                        type="radio"
                        name="portAction"
                        value="block"
                        checked={portActionType === 'block'}
                        onChange={(e) => setPortActionType(e.target.value)}
                        className="accent-orange-500"
                      />
                      <div>
                        <div className="font-medium text-sm">Block Completely</div>
                        <div className="text-xs text-slate-400">Deny all access to this port</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700">
                      <input
                        type="radio"
                        name="portAction"
                        value="localhost"
                        checked={portActionType === 'localhost'}
                        onChange={(e) => setPortActionType(e.target.value)}
                        className="accent-orange-500"
                      />
                      <div>
                        <div className="font-medium text-sm">Restrict to Localhost</div>
                        <div className="text-xs text-slate-400">Allow only connections from 127.0.0.1</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700">
                      <input
                        type="radio"
                        name="portAction"
                        value="ip"
                        checked={portActionType === 'ip'}
                        onChange={(e) => setPortActionType(e.target.value)}
                        className="accent-orange-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">Restrict to Specific IP</div>
                        <div className="text-xs text-slate-400">Allow only connections from a specific IP address</div>
                      </div>
                    </label>
                    {portActionType === 'ip' && (
                      <div className="ml-6 mt-2">
                        <input
                          type="text"
                          value={allowedIP}
                          onChange={(e) => setAllowedIP(e.target.value)}
                          placeholder="Enter IP address (e.g., 192.168.1.100)"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show command only for non-port-management actions */}
              {!actionModal.action.isPortManagement && actionModal.action.command && (
                <div className="mb-4">
                  <div className="text-sm text-slate-400 mb-1">Command to execute</div>
                  <pre className="bg-slate-900 rounded-lg p-3 text-xs overflow-x-auto text-green-400">
                    {actionModal.action.command}
                  </pre>
                </div>
              )}

              {actionResult && (
                <div className="mb-4">
                  <div className="text-sm text-slate-400 mb-1">Result</div>
                  <div className={`p-3 rounded-lg ${actionResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {actionResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span className="font-medium">{actionResult.success ? 'Success' : 'Failed'}</span>
                      {actionResult.exitCode !== undefined && (
                        <span className="text-xs opacity-70">(exit code: {actionResult.exitCode})</span>
                      )}
                    </div>
                    {actionResult.output && (
                      <pre className="bg-slate-900 rounded p-2 text-xs overflow-x-auto max-h-40 text-slate-300">
                        {actionResult.output}
                      </pre>
                    )}
                    {actionResult.error && (
                      <pre className="bg-slate-900 rounded p-2 text-xs overflow-x-auto max-h-40 text-red-300 mt-2">
                        {actionResult.error}
                      </pre>
                    )}
                    {actionResult.success && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-xs">
                        {actionResult.auditRunning && !actionResult.auditCompleted && (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Running security audit to update findings...
                          </div>
                        )}
                        {actionResult.auditCompleted && (
                          <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Security audit updated. Close to see new results.
                          </div>
                        )}
                        {actionResult.auditFailed && (
                          <div className="flex items-center gap-2 text-yellow-400">
                            <AlertTriangle className="w-3 h-3" />
                            Auto-audit failed. Run manually to update findings.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => { setActionModal(null); setActionResult(null); }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                {actionResult ? 'Close' : 'Cancel'}
              </button>
              {actionResult && actionResult.success && actionResult.undoAction && !actionResult.isUndo && (
                <button
                  onClick={() => executeUndo(actionModal.serverId, actionResult.undoAction)}
                  disabled={actionRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Undoing...
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4" />
                      Undo
                    </>
                  )}
                </button>
              )}
              {!actionResult && (
                <button
                  onClick={() => {
                    if (actionModal.action.isPortManagement) {
                      // For port management, determine the IP to pass based on selection
                      let ipToSend = null;
                      if (portActionType === 'localhost') {
                        ipToSend = 'localhost';
                      } else if (portActionType === 'ip') {
                        if (!allowedIP.trim()) {
                          alert('Please enter an IP address');
                          return;
                        }
                        ipToSend = allowedIP.trim();
                      }
                      // null means block
                      executeAction(actionModal.serverId, actionModal.action.id, ipToSend);
                    } else {
                      executeAction(actionModal.serverId, actionModal.action.id);
                    }
                  }}
                  disabled={actionRunning || (actionModal.action.isPortManagement && portActionType === 'ip' && !allowedIP.trim())}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Execute
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Security;
