import { useState, useEffect } from 'react';
import { Plus, Server, Trash2, Check, X, Loader2, Edit } from 'lucide-react';
import { getServers, createServer, deleteServer, testServer, updateServer } from '../services/api';

function Servers() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [editingServer, setEditingServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    deployPath: '/home'
  });

  const defaultFormData = {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKey: '',
    deployPath: '/home'
  };

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    setLoading(true);
    try {
      const data = await getServers();
      setServers(data);
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    try {
      if (editingServer) {
        await updateServer(editingServer.id, formData);
      } else {
        await createServer(formData);
      }
      setShowModal(false);
      setEditingServer(null);
      setFormData(defaultFormData);
      await loadServers();
    } catch (err) {
      alert(`Failed to ${editingServer ? 'update' : 'add'} server: ` + err.message);
    } finally {
      setCreating(false);
    }
  }

  function handleEdit(server) {
    setEditingServer(server);
    setFormData({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.auth_type || 'password',
      password: '',
      privateKey: '',
      deployPath: server.deploy_path || '/home'
    });
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingServer(null);
    setFormData(defaultFormData);
  }

  async function handleDelete(id, name) {
    if (!confirm(`Remove server "${name}"?`)) return;
    try {
      await deleteServer(id);
      await loadServers();
    } catch (err) {
      alert('Failed to delete server: ' + err.message);
    }
  }

  async function handleTest(id) {
    setTesting({ ...testing, [id]: true });
    setTestResults({ ...testResults, [id]: null });
    try {
      const result = await testServer(id);
      setTestResults({ ...testResults, [id]: result });
    } catch (err) {
      setTestResults({ ...testResults, [id]: { success: false, error: err.message } });
    } finally {
      setTesting({ ...testing, [id]: false });
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Deployment Servers</h1>
        <button
          onClick={() => {
            setEditingServer(null);
            setFormData(defaultFormData);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </button>
      </div>

      <p className="text-slate-400 mb-6">
        Configure your Contabo or other servers where projects will be deployed.
      </p>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading servers...</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-12">
          <Server className="w-16 h-16 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400">No servers configured</p>
        </div>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <div
              key={server.id}
              className="bg-slate-800 rounded-lg border border-slate-700 p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{server.name}</h3>
                  <p className="text-slate-400 text-sm">
                    {server.username}@{server.host}:{server.port}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Deploy path: {server.deploy_path}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {testResults[server.id] && (
                    <span className={`flex items-center gap-1 text-sm ${
                      testResults[server.id].success ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {testResults[server.id].success ? (
                        <><Check className="w-4 h-4" /> Connected</>
                      ) : (
                        <><X className="w-4 h-4" /> Failed</>
                      )}
                    </span>
                  )}
                  <button
                    onClick={() => handleTest(server.id)}
                    disabled={testing[server.id]}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm disabled:opacity-50"
                  >
                    {testing[server.id] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(server)}
                    className="text-slate-500 hover:text-orange-500 transition-colors"
                    title="Edit server"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(server.id, server.name)}
                    className="text-slate-500 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Server Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editingServer ? 'Edit Server' : 'Add Server'}</h2>
            {editingServer && (
              <p className="text-sm text-yellow-500 mb-4">
                Leave password/key blank to keep existing credentials
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="Production Server"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Host</label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      placeholder="194.163.144.206"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Port</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Authentication</label>
                  <select
                    value={formData.authType}
                    onChange={(e) => setFormData({ ...formData, authType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="password">Password</option>
                    <option value="key">Private Key</option>
                  </select>
                </div>
                {formData.authType === 'password' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">Private Key</label>
                    <textarea
                      value={formData.privateKey}
                      onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500 font-mono text-xs"
                      rows={5}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Deploy Path</label>
                  <input
                    type="text"
                    value={formData.deployPath}
                    onChange={(e) => setFormData({ ...formData, deployPath: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="/home/projects"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? (editingServer ? 'Updating...' : 'Adding...') : (editingServer ? 'Update Server' : 'Add Server')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Servers;
