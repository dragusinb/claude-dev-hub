import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { FolderGit2, Server, Settings, Home, LogOut, Menu, X, Activity, Shield } from 'lucide-react';
import { logout, getUser } from '../services/auth';

function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/', icon: Home, label: 'Projects' },
    { path: '/servers', icon: Server, label: 'Servers' },
    { path: '/monitoring', icon: Activity, label: 'Monitoring' },
    { path: '/vault', icon: Shield, label: 'Vault' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  // Close sidebar when navigating on mobile
  function handleNavClick() {
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-6 h-6 text-orange-500" />
          <span className="font-bold">Claude Dev Hub</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-slate-400 hover:text-white"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-slate-900 border-r border-slate-700 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="p-4 border-b border-slate-700 hidden lg:block">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-8 h-8 text-orange-500" />
            <span className="text-xl font-bold">Claude Dev Hub</span>
          </div>
        </div>

        {/* Spacer for mobile header */}
        <div className="h-14 lg:hidden" />

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map(({ path, icon: Icon, label }) => (
              <li key={path}>
                <Link
                  to={path}
                  onClick={handleNavClick}
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

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              {getUser()?.email?.split('@')[0] || 'User'}
            </div>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-slate-600 mt-1">v1.0.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
