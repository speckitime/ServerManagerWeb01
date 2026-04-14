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
  const [showSetupServer, setShowSetupServer] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showClientConfig, setShowClientConfig] = useState(false);
  const [clientConfig, setClientConfig] = useState(null);
  const [serverSetup, setServerSetup] = useState({ address: '10.0.0.1/24', listenPort: 51820 });
  const [newClient, setNewClient] = useState({ clientName: '', clientIp: '10.0.0.2/32', dns: '1.1.1.1', generateQr: true });

  useEffect(() => {
    checkStatus();
  }, [serverId, addon.id]);

  const checkStatus = async () => {
    setLoading(true);
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

  const installWireGuard = async () => {
    setActionLoading('install');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'install'
      });
      toast.success('WireGuard installed successfully');
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Installation failed');
    } finally {
      setActionLoading(null);
    }
  };

  const executeAction = async (action) => {
    setActionLoading(action);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, { action });
      toast.success(`${action} executed`);
      await checkStatus();
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const setupServer = async () => {
    setActionLoading('setup-server');
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'setup-server',
        address: serverSetup.address,
        listenPort: serverSetup.listenPort
      });
      toast.success('WireGuard server configured');
      setShowSetupServer(false);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Setup failed');
    } finally {
      setActionLoading(null);
    }
  };

  const generateClientConfig = async () => {
    if (!newClient.clientName) {
      toast.error('Client name required');
      return;
    }
    setActionLoading('generate-client');
    try {
      const serverEndpoint = status?.interface?.address ? undefined : undefined;
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'generate-client-config',
        clientName: newClient.clientName,
        clientIp: newClient.clientIp,
        dns: newClient.dns,
        serverPort: status?.interface?.port || 51820,
        generateQr: newClient.generateQr
      });
      setClientConfig(data);
      setShowAddClient(false);
      setShowClientConfig(true);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate config');
    } finally {
      setActionLoading(null);
    }
  };

  const removePeer = async (publicKey) => {
    setActionLoading(`remove-${publicKey}`);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'remove-peer',
        publicKey
      });
      toast.success('Peer removed');
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove peer');
    } finally {
      setActionLoading(null);
    }
  };

  const copyConfig = () => {
    if (clientConfig?.config) {
      navigator.clipboard.writeText(clientConfig.config);
      toast.success('Config copied to clipboard');
    }
  };

  const downloadConfig = () => {
    if (clientConfig?.config) {
      const blob = new Blob([clientConfig.config], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${newClient.clientName || 'client'}.conf`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Not installed
  if (!status?.installed && !status?.running) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">WireGuard not installed</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Install WireGuard to create a fast, modern VPN server.
        </p>
        <button
          onClick={installWireGuard}
          disabled={actionLoading === 'install'}
          className="btn-primary flex items-center gap-2 mx-auto"
        >
          {actionLoading === 'install' ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Installing...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Install WireGuard
            </>
          )}
        </button>
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
        <button onClick={checkStatus} className="mt-3 text-sm text-primary-500 hover:text-primary-600">Retry</button>
      </div>
    );
  }

  const isRunning = status?.running || status?.interface?.up;
  const interfaceName = addon.config?.interface || 'wg0';
  const peers = status?.peers || [];
  const interfaceInfo = status?.interface || {};
  const serverConfigured = interfaceInfo.address || interfaceInfo.port;

  // Calculate totals
  const totalRx = peers.reduce((sum, p) => sum + (p.rx || p.transfer_rx || 0), 0);
  const totalTx = peers.reduce((sum, p) => sum + (p.tx || p.transfer_tx || 0), 0);
  const activePeers = peers.filter(p => {
    const lastHandshake = p.latest_handshake || p.last_handshake;
    return lastHandshake && (Date.now() / 1000 - lastHandshake) < 180;
  }).length;

  return (
    <div className="space-y-6">
      {/* Server not configured hint */}
      {status?.installed && !serverConfigured && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-purple-800 dark:text-purple-200">WireGuard server not configured</p>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                Set up the server interface to start accepting VPN connections.
              </p>
              <button onClick={() => setShowSetupServer(true)} className="mt-2 btn-primary text-sm">
                Setup Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{interfaceName}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{isRunning ? 'Up' : 'Down'}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Peers</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            <span className="text-green-500">{activePeers}</span> / {peers.length}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Download</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(totalRx)}</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Upload</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(totalTx)}</p>
        </div>
      </div>

      {/* Server Info */}
      {serverConfigured && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Server Configuration</p>
              <p className="text-sm text-gray-900 dark:text-white">
                Address: <span className="font-mono">{interfaceInfo.address || 'Not set'}</span>
                {' | '}
                Port: <span className="font-mono">{interfaceInfo.port || 51820}</span>
              </p>
            </div>
            <button onClick={() => setShowSetupServer(true)} className="text-sm text-primary-500 hover:text-primary-600">
              Edit
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => executeAction(isRunning ? 'stop' : 'start')}
          disabled={actionLoading}
          className={`${isRunning ? 'btn-danger' : 'btn-primary'} text-sm flex items-center gap-2`}
        >
          {actionLoading === (isRunning ? 'stop' : 'start') ? (
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {isRunning ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              )}
            </svg>
          )}
          {isRunning ? 'Stop' : 'Start'}
        </button>

        {isRunning && (
          <button onClick={() => executeAction('restart')} disabled={actionLoading} className="btn-secondary text-sm flex items-center gap-2">
            {actionLoading === 'restart' ? (
              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            Restart
          </button>
        )}

        <button onClick={() => setShowAddClient(true)} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
          Add Client
        </button>

        <button onClick={() => setShowSetupServer(true)} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          </svg>
          Setup Server
        </button>

        <button onClick={checkStatus} className="btn-secondary text-sm flex items-center gap-2 ml-auto">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Peers List */}
      {peers.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Connected Peers</h4>
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
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{formatHandshake(lastHandshake)}</span>
                      <button
                        onClick={() => removePeer(peer.public_key)}
                        disabled={actionLoading === `remove-${peer.public_key}`}
                        className="text-red-500 hover:text-red-600 p-1"
                        title="Remove peer"
                      >
                        {actionLoading === `remove-${peer.public_key}` ? (
                          <div className="animate-spin h-4 w-4 border border-red-500 border-t-transparent rounded-full" />
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {peer.allowed_ips && <span>IP: {peer.allowed_ips}</span>}
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
          <button onClick={() => setShowAddClient(true)} className="mt-2 text-sm text-primary-500 hover:text-primary-600">
            Add your first client
          </button>
        </div>
      )}

      {/* Setup Server Modal */}
      {showSetupServer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSetupServer(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Setup WireGuard Server</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Server Address (CIDR)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="10.0.0.1/24"
                  value={serverSetup.address}
                  onChange={(e) => setServerSetup({ ...serverSetup, address: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">Internal VPN address for the server</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Listen Port</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="51820"
                  value={serverSetup.listenPort}
                  onChange={(e) => setServerSetup({ ...serverSetup, listenPort: parseInt(e.target.value) || 51820 })}
                />
                <p className="text-xs text-gray-500 mt-1">UDP port for WireGuard (default: 51820)</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSetupServer(false)} className="btn-secondary">Cancel</button>
              <button onClick={setupServer} disabled={actionLoading === 'setup-server'} className="btn-primary">
                {actionLoading === 'setup-server' ? 'Setting up...' : 'Setup Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddClient(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add VPN Client</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., laptop, phone, john-pc"
                  value={newClient.clientName}
                  onChange={(e) => setNewClient({ ...newClient, clientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client IP Address</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="10.0.0.2/32"
                  value={newClient.clientIp}
                  onChange={(e) => setNewClient({ ...newClient, clientIp: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">Must be within server's subnet</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DNS Servers</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="1.1.1.1, 8.8.8.8"
                  value={newClient.dns}
                  onChange={(e) => setNewClient({ ...newClient, dns: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newClient.generateQr}
                  onChange={(e) => setNewClient({ ...newClient, generateQr: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Generate QR code for mobile</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddClient(false)} className="btn-secondary">Cancel</button>
              <button onClick={generateClientConfig} disabled={!newClient.clientName || actionLoading === 'generate-client'} className="btn-primary">
                {actionLoading === 'generate-client' ? 'Generating...' : 'Generate Config'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Config Result Modal */}
      {showClientConfig && clientConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowClientConfig(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Client Configuration</h3>

            <p className="text-sm text-gray-500 mb-4">
              Copy this configuration to your WireGuard client or scan the QR code with the WireGuard mobile app.
            </p>

            <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-48 whitespace-pre">
              {clientConfig.config}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={copyConfig} className="btn-secondary text-sm flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                Copy
              </button>
              <button onClick={downloadConfig} className="btn-secondary text-sm flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download .conf
              </button>
            </div>

            {clientConfig.qrCode && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">QR Code (scan with WireGuard app)</p>
                <pre className="bg-white text-black p-2 rounded text-[8px] leading-none font-mono overflow-auto">
                  {clientConfig.qrCode}
                </pre>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowClientConfig(false)} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
