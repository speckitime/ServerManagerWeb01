import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatHandshake(timestamp) {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function WireGuardPanel({ serverId, addon, onRefresh }) {
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

  const isRunning = status?.running || status?.interface?.up;
  const interfaceName = addon.config?.interface || 'wg0';
  const peers = status?.peers || [];
  const interfaceInfo = status?.interface || {};

  // Calculate totals
  const totalRx = peers.reduce((sum, p) => sum + (p.rx || p.transfer_rx || 0), 0);
  const totalTx = peers.reduce((sum, p) => sum + (p.tx || p.transfer_tx || 0), 0);
  const activePeers = peers.filter(p => {
    const lastHandshake = p.latest_handshake || p.last_handshake;
    return lastHandshake && (Date.now() / 1000 - lastHandshake) < 180;
  }).length;

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Interface Status */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{interfaceName}</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {isRunning ? 'Up' : 'Down'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Peers */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Peers</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            <span className="text-green-500">{activePeers}</span> / {peers.length}
          </p>
        </div>

        {/* Download */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Download</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatBytes(totalRx)}
          </p>
        </div>

        {/* Upload */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Upload</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatBytes(totalTx)}
          </p>
        </div>
      </div>

      {/* Peers List */}
      {peers.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Connected Peers
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {peers.map((peer, idx) => {
              const lastHandshake = peer.latest_handshake || peer.last_handshake;
              const isActive = lastHandshake && (Date.now() / 1000 - lastHandshake) < 180;

              return (
                <div key={idx} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <span className="font-mono text-sm text-gray-900 dark:text-white truncate max-w-[200px]">
                        {peer.name || peer.public_key?.substring(0, 12) + '...'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatHandshake(lastHandshake)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {peer.allowed_ips && (
                      <span>IP: {peer.allowed_ips}</span>
                    )}
                    <span>↓ {formatBytes(peer.rx || peer.transfer_rx || 0)}</span>
                    <span>↑ {formatBytes(peer.tx || peer.transfer_tx || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {peers.length === 0 && isRunning && (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <p className="text-sm text-gray-500">No peers configured</p>
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
