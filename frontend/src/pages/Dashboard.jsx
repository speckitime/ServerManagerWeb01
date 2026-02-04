import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { getSocket } from '../services/socket';

export default function Dashboard() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, error: 0 });

  useEffect(() => {
    loadServers();
    const socket = getSocket();

    socket.on('server_status', (data) => {
      setServers((prev) =>
        prev.map((s) => (s.id === data.server_id ? { ...s, status: data.status } : s))
      );
    });

    socket.on('server_metrics', (data) => {
      setServers((prev) =>
        prev.map((s) =>
          s.id === data.server_id ? { ...s, latest_metrics: data } : s
        )
      );
    });

    return () => {
      socket.off('server_status');
      socket.off('server_metrics');
    };
  }, []);

  useEffect(() => {
    const online = servers.filter((s) => s.status === 'online').length;
    const offline = servers.filter((s) => s.status === 'offline').length;
    const error = servers.filter((s) => s.status === 'error').length;
    setStats({ total: servers.length, online, offline, error });
  }, [servers]);

  const loadServers = async () => {
    try {
      const { data } = await api.get('/servers');
      setServers(data);
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-400';
      case 'maintenance': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Servers" value={stats.total} color="text-primary-600" />
        <StatCard label="Online" value={stats.online} color="text-green-600" />
        <StatCard label="Offline" value={stats.offline} color="text-gray-500" />
        <StatCard label="Errors" value={stats.error} color="text-red-600" />
      </div>

      {/* Server list */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Servers</h2>
          <Link to="/servers" className="text-sm text-primary-600 hover:text-primary-700">
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {servers.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              No servers added yet.{' '}
              <Link to="/servers" className="text-primary-600 hover:underline">
                Add your first server
              </Link>
            </div>
          ) : (
            servers.slice(0, 10).map((server) => (
              <Link
                key={server.id}
                to={`/servers/${server.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className={`h-3 w-3 rounded-full ${statusColor(server.status)}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {server.display_name || server.hostname}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {server.ip_address} &middot; {server.os_type}
                  </p>
                </div>
                {server.latest_metrics && (
                  <div className="hidden md:flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                    <span>CPU: {server.latest_metrics.cpu_usage?.toFixed(1)}%</span>
                    <span>RAM: {server.latest_metrics.ram_usage_percent?.toFixed(1)}%</span>
                  </div>
                )}
                {server.group_name && (
                  <span
                    className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                    style={{ backgroundColor: server.group_color || '#6B7280' }}
                  >
                    {server.group_name}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
