import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Server, Cpu, HardDrive, MemoryStick, RefreshCw, AlertCircle, PieChart } from 'lucide-react';
import { getContaboInstances } from '../services/api';

function Costs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const result = await getContaboInstances();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Calculate cost breakdown by product
  function getCostBreakdown() {
    if (!data?.instances) return [];

    const breakdown = {};
    data.instances.forEach(instance => {
      const key = instance.productName || instance.productId || 'Unknown';
      if (!breakdown[key]) {
        breakdown[key] = { name: key, count: 0, cost: 0 };
      }
      breakdown[key].count++;
      breakdown[key].cost += instance.monthlyPrice || 0;
    });

    return Object.values(breakdown).sort((a, b) => b.cost - a.cost);
  }

  // Calculate resource totals
  function getResourceTotals() {
    if (!data?.instances) return { cpuCores: 0, ramGb: 0, diskGb: 0 };

    return data.instances.reduce((acc, i) => ({
      cpuCores: acc.cpuCores + (i.cpuCores || 0),
      ramGb: acc.ramGb + (i.ramGb || 0),
      diskGb: acc.diskGb + (i.diskGb || 0)
    }), { cpuCores: 0, ramGb: 0, diskGb: 0 });
  }

  // Get color for breakdown chart
  function getColor(index) {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
      'bg-pink-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-orange-500'
    ];
    return colors[index % colors.length];
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-red-400 mb-2">Failed to load cost data</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalMonthly = parseFloat(data?.summary?.totalMonthlyCost || 0);
  const totalAnnual = totalMonthly * 12;
  const breakdown = getCostBreakdown();
  const resources = getResourceTotals();
  const costPerCore = resources.cpuCores > 0 ? (totalMonthly / resources.cpuCores).toFixed(2) : 0;
  const costPerGbRam = resources.ramGb > 0 ? (totalMonthly / resources.ramGb).toFixed(2) : 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Cost Dashboard</h1>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Cost Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6">
          <div className="text-green-200 text-sm mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Monthly Cost
          </div>
          <div className="text-4xl font-bold text-white">
            {totalMonthly.toFixed(2)}
          </div>
          <div className="text-green-200 text-sm mt-1">EUR / month</div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6">
          <div className="text-blue-200 text-sm mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Annual Estimate
          </div>
          <div className="text-4xl font-bold text-white">
            {totalAnnual.toFixed(2)}
          </div>
          <div className="text-blue-200 text-sm mt-1">EUR / year</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6">
          <div className="text-purple-200 text-sm mb-2 flex items-center gap-2">
            <Server className="w-4 h-4" />
            Servers
          </div>
          <div className="text-4xl font-bold text-white">
            {data?.summary?.totalInstances || 0}
          </div>
          <div className="text-purple-200 text-sm mt-1">
            {data?.summary?.runningInstances || 0} running
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl p-6">
          <div className="text-orange-200 text-sm mb-2 flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Avg per Server
          </div>
          <div className="text-4xl font-bold text-white">
            {(totalMonthly / (data?.summary?.totalInstances || 1)).toFixed(2)}
          </div>
          <div className="text-orange-200 text-sm mt-1">EUR / month</div>
        </div>
      </div>

      {/* Resources Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Total vCPU Cores
              </div>
              <div className="text-3xl font-bold text-cyan-400">{resources.cpuCores}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Cost per Core</div>
              <div className="text-lg font-semibold text-slate-300">{costPerCore} EUR</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                <MemoryStick className="w-4 h-4" /> Total RAM
              </div>
              <div className="text-3xl font-bold text-pink-400">{resources.ramGb} GB</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Cost per GB</div>
              <div className="text-lg font-semibold text-slate-300">{costPerGbRam} EUR</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                <HardDrive className="w-4 h-4" /> Total Storage
              </div>
              <div className="text-3xl font-bold text-amber-400">{resources.diskGb} GB</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">
                {(resources.diskGb / 1024).toFixed(1)} TB
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown by Product */}
        <div className="bg-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-orange-500" />
            Cost Breakdown by Product
          </h2>

          {breakdown.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No cost data available
            </div>
          ) : (
            <>
              {/* Simple bar chart */}
              <div className="space-y-3 mb-4">
                {breakdown.map((item, index) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-300">{item.name}</span>
                      <span className="text-slate-400">{item.cost.toFixed(2)} EUR ({item.count}x)</span>
                    </div>
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getColor(index)} transition-all duration-500`}
                        style={{ width: `${(item.cost / totalMonthly) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-700">
                {breakdown.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <div className={`w-3 h-3 rounded ${getColor(index)}`} />
                    <span className="text-slate-400">
                      {item.name} ({((item.cost / totalMonthly) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Per-Server Costs */}
        <div className="bg-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-orange-500" />
            Cost per Server
          </h2>

          {!data?.instances || data.instances.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No servers found
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.instances
                .sort((a, b) => (b.monthlyPrice || 0) - (a.monthlyPrice || 0))
                .map(instance => (
                  <div
                    key={instance.id}
                    className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        instance.status === 'running' ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <div>
                        <div className="font-medium text-sm">{instance.name}</div>
                        <div className="text-xs text-slate-500">
                          {instance.cpuCores} vCPU • {instance.ramGb} GB RAM • {instance.region}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-400">
                        {instance.monthlyPrice?.toFixed(2) || '?'} EUR
                      </div>
                      <div className="text-xs text-slate-500">/ month</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Cost Optimization Tips */}
      <div className="mt-6 bg-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Cost Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="text-slate-400 text-sm mb-2">Most Expensive</div>
            <div className="font-semibold">
              {data?.instances?.[0]?.name || 'N/A'}
            </div>
            <div className="text-sm text-green-400">
              {data?.instances?.sort((a, b) => (b.monthlyPrice || 0) - (a.monthlyPrice || 0))[0]?.monthlyPrice?.toFixed(2) || 0} EUR/mo
            </div>
          </div>

          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="text-slate-400 text-sm mb-2">Stopped Servers</div>
            <div className="font-semibold">
              {data?.summary?.stoppedInstances || 0} servers
            </div>
            <div className="text-sm text-yellow-400">
              Still incurring costs
            </div>
          </div>

          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="text-slate-400 text-sm mb-2">Resource Utilization</div>
            <div className="font-semibold">
              {resources.cpuCores} cores, {resources.ramGb} GB RAM
            </div>
            <div className="text-sm text-slate-400">
              across {data?.summary?.totalInstances || 0} servers
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Costs;
