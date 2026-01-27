import { useState, useEffect } from 'react';
import { Lock, Plus, RefreshCw, Trash2, Edit, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import * as api from '../services/api';

function SSLMonitor() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCert, setEditingCert] = useState(null);
  const [checking, setChecking] = useState(null);

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
    </div>
  );
}

export default SSLMonitor;
