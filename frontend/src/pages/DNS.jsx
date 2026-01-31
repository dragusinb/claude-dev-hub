import { useState, useEffect } from 'react';
import { Globe, Search, Plus, Trash2, RefreshCw, AlertCircle, X, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { getDnsDomains, addDnsDomain, deleteDnsDomain, getDnsDomainRecords, dnsLookup, dnsPropagation } from '../services/api';

function DNS() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [domainRecords, setDomainRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Quick lookup state
  const [lookupDomain, setLookupDomain] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Propagation check state
  const [propagationResult, setPropagationResult] = useState(null);
  const [checkingPropagation, setCheckingPropagation] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await getDnsDomains();
      setDomains(data.domains || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(domain) {
    if (!confirm(`Remove ${domain.domain} from your watchlist?`)) return;

    try {
      await deleteDnsDomain(domain.id);
      loadDomains();
      if (selectedDomain?.id === domain.id) {
        setSelectedDomain(null);
        setDomainRecords(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectDomain(domain) {
    setSelectedDomain(domain);
    setLoadingRecords(true);
    try {
      const data = await getDnsDomainRecords(domain.id);
      setDomainRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRecords(false);
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

    if (typeof value === 'object') {
      return <pre className="font-mono text-sm whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
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
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Domain
        </button>
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

      {/* Quick Lookup */}
      <div className="bg-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-orange-500" />
          Quick DNS Lookup
        </h2>

        <form onSubmit={handleQuickLookup} className="flex gap-3 mb-4">
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

        {/* Lookup Results */}
        {lookupResult && (
          <div className="bg-slate-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Records for {lookupResult.domain}</h3>
              <span className="text-xs text-slate-500">{lookupResult.timestamp}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(lookupResult.records).map(([type, value]) => (
                <div key={type} className="bg-slate-800 rounded-lg p-3">
                  <div className="text-sm text-slate-400 mb-2 font-semibold">{type} Records</div>
                  {renderRecordValue(type, value)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Propagation Results */}
        {propagationResult && (
          <div className="bg-slate-900 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                DNS Propagation for {propagationResult.domain}
                {propagationResult.propagated ? (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" /> Propagated
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-yellow-400 text-sm">
                    <AlertCircle className="w-4 h-4" /> In Progress
                  </span>
                )}
              </h3>
              <span className="text-sm text-slate-400">
                {propagationResult.successCount}/{propagationResult.totalServers} servers
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {propagationResult.results.map((result, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg ${result.records ? 'bg-green-500/10' : 'bg-red-500/10'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {result.records ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-medium text-sm">{result.server}</span>
                  </div>
                  <div className="text-xs text-slate-500">{result.ip}</div>
                  {result.records && (
                    <div className="text-xs font-mono text-slate-300 mt-1">
                      {Array.isArray(result.records) ? result.records.join(', ') : result.records}
                    </div>
                  )}
                  {result.error && (
                    <div className="text-xs text-red-400 mt-1">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Managed Domains */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Domain List */}
        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4">Watched Domains</h2>

          {loading ? (
            <div className="text-center py-8 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No domains added yet</p>
              <p className="text-sm mt-1">Add domains to monitor their DNS</p>
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map(domain => (
                <div
                  key={domain.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedDomain?.id === domain.id
                      ? 'bg-orange-500/20 border border-orange-500/30'
                      : 'bg-slate-700/50 hover:bg-slate-700'
                  }`}
                  onClick={() => handleSelectDomain(domain)}
                >
                  <div>
                    <div className="font-medium">{domain.domain}</div>
                    {domain.notes && (
                      <div className="text-xs text-slate-500">{domain.notes}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(domain); }}
                    className="p-1 text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Domain Records */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4">DNS Records</h2>

          {!selectedDomain ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a domain to view its DNS records</p>
            </div>
          ) : loadingRecords ? (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
              Loading records...
            </div>
          ) : domainRecords ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xl font-bold">{domainRecords.domain}</span>
                  <a
                    href={`https://${domainRecords.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <button
                  onClick={() => handleSelectDomain(selectedDomain)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(domainRecords.records).map(([type, value]) => (
                  <div key={type} className="bg-slate-900 rounded-lg p-4">
                    <div className="text-sm text-slate-400 mb-2 font-semibold flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">{type}</span>
                      Records
                    </div>
                    {renderRecordValue(type, value)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Add Domain Modal */}
      {showAddModal && (
        <AddDomainModal
          onClose={() => setShowAddModal(false)}
          onSave={() => { setShowAddModal(false); loadDomains(); }}
        />
      )}
    </div>
  );
}

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
          <h2 className="text-lg font-semibold">Add Domain</h2>
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
            <label className="block text-sm text-slate-400 mb-1">Domain *</label>
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
              placeholder="Production website, API server, etc."
            />
          </div>

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
              {saving ? 'Adding...' : 'Add Domain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DNS;
