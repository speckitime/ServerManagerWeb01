import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
import {
  CpuChipIcon,
  CircleStackIcon,
  SignalIcon,
  ServerStackIcon,
  FireIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function ServerMonitoring() {
  const { id } = useParams();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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

  const diskIOData = {
    labels,
    datasets: [
      {
        label: 'Read',
        data: history.map((m) => (m.disk_read_bytes || 0) / 1024 / 1024),
        borderColor: '#3b82f6',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Write',
        data: history.map((m) => (m.disk_write_bytes || 0) / 1024 / 1024),
        borderColor: '#ef4444',
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const iopsData = {
    labels,
    datasets: [
      {
        label: 'Read IOPS',
        data: history.map((m) => m.disk_read_iops || 0),
        borderColor: '#8b5cf6',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'Write IOPS',
        data: history.map((m) => m.disk_write_iops || 0),
        borderColor: '#f59e0b',
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const swapData = {
    labels,
    datasets: [{
      label: 'Swap %',
      data: history.map((m) => m.swap_usage_percent || 0),
      borderColor: '#ec4899',
      backgroundColor: 'rgba(236,72,153,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
    }],
  };

  const networkRateData = {
    labels,
    datasets: [
      {
        label: 'RX Rate',
        data: history.map((m) => (m.network_rx_rate || 0) / 1024 / 1024),
        borderColor: '#10b981',
        tension: 0.3,
        pointRadius: 0,
      },
      {
        label: 'TX Rate',
        data: history.map((m) => (m.network_tx_rate || 0) / 1024 / 1024),
        borderColor: '#f59e0b',
        tension: 0.3,
        pointRadius: 0,
      },
    ],
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: ServerStackIcon },
    { id: 'cpu', label: 'CPU', icon: CpuChipIcon },
    { id: 'memory', label: 'Memory', icon: CircleStackIcon },
    { id: 'network', label: 'Network', icon: SignalIcon },
    { id: 'disk', label: 'Disk I/O', icon: ServerStackIcon },
    { id: 'health', label: 'Health', icon: FireIcon },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs and Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
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

      {/* Current metrics - always shown */}
      {current && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard label="CPU" value={`${current.cpu_usage?.toFixed(1)}%`} color={current.cpu_usage > 90 ? 'text-red-500' : 'text-primary-500'} />
          <MetricCard label="RAM" value={`${current.ram_usage_percent?.toFixed(1)}%`} color={current.ram_usage_percent > 90 ? 'text-red-500' : 'text-green-500'} />
          <MetricCard label="Swap" value={`${current.swap_usage_percent?.toFixed(1) || 0}%`} color={current.swap_usage_percent > 80 ? 'text-red-500' : 'text-pink-500'} />
          <MetricCard label="Uptime" value={formatUptime(current.uptime_seconds)} color="text-gray-700 dark:text-gray-200" />
          <MetricCard label="Processes" value={current.process_count} color="text-gray-700 dark:text-gray-200" />
          <MetricCard label="CPU Freq" value={current.cpu_freq_current ? `${current.cpu_freq_current.toFixed(0)} MHz` : 'N/A'} color="text-gray-700 dark:text-gray-200" />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
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
        </>
      )}

      {/* CPU Tab */}
      {activeTab === 'cpu' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-4">
              <div className="h-64">
                <Line data={cpuData} options={chartOptions('CPU Usage (%)')} />
              </div>
            </div>
            <div className="card p-4">
              <div className="h-64">
                <Line data={loadData2} options={chartOptions('System Load Average', undefined)} />
              </div>
            </div>
          </div>

          {/* CPU Cores */}
          {current?.cpu_cores && Array.isArray(current.cpu_cores) && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">CPU Cores</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {current.cpu_cores.map((core, i) => (
                  <div key={i} className="text-center">
                    <div className="relative h-24 w-12 mx-auto bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                      <div
                        className={`absolute bottom-0 w-full transition-all duration-300 ${
                          core > 90 ? 'bg-red-500' : core > 70 ? 'bg-yellow-500' : 'bg-primary-500'
                        }`}
                        style={{ height: `${core}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Core {i}</p>
                    <p className="text-sm font-medium">{core?.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CPU Info */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">CPU Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Current Frequency</p>
                <p className="text-lg font-medium">{current?.cpu_freq_current?.toFixed(0) || 'N/A'} MHz</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Max Frequency</p>
                <p className="text-lg font-medium">{current?.cpu_freq_max?.toFixed(0) || 'N/A'} MHz</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Load (1m/5m/15m)</p>
                <p className="text-lg font-medium">
                  {current?.load_avg_1?.toFixed(2)} / {current?.load_avg_5?.toFixed(2)} / {current?.load_avg_15?.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Processes</p>
                <p className="text-lg font-medium">{current?.process_count || 'N/A'}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Memory Tab */}
      {activeTab === 'memory' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-4">
              <div className="h-64">
                <Line data={ramData} options={chartOptions('RAM Usage (%)')} />
              </div>
            </div>
            <div className="card p-4">
              <div className="h-64">
                <Line data={swapData} options={chartOptions('Swap Usage (%)')} />
              </div>
            </div>
          </div>

          {/* Memory Details */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Memory Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">RAM</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total</span>
                    <span className="font-medium">{formatBytes(current?.ram_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Used</span>
                    <span className="font-medium">{formatBytes(current?.ram_used)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Available</span>
                    <span className="font-medium">{formatBytes(current?.ram_available)}</span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full ${current?.ram_usage_percent > 90 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${current?.ram_usage_percent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Swap</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total</span>
                    <span className="font-medium">{formatBytes(current?.swap_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Used</span>
                    <span className="font-medium">{formatBytes(current?.swap_used)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Usage</span>
                    <span className="font-medium">{current?.swap_usage_percent?.toFixed(1) || 0}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full ${current?.swap_usage_percent > 80 ? 'bg-red-500' : 'bg-pink-500'}`}
                      style={{ width: `${current?.swap_usage_percent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Network Tab */}
      {activeTab === 'network' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-4">
              <div className="h-64">
                <Line data={networkData} options={chartOptions('Network Traffic (MB)', undefined)} />
              </div>
            </div>
            <div className="card p-4">
              <div className="h-64">
                <Line data={networkRateData} options={chartOptions('Network Rate (MB/s)', undefined)} />
              </div>
            </div>
          </div>

          {/* Network Interfaces */}
          {current?.network_interfaces && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Network Interfaces</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Interface</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RX Bytes</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">TX Bytes</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">RX Packets</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">TX Packets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.entries(current.network_interfaces || {}).map(([name, iface]) => (
                      <tr key={name}>
                        <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">{name}</td>
                        <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{formatBytes(iface.bytes_recv)}</td>
                        <td className="px-6 py-3 text-right text-gray-900 dark:text-white">{formatBytes(iface.bytes_sent)}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{iface.packets_recv?.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{iface.packets_sent?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Current Network Stats */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Current Network Stats</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Received</p>
                <p className="text-lg font-medium text-green-600">{formatBytes(current?.network_rx_bytes)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Sent</p>
                <p className="text-lg font-medium text-yellow-600">{formatBytes(current?.network_tx_bytes)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">RX Rate</p>
                <p className="text-lg font-medium">{formatBytes(current?.network_rx_rate)}/s</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">TX Rate</p>
                <p className="text-lg font-medium">{formatBytes(current?.network_tx_rate)}/s</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Disk I/O Tab */}
      {activeTab === 'disk' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-4">
              <div className="h-64">
                <Line data={diskIOData} options={chartOptions('Disk Throughput (MB/s)', undefined)} />
              </div>
            </div>
            <div className="card p-4">
              <div className="h-64">
                <Line data={iopsData} options={chartOptions('Disk IOPS', undefined)} />
              </div>
            </div>
          </div>

          {/* Disk partitions */}
          {current?.disk_partitions && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Disk Partitions</h3>
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

          {/* Disk I/O Stats */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Disk I/O Stats</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Read Throughput</p>
                <p className="text-lg font-medium text-blue-600">{formatBytes(current?.disk_read_bytes)}/s</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Write Throughput</p>
                <p className="text-lg font-medium text-red-600">{formatBytes(current?.disk_write_bytes)}/s</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Read IOPS</p>
                <p className="text-lg font-medium">{current?.disk_read_iops || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Write IOPS</p>
                <p className="text-lg font-medium">{current?.disk_write_iops || 0}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Health Tab */}
      {activeTab === 'health' && (
        <>
          {/* Temperatures */}
          {current?.temperatures && Object.keys(current.temperatures).length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FireIcon className="h-5 w-5 text-orange-500" />
                Temperature Sensors
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {Object.entries(current.temperatures).map(([name, temp]) => (
                  <div key={name} className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">{name}</p>
                    <p className={`text-2xl font-bold ${
                      temp > 80 ? 'text-red-500' : temp > 60 ? 'text-yellow-500' : 'text-green-500'
                    }`}>
                      {temp?.toFixed(1)}°C
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SMART Data */}
          {current?.disk_smart && Object.keys(current.disk_smart).length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <ServerStackIcon className="h-5 w-5 text-blue-500" />
                  S.M.A.R.T. Disk Health
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {Object.entries(current.disk_smart).map(([disk, smart]) => (
                    <div key={disk}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900 dark:text-white">{disk}</h4>
                        {smart.healthy !== undefined && (
                          <span className={`flex items-center gap-1 text-sm ${
                            smart.healthy ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {smart.healthy ? (
                              <><CheckCircleIcon className="h-4 w-4" /> Healthy</>
                            ) : (
                              <><ExclamationTriangleIcon className="h-4 w-4" /> Warning</>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        {smart.temperature && (
                          <div>
                            <span className="text-gray-500">Temperature</span>
                            <p className="font-medium">{smart.temperature}°C</p>
                          </div>
                        )}
                        {smart.power_on_hours !== undefined && (
                          <div>
                            <span className="text-gray-500">Power On Hours</span>
                            <p className="font-medium">{smart.power_on_hours?.toLocaleString()}</p>
                          </div>
                        )}
                        {smart.reallocated_sectors !== undefined && (
                          <div>
                            <span className="text-gray-500">Reallocated Sectors</span>
                            <p className={`font-medium ${smart.reallocated_sectors > 0 ? 'text-yellow-600' : ''}`}>
                              {smart.reallocated_sectors}
                            </p>
                          </div>
                        )}
                        {smart.pending_sectors !== undefined && (
                          <div>
                            <span className="text-gray-500">Pending Sectors</span>
                            <p className={`font-medium ${smart.pending_sectors > 0 ? 'text-yellow-600' : ''}`}>
                              {smart.pending_sectors}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* No health data available */}
          {(!current?.temperatures || Object.keys(current.temperatures).length === 0) &&
           (!current?.disk_smart || Object.keys(current.disk_smart).length === 0) && (
            <div className="card p-12 text-center">
              <FireIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Health Data Available</h3>
              <p className="text-gray-500">
                Temperature sensors and S.M.A.R.T. data are not available for this server.
                This may require additional configuration on the server.
              </p>
            </div>
          )}

          {/* System Health Summary */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">System Health Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <HealthIndicator
                label="CPU"
                value={current?.cpu_usage}
                thresholds={{ warning: 70, critical: 90 }}
              />
              <HealthIndicator
                label="Memory"
                value={current?.ram_usage_percent}
                thresholds={{ warning: 70, critical: 90 }}
              />
              <HealthIndicator
                label="Disk"
                value={current?.disk_usage_percent}
                thresholds={{ warning: 70, critical: 90 }}
              />
            </div>
          </div>
        </>
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

function HealthIndicator({ label, value, thresholds }) {
  const getStatus = () => {
    if (value == null) return 'unknown';
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'healthy';
  };

  const status = getStatus();

  const statusConfig = {
    healthy: { color: 'text-green-500', bg: 'bg-green-100', icon: CheckCircleIcon, label: 'Healthy' },
    warning: { color: 'text-yellow-500', bg: 'bg-yellow-100', icon: ExclamationTriangleIcon, label: 'Warning' },
    critical: { color: 'text-red-500', bg: 'bg-red-100', icon: ExclamationTriangleIcon, label: 'Critical' },
    unknown: { color: 'text-gray-400', bg: 'bg-gray-100', icon: SignalIcon, label: 'Unknown' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`${config.bg} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className={`text-xl font-bold ${config.color}`}>
            {value != null ? `${value.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
        <Icon className={`h-8 w-8 ${config.color}`} />
      </div>
      <p className={`text-xs mt-1 ${config.color}`}>{config.label}</p>
    </div>
  );
}
