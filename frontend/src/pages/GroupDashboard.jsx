import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  ServerIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  CpuChipIcon,
  CircleStackIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

function StatCard({ title, value, icon: Icon, color = 'blue', subtitle }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, color = 'blue', label }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
  };

  const getColor = () => {
    if (value >= 90) return 'red';
    if (value >= 70) return 'yellow';
    return color;
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{value?.toFixed(1) || 0}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${colorClasses[getColor()]} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(value || 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ServerRow({ server }) {
  const getStatusColor = () => {
    if (server.status === 'online') return 'text-green-500';
    if (server.status === 'offline') return 'text-red-500';
    return 'text-gray-400';
  };

  const getStatusIcon = () => {
    if (server.status === 'online') return CheckCircleIcon;
    if (server.status === 'offline') return XCircleIcon;
    return SignalIcon;
  };

  const StatusIcon = getStatusIcon();

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <StatusIcon className={`h-5 w-5 ${getStatusColor()} mr-3`} />
          <div>
            <Link
              to={`/servers/${server.id}`}
              className="text-sm font-medium text-gray-900 hover:text-blue-600"
            >
              {server.name}
            </Link>
            <p className="text-xs text-gray-500">{server.hostname}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <ProgressBar value={server.cpu_usage} color="blue" label="" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <ProgressBar value={server.ram_usage} color="purple" label="" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <ProgressBar value={server.disk_usage} color="green" label="" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {server.uptime || 'N/A'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {server.activeAlerts > 0 ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {server.activeAlerts} alerts
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Healthy
          </span>
        )}
      </td>
    </tr>
  );
}

export default function GroupDashboard() {
  const { id } = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [id]);

  const fetchDashboard = async () => {
    try {
      const [dashboardRes, groupRes] = await Promise.all([
        api.get(`/groups/${id}/dashboard`),
        api.get(`/groups/${id}`),
      ]);
      setDashboard(dashboardRes.data);
      setGroup(groupRes.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const { summary, servers, alerts } = dashboard || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{group?.name} Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of all servers in this group
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Servers"
          value={summary?.total || 0}
          icon={ServerIcon}
          color="blue"
          subtitle={`${summary?.online || 0} online, ${summary?.offline || 0} offline`}
        />
        <StatCard
          title="Avg. CPU Usage"
          value={`${summary?.avgCpu?.toFixed(1) || 0}%`}
          icon={CpuChipIcon}
          color={summary?.avgCpu >= 80 ? 'red' : summary?.avgCpu >= 60 ? 'yellow' : 'green'}
        />
        <StatCard
          title="Avg. RAM Usage"
          value={`${summary?.avgRam?.toFixed(1) || 0}%`}
          icon={CircleStackIcon}
          color={summary?.avgRam >= 80 ? 'red' : summary?.avgRam >= 60 ? 'yellow' : 'purple'}
        />
        <StatCard
          title="Active Alerts"
          value={alerts?.length || 0}
          icon={ExclamationTriangleIcon}
          color={alerts?.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Server Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Servers</h2>
        </div>
        {servers?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Server
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RAM
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disk
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uptime
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {servers.map((server) => (
                  <ServerRow key={server.id} server={server} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            No servers in this group
          </div>
        )}
      </div>

      {/* Active Alerts */}
      {alerts?.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Active Alerts</h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {alerts.map((alert) => (
              <li key={alert.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <ExclamationTriangleIcon
                      className={`h-5 w-5 mr-3 ${
                        alert.severity === 'critical'
                          ? 'text-red-500'
                          : alert.severity === 'warning'
                          ? 'text-yellow-500'
                          : 'text-blue-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {alert.server_name}: {alert.metric} {alert.condition}{' '}
                        {alert.threshold}%
                      </p>
                      <p className="text-xs text-gray-500">
                        Current value: {alert.current_value?.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      alert.severity === 'critical'
                        ? 'bg-red-100 text-red-800'
                        : alert.severity === 'warning'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Avg Disk Usage Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Average Resource Usage
        </h2>
        <div className="space-y-4">
          <ProgressBar
            value={summary?.avgCpu}
            color="blue"
            label="CPU Usage"
          />
          <ProgressBar
            value={summary?.avgRam}
            color="purple"
            label="RAM Usage"
          />
          <ProgressBar
            value={summary?.avgDisk}
            color="green"
            label="Disk Usage"
          />
        </div>
      </div>
    </div>
  );
}
