import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// Category icons
const CATEGORY_ICONS = {
  networking: '🌐',
  security: '🛡️',
  container: '🐳',
  monitoring: '📊',
  integration: '🔌',
};

export default function ServerAddons() {
  const { id } = useParams();
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAddon, setSelectedAddon] = useState(null);
  const [actionOutput, setActionOutput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configAddon, setConfigAddon] = useState(null);
  const [configValues, setConfigValues] = useState({});

  useEffect(() => {
    loadAddons();
  }, [id]);

  const loadAddons = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/addons`);
      setAddons(data);
    } catch (err) {
      toast.error('Failed to load addons');
    } finally {
      setLoading(false);
    }
  };

  const enableAddon = async (addon) => {
    try {
      await api.post(`/servers/${id}/addons/${addon.id}/enable`, {
        config: addon.default_config
      });
      toast.success(`${addon.name} enabled`);
      loadAddons();
    } catch (err) {
      toast.error('Failed to enable addon');
    }
  };

  const disableAddon = async (addon) => {
    if (!confirm(`Disable ${addon.name}?`)) return;
    try {
      await api.post(`/servers/${id}/addons/${addon.id}/disable`);
      toast.success(`${addon.name} disabled`);
      loadAddons();
    } catch (err) {
      toast.error('Failed to disable addon');
    }
  };

  const checkStatus = async (addon) => {
    try {
      const { data } = await api.get(`/servers/${id}/addons/${addon.id}/status`);
      // Update local state
      setAddons(prev => prev.map(a =>
        a.id === addon.id
          ? { ...a, status: data.status, status_message: data.status_message }
          : a
      ));
      toast.success(`Status: ${data.status_message}`);
    } catch (err) {
      toast.error('Failed to check status: ' + (err.response?.data?.error || err.message));
    }
  };

  const executeAction = async (addon, action, params = {}) => {
    setExecuting(true);
    setSelectedAddon(addon);
    try {
      const { data } = await api.post(`/servers/${id}/addons/${addon.id}/action`, {
        action,
        params
      });
      setActionOutput(data.output || '(no output)');
    } catch (err) {
      setActionOutput(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const openConfigModal = (addon) => {
    setConfigAddon(addon);
    setConfigValues(addon.server_config || addon.default_config || {});
    setShowConfigModal(true);
  };

  const saveConfig = async () => {
    try {
      await api.patch(`/servers/${id}/addons/${configAddon.id}/config`, {
        config: configValues
      });
      toast.success('Configuration saved');
      setShowConfigModal(false);
      loadAddons();
    } catch (err) {
      toast.error('Failed to save configuration');
    }
  };

  // Group addons by category
  const addonsByCategory = addons.reduce((acc, addon) => {
    const cat = addon.category || 'integration';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(addon);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">
          Server Addons
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Enable and manage integrations for this server
        </p>
      </div>

      {/* Addon Grid */}
      <div className="space-y-8">
        {Object.entries(addonsByCategory).map(([category, categoryAddons]) => (
          <div key={category}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-4">
              <span className="text-lg">{CATEGORY_ICONS[category] || '🔌'}</span>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryAddons.map((addon) => (
                <div
                  key={addon.id}
                  className={`card p-5 transition-all duration-300 hover:shadow-lg ${
                    addon.is_installed && addon.server_enabled
                      ? 'border-l-4 border-l-green-500'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{addon.icon}</span>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {addon.name}
                        </h4>
                        <p className="text-xs text-gray-500">v{addon.version}</p>
                      </div>
                    </div>
                    {addon.is_installed && addon.server_enabled && (
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        addon.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : addon.status === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {addon.status || 'unknown'}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {addon.description}
                  </p>

                  {addon.status_message && addon.is_installed && (
                    <p className="text-xs text-gray-500 mb-3 italic">
                      {addon.status_message}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {addon.is_installed && addon.server_enabled ? (
                      <>
                        <button
                          onClick={() => checkStatus(addon)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Check Status
                        </button>
                        <button
                          onClick={() => openConfigModal(addon)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Configure
                        </button>
                        <button
                          onClick={() => setSelectedAddon(selectedAddon?.id === addon.id ? null : addon)}
                          className="btn-primary text-xs py-1 px-2"
                        >
                          {selectedAddon?.id === addon.id ? 'Hide Actions' : 'Actions'}
                        </button>
                        <button
                          onClick={() => disableAddon(addon)}
                          className="text-xs text-red-500 hover:text-red-700 px-2"
                        >
                          Disable
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => enableAddon(addon)}
                        className="btn-primary text-xs py-1 px-3"
                      >
                        Enable
                      </button>
                    )}
                  </div>

                  {/* Action Panel */}
                  {selectedAddon?.id === addon.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <AddonActions
                        addon={addon}
                        onAction={(action, params) => executeAction(addon, action, params)}
                        executing={executing}
                      />
                      {actionOutput && (
                        <div className="mt-3 p-3 bg-gray-900 rounded-lg overflow-auto max-h-48">
                          <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                            {actionOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {addons.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-2xl">🔌</span>
          </div>
          <p className="text-gray-500">No addons available</p>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && configAddon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 animate-slideUp">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>{configAddon.icon}</span>
                Configure {configAddon.name}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {Object.entries(configValues).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                    {key.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={value || ''}
                    onChange={(e) => setConfigValues({ ...configValues, [key]: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowConfigModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={saveConfig} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Addon-specific actions component
function AddonActions({ addon, onAction, executing }) {
  const [containerName, setContainerName] = useState('');
  const [jailName, setJailName] = useState('');

  switch (addon.slug) {
    case 'cloudflare-tunnel':
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAction('status')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            Service Status
          </button>
          <button
            onClick={() => onAction('list-tunnels')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            List Tunnels
          </button>
          <button
            onClick={() => onAction('restart')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            Restart Service
          </button>
        </div>
      );

    case 'wireguard':
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAction('show')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            Show Status
          </button>
          <button
            onClick={() => onAction('list-peers')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            List Peers
          </button>
          <button
            onClick={() => onAction('transfer-stats')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            Transfer Stats
          </button>
          <button
            onClick={() => onAction('show-config')}
            disabled={executing}
            className="btn-secondary text-xs py-1 px-2"
          >
            Show Config
          </button>
        </div>
      );

    case 'docker':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAction('ps')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              Running Containers
            </button>
            <button
              onClick={() => onAction('ps-all')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              All Containers
            </button>
            <button
              onClick={() => onAction('images')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              Images
            </button>
            <button
              onClick={() => onAction('stats')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              Stats
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Container name"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              className="input-field text-xs py-1 flex-1"
            />
            <button
              onClick={() => onAction('start', { container: containerName })}
              disabled={executing || !containerName}
              className="btn-secondary text-xs py-1 px-2"
            >
              Start
            </button>
            <button
              onClick={() => onAction('stop', { container: containerName })}
              disabled={executing || !containerName}
              className="btn-secondary text-xs py-1 px-2"
            >
              Stop
            </button>
            <button
              onClick={() => onAction('logs', { container: containerName, lines: 50 })}
              disabled={executing || !containerName}
              className="btn-secondary text-xs py-1 px-2"
            >
              Logs
            </button>
          </div>
        </div>
      );

    case 'fail2ban':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAction('status')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              Status
            </button>
            <button
              onClick={() => onAction('banned-ips')}
              disabled={executing}
              className="btn-secondary text-xs py-1 px-2"
            >
              All Banned IPs
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Jail name (e.g., sshd)"
              value={jailName}
              onChange={(e) => setJailName(e.target.value)}
              className="input-field text-xs py-1 flex-1"
            />
            <button
              onClick={() => onAction('jail-status', { jail: jailName })}
              disabled={executing || !jailName}
              className="btn-secondary text-xs py-1 px-2"
            >
              Jail Status
            </button>
          </div>
        </div>
      );

    default:
      return (
        <p className="text-sm text-gray-500">No actions available for this addon</p>
      );
  }
}
