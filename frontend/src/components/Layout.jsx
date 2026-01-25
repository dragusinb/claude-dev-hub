import { Outlet, Link, useLocation } from 'react-router-dom';
import { FolderGit2, Server, Settings, Home } from 'lucide-react';

function Layout() {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Projects' },
    { path: '/servers', icon: Server, label: 'Servers' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-8 h-8 text-orange-500" />
            <span className="text-xl font-bold">Claude Dev Hub</span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map(({ path, icon: Icon, label }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    location.pathname === path
                      ? 'bg-slate-800 text-orange-500'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
          Claude Dev Hub v1.0.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
