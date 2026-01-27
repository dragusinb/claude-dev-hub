import { useState, useEffect } from 'react';
import { Lock, Plus, RefreshCw, Trash2, Edit, AlertTriangle, CheckCircle, XCircle, Search, Server } from 'lucide-react';
import * as api from '../services/api';

function SSLMonitor() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCert, setEditingCert] = useState(null);
  const [checking, setChecking] = useState(null);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResults, setDiscoverResults] = useState(null);
  const [addingDomain, setAddingDomain] = useState(null);
  const [addedDomains, setAddedDomains] = useState(new Set());

  const [formData, setFormData] = useState({
    domain: '',
    port: 443,
    alertDays: 30,
    enabled: true
  });

  useEffect(() => {
    loadCertificates();
  }, []);

  async function loadCertificates() {
    try {
      setLoading(true);
      const data = await api.getSSLCertificates();
      setCertificates(data);
    } catch (err) {
      console.error('Failed to load certificates:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingCert) {
        await api.updateSSLCertificate(editingCert.id, formData);
      } else {
        await api.createSSLCertificate(formData);
      }
      setShowModal(false);
      setEditingCert(null);
      resetForm();
      loadCertificates();
    } catch (err) {
      alert('Failed to save certificate: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this certificate?')) return;
    try {
      await api.deleteSSLCertificate(id);
      loadCertificates();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  async function handleCheck(id) {
    try {
      setChecking(id);
      await api.checkSSLCertificate(id);
      loadCertificates();
    } catch (err) {
      alert('Check failed: ' + err.message);
    } finally {
      setChecking(null);
    }
  }

  function openEdit(cert) {
    setEditingCert(cert);
    setFormData({
      domain: cert.domain,
      port: cert.port,
      alertDays: cert.alert_days,
      enabled: cert.enabled
    });
    setShowModal(true);
  }

  function resetForm() {
    setFormData({ domain: '', port: 443, alertDays: 30, enabled: true });
  }

  function getStatusColor(days) {
    if (days === null || days === undefined) return 'border-slate-600';
    if (days <= 7) return 'border-red-500';
    if (days <= 30) return 'border-yellow-500';
    return 'border-green-500';
  }

  function getStatusBadge(cert) {
    if (cert.last_error) {
      return (
        <span className="flex items-center gap-1 text-red-400">
          <XCircle className="w-4 h-4" /> Error
        </span>
      );
    }
    if (cert.days_until_expiry === null) {
      return <span className="text-slate-400">Not checked</span>;
    }
    if (cert.days_until_expiry <= 7) {
      return (
        <span className="flex items-center gap-1 text-red-400">
          <AlertTriangle className="w-4 h-4" /> Critical
        </span>
      );
    }
    if (cert.days_until_expiry <= 30) {
      return (
        <span className="flex items-center gap-1 text-yellow-400">
          <AlertTriangle className="w-4 h-4" /> Warning
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-green-400">
        <CheckCircle className="w-4 h-4" /> Valid
      </span>
    );
  }

  async function handleDiscover() {
    try {
      setDiscovering(true);
      setShowDiscoverModal(true);
      setAddedDomains(new Set());  // Reset added state
      const results = await api.discoverSSLDomains();
      setDiscoverResults(results);
    } catch (err) {
      alert('Failed to discover domains: ' + err.message);
      setShowDiscoverModal(false);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleAddDiscovered(domain) {
    try {
      setAddingDomain(domain);
      await api.createSSLCertificate({ domain, port: 443, alertDays: 30, enabled: true });
      // Mark as added (show success state)
      setAddedDomains(prev => new Set([...prev, domain]));
      loadCertificates();
    } catch (err) {
      alert('Failed to add domain: ' + err.message);
    } finally {
      setAddingDomain(null);
    }
  }

  async function handleAddAllDiscovered() {
    if (!discoverResults?.suggestions?.length) return;
    const domainsToAdd = discoverResults.suggestions.filter(s => !addedDomains.has(s.domain));
    if (domainsToAdd.length === 0) return;

    setAddingDomain('__all__');
    const newlyAdded = new Set(addedDomains);

    for (const suggestion of domainsToAdd) {
      try {
        await api.createSSLCertificate({ domain: suggestion.domain, port: 443, alertDays: 30, enabled: true });
        newlyAdded.add(suggestion.domain);
      } catch (err) {
        console.error(`Failed to add ${suggestion.domain}:`, err.message);
      }
    }

    setAddedDomains(newlyAdded);
    loadCertificates();
    setAddingDomain(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Lock className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">SSL Monitor</h1>
            <p className="text-slate-400 text-sm">Track SSL certificate expiration dates</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCertificates}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <Search className={`w-4 h-4 ${discovering ? 'animate-pulse' : ''}`} />
            Discover
          </button>
          <button
            onClick={() => { resetForm(); setEditingCert(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Domain
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Total</div>
          <div className="text-2xl font-bold">{certificates.length}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Valid</div>
          <div className="text-2xl font-bold text-green-400">
            {certificates.filter(c => c.days_until_expiry > 30).length}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Expiring Soon</div>
          <div className="text-2xl font-bold text-yellow-400">
            {certificates.filter(c => c.days_until_expiry > 7 && c.days_until_expiry <= 30).length}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="text-slate-400 text-sm mb-1">Critical</div>
          <div className="text-2xl font-bold text-red-400">
            {certificates.filter(c => c.days_until_expiry !== null && c.days_until_expiry <= 7).length}
          </div>
        </div>
      </div>

      {/* Certificates Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading certificates...</div>
      ) : certificates.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No SSL certificates configured</p>
          <p className="text-sm mt-2">Click "Add Domain" to start monitoring</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map(cert => (
            <div
              key={cert.id}
              className={`bg-slate-800 rounded-xl p-4 border-l-4 ${getStatusColor(cert.days_until_expiry)}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-lg">{cert.domain}</h3>
                  <div className="text-sm text-slate-400">Port {cert.port}</div>
                </div>
                {getStatusBadge(cert)}
              </div>

              {cert.days_until_expiry !== null && (
                <div className="mb-3">
                  <div className="text-3xl font-bold">
                    {cert.days_until_expiry}
                    <span className="text-lg text-slate-400 ml-2">days</span>
                  </div>
                  <div className="text-sm text-slate-400">until expiry</div>
                </div>
              )}

              {cert.valid_to && (
                <div className="text-sm text-slate-400 mb-3">
                  Expires: {new Date(cert.valid_to).toLocaleDateString()}
                </div>
              )}

              {cert.issuer && (
                <div className="text-xs text-slate-500 mb-3 truncate" title={cert.issuer}>
                  Issuer: {cert.issuer.split(',')[0]}
                </div>
              )}

              {cert.last_error && (
                <div className="text-sm text-red-400 mb-3 truncate" title={cert.last_error}>
                  Error: {cert.last_error}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-slate-700">
                <button
                  onClick={() => handleCheck(cert.id)}
                  disabled={checking === cert.id}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${checking === cert.id ? 'animate-spin' : ''}`} />
                  Check
                </button>
                <button
                  onClick={() => openEdit(cert)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                >
                  <Edit className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(cert.id)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-red-600 rounded text-sm transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingCert ? 'Edit Certificate' : 'Add SSL Certificate'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Domain</label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={e => setFormData({ ...formData, domain: e.target.value })}
                  placeholder="example.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) || 443 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Alert Days Before Expiry</label>
                <input
                  type="number"
                  value={formData.alertDays}
                  onChange={e => setFormData({ ...formData, alertDays: parseInt(e.target.value) || 30 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="enabled" className="text-sm text-slate-400">Enable monitoring</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors"
                >
                  {editingCert ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discover Modal */}
      {showDiscoverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Discover Domains</h2>
              <button
                onClick={() => setShowDiscoverModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {discovering ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 mx-auto mb-4 animate-pulse text-orange-500" />
                <p className="text-slate-400">Scanning servers for domains...</p>
                <p className="text-sm text-slate-500 mt-2">Checking nginx, apache, and Let's Encrypt configs</p>
              </div>
            ) : discoverResults ? (
              <div className="overflow-y-auto flex-1">
                {/* Server scan results */}
                <div className="mb-4 p-3 bg-slate-900 rounded-lg">
                  <div className="text-sm text-slate-400 mb-2">Scanned Servers:</div>
                  <div className="flex flex-wrap gap-2">
                    {discoverResults.serverResults.map(s => (
                      <span
                        key={s.serverId}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          s.error ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'
                        }`}
                        title={s.error || `Found ${s.domainsFound} domains`}
                      >
                        <Server className="w-3 h-3" />
                        {s.serverName}
                        {!s.error && <span className="opacity-75">({s.domainsFound})</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Suggestions */}
                {discoverResults.suggestions.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p>All discovered domains are already being monitored!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const remaining = discoverResults.suggestions.filter(s => !addedDomains.has(s.domain));
                      const allAdded = remaining.length === 0;

                      return (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm text-slate-400">
                              {allAdded ? (
                                <span className="text-green-400">All {discoverResults.suggestions.length} domains added!</span>
                              ) : (
                                <>Found {discoverResults.suggestions.length} domains ({addedDomains.size} added):</>
                              )}
                            </div>
                            {!allAdded && (
                              <button
                                onClick={handleAddAllDiscovered}
                                disabled={!!addingDomain}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm transition-colors disabled:opacity-50"
                              >
                                {addingDomain === '__all__' ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Plus className="w-4 h-4" />
                                )}
                                Add All ({remaining.length})
                              </button>
                            )}
                          </div>
                          {discoverResults.suggestions.map(s => {
                            const isAdded = addedDomains.has(s.domain);
                            const isAdding = addingDomain === s.domain;

                            return (
                              <div
                                key={s.domain}
                                className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                                  isAdded ? 'bg-green-900/30 border border-green-700' : 'bg-slate-900'
                                } ${addingDomain === '__all__' && !isAdded ? 'opacity-50' : ''}`}
                              >
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {s.domain}
                                    {isAdded && <CheckCircle className="w-4 h-4 text-green-500" />}
                                  </div>
                                  <div className="text-xs text-slate-500">from {s.serverName}</div>
                                </div>
                                {isAdded ? (
                                  <span className="text-green-400 text-sm">Added</span>
                                ) : (
                                  <button
                                    onClick={() => handleAddDiscovered(s.domain)}
                                    disabled={!!addingDomain}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-sm transition-colors disabled:opacity-50"
                                  >
                                    {isAdding ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                    Add
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-4 border-t border-slate-700 mt-4">
              <button
                onClick={() => setShowDiscoverModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SSLMonitor;
