import { useState, useEffect } from 'react';
import { Plus, Key, Trash2, Eye, EyeOff, Copy, Check, Loader2, Edit2, Shield, Lock, Unlock, RefreshCw } from 'lucide-react';
import { getVaultEntries, getVaultEntry, createVaultEntry, updateVaultEntry, deleteVaultEntry, getVaultStatus, syncVaultCredentials } from '../services/api';

function Vault() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [creating, setCreating] = useState(false);
  const [decryptedEntries, setDecryptedEntries] = useState({});
  const [loadingEntries, setLoadingEntries] = useState({});
  const [copied, setCopied] = useState({});
  const [vaultStatus, setVaultStatus] = useState(null);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    category: 'general'
  });

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'server', label: 'Server' },
    { value: 'database', label: 'Database' },
    { value: 'api', label: 'API Key' },
    { value: 'email', label: 'Email' },
    { value: 'other', label: 'Other' }
  ];

  // Credential templates for common services
  const templates = [
    { name: 'Custom', apply: () => {} },
    {
      name: 'Contabo API',
      apply: () => setFormData({
        name: 'Contabo API',
        username: '',
        password: '',
        url: 'https://my.contabo.com/api/details',
        notes: 'Client ID: your-client-id-here\nClient Secret: your-client-secret-here',
        category: 'api'
      })
    },
    {
      name: 'Cloudflare API',
      apply: () => setFormData({
        name: 'Cloudflare API',
        username: '',
        password: '',
        url: 'https://dash.cloudflare.com/profile/api-tokens',
        notes: 'API Token (not Global API Key)\nCreate token with DNS edit permissions',
        category: 'api'
      })
    },
    {
      name: 'SMTP Server',
      apply: () => setFormData({
        name: '',
        username: '',
        password: '',
        url: '',
        notes: 'Host: smtp.example.com\nPort: 587\nEncryption: TLS',
        category: 'email'
      })
    },
    {
      name: 'MySQL Database',
      apply: () => setFormData({
        name: '',
        username: '',
        password: '',
        url: '',
        notes: 'Host: localhost\nPort: 3306\nDatabase: dbname',
        category: 'database'
      })
    },
    {
      name: 'SSH Server',
      apply: () => setFormData({
        name: '',
        username: 'root',
        password: '',
        url: '',
        notes: 'Host: your-server-ip\nPort: 22\nAuth: password or key',
        category: 'server'
      })
    }
  ];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [entriesData, statusData] = await Promise.all([
        getVaultEntries(),
        getVaultStatus()
      ]);
      setEntries(entriesData);
      setVaultStatus(statusData);
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      if (editingEntry) {
        await updateVaultEntry(editingEntry.id, formData);
        // Clear decrypted cache for this entry
        setDecryptedEntries(prev => {
          const newState = { ...prev };
          delete newState[editingEntry.id];
          return newState;
        });
      } else {
        await createVaultEntry(formData);
      }
      setShowModal(false);
      setEditingEntry(null);
      resetForm();
      await loadData();
    } catch (err) {
      alert('Failed to save entry: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}" from vault?`)) return;
    try {
      await deleteVaultEntry(id);
      setDecryptedEntries(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      await loadData();
    } catch (err) {
      alert('Failed to delete entry: ' + err.message);
    }
  }

  async function handleEdit(entry) {
    setLoadingEntries(prev => ({ ...prev, [entry.id]: true }));
    try {
      const fullEntry = await getVaultEntry(entry.id);
      setFormData({
        name: fullEntry.name,
        username: fullEntry.username || '',
        password: '', // Don't pre-fill password
        url: fullEntry.url || '',
        notes: fullEntry.notes || '',
        category: fullEntry.category || 'general'
      });
      setEditingEntry(entry);
      setShowModal(true);
    } catch (err) {
      alert('Failed to load entry: ' + err.message);
    } finally {
      setLoadingEntries(prev => ({ ...prev, [entry.id]: false }));
    }
  }

  async function toggleDecrypt(id) {
    if (decryptedEntries[id]) {
      // Lock the entry (remove from decrypted cache)
      setDecryptedEntries(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      return;
    }

    // Decrypt the entry
    setLoadingEntries(prev => ({ ...prev, [id]: true }));
    try {
      const entry = await getVaultEntry(id);
      setDecryptedEntries(prev => ({ ...prev, [id]: entry }));
    } catch (err) {
      alert('Failed to decrypt entry');
    } finally {
      setLoadingEntries(prev => ({ ...prev, [id]: false }));
    }
  }

  async function copyToClipboard(text, id, field) {
    await navigator.clipboard.writeText(text);
    setCopied(prev => ({ ...prev, [`${id}-${field}`]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [`${id}-${field}`]: false })), 2000);
  }

  function resetForm() {
    setFormData({
      name: '',
      username: '',
      password: '',
      url: '',
      notes: '',
      category: 'general'
    });
  }

  function openNewEntry() {
    resetForm();
    setEditingEntry(null);
    setShowModal(true);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncVaultCredentials();
      if (result.synced > 0) {
        alert(`Synced ${result.synced} credentials to vault!`);
        await loadData();
      } else {
        alert('All credentials are already in the vault.');
      }
    } catch (err) {
      alert('Failed to sync: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = !filter || entry.name.toLowerCase().includes(filter.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || entry.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category) => {
    const colors = {
      general: 'bg-slate-600',
      server: 'bg-green-600',
      database: 'bg-blue-600',
      api: 'bg-purple-600',
      email: 'bg-orange-600',
      other: 'bg-gray-600'
    };
    return colors[category] || colors.general;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Secure Vault</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
            title="Import credentials from servers, API keys, etc."
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Import All'}
          </button>
          <button
            onClick={openNewEntry}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Entry
          </button>
        </div>
      </div>

      {vaultStatus && !vaultStatus.configured && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
          <p className="text-yellow-300 text-sm">
            <strong>Note:</strong> {vaultStatus.message}
          </p>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <Key className="w-16 h-16 mx-auto text-slate-600 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No entries yet</h2>
          <p className="text-slate-400 mb-4">Store your passwords and secrets securely encrypted</p>
          <button
            onClick={openNewEntry}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            Add First Entry
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map(entry => {
            const decrypted = decryptedEntries[entry.id];
            const isLoading = loadingEntries[entry.id];

            return (
              <div key={entry.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${getCategoryColor(entry.category)}`}>
                        {entry.category}
                      </span>
                      <h3 className="font-semibold text-lg">{entry.name}</h3>
                      {decrypted ? (
                        <Unlock className="w-4 h-4 text-green-400" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    {decrypted ? (
                      <div className="space-y-2 bg-slate-900/50 rounded-lg p-3">
                        {decrypted.username && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-sm">Username:</span>
                            <div className="flex items-center gap-2">
                              <code className="text-sm bg-slate-800 px-2 py-1 rounded">{decrypted.username}</code>
                              <button
                                onClick={() => copyToClipboard(decrypted.username, entry.id, 'username')}
                                className="p-1 hover:bg-slate-700 rounded"
                                title="Copy username"
                              >
                                {copied[`${entry.id}-username`] ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">Password:</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-slate-800 px-2 py-1 rounded font-mono">{decrypted.password}</code>
                            <button
                              onClick={() => copyToClipboard(decrypted.password, entry.id, 'password')}
                              className="p-1 hover:bg-slate-700 rounded"
                              title="Copy password"
                            >
                              {copied[`${entry.id}-password`] ? (
                                <Check className="w-4 h-4 text-green-400" />
                              ) : (
                                <Copy className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {decrypted.url && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-sm">URL:</span>
                            <div className="flex items-center gap-2">
                              <a href={decrypted.url} target="_blank" rel="noopener noreferrer"
                                 className="text-sm text-orange-400 hover:underline">{decrypted.url}</a>
                              <button
                                onClick={() => copyToClipboard(decrypted.url, entry.id, 'url')}
                                className="p-1 hover:bg-slate-700 rounded"
                                title="Copy URL"
                              >
                                {copied[`${entry.id}-url`] ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {decrypted.notes && (
                          <div className="mt-2 pt-2 border-t border-slate-700">
                            <span className="text-slate-400 text-sm">Notes:</span>
                            <p className="text-sm mt-1 text-slate-300 whitespace-pre-wrap">{decrypted.notes}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm italic">
                        Click unlock to view encrypted data
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => toggleDecrypt(entry.id)}
                      disabled={isLoading}
                      className={`p-2 rounded transition-colors ${
                        decrypted
                          ? 'text-green-400 hover:bg-slate-700'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                      title={decrypted ? 'Lock' : 'Unlock'}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : decrypted ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(entry)}
                      disabled={isLoading}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id, entry.name)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
            <h2 className="text-xl font-bold mb-4">
              {editingEntry ? 'Edit Entry' : 'Add New Entry'}
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              {!editingEntry && (
                <div>
                  <label className="block text-sm font-medium mb-1">Use Template</label>
                  <select
                    onChange={(e) => {
                      const template = templates.find(t => t.name === e.target.value);
                      if (template) template.apply();
                    }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                  >
                    {templates.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Select a template to pre-fill fields with the required format</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                  placeholder="e.g., Production Database"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Username (encrypted)</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                  placeholder="admin"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Password (encrypted) {editingEntry ? '' : '*'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                  placeholder="••••••••"
                  required={!editingEntry}
                />
                {editingEntry && (
                  <p className="text-xs text-slate-400 mt-1">Leave blank to keep existing password</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">URL (encrypted)</label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes (encrypted)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500 h-20 resize-none"
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingEntry(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Encrypting...
                    </>
                  ) : (
                    editingEntry ? 'Update' : 'Add Entry'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Vault;
