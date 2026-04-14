import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function CloudflareTunnelPanel({ serverId, addon, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showCreateTunnel, setShowCreateTunnel] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [showSetupConfig, setShowSetupConfig] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState('');
  const [tunnelName, setTunnelName] = useState('');
  const [newRoute, setNewRoute] = useState({ hostname: '', service: 'http://localhost:3000' });
  const [ingressRules, setIngressRules] = useState([{ hostname: '', service: '' }]);

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

  const installCloudflared = async () => {
    setActionLoading('install');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'install'
      });
      toast.success('Cloudflared installed successfully');
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
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const createTunnel = async () => {
    if (!tunnelName.trim()) return;
    setActionLoading('create-tunnel');
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'create-tunnel',
        tunnelName: tunnelName.trim()
      });
      toast.success(`Tunnel "${tunnelName}" created`);
      setShowCreateTunnel(false);
      setTunnelName('');
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create tunnel');
    } finally {
      setActionLoading(null);
    }
  };

  const setupConfig = async () => {
    const validRules = ingressRules.filter(r => r.hostname && r.service);
    if (validRules.length === 0) {
      toast.error('At least one ingress rule required');
      return;
    }
    const tunnelId = status?.tunnel?.id || status?.tunnels?.[0]?.id;
    if (!tunnelId) {
      toast.error('No tunnel found. Create a tunnel first.');
      return;
    }
    setActionLoading('setup-config');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'setup-config',
        tunnelId,
        ingress: validRules
      });
      toast.success('Configuration saved');
      setShowSetupConfig(false);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save config');
    } finally {
      setActionLoading(null);
    }
  };

  const addRoute = async () => {
    if (!newRoute.hostname || !newRoute.service) {
      toast.error('Hostname and service required');
      return;
    }
    const tunnelId = status?.tunnel?.id || status?.tunnels?.[0]?.id;
    if (!tunnelId) {
      toast.error('No tunnel found');
      return;
    }
    setActionLoading('add-route');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'add-route',
        tunnelId,
        hostname: newRoute.hostname
      });
      toast.success(`Route for ${newRoute.hostname} added`);
      setShowAddRoute(false);
      setNewRoute({ hostname: '', service: 'http://localhost:3000' });
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add route');
    } finally {
      setActionLoading(null);
    }
  };

  const loadLogs = async () => {
    setActionLoading('logs');
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'get-logs'
      });
      setLogs(data.logs || 'No logs available');
      setShowLogs(true);
    } catch (err) {
      toast.error('Failed to load logs');
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

  // Not installed
  if (!status?.installed && !status?.running) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Cloudflared not installed</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Install the Cloudflare Tunnel daemon to expose local services securely.
        </p>
        <button
          onClick={installCloudflared}
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
              Install Cloudflared
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

  const isRunning = status?.running || status?.status === 'running';
  const tunnelInfo = status?.tunnel;
  const tunnels = status?.tunnels || [];
  const ingress = status?.ingress || [];
  const hasTunnel = tunnels.length > 0;
  const needsAuth = status?.installed && !hasTunnel;

  return (
    <div className="space-y-6">
      {/* Authentication hint */}
      {needsAuth && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <div className="flex gap-3">
            <svg className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Cloudflare authentication required</p>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                Run <code className="bg-orange-100 dark:bg-orange-900/40 px-1 rounded">cloudflared tunnel login</code> on the server to connect your Cloudflare account, then create a tunnel.
              </p>
              <button
                onClick={() => setShowCreateTunnel(true)}
                className="mt-2 btn-primary text-sm"
              >
                Create Tunnel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Service</p>
              <p className="font-semibold text-gray-900 dark:text-white">{isRunning ? 'Running' : 'Stopped'}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tunnel</p>
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {tunnelInfo?.name || (hasTunnel ? tunnels[0]?.name : 'Not configured')}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Routes</p>
          <p className="font-semibold text-gray-900 dark:text-white">{ingress.length} configured</p>
        </div>
      </div>

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

        <button onClick={() => setShowCreateTunnel(true)} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Tunnel
        </button>

        {hasTunnel && (
          <>
            <button onClick={() => setShowSetupConfig(true)} className="btn-secondary text-sm flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              </svg>
              Configure Routes
            </button>
          </>
        )}

        <button onClick={loadLogs} disabled={actionLoading === 'logs'} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {actionLoading === 'logs' ? 'Loading...' : 'Logs'}
        </button>

        <button onClick={checkStatus} className="btn-secondary text-sm flex items-center gap-2 ml-auto">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tunnels List */}
      {tunnels.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tunnels</h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {tunnels.map((tunnel, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{tunnel.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{tunnel.id?.substring(0, 16)}...</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  tunnel.status === 'active' || isRunning
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {tunnel.status || (isRunning ? 'active' : 'inactive')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ingress Routes */}
      {ingress.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Ingress Routes</h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {ingress.map((route, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{route.hostname}</p>
                    <p className="text-xs text-gray-500">→ {route.service}</p>
                  </div>
                </div>
                <a href={`https://${route.hostname}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1">
                  Open ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Tunnel Modal */}
      {showCreateTunnel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateTunnel(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Create Tunnel</h3>
            <p className="text-sm text-gray-500 mb-4">
              Make sure you've run <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">cloudflared tunnel login</code> on the server first.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tunnel Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g., my-server-tunnel"
                value={tunnelName}
                onChange={(e) => setTunnelName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateTunnel(false)} className="btn-secondary">Cancel</button>
              <button onClick={createTunnel} disabled={!tunnelName.trim() || actionLoading === 'create-tunnel'} className="btn-primary">
                {actionLoading === 'create-tunnel' ? 'Creating...' : 'Create Tunnel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Routes Modal */}
      {showSetupConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSetupConfig(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Configure Ingress Routes</h3>
            <p className="text-sm text-gray-500 mb-4">
              Map public hostnames to internal services. These routes will be applied to your Cloudflare tunnel.
            </p>
            <div className="space-y-3">
              {ingressRules.map((rule, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      className="input-field text-sm"
                      placeholder="app.yourdomain.com"
                      value={rule.hostname}
                      onChange={(e) => {
                        const updated = [...ingressRules];
                        updated[idx].hostname = e.target.value;
                        setIngressRules(updated);
                      }}
                    />
                    <input
                      type="text"
                      className="input-field text-sm"
                      placeholder="http://localhost:3000"
                      value={rule.service}
                      onChange={(e) => {
                        const updated = [...ingressRules];
                        updated[idx].service = e.target.value;
                        setIngressRules(updated);
                      }}
                    />
                  </div>
                  {ingressRules.length > 1 && (
                    <button
                      onClick={() => setIngressRules(ingressRules.filter((_, i) => i !== idx))}
                      className="p-2 text-red-500 hover:text-red-600 mt-1"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setIngressRules([...ingressRules, { hostname: '', service: '' }])}
              className="mt-3 text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add route
            </button>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSetupConfig(false)} className="btn-secondary">Cancel</button>
              <button onClick={setupConfig} disabled={actionLoading === 'setup-config'} className="btn-primary">
                {actionLoading === 'setup-config' ? 'Saving...' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLogs(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cloudflared Logs</h3>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
              {logs}
            </pre>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLogs(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
