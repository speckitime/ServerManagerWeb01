import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user_id: '', action: '', limit: 100 });

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadLogs = async () => {
    try {
      const params = {};
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.action) params.action = filters.action;
      params.limit = filters.limit;

      const { data } = await api.get('/users/activity-log', { params });
      setLogs(data);
    } catch (err) {
      toast.error('Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  const actionColors = {
    login: 'text-green-600 dark:text-green-400',
    server_created: 'text-blue-600 dark:text-blue-400',
    server_updated: 'text-yellow-600 dark:text-yellow-400',
    server_deleted: 'text-red-600 dark:text-red-400',
    ssh_connected: 'text-purple-600 dark:text-purple-400',
    update_requested: 'text-orange-600 dark:text-orange-400',
    user_created: 'text-blue-600 dark:text-blue-400',
    user_updated: 'text-yellow-600 dark:text-yellow-400',
    user_deleted: 'text-red-600 dark:text-red-400',
    task_created: 'text-blue-600 dark:text-blue-400',
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>

      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          <select
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className="input-field w-auto"
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="server_created">Server Created</option>
            <option value="server_updated">Server Updated</option>
            <option value="server_deleted">Server Deleted</option>
            <option value="ssh_connected">SSH Connected</option>
            <option value="update_requested">Update Requested</option>
            <option value="user_created">User Created</option>
            <option value="user_deleted">User Deleted</option>
          </select>
          <select
            value={filters.limit}
            onChange={(e) => setFilters((f) => ({ ...f, limit: parseInt(e.target.value, 10) }))}
            className="input-field w-auto"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={500}>Last 500</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Server</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No activity logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                      {log.username || 'System'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`font-medium ${actionColors[log.action] || 'text-gray-600 dark:text-gray-300'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                      {log.details}
                    </td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400">
                      {log.server_hostname || '-'}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
