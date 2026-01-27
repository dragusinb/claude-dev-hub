import { useState, useEffect } from 'react';
import { Clock, Server, RefreshCw, ChevronDown, ChevronUp, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as api from '../services/api';

function Uptime() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedServer, setExpandedServer] = useState(null);
  const [serverDetails, setServerDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    try {
      setLoading(true);
      const data = await api.getUptimeSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load uptime summary:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadServerDetails(serverId) {
    try {
      setDetailsLoading(true);
      const data = await api.getServerUptime(serverId, 24);
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

  function getStatusColor(status) {
    switch (status) {
      case 'up': return 'bg-green-500';
      case 'down': return 'bg-red-500';
      case 'partial': return 'bg-yellow-500';
      default: return 'bg-slate-500';
    }
  }

  function getUptimeColor(percent) {
    if (percent === null) return 'text-slate-400';
    if (percent >= 99) return 'text-green-400';
    if (percent >= 95) return 'text-yellow-400';
    return 'text-red-400';
  }

  // Calculate overall stats
  const totalServers = summary.length;
  const onlineServers = summary.filter(s => s.currentStatus === 'up').length;
  const avgUptime = summary.length > 0
    ? Math.round(summary.filter(s => s.uptime24h !== null).reduce((sum, s) => sum + (s.uptime24h || 0), 0) / summary.filter(s => s.uptime24h !== null).length * 10) / 10
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Uptime Monitor</h1>
            <p className="text-slate-400 text-sm">Track server availability and response times</p>
          </div>
        </div>
        <button
          onClick={loadSummary}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Online Servers</div>
          <div className="text-2xl font-bold text-green-400">{onlineServers}/{totalServers}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Avg Uptime (24h)</div>
          <div className={`text-2xl font-bold ${getUptimeColor(avgUptime)}`}>
            {avgUptime > 0 ? `${avgUptime}%` : 'N/A'}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Monitoring</div>
          <div className="text-2xl font-bold text-blue-400">Every 5 min</div>
        </div>
      </div>

      {/* Server List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading uptime data...</div>
      ) : summary.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No servers configured</p>
          <p className="text-sm mt-2">Add servers in the Servers section to start monitoring uptime</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.map(server => (
            <div key={server.id} className="bg-slate-800 rounded-xl overflow-hidden">
              {/* Server Row */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                onClick={() => toggleExpand(server.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(server.currentStatus)}`} />
                  <div>
                    <div className="font-medium">{server.name}</div>
                    <div className="text-sm text-slate-400">{server.host}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getUptimeColor(server.uptime24h)}`}>
                      {server.uptime24h !== null ? `${server.uptime24h}%` : 'N/A'}
                    </div>
                    <div className="text-xs text-slate-400">24h uptime</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-medium">
                      {server.avgResponse24h !== null ? `${server.avgResponse24h}ms` : '-'}
                    </div>
                    <div className="text-xs text-slate-400">avg response</div>
                  </div>
                  {expandedServer === server.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedServer === server.id && (
                <div className="border-t border-slate-700 p-4">
                  {detailsLoading ? (
                    <div className="text-center py-8 text-slate-400">Loading details...</div>
                  ) : serverDetails ? (
                    <div className="space-y-4">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-900 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Total Checks</div>
                          <div className="text-xl font-bold">{serverDetails.stats.totalChecks}</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Successful</div>
                          <div className="text-xl font-bold text-green-400">{serverDetails.stats.upChecks}</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Failed</div>
                          <div className="text-xl font-bold text-red-400">{serverDetails.stats.downChecks}</div>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Avg Response</div>
                          <div className="text-xl font-bold">
                            {serverDetails.stats.avgResponseTime ? `${serverDetails.stats.avgResponseTime}ms` : '-'}
                          </div>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div>
                        <div className="text-sm text-slate-400 mb-2">24h Timeline</div>
                        <div className="flex gap-0.5">
                          {serverDetails.timeline.map((hour, idx) => (
                            <div
                              key={idx}
                              className={`flex-1 h-8 rounded-sm ${getStatusColor(hour.status)} opacity-80 hover:opacity-100 transition-opacity`}
                              title={`${new Date(hour.hour).toLocaleTimeString()}: ${hour.status} (${hour.upCount}/${hour.totalCount})`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                          <span>24h ago</span>
                          <span>Now</span>
                        </div>
                      </div>

                      {/* Recent Events */}
                      <div>
                        <div className="text-sm text-slate-400 mb-2">Recent Events</div>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {serverDetails.recentEvents.slice(0, 10).map((event, idx) => (
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
                              {event.error_message && (
                                <span className="text-red-400 text-xs truncate max-w-xs">{event.error_message}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">No data available</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Uptime;
