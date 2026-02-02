import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import ServersMonitoring from './pages/ServersMonitoring';
import Settings from './pages/Settings';
import Vault from './pages/Vault';
import SSLMonitor from './pages/SSLMonitor';
import Backups from './pages/Backups';
import Security from './pages/Security';
import Contabo from './pages/Contabo';
import Logs from './pages/Logs';
import Deployments from './pages/Deployments';
import Costs from './pages/Costs';
import CronJobs from './pages/CronJobs';
import DNS from './pages/DNS';
import Login from './pages/Login';
import Register from './pages/Register';
import { isAuthenticated, checkAuth } from './services/auth';

function ProtectedRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    async function verify() {
      if (isAuthenticated()) {
        const valid = await checkAuth();
        setAuthenticated(valid);
      }
      setChecking(false);
    }
    verify();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="projects" element={<Dashboard />} />
        <Route path="project/:id" element={<Project />} />
        <Route path="servers" element={<ServersMonitoring />} />
        <Route path="monitoring" element={<Navigate to="/servers" replace />} />
        <Route path="uptime" element={<Navigate to="/servers" replace />} />
        <Route path="ssl" element={<SSLMonitor />} />
        <Route path="backups" element={<Backups />} />
        <Route path="security" element={<Security />} />
        <Route path="contabo" element={<Contabo />} />
        <Route path="logs" element={<Logs />} />
        <Route path="deployments" element={<Deployments />} />
        <Route path="costs" element={<Costs />} />
        <Route path="cron" element={<CronJobs />} />
        <Route path="dns" element={<DNS />} />
        <Route path="vault" element={<Vault />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
