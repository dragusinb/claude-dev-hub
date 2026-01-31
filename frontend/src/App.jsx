import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import Servers from './pages/Servers';
import Settings from './pages/Settings';
import Monitoring from './pages/Monitoring';
import Vault from './pages/Vault';
import Uptime from './pages/Uptime';
import SSLMonitor from './pages/SSLMonitor';
import Backups from './pages/Backups';
import Security from './pages/Security';
import Contabo from './pages/Contabo';
import Logs from './pages/Logs';
import Deployments from './pages/Deployments';
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
        <Route index element={<Dashboard />} />
        <Route path="project/:id" element={<Project />} />
        <Route path="servers" element={<Servers />} />
        <Route path="monitoring" element={<Monitoring />} />
        <Route path="uptime" element={<Uptime />} />
        <Route path="ssl" element={<SSLMonitor />} />
        <Route path="backups" element={<Backups />} />
        <Route path="security" element={<Security />} />
        <Route path="contabo" element={<Contabo />} />
        <Route path="logs" element={<Logs />} />
        <Route path="deployments" element={<Deployments />} />
        <Route path="vault" element={<Vault />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
