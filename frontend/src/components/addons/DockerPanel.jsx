import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

function formatUptime(started) {
  if (!started) return 'N/A';
  const ms = Date.now() - new Date(started).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const STATUS_COLORS = {
  running: 'bg-green-500',
  exited: 'bg-gray-400',
  paused: 'bg-yellow-500',
  restarting: 'bg-blue-500',
  dead: 'bg-red-500',
  created: 'bg-gray-400',
};

export default function DockerPanel({ serverId, addon, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    checkStatus();
  }, [serverId, addon.id]);

  const checkStatus = async () => {
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'status'
      });
      setStatus(data);
    } catch (err) {
      setStatus({ error: err.response?.data?.error || 'Failed to get status' });
    } finally {
      setLoading(false);
    }
  };

  const containerAction = async (containerId, action) => {
    setActionLoading(`${containerId}-${action}`);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: `container-${action}`,
        container: containerId
      });
      toast.success(`Container ${action} executed`);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (status?.error) {
    return (
      <div className="text-center py-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{status.error}</p>
        <button
          onClick={checkStatus}
          className="mt-3 text-sm text-primary-500 hover:text-primary-600"
        >
          Retry
        </button>
      </div>
    );
  }

  const containers = status?.containers || [];
  const runningCount = containers.filter(c => c.state === 'running' || c.status?.includes('Up')).length;
  const stoppedCount = containers.filter(c => c.state === 'exited' || c.status?.includes('Exited')).length;

  const filteredContainers = containers.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'running') return c.state === 'running' || c.status?.includes('Up');
    if (filter === 'stopped') return c.state === 'exited' || c.status?.includes('Exited');
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Docker Status */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Docker</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {status?.running ? 'Running' : 'Not Available'}
              </p>
            </div>
          </div>
        </div>

        {/* Total Containers */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {containers.length} container{containers.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Running */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Running</p>
          <p className="font-semibold text-green-500">
            {runningCount}
          </p>
        </div>

        {/* Stopped */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stopped</p>
          <p className="font-semibold text-gray-500">
            {stoppedCount}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {['all', 'running', 'stopped'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === f
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${containers.length})`}
            {f === 'running' && ` (${runningCount})`}
            {f === 'stopped' && ` (${stoppedCount})`}
          </button>
        ))}
      </div>

      {/* Container List */}
      {filteredContainers.length > 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {filteredContainers.map((container) => {
            const isRunning = container.state === 'running' || container.status?.includes('Up');
            const containerName = (container.names?.[0] || container.name || container.id?.substring(0, 12)).replace(/^\//, '');

            return (
              <div key={container.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[container.state] || 'bg-gray-400'}`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {containerName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {container.image} • {container.status || container.state}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => containerAction(container.id, 'restart')}
                          disabled={actionLoading === `${container.id}-restart`}
                          className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors"
                          title="Restart"
                        >
                          {actionLoading === `${container.id}-restart` ? (
                            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-yellow-500 rounded-full" />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => containerAction(container.id, 'stop')}
                          disabled={actionLoading === `${container.id}-stop`}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Stop"
                        >
                          {actionLoading === `${container.id}-stop` ? (
                            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-red-500 rounded-full" />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                            </svg>
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => containerAction(container.id, 'start')}
                        disabled={actionLoading === `${container.id}-start`}
                        className="p-1.5 text-gray-400 hover:text-green-500 transition-colors"
                        title="Start"
                      >
                        {actionLoading === `${container.id}-start` ? (
                          <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-green-500 rounded-full" />
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <p className="text-sm text-gray-500">No {filter !== 'all' ? filter : ''} containers</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={checkStatus}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  );
}
