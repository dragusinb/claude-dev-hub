import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, GitPullRequest, GitCommit, FolderTree, RefreshCw, X } from 'lucide-react';
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
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen flex flex-col">
      {/* Header - compact on mobile */}
      <div className="p-2 lg:p-4 border-b border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:gap-4 min-w-0">
            <Link
              to="/"
              className="text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base lg:text-xl font-bold truncate">{project.name}</h1>
              <p className="text-xs lg:text-sm text-slate-400 truncate hidden sm:block">{project.git_url}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 lg:gap-2 shrink-0">
            {/* Branch info - hidden on mobile */}
            {gitStatusData && (
              <span className="hidden md:flex text-sm text-slate-400 mr-2 items-center">
                <GitCommit className="w-4 h-4 mr-1" />
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
              className={`p-2 lg:px-3 lg:py-1.5 rounded-lg transition-colors ${
                showFiles ? 'bg-orange-600' : 'bg-slate-700 hover:bg-slate-600'
              }`}
              title="Files"
            >
              <FolderTree className="w-4 h-4" />
              <span className="hidden lg:inline ml-2">Files</span>
            </button>
            <button
              onClick={handlePull}
              disabled={pulling}
              className="p-2 lg:px-3 lg:py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
              title="Pull"
            >
              <GitPullRequest className="w-4 h-4" />
              <span className="hidden lg:inline ml-2">{pulling ? 'Pulling...' : 'Pull'}</span>
            </button>
            <button
              onClick={loadProject}
              className="p-2 lg:px-3 lg:py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* File tree overlay on mobile, sidebar on desktop */}
        {showFiles && (
          <>
            {/* Mobile overlay */}
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setShowFiles(false)}
            />
            <div className={`
              fixed lg:static inset-y-0 right-0 z-40
              w-72 lg:w-64 bg-slate-900 border-l lg:border-l-0 lg:border-r border-slate-700
              overflow-auto shadow-xl lg:shadow-none
              transform transition-transform duration-200
              lg:transform-none
            `}>
              {/* Mobile close button */}
              <div className="lg:hidden flex items-center justify-between p-3 border-b border-slate-700">
                <span className="font-medium">Files</span>
                <button
                  onClick={() => setShowFiles(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FileTree projectId={id} />
            </div>
          </>
        )}

        {/* Terminal - full width on mobile */}
        <div className="flex-1 bg-slate-950">
          <Terminal projectId={id} />
        </div>
      </div>
    </div>
  );
}

export default Project;
