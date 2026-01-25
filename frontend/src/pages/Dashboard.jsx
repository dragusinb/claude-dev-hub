import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Folder, GitBranch, Trash2, RefreshCw, Github, Lock, Globe, Search, Server, ChevronRight } from 'lucide-react';
import { getProjects, createProject, deleteProject, getGitHubRepos, getGitHubStatus, getSvnCredentials, getSvnRepos, checkoutSvn } from '../services/api';

function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('manual'); // 'manual', 'github', or 'svn'
  const [creating, setCreating] = useState(false);
  const [addingRepoId, setAddingRepoId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    gitUrl: '',
    description: ''
  });

  // GitHub state
  const [githubStatus, setGithubStatus] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');

  // SVN state
  const [svnCredentials, setSvnCredentials] = useState([]);
  const [selectedSvnCred, setSelectedSvnCred] = useState(null);
  const [svnPath, setSvnPath] = useState('');
  const [svnFolders, setSvnFolders] = useState([]);
  const [loadingSvn, setLoadingSvn] = useState(false);
  const [svnProjectName, setSvnProjectName] = useState('');
  const [addingSvn, setAddingSvn] = useState(false);

  useEffect(() => {
    loadProjects();
    checkGitHub();
    loadSvnCredentials();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkGitHub() {
    try {
      const status = await getGitHubStatus();
      setGithubStatus(status);
    } catch (err) {
      console.error('Failed to check GitHub:', err);
    }
  }

  async function loadGitHubRepos() {
    setLoadingRepos(true);
    try {
      const repos = await getGitHubRepos();
      setGithubRepos(repos);
    } catch (err) {
      console.error('Failed to load repos:', err);
    } finally {
      setLoadingRepos(false);
    }
  }

  function openGitHubModal() {
    setModalMode('github');
    setShowModal(true);
    if (githubRepos.length === 0) {
      loadGitHubRepos();
    }
  }

  async function loadSvnCredentials() {
    try {
      const creds = await getSvnCredentials();
      setSvnCredentials(creds);
    } catch (err) {
      console.error('Failed to load SVN credentials:', err);
    }
  }

  function openSvnModal() {
    setModalMode('svn');
    setShowModal(true);
    setSelectedSvnCred(null);
    setSvnPath('');
    setSvnFolders([]);
    setSvnProjectName('');
  }

  async function loadSvnFolders(credId, path = '') {
    setLoadingSvn(true);
    try {
      const folders = await getSvnRepos(credId, path);
      setSvnFolders(folders);
      setSvnPath(path);
    } catch (err) {
      console.error('Failed to load SVN folders:', err);
      alert('Failed to load SVN folders: ' + err.message);
    } finally {
      setLoadingSvn(false);
    }
  }

  async function selectSvnCredential(cred) {
    setSelectedSvnCred(cred);
    setSvnPath('');
    setSvnProjectName('');
    await loadSvnFolders(cred.id, '');
  }

  async function navigateSvnFolder(folder) {
    if (folder.type === 'directory') {
      await loadSvnFolders(selectedSvnCred.id, folder.path);
    }
  }

  async function addFromSvn() {
    if (!svnProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    setAddingSvn(true);
    try {
      // Checkout and create the project in one call
      await checkoutSvn({
        credentialId: selectedSvnCred.id,
        svnPath: svnPath,
        projectName: svnProjectName,
        description: `SVN: ${selectedSvnCred.url}/${svnPath}`
      });

      setShowModal(false);
      await loadProjects();
    } catch (err) {
      alert('Failed to add SVN project: ' + err.message);
    } finally {
      setAddingSvn(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await createProject(formData);
      setShowModal(false);
      setFormData({ name: '', gitUrl: '', description: '' });
      await loadProjects();
    } catch (err) {
      alert('Failed to create project: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function addFromGitHub(repo) {
    setAddingRepoId(repo.id);
    try {
      await createProject({
        name: repo.name,
        gitUrl: repo.url,
        description: repo.description || ''
      });
      await loadProjects();
    } catch (err) {
      alert('Failed to add project: ' + err.message);
    } finally {
      setAddingRepoId(null);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete project "${name}"? This will remove all local files.`)) {
      return;
    }
    try {
      await deleteProject(id);
      await loadProjects();
    } catch (err) {
      alert('Failed to delete project: ' + err.message);
    }
  }

  const filteredRepos = githubRepos.filter(repo =>
    repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(repoSearch.toLowerCase()))
  );

  // Check if repo is already added
  const addedRepoUrls = new Set(projects.map(p => p.git_url));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <div className="flex gap-2">
          <button
            onClick={loadProjects}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {githubStatus?.connected && (
            <button
              onClick={openGitHubModal}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <Github className="w-4 h-4" />
              From GitHub
            </button>
          )}
          {svnCredentials.length > 0 && (
            <button
              onClick={openSvnModal}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <Server className="w-4 h-4" />
              From SVN
            </button>
          )}
          <button
            onClick={() => { setModalMode('manual'); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {/* GitHub connection status */}
      {githubStatus && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          githubStatus.connected ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800 border border-slate-700'
        }`}>
          <Github className="w-5 h-5" />
          {githubStatus.connected ? (
            <span className="text-sm">
              Connected to GitHub as <strong>{githubStatus.user?.login}</strong>
            </span>
          ) : (
            <span className="text-sm text-slate-400">
              GitHub not connected. Add your token in Settings.
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <Folder className="w-16 h-16 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 mb-4">No projects yet</p>
          <div className="flex justify-center gap-4">
            {githubStatus?.connected && (
              <button
                onClick={openGitHubModal}
                className="flex items-center gap-2 text-slate-300 hover:text-white"
              >
                <Github className="w-4 h-4" />
                Add from GitHub
              </button>
            )}
            {svnCredentials.length > 0 && (
              <button
                onClick={openSvnModal}
                className="flex items-center gap-2 text-slate-300 hover:text-white"
              >
                <Server className="w-4 h-4" />
                Add from SVN
              </button>
            )}
            <button
              onClick={() => { setModalMode('manual'); setShowModal(true); }}
              className="text-orange-500 hover:text-orange-400"
            >
              Add manually
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors"
            >
              <Link to={`/project/${project.id}`} className="block p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{project.name}</h3>
                    <p className="text-sm text-slate-400 mb-2 line-clamp-2">
                      {project.description || 'No description'}
                    </p>
                  </div>
                  <GitBranch className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-xs text-slate-500 truncate">{project.git_url}</p>
              </Link>
              <div className="px-4 py-2 bg-slate-900 flex justify-between items-center">
                <span className="text-xs text-slate-500">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(project.id, project.name);
                  }}
                  className="text-slate-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl border border-slate-700 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="flex gap-4 mb-4 border-b border-slate-700 pb-4">
              <button
                onClick={() => setModalMode('github')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  modalMode === 'github' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Github className="w-4 h-4" />
                From GitHub
              </button>
              {svnCredentials.length > 0 && (
                <button
                  onClick={() => { setModalMode('svn'); setSelectedSvnCred(null); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                    modalMode === 'svn' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Server className="w-4 h-4" />
                  From SVN
                </button>
              )}
              <button
                onClick={() => setModalMode('manual')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  modalMode === 'manual' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                Manual
              </button>
            </div>

            {modalMode === 'github' ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="Search repositories..."
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loadingRepos ? (
                    <div className="text-center py-8 text-slate-400">Loading repositories...</div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">No repositories found</div>
                  ) : (
                    filteredRepos.map((repo) => {
                      const isAdded = addedRepoUrls.has(repo.url);
                      return (
                        <div
                          key={repo.id}
                          className={`p-3 rounded-lg border ${
                            isAdded
                              ? 'bg-slate-900/50 border-slate-700 opacity-50'
                              : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium truncate">{repo.name}</h4>
                                {repo.private ? (
                                  <Lock className="w-3 h-3 text-slate-500" />
                                ) : (
                                  <Globe className="w-3 h-3 text-slate-500" />
                                )}
                                {repo.language && (
                                  <span className="text-xs px-2 py-0.5 bg-slate-700 rounded">
                                    {repo.language}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-400 truncate mt-1">
                                {repo.description || 'No description'}
                              </p>
                            </div>
                            <button
                              onClick={() => addFromGitHub(repo)}
                              disabled={addingRepoId !== null || isAdded}
                              className={`ml-4 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                isAdded
                                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                  : addingRepoId === repo.id
                                  ? 'bg-orange-700 text-white'
                                  : 'bg-orange-600 hover:bg-orange-700 text-white'
                              }`}
                            >
                              {isAdded ? 'Added' : addingRepoId === repo.id ? 'Adding...' : 'Add'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : modalMode === 'svn' ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                {!selectedSvnCred ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400 mb-4">Select an SVN server to browse:</p>
                    {svnCredentials.map((cred) => (
                      <button
                        key={cred.id}
                        onClick={() => selectSvnCredential(cred)}
                        className="w-full p-3 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg text-left flex items-center gap-3"
                      >
                        <Server className="w-5 h-5 text-slate-500" />
                        <div>
                          <p className="font-medium">{cred.name}</p>
                          <p className="text-sm text-slate-400 truncate">{cred.url}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="mb-4 p-3 bg-slate-900 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-slate-500" />
                          <span className="font-medium">{selectedSvnCred.name}</span>
                        </div>
                        <button
                          onClick={() => setSelectedSvnCred(null)}
                          className="text-sm text-slate-400 hover:text-white"
                        >
                          Change
                        </button>
                      </div>
                      <div className="text-sm text-slate-400">
                        Path: /{svnPath || '(root)'}
                      </div>
                      {svnPath && (
                        <button
                          onClick={() => {
                            const parentPath = svnPath.split('/').slice(0, -1).join('/');
                            loadSvnFolders(selectedSvnCred.id, parentPath);
                          }}
                          className="text-sm text-orange-500 hover:text-orange-400 mt-1"
                        >
                          Go up
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                      {loadingSvn ? (
                        <div className="text-center py-8 text-slate-400">Loading...</div>
                      ) : svnFolders.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">No items found</div>
                      ) : (
                        svnFolders.map((item) => (
                          <button
                            key={item.path}
                            onClick={() => item.type === 'directory' && navigateSvnFolder(item)}
                            className={`w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-left flex items-center gap-2 ${
                              item.type === 'directory' ? 'hover:border-slate-600 cursor-pointer' : 'opacity-50'
                            }`}
                            disabled={item.type !== 'directory'}
                          >
                            {item.type === 'directory' ? (
                              <Folder className="w-4 h-4 text-orange-500" />
                            ) : (
                              <GitBranch className="w-4 h-4 text-slate-500" />
                            )}
                            <span className="flex-1 truncate">{item.name}</span>
                            {item.type === 'directory' && (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        ))
                      )}
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                      <label className="block text-sm font-medium mb-2">Project Name</label>
                      <input
                        type="text"
                        value={svnProjectName}
                        onChange={(e) => setSvnProjectName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500 mb-4"
                        placeholder="Enter project name"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowModal(false)}
                          className="px-4 py-2 text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addFromSvn}
                          disabled={addingSvn || !svnProjectName.trim()}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
                        >
                          {addingSvn ? 'Checking out...' : 'Checkout & Add'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreate}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Project Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      placeholder="My Awesome Project"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Git URL</label>
                    <input
                      type="url"
                      value={formData.gitUrl}
                      onChange={(e) => setFormData({ ...formData, gitUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      placeholder="https://github.com/user/repo.git"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description (optional)</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-orange-500"
                      rows={3}
                      placeholder="What is this project about?"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Cloning...' : 'Create Project'}
                  </button>
                </div>
              </form>
            )}

            {modalMode === 'github' && (
              <div className="flex justify-end mt-4 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
