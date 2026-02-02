import { useState, useEffect } from 'react';
import { Globe, Search, Plus, Trash2, RefreshCw, AlertCircle, X, CheckCircle, XCircle, ExternalLink, Cloud, Edit, Shield } from 'lucide-react';
import {
  getDnsDomains, addDnsDomain, deleteDnsDomain, getDnsDomainRecords,
  dnsLookup, dnsPropagation,
  getCloudflareStatus, getCloudflareZones, getCloudflareRecords,
  createCloudflareRecord, updateCloudflareRecord, deleteCloudflareRecord
} from '../services/api';

function DNS() {
  const [activeTab, setActiveTab] = useState('cloudflare');
  const [error, setError] = useState(null);

  // Cloudflare state
  const [cfConnected, setCfConnected] = useState(false);
  const [cfLoading, setCfLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneRecords, setZoneRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // Lookup state
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [propagationResult, setPropagationResult] = useState(null);
  const [checkingPropagation, setCheckingPropagation] = useState(false);

  // Watched domains state
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [showAddDomain, setShowAddDomain] = useState(false);

  useEffect(() => {
    checkCloudflare();
    loadDomains();
  }, []);

  async function checkCloudflare() {
    setCfLoading(true);
    setError(null);
    try {
      console.log('[DNS] Checking Cloudflare status...');
      const status = await getCloudflareStatus();
      console.log('[DNS] Cloudflare status response:', status);
      setCfConnected(status.connected);
      if (status.connected) {
        loadZones();
      } else if (status.error) {
        setError(`Cloudflare: ${status.error}`);
      }
    } catch (err) {
      console.error('[DNS] Cloudflare check error:', err);
      setCfConnected(false);
      setError(`Failed to check Cloudflare: ${err.message}`);
    } finally {
      setCfLoading(false);
    }
  }

  async function loadZones() {
    try {
      const data = await getCloudflareZones();
      setZones(data.zones || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadZoneRecords(zone) {
    setSelectedZone(zone);
    setLoadingRecords(true);
    try {
      const data = await getCloudflareRecords(zone.id);
      setZoneRecords(data.records || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRecords(false);
    }
  }

  async function handleDeleteRecord(record) {
    if (!confirm(`Delete ${record.type} record for ${record.name}?`)) return;

    try {
      await deleteCloudflareRecord(selectedZone.id, record.id);
      loadZoneRecords(selectedZone);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDomains() {
    setDomainsLoading(true);
    try {
      const data = await getDnsDomains();
      setDomains(data.domains || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setDomainsLoading(false);
    }
  }

  async function handleQuickLookup(e) {
    e.preventDefault();
    if (!lookupDomain.trim()) return;

    setLookingUp(true);
    setLookupResult(null);
    setPropagationResult(null);
    try {
      const data = await dnsLookup(lookupDomain);
      setLookupResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLookingUp(false);
    }
  }

  async function handleCheckPropagation() {
    if (!lookupDomain.trim()) return;

    setCheckingPropagation(true);
    try {
      const data = await dnsPropagation(lookupDomain, 'A');
      setPropagationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingPropagation(false);
    }
  }

  function renderRecordValue(type, value) {
    if (!value) return <span className="text-slate-500">-</span>;

    if (type === 'MX') {
      return (
        <div className="space-y-1">
          {value.map((mx, i) => (
            <div key={i} className="font-mono text-sm">
              <span className="text-orange-400">{mx.priority}</span>
              <span className="text-slate-400 mx-2">|</span>
              <span>{mx.exchange}</span>
            </div>
          ))}
        </div>
      );
    }

    if (Array.isArray(value)) {
      return (
        <div className="space-y-1">
          {value.map((v, i) => (
            <div key={i} className="font-mono text-sm break-all">{typeof v === 'object' ? JSON.stringify(v) : v}</div>
          ))}
        </div>
      );
    }

    return <span className="font-mono text-sm">{value}</span>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Globe className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">DNS Manager</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('cloudflare')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'cloudflare'
              ? 'text-orange-400 border-b-2 border-orange-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cloud className="w-4 h-4 inline mr-2" />
          Cloudflare
        </button>
        <button
          onClick={() => setActiveTab('lookup')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'lookup'
              ? 'text-orange-400 border-b-2 border-orange-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4 inline mr-2" />
          Quick Lookup
        </button>
        <button
          onClick={() => setActiveTab('watched')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'watched'
              ? 'text-orange-400 border-b-2 border-orange-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-4 h-4 inline mr-2" />
          Watched Domains
        </button>
      </div>

      {/* Cloudflare Tab */}
      {activeTab === 'cloudflare' && (
        <div>
          {cfLoading ? (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
              Connecting to Cloudflare...
            </div>
          ) : !cfConnected ? (
            <div className="text-center py-12">
              <Cloud className="w-16 h-16 mx-auto mb-4 text-slate-500 opacity-50" />
              <h2 className="text-xl font-bold mb-2">Cloudflare Not Connected</h2>
              <p className="text-slate-400 mb-4">Add your Cloudflare API token to the Vault to manage DNS.</p>
              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 mb-4 max-w-md mx-auto">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <button
                onClick={checkCloudflare}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Zones List */}
              <div className="bg-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-orange-500" />
                    Your Domains
                  </h2>
                  <button onClick={loadZones} className="p-1 text-slate-400 hover:text-white">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {zones.map(zone => (
                    <button
                      key={zone.id}
                      onClick={() => loadZoneRecords(zone)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedZone?.id === zone.id
                          ? 'bg-orange-500/20 border border-orange-500/30'
                          : 'bg-slate-700/50 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{zone.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          zone.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {zone.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{zone.plan}</div>
                    </button>
                  ))}

                  {zones.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      No domains found
                    </div>
                  )}
                </div>
              </div>

              {/* Records */}
              <div className="lg:col-span-2 bg-slate-800 rounded-xl p-4">
                {!selectedZone ? (
                  <div className="text-center py-12 text-slate-500">
                    <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a domain to view DNS records</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-semibold">{selectedZone.name}</h2>
                        <p className="text-sm text-slate-400">{zoneRecords.length} records</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowAddRecord(true)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          Add Record
                        </button>
                        <button
                          onClick={() => loadZoneRecords(selectedZone)}
                          className="p-1.5 text-slate-400 hover:text-white"
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingRecords ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {loadingRecords ? (
                      <div className="text-center py-8 text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {zoneRecords.map(record => (
                          <div key={record.id} className="bg-slate-900 rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono">
                                    {record.type}
                                  </span>
                                  <span className="font-medium text-sm truncate">{record.name}</span>
                                  {record.proxied && (
                                    <Shield className="w-4 h-4 text-orange-400" title="Proxied through Cloudflare" />
                                  )}
                                </div>
                                <div className="font-mono text-sm text-slate-300 break-all">
                                  {record.priority !== undefined && (
                                    <span className="text-orange-400 mr-2">{record.priority}</span>
                                  )}
                                  {record.content}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                  TTL: {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  onClick={() => setEditingRecord(record)}
                                  className="p-1 text-slate-400 hover:text-white"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(record)}
                                  className="p-1 text-slate-400 hover:text-red-400"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Lookup Tab */}
      {activeTab === 'lookup' && (
        <div className="bg-slate-800 rounded-xl p-6">
          <form onSubmit={handleQuickLookup} className="flex gap-3 mb-6">
            <input
              type="text"
              value={lookupDomain}
              onChange={(e) => setLookupDomain(e.target.value)}
              placeholder="Enter domain (e.g., example.com)"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2"
            />
            <button
              type="submit"
              disabled={lookingUp}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {lookingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Lookup
            </button>
            <button
              type="button"
              onClick={handleCheckPropagation}
              disabled={checkingPropagation || !lookupDomain}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {checkingPropagation ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Check Propagation
            </button>
          </form>

          {lookupResult && (
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-4">Records for {lookupResult.domain}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(lookupResult.records).map(([type, value]) => (
                  <div key={type} className="bg-slate-800 rounded-lg p-3">
                    <div className="text-sm text-slate-400 mb-2 font-semibold">{type}</div>
                    {renderRecordValue(type, value)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {propagationResult && (
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  Propagation: {propagationResult.domain}
                  {propagationResult.propagated ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" /> Complete
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-400 text-sm">
                      <AlertCircle className="w-4 h-4" /> In Progress
                    </span>
                  )}
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {propagationResult.results.map((result, i) => (
                  <div key={i} className={`p-3 rounded-lg ${result.records ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {result.records ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <span className="font-medium text-sm">{result.server}</span>
                    </div>
                    {result.records && (
                      <div className="text-xs font-mono text-slate-300">{result.records.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Watched Domains Tab */}
      {activeTab === 'watched' && (
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Watched Domains</h2>
            <button
              onClick={() => setShowAddDomain(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Domain
            </button>
          </div>

          {domainsLoading ? (
            <div className="text-center py-8 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No watched domains</p>
              <p className="text-sm mt-1">Add domains to monitor their DNS records</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {domains.map(domain => (
                <WatchedDomainCard
                  key={domain.id}
                  domain={domain}
                  onDelete={() => {
                    deleteDnsDomain(domain.id).then(loadDomains);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Record Modal */}
      {showAddRecord && selectedZone && (
        <RecordModal
          zoneId={selectedZone.id}
          zoneName={selectedZone.name}
          onClose={() => setShowAddRecord(false)}
          onSave={() => { setShowAddRecord(false); loadZoneRecords(selectedZone); }}
        />
      )}

      {/* Edit Record Modal */}
      {editingRecord && selectedZone && (
        <RecordModal
          zoneId={selectedZone.id}
          zoneName={selectedZone.name}
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={() => { setEditingRecord(null); loadZoneRecords(selectedZone); }}
        />
      )}

      {/* Add Domain Modal */}
      {showAddDomain && (
        <AddDomainModal
          onClose={() => setShowAddDomain(false)}
          onSave={() => { setShowAddDomain(false); loadDomains(); }}
        />
      )}
    </div>
  );
}

// Watched Domain Card with Issue Detection
function WatchedDomainCard({ domain, onDelete }) {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await getDnsDomainRecords(domain.id);
      setRecords(data.records);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, [domain.id]);

  // Detect issues
  function getIssues() {
    if (!records) return [];
    const issues = [];

    // No A record
    if (!records.A || records.A.length === 0) {
      issues.push({ type: 'error', message: 'No A record - domain may not resolve' });
    }

    // Private IP in A record
    if (records.A) {
      const privateIPs = records.A.filter(ip =>
        ip.startsWith('10.') || ip.startsWith('192.168.') ||
        ip.startsWith('172.16.') || ip.startsWith('127.')
      );
      if (privateIPs.length > 0) {
        issues.push({ type: 'warning', message: 'Private IP detected in A record' });
      }
    }

    // No MX record (might need email)
    if (!records.MX || records.MX.length === 0) {
      issues.push({ type: 'info', message: 'No MX record - email may not work' });
    }

    // Check for email security records in TXT
    if (records.TXT) {
      const txtJoined = records.TXT.join(' ').toLowerCase();
      if (!txtJoined.includes('v=spf1')) {
        issues.push({ type: 'warning', message: 'No SPF record - email may be marked as spam' });
      }
    } else {
      issues.push({ type: 'warning', message: 'No TXT records - missing SPF/DKIM' });
    }

    return issues;
  }

  const issues = records ? getIssues() : [];
  const hasErrors = issues.some(i => i.type === 'error');
  const hasWarnings = issues.some(i => i.type === 'warning');

  return (
    <div className={`bg-slate-900 rounded-lg p-4 border-l-4 ${
      hasErrors ? 'border-red-500' : hasWarnings ? 'border-yellow-500' : 'border-green-500'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="font-medium">{domain.domain}</div>
          {issues.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              hasErrors ? 'bg-red-500/20 text-red-400' :
              hasWarnings ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {issues.length} issue{issues.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4 text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
        </div>
      ) : records ? (
        <>
          <div className="space-y-2 text-sm">
            {records.A && (
              <div><span className="text-slate-500">A:</span> <span className="font-mono">{records.A.join(', ')}</span></div>
            )}
            {records.NS && (
              <div><span className="text-slate-500">NS:</span> <span className="font-mono text-xs">{records.NS.slice(0, 2).join(', ')}</span></div>
            )}
            {records.MX && records.MX.length > 0 && (
              <div><span className="text-slate-500">MX:</span> <span className="font-mono text-xs">{records.MX[0].exchange || records.MX[0]}</span></div>
            )}
          </div>
          {issues.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
              {issues.map((issue, i) => (
                <div key={i} className={`text-xs flex items-center gap-1 ${
                  issue.type === 'error' ? 'text-red-400' :
                  issue.type === 'warning' ? 'text-yellow-400' :
                  'text-blue-400'
                }`}>
                  <AlertCircle className="w-3 h-3" />
                  {issue.message}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-slate-500 text-sm">No records</div>
      )}
    </div>
  );
}

// Record Modal (Add/Edit)
function RecordModal({ zoneId, zoneName, record, onClose, onSave }) {
  const [form, setForm] = useState({
    type: record?.type || 'A',
    name: record?.name || '',
    content: record?.content || '',
    ttl: record?.ttl || 1,
    proxied: record?.proxied || false,
    priority: record?.priority || 10
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (record) {
        await updateCloudflareRecord(zoneId, record.id, form);
      } else {
        await createCloudflareRecord(zoneId, form);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const showProxied = ['A', 'AAAA', 'CNAME'].includes(form.type);
  const showPriority = form.type === 'MX';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{record ? 'Edit Record' : 'Add Record'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              disabled={!!record}
            >
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="MX">MX</option>
              <option value="TXT">TXT</option>
              <option value="NS">NS</option>
              <option value="SRV">SRV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                placeholder="@ or subdomain"
              />
              <span className="text-slate-500">.{zoneName}</span>
            </div>
          </div>

          {showPriority && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Content</label>
            <input
              type="text"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              placeholder={form.type === 'A' ? 'IP address' : 'Value'}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">TTL</label>
            <select
              value={form.ttl}
              onChange={(e) => setForm({ ...form, ttl: parseInt(e.target.value) })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
            >
              <option value={1}>Auto</option>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={86400}>1 day</option>
            </select>
          </div>

          {showProxied && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.proxied}
                onChange={(e) => setForm({ ...form, proxied: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-300">Proxy through Cloudflare (orange cloud)</span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : (record ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Domain Modal
function AddDomainModal({ onClose, onSave }) {
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!domain.trim()) {
      setError('Domain is required');
      return;
    }

    setSaving(true);
    try {
      await addDnsDomain(domain, notes);
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Domain to Watch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              placeholder="example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
              placeholder="Description"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Domain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DNS;
