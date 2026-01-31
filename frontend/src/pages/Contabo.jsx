import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, RefreshCw, Server, Play, Square, RotateCcw, Cpu, HardDrive, MemoryStick, Globe, DollarSign, Link2, ExternalLink } from 'lucide-react';
import * as api from '../services/api';

function Contabo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getContaboInstances();
      setData(result);
    } catch (err) {
      console.error('Failed to load Contabo data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(instanceId, action) {
    try {
      setActionLoading(`${instanceId}-${action}`);
      if (action === 'start') {
        await api.startContaboInstance(instanceId);
      } else if (action === 'stop') {
        await api.stopContaboInstance(instanceId);
      } else if (action === 'restart') {
        await api.restartContaboInstance(instanceId);
      }
      // Reload data after a short delay
      setTimeout(loadData, 2000);
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusColor(status) {
    switch (status) {
      case 'running': return 'text-green-400 bg-green-900/30';
      case 'stopped': return 'text-red-400 bg-red-900/30';
      case 'provisioning': return 'text-yellow-400 bg-yellow-900/30';
      default: return 'text-slate-400 bg-slate-900/30';
    }
  }

  function getRegionFlag(region) {
    if (region?.includes('EU')) return '🇪🇺';
    if (region?.includes('US')) return '🇺🇸';
    if (region?.includes('UK')) return '🇬🇧';
    if (region?.includes('SIN') || region?.includes('Asia')) return '🇸🇬';
    if (region?.includes('AUS')) return '🇦🇺';
    if (region?.includes('JPN')) return '🇯🇵';
    return '🌍';
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Cloud className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Contabo</h1>
            <p className="text-slate-400 text-sm">Cloud VPS & VDS Management</p>
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

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-xl p-4 mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          Loading Contabo instances...
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-sm mb-1">Total Instances</div>
              <div className="text-3xl font-bold text-blue-400">{data.summary.totalInstances}</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-sm mb-1">Running</div>
              <div className="text-2xl font-bold text-green-400">{data.summary.runningInstances}</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-sm mb-1">Stopped</div>
              <div className="text-2xl font-bold text-red-400">{data.summary.stoppedInstances}</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-sm mb-1">Monthly Cost</div>
              <div className="text-2xl font-bold text-yellow-400">
                ~{data.summary.totalMonthlyCost} {data.summary.currency}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-sm mb-1">Linked Servers</div>
              <div className="text-2xl font-bold text-purple-400">
                {data.summary.linkedInstances} / {data.summary.totalInstances}
              </div>
            </div>
          </div>

          {/* Instances List */}
          {data.instances.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No instances found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.instances.map(instance => (
                <div key={instance.id} className="bg-slate-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Server className="w-10 h-10 text-blue-400" />
                      <div>
                        <div className="font-bold text-lg flex items-center gap-2">
                          {instance.name}
                          {instance.linkedServer && (
                            <Link
                              to={`/servers`}
                              className="flex items-center gap-1 px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded text-xs hover:bg-purple-900/50"
                              title={`Linked to: ${instance.linkedServer.name}`}
                            >
                              <Link2 className="w-3 h-3" />
                              {instance.linkedServer.name}
                            </Link>
                          )}
                        </div>
                        <div className="text-sm text-slate-400">
                          {instance.productName} • ID: {instance.id}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(instance.status)}`}>
                        {instance.status}
                      </span>
                      {instance.monthlyPrice && (
                        <span className="px-3 py-1 bg-yellow-900/30 text-yellow-400 rounded-full text-sm font-medium">
                          ~{instance.monthlyPrice} EUR/mo
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <Cpu className="w-3 h-3" /> CPU
                      </div>
                      <div className="font-bold">{instance.cpuCores} Cores</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <MemoryStick className="w-3 h-3" /> RAM
                      </div>
                      <div className="font-bold">{instance.ramGb} GB</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <HardDrive className="w-3 h-3" /> Storage
                      </div>
                      <div className="font-bold">{instance.diskGb} GB</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <Globe className="w-3 h-3" /> Region
                      </div>
                      <div className="font-bold">{getRegionFlag(instance.region)} {instance.region}</div>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                        <Globe className="w-3 h-3" /> IPv4
                      </div>
                      <div className="font-bold font-mono text-sm">{instance.ipv4 || 'N/A'}</div>
                    </div>
                  </div>

                  {/* OS and Actions */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-400">
                      OS: <span className="text-slate-300">{instance.osType || 'Unknown'}</span>
                      {instance.createdAt && (
                        <span className="ml-4">Created: {new Date(instance.createdAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {instance.status === 'stopped' && (
                        <button
                          onClick={() => handleAction(instance.id, 'start')}
                          disabled={actionLoading === `${instance.id}-start`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm transition-colors disabled:opacity-50"
                        >
                          {actionLoading === `${instance.id}-start` ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Start
                        </button>
                      )}
                      {instance.status === 'running' && (
                        <>
                          <button
                            onClick={() => handleAction(instance.id, 'restart')}
                            disabled={actionLoading === `${instance.id}-restart`}
                            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm transition-colors disabled:opacity-50"
                          >
                            {actionLoading === `${instance.id}-restart` ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                            Restart
                          </button>
                          <button
                            onClick={() => handleAction(instance.id, 'stop')}
                            disabled={actionLoading === `${instance.id}-stop`}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm transition-colors disabled:opacity-50"
                          >
                            {actionLoading === `${instance.id}-stop` ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                            Stop
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default Contabo;
