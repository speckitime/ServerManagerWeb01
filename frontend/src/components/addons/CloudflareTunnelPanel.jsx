import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function CloudflareTunnelPanel({ serverId, addon, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

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

  const executeAction = async (action) => {
    setActionLoading(action);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, { action });
      toast.success(`${action} executed successfully`);
      await checkStatus();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action}`);
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

  const isRunning = status?.running || status?.status === 'running';
  const tunnelInfo = status?.tunnel || {};

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Service Status */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Service</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
        </div>

        {/* Tunnel Name */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tunnel</p>
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {tunnelInfo.name || addon.config?.tunnel_name || 'Not configured'}
          </p>
        </div>

        {/* Connection Status */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Connection</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {tunnelInfo.connectors || status?.connections || 0} connector(s)
          </p>
        </div>
      </div>

      {/* Routes/Ingress */}
      {(tunnelInfo.routes?.length > 0 || status?.ingress?.length > 0) && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Configured Routes
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {(tunnelInfo.routes || status?.ingress || []).map((route, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🌐</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {route.hostname || route.public}
                    </p>
                    <p className="text-xs text-gray-500">
                      → {route.service || route.origin || route.local}
                    </p>
                  </div>
                </div>
                {route.hostname && (
                  <a
                    href={`https://${route.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:text-primary-600 text-sm"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
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

        {isRunning ? (
          <button
            onClick={() => executeAction('restart')}
            disabled={actionLoading}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {actionLoading === 'restart' ? (
              <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-primary-500 rounded-full" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            )}
            Restart
          </button>
        ) : (
          <button
            onClick={() => executeAction('start')}
            disabled={actionLoading}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {actionLoading === 'start' ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            )}
            Start
          </button>
        )}
      </div>
    </div>
  );
}
