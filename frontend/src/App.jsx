import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/layout/Layout';
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
import Users from './pages/Users';
import IpOverview from './pages/IpOverview';
import ActivityLog from './pages/ActivityLog';
import Profile from './pages/Profile';

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
        <Route path="servers/:id" element={<ServerDetail />} />
        <Route path="servers/:id/terminal" element={<ServerTerminal />} />
        <Route path="servers/:id/monitoring" element={<ServerMonitoring />} />
        <Route path="servers/:id/packages" element={<ServerPackages />} />
        <Route path="servers/:id/logs" element={<ServerLogs />} />
        <Route path="servers/:id/tasks" element={<ServerTasks />} />
        <Route path="servers/:id/documents" element={<ServerDocuments />} />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
        <Route path="ips" element={<IpOverview />} />
        <Route
          path="activity"
          element={
            <AdminRoute>
              <ActivityLog />
            </AdminRoute>
          }
        />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
