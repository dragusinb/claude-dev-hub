import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, File, FileCode, FileText, FileJson } from 'lucide-react';
import { getProjectFiles } from '../services/api';

function FileTree({ projectId }) {
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles('');
  }, [projectId]);

  async function loadFiles(path) {
    try {
      setLoading(true);
      const files = await getProjectFiles(projectId, path);
      if (path === '') {
        setTree(files);
      }
      return files;
    } catch (err) {
      console.error('Failed to load files:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }

  function getFileIcon(name, type) {
    if (type === 'directory') return Folder;

    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'py':
      case 'rb':
      case 'go':
      case 'rs':
        return FileCode;
      case 'json':
        return FileJson;
      case 'md':
      case 'txt':
        return FileText;
      default:
        return File;
    }
  }

  function FileItem({ item, depth = 0 }) {
    const [children, setChildren] = useState([]);
    const [loadingChildren, setLoadingChildren] = useState(false);
    const isExpanded = expanded[item.path];
    const Icon = getFileIcon(item.name, item.type);

    async function toggleExpand() {
      if (item.type !== 'directory') return;

      if (!isExpanded) {
        setLoadingChildren(true);
        try {
          const files = await getProjectFiles(projectId, item.path);
          setChildren(files);
        } catch (err) {
          console.error('Failed to load directory:', err);
        } finally {
          setLoadingChildren(false);
        }
      }
      setExpanded({ ...expanded, [item.path]: !isExpanded });
    }

    return (
      <div>
        <div
          className={`flex items-center gap-1 px-2 py-1 hover:bg-slate-800 cursor-pointer text-sm ${
            item.type === 'directory' ? 'text-slate-300' : 'text-slate-400'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={toggleExpand}
        >
          {item.type === 'directory' ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )
          ) : (
            <span className="w-4" />
          )}
          <Icon className={`w-4 h-4 ${
            item.type === 'directory' ? 'text-orange-500' : 'text-slate-500'
          }`} />
          <span className="truncate">{item.name}</span>
        </div>
        {isExpanded && item.type === 'directory' && (
          <div>
            {loadingChildren ? (
              <div className="px-4 py-1 text-xs text-slate-500" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                Loading...
              </div>
            ) : (
              children.map((child) => (
                <FileItem key={child.path} item={child} depth={depth + 1} />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading && tree.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Loading files...
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
        Files
      </div>
      {tree.map((item) => (
        <FileItem key={item.path} item={item} />
      ))}
    </div>
  );
}

export default FileTree;
