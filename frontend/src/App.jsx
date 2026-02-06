import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/layout/Layout';
import ServerLayout from './components/layout/ServerLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import ServerTerminal from './pages/ServerTerminal';
import ServerMonitoring from './pages/ServerMonitoring';
import ServerPackages from './pages/ServerPackages';
import ServerLogs from './pages/ServerLogs';
import ServerTasks from './pages/ServerTasks';
import ServerDocuments from './pages/ServerDocuments';
import ServerAddons from './pages/ServerAddons';
import Users from './pages/Users';
import IpOverview from './pages/IpOverview';
import ActivityLog from './pages/ActivityLog';
import Profile from './pages/Profile';
import Scripts from './pages/Scripts';
import Addons from './pages/Addons';

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user && user.role !== 'admin') return <Navigate to="/" />;
  return children;
}

export default function App() {
  const { isAuthenticated, fetchUser, token } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUser();
    }
  }, [isAuthenticated, token, fetchUser]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="servers" element={<Servers />} />

        {/* Server sub-pages with persistent tab navigation */}
        <Route path="servers/:id" element={<ServerLayout />}>
          <Route index element={<ServerDetail />} />
          <Route path="terminal" element={<ServerTerminal />} />
          <Route path="monitoring" element={<ServerMonitoring />} />
          <Route path="packages" element={<ServerPackages />} />
          <Route path="logs" element={<ServerLogs />} />
          <Route path="tasks" element={<ServerTasks />} />
          <Route path="documents" element={<ServerDocuments />} />
          <Route path="addons" element={<ServerAddons />} />
        </Route>

        <Route
          path="scripts"
          element={<AdminRoute><Scripts /></AdminRoute>}
        />
        <Route
          path="addons"
          element={<AdminRoute><Addons /></AdminRoute>}
        />
        <Route
          path="users"
          element={<AdminRoute><Users /></AdminRoute>}
        />
        <Route path="ips" element={<IpOverview />} />
        <Route
          path="activity"
          element={<AdminRoute><ActivityLog /></AdminRoute>}
        />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
