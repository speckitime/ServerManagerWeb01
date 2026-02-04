import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function ServerDetail() {
  const { id } = useParams();
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentKey, setAgentKey] = useState(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadServer();
  }, [id]);

  const loadServer = async () => {
    try {
      const { data } = await api.get(`/servers/${id}`);
      setServer(data);
    } catch (err) {
      toast.error('Failed to load server');
    } finally {
      setLoading(false);
    }
  };

  const showAgentKey = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/agent-key`);
      setAgentKey(data.agent_api_key);
    } catch (err) {
      toast.error('Failed to get agent key');
    }
  };

  const statusBadge = (status) => {
    const colors = {
      online: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      offline: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${colors[status] || colors.offline}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!server) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Server not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {statusBadge(server.status)}
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {server.os_type} {server.os_version}
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Server Details</h3>
          <dl className="space-y-3 text-sm">
            <DetailRow label="Hostname" value={server.hostname} />
            <DetailRow label="IP Address" value={server.ip_address} />
            <DetailRow label="OS Type" value={server.os_type} />
            <DetailRow label="OS Version" value={server.os_version || 'N/A'} />
            <DetailRow label="SSH Port" value={server.ssh_port} />
            <DetailRow label="RDP Port" value={server.rdp_port} />
            <DetailRow label="Agent Installed" value={server.agent_installed ? 'Yes' : 'No'} />
            <DetailRow label="Last Seen" value={server.last_seen ? new Date(server.last_seen).toLocaleString() : 'Never'} />
            <DetailRow label="Has SSH Credentials" value={server.has_ssh_credentials ? 'Yes' : 'No'} />
            <DetailRow label="Has SSH Key" value={server.has_ssh_key ? 'Yes' : 'No'} />
            <DetailRow label="Has RDP Credentials" value={server.has_rdp_credentials ? 'Yes' : 'No'} />
          </dl>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Metrics</h3>
          {server.latest_metrics ? (
            <dl className="space-y-3 text-sm">
              <DetailRow label="CPU Usage" value={`${server.latest_metrics.cpu_usage?.toFixed(1)}%`} />
              <DetailRow label="RAM Usage" value={`${server.latest_metrics.ram_usage_percent?.toFixed(1)}% (${formatBytes(server.latest_metrics.ram_used)} / ${formatBytes(server.latest_metrics.ram_total)})`} />
              <DetailRow label="Load Average" value={`${server.latest_metrics.load_avg_1} / ${server.latest_metrics.load_avg_5} / ${server.latest_metrics.load_avg_15}`} />
              <DetailRow label="Uptime" value={formatUptime(server.latest_metrics.uptime_seconds)} />
              <DetailRow label="Processes" value={server.latest_metrics.process_count} />
            </dl>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">No metrics available. Install the agent to start monitoring.</p>
          )}
        </div>

        {server.description && (
          <div className="card p-6 md:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
            <p className="text-gray-600 dark:text-gray-300">{server.description}</p>
          </div>
        )}

        {/* Additional IPs */}
        {server.additional_ips && server.additional_ips.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">IP Addresses</h3>
            <div className="space-y-2">
              {server.additional_ips.map((ip) => (
                <div key={ip.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-gray-900 dark:text-white">{ip.ip_address}</span>
                  <div className="flex items-center gap-2">
                    {ip.is_primary && (
                      <span className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                        Primary
                      </span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400">{ip.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agent setup */}
        {user?.role === 'admin' && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Agent Setup</h3>
            {agentKey ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Agent API Key:</p>
                <code className="block p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-mono break-all">
                  {agentKey}
                </code>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Use this key when installing the agent on the server.
                </p>
              </div>
            ) : (
              <button onClick={showAgentKey} className="btn-secondary text-sm">
                Show Agent API Key
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
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
