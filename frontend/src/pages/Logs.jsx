import { useState, useEffect, useRef } from 'react';
import { FileText, Server, RefreshCw, Search, Download, AlertCircle, ChevronDown, X, Play, Pause } from 'lucide-react';
import { getServers, getLogFiles, tailLogFile, searchLogFile } from '../services/api';

function Logs() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lines, setLines] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const logRef = useRef(null);
  const refreshInterval = useRef(null);

  useEffect(() => {
    loadServers();
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoRefresh && selectedServer && selectedFile) {
      refreshInterval.current = setInterval(() => {
        loadLogContent(false);
      }, 5000);
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    }
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh, selectedServer, selectedFile, searchQuery]);

  async function loadServers() {
    try {
      const data = await getServers();
      setServers(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadLogFiles(server) {
    setLoadingFiles(true);
    setError(null);
    setLogFiles([]);
    setSelectedFile(null);
    setLogContent('');
    try {
      const data = await getLogFiles(server.id);
      setLogFiles(data.files || []);
    } catch (err) {
      setError(`Failed to load log files: ${err.message}`);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function loadLogContent(showLoading = true) {
    if (!selectedServer || !selectedFile) return;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      let data;
      if (searchQuery.trim()) {
        data = await searchLogFile(selectedServer.id, selectedFile.id, searchQuery, lines);
      } else {
        data = await tailLogFile(selectedServer.id, selectedFile.id, lines);
      }
      setLogContent(data.content || '');
      setLastUpdate(new Date());
      setIsSearching(!!searchQuery.trim());

      // Auto-scroll to bottom
      if (logRef.current) {
        setTimeout(() => {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }, 100);
      }
    } catch (err) {
      setError(`Failed to load log: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleServerSelect(server) {
    setSelectedServer(server);
    setAutoRefresh(false);
    loadLogFiles(server);
  }

  function handleFileSelect(file) {
    setSelectedFile(file);
    setSearchQuery('');
    setIsSearching(false);
    setAutoRefresh(false);
  }

  useEffect(() => {
    if (selectedFile) {
      loadLogContent();
    }
  }, [selectedFile, lines]);

  function handleSearch(e) {
    e.preventDefault();
    loadLogContent();
  }

  function clearSearch() {
    setSearchQuery('');
    setIsSearching(false);
    loadLogContent();
  }

  function handleDownload() {
    if (!selectedServer || !selectedFile) return;
    const token = localStorage.getItem('token');
    const url = `/api/logs/servers/${selectedServer.id}/download?file=${encodeURIComponent(selectedFile.id)}&lines=10000`;

    // Create a link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedFile.id}-${selectedServer.name}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold">Log Viewer</h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Left sidebar - Server and file selection */}
        <div className="lg:col-span-1 space-y-4">
          {/* Server selection */}
          <div className="bg-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" />
              Select Server
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {servers.map(server => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedServer?.id === server.id
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-medium truncate">{server.name}</div>
                  <div className="text-xs text-slate-500 truncate">{server.host}</div>
                </button>
              ))}
              {servers.length === 0 && (
                <div className="text-slate-500 text-sm text-center py-4">
                  No servers available
                </div>
              )}
            </div>
          </div>

          {/* Log file selection */}
          {selectedServer && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Log Files
                {loadingFiles && <RefreshCw className="w-3 h-3 animate-spin" />}
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logFiles.map(file => (
                  <button
                    key={file.id}
                    onClick={() => handleFileSelect(file)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedFile?.id === file.id
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{file.name}</div>
                    <div className="text-xs text-slate-500 truncate">{file.path}</div>
                  </button>
                ))}
                {logFiles.length === 0 && !loadingFiles && (
                  <div className="text-slate-500 text-sm text-center py-4">
                    No log files found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lines selection */}
          {selectedFile && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-3">Lines to show</h2>
              <select
                value={lines}
                onChange={(e) => setLines(parseInt(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value={50}>50 lines</option>
                <option value={100}>100 lines</option>
                <option value={200}>200 lines</option>
                <option value={500}>500 lines</option>
                <option value={1000}>1000 lines</option>
              </select>
            </div>
          )}
        </div>

        {/* Right side - Log content */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          {selectedFile ? (
            <>
              {/* Toolbar */}
              <div className="bg-slate-800 rounded-t-lg p-4 border-b border-slate-700">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Search */}
                  <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search in logs..."
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-10 py-2 text-sm placeholder-slate-500"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        autoRefresh
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                      title={autoRefresh ? 'Stop auto-refresh' : 'Start auto-refresh (5s)'}
                    >
                      {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      <span className="text-sm hidden sm:inline">
                        {autoRefresh ? 'Stop' : 'Auto'}
                      </span>
                    </button>

                    <button
                      onClick={() => loadLogContent()}
                      disabled={loading}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      <span className="text-sm hidden sm:inline">Refresh</span>
                    </button>

                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm hidden sm:inline">Download</span>
                    </button>
                  </div>
                </div>

                {/* Status bar */}
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <span>{selectedServer?.name} / {selectedFile?.name}</span>
                  {isSearching && (
                    <span className="text-orange-400">
                      Searching: "{searchQuery}"
                    </span>
                  )}
                  {lastUpdate && (
                    <span className="ml-auto">
                      Last update: {lastUpdate.toLocaleTimeString()}
                    </span>
                  )}
                  {autoRefresh && (
                    <span className="flex items-center gap-1 text-green-400">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
              </div>

              {/* Log content */}
              <div
                ref={logRef}
                className="flex-1 bg-slate-900 rounded-b-lg p-4 overflow-auto font-mono text-sm"
                style={{ minHeight: '400px', maxHeight: 'calc(100vh - 400px)' }}
              >
                {loading && !logContent ? (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    Loading logs...
                  </div>
                ) : logContent ? (
                  <pre className="whitespace-pre-wrap break-all text-slate-300 leading-relaxed">
                    {logContent}
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500">
                    No log content available
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 bg-slate-800 rounded-lg flex items-center justify-center">
              <div className="text-center text-slate-500">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a server and log file to view</p>
                <p className="text-sm mt-2">Choose from the sidebar on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Logs;
