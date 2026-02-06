import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const CATEGORY_ICONS = {
  networking: '🌐',
  security: '🛡️',
  container: '🐳',
  monitoring: '📊',
  integration: '🔌',
};

export default function Addons() {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAddons();
  }, []);

  const loadAddons = async () => {
    try {
      const { data } = await api.get('/addons');
      setAddons(data);
    } catch (err) {
      toast.error('Failed to load addons');
    } finally {
      setLoading(false);
    }
  };

  const toggleAddon = async (addon) => {
    try {
      await api.patch(`/addons/${addon.id}/toggle`, {
        is_enabled: !addon.is_enabled
      });
      toast.success(`${addon.name} ${!addon.is_enabled ? 'enabled' : 'disabled'} globally`);
      loadAddons();
    } catch (err) {
      toast.error('Failed to toggle addon');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">
            Addon Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Enable or disable addons globally. Disabled addons won't be available on any server.
          </p>
        </div>
      </div>

      {/* Addon List */}
      <div className="space-y-8">
        {Object.entries(addonsByCategory).map(([category, categoryAddons]) => (
          <div key={category}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-4">
              <span className="text-lg">{CATEGORY_ICONS[category] || '🔌'}</span>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            <div className="card divide-y divide-gray-200 dark:divide-gray-700">
              {categoryAddons.map((addon) => (
                <div
                  key={addon.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{addon.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {addon.name}
                        </h4>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                          v{addon.version}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {addon.description}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        by {addon.author}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${
                      addon.is_enabled
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400'
                    }`}>
                      {addon.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      onClick={() => toggleAddon(addon)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        addon.is_enabled
                          ? 'bg-primary-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          addon.is_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {addons.length === 0 && (
        <div className="text-center py-12 card">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-2xl">🔌</span>
          </div>
          <p className="text-gray-500">No addons installed</p>
        </div>
      )}
    </div>
  );
}
