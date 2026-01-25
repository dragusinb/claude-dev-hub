import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, GitPullRequest, GitCommit, FolderTree, RefreshCw } from 'lucide-react';
import { getProject, gitPull, gitStatus } from '../services/api';
import Terminal from '../components/Terminal';
import FileTree from '../components/FileTree';

function Project() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gitStatusData, setGitStatusData] = useState(null);
  const [showFiles, setShowFiles] = useState(false);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  async function loadProject() {
    setLoading(true);
    try {
      const data = await getProject(id);
      setProject(data);
      const status = await gitStatus(id);
      setGitStatusData(status);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePull() {
    setPulling(true);
    try {
      await gitPull(id);
      const status = await gitStatus(id);
      setGitStatusData(status);
    } catch (err) {
      alert('Git pull failed: ' + err.message);
    } finally {
      setPulling(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400 mb-4">Project not found</p>
        <Link to="/" className="text-orange-500 hover:text-orange-400">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">{project.name}</h1>
              <p className="text-sm text-slate-400">{project.git_url}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gitStatusData && (
              <span className="text-sm text-slate-400 mr-4">
                <GitCommit className="w-4 h-4 inline mr-1" />
                {gitStatusData.current}
                {gitStatusData.behind > 0 && (
                  <span className="text-orange-500 ml-2">
                    {gitStatusData.behind} behind
                  </span>
                )}
              </span>
            )}
            <button
              onClick={() => setShowFiles(!showFiles)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                showFiles ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              <FolderTree className="w-4 h-4" />
              Files
            </button>
            <button
              onClick={handlePull}
              disabled={pulling}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <GitPullRequest className="w-4 h-4" />
              {pulling ? 'Pulling...' : 'Pull'}
            </button>
            <button
              onClick={loadProject}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File tree sidebar */}
        {showFiles && (
          <div className="w-64 border-r border-slate-700 bg-slate-900 overflow-auto">
            <FileTree projectId={id} />
          </div>
        )}

        {/* Terminal */}
        <div className="flex-1 bg-slate-950">
          <Terminal projectId={id} />
        </div>
      </div>
    </div>
  );
}

export default Project;
