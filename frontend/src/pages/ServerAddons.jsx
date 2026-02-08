import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// Import addon panels
import CloudflareTunnelPanel from '../components/addons/CloudflareTunnelPanel';
import WireGuardPanel from '../components/addons/WireGuardPanel';
import DockerPanel from '../components/addons/DockerPanel';
import Fail2BanPanel from '../components/addons/Fail2BanPanel';

const ADDON_PANELS = {
  'cloudflare-tunnel': CloudflareTunnelPanel,
  'wireguard': WireGuardPanel,
  'docker': DockerPanel,
  'fail2ban': Fail2BanPanel,
};

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
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadAddons();
  }, [id]);

  const loadAddons = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/addons`);
      setAddons(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error('Failed to load addons: ' + msg);
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

  // Separate enabled and available addons
  const enabledAddons = addons.filter(a => a.is_installed && a.server_enabled);
  const availableAddons = addons.filter(a => !a.is_installed || !a.server_enabled);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">
            Server Addons
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {enabledAddons.length === 0
              ? 'No addons enabled yet'
              : `${enabledAddons.length} addon${enabledAddons.length !== 1 ? 's' : ''} active`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Addon
        </button>
      </div>

      {/* Enabled Addons - Show Panels */}
      {enabledAddons.length > 0 ? (
        <div className="space-y-6">
          {enabledAddons.map((addon) => {
            const PanelComponent = ADDON_PANELS[addon.slug];
            return (
              <div key={addon.id} className="card overflow-hidden">
                {/* Addon Header */}
                <div className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-750 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{addon.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {addon.name}
                      </h3>
                      <p className="text-xs text-gray-500">v{addon.version}</p>
                    </div>
                    {addon.status && (
                      <span className={`ml-3 px-2.5 py-1 text-xs font-medium rounded-full ${
                        addon.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : addon.status === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {addon.status}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => disableAddon(addon)}
                    className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Disable
                  </button>
                </div>

                {/* Addon Panel Content */}
                <div className="p-5">
                  {PanelComponent ? (
                    <PanelComponent
                      serverId={id}
                      addon={addon}
                      onRefresh={loadAddons}
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No dedicated panel available for this addon</p>
                      <p className="text-sm mt-1">Use the actions below to interact with {addon.name}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="card p-12">
          <div className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center">
              <span className="text-3xl">🔌</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Addons Enabled
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Enable addons to extend server management with integrations like Cloudflare Tunnel, WireGuard, Docker, and more.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
            >
              Browse Available Addons
            </button>
          </div>
        </div>
      )}

      {/* Add Addon Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col animate-slideUp">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Available Addons
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Click on an addon to enable it on this server
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {availableAddons.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  All available addons are already enabled
                </div>
              ) : (
                <div className="grid gap-4">
                  {availableAddons.map((addon) => (
                    <button
                      key={addon.id}
                      onClick={() => {
                        enableAddon(addon);
                        setShowAddModal(false);
                      }}
                      className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-left group"
                    >
                      <span className="text-3xl">{addon.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {addon.name}
                          </h4>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded">
                            v{addon.version}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {addon.description}
                        </p>
                      </div>
                      <svg className="h-5 w-5 text-gray-300 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
