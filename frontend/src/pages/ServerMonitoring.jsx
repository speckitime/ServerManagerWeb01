import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '../services/api';
import { getSocket, subscribeToServer, unsubscribeFromServer } from '../services/socket';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function ServerMonitoring() {
  const { id } = useParams();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    subscribeToServer(id);

    const socket = getSocket();
    socket.on('server_metrics', (data) => {
      if (data.server_id === id) {
        setCurrent(data);
      }
    });

    return () => {
      unsubscribeFromServer(id);
      socket.off('server_metrics');
    };
  }, [id]);

  useEffect(() => {
    loadHistory();
  }, [period, id]);

  const loadData = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/metrics/current`);
      setCurrent(data);
    } catch (err) {
      console.error('Failed to load current metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/metrics/history`, { params: { period } });
      setHistory(data);
    } catch (err) {
      console.error('Failed to load metric history:', err);
    }
  };

  const chartOptions = (title, yMax = 100) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: title, color: '#9ca3af' },
    },
    scales: {
      x: {
        ticks: { color: '#6b7280', maxTicksLimit: 10 },
        grid: { color: 'rgba(107,114,128,0.1)' },
      },
      y: {
        min: 0,
        max: yMax,
        ticks: { color: '#6b7280' },
        grid: { color: 'rgba(107,114,128,0.1)' },
      },
    },
    interaction: { intersect: false, mode: 'index' },
  });

  const labels = history.map((m) =>
    new Date(m.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const cpuData = {
    labels,
    datasets: [{
      label: 'CPU %',
      data: history.map((m) => m.cpu_usage),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    }],
  };

  const ramData = {
    labels,
    datasets: [{
      label: 'RAM %',
      data: history.map((m) => m.ram_usage_percent),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    }],
  };

  const networkData = {
    labels,
    datasets: [
      {
        label: 'RX',
        data: history.map((m) => m.network_rx_bytes / 1024 / 1024),
        borderColor: '#8b5cf6',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'TX',
        data: history.map((m) => m.network_tx_bytes / 1024 / 1024),
        borderColor: '#f59e0b',
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const loadData2 = {
    labels,
    datasets: [
      {
        label: '1 min',
        data: history.map((m) => m.load_avg_1),
        borderColor: '#ef4444',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: '5 min',
        data: history.map((m) => m.load_avg_5),
        borderColor: '#f59e0b',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: '15 min',
        data: history.map((m) => m.load_avg_15),
        borderColor: '#10b981',
        tension: 0.3,
        pointRadius: 0,
      },
    ],
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
      <div className="flex items-center justify-end">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {['24h', '7d', '30d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Current metrics */}
      {current && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="CPU" value={`${current.cpu_usage?.toFixed(1)}%`} color={current.cpu_usage > 90 ? 'text-red-500' : 'text-primary-500'} />
          <MetricCard label="RAM" value={`${current.ram_usage_percent?.toFixed(1)}%`} color={current.ram_usage_percent > 90 ? 'text-red-500' : 'text-green-500'} />
          <MetricCard label="Uptime" value={formatUptime(current.uptime_seconds)} color="text-gray-700 dark:text-gray-200" />
          <MetricCard label="Processes" value={current.process_count} color="text-gray-700 dark:text-gray-200" />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="h-64">
            <Line data={cpuData} options={chartOptions('CPU Usage (%)')} />
          </div>
        </div>
        <div className="card p-4">
          <div className="h-64">
            <Line data={ramData} options={chartOptions('RAM Usage (%)')} />
          </div>
        </div>
        <div className="card p-4">
          <div className="h-64">
            <Line data={networkData} options={chartOptions('Network Traffic (MB)', undefined)} />
          </div>
        </div>
        <div className="card p-4">
          <div className="h-64">
            <Line data={loadData2} options={chartOptions('System Load Average', undefined)} />
          </div>
        </div>
      </div>

      {/* Top processes */}
      {current?.top_processes && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Top Processes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">CPU %</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RAM %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {(Array.isArray(current.top_processes) ? current.top_processes : []).map((proc, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3 text-gray-900 dark:text-white">{proc.pid}</td>
                    <td className="px-6 py-3 text-gray-900 dark:text-white">{proc.name}</td>
                    <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{proc.cpu?.toFixed(1)}</td>
                    <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{proc.memory?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disk partitions */}
      {current?.disk_partitions && (
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Disk Usage</h3>
          <div className="space-y-4">
            {(Array.isArray(current.disk_partitions) ? current.disk_partitions : []).map((disk, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 dark:text-gray-300">{disk.mountpoint} ({disk.device})</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {formatBytes(disk.used)} / {formatBytes(disk.total)} ({disk.percent?.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${disk.percent > 90 ? 'bg-red-500' : disk.percent > 70 ? 'bg-yellow-500' : 'bg-primary-500'}`}
                    style={{ width: `${disk.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
