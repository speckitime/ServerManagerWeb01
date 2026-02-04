import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket, subscribeToServer } from '../services/socket';
import useAuthStore from '../store/authStore';

export default function ServerPackages() {
  const { id } = useParams();
  const [packages, setPackages] = useState([]);
  const [totalPkgs, setTotalPkgs] = useState(0);
  const [updatableCount, setUpdatableCount] = useState(0);
  const [search, setSearch] = useState('');
  const [showUpdatable, setShowUpdatable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updateHistory, setUpdateHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [updating, setUpdating] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadPackages();
    subscribeToServer(id);

    const socket = getSocket();
    socket.on('update_progress', (data) => {
      if (data.server_id === id) {
        toast(data.message || 'Update in progress...', { icon: 'i' });
      }
    });

    return () => {
      socket.off('update_progress');
    };
  }, [id]);

  useEffect(() => {
    loadPackages();
  }, [search, showUpdatable]);

  const loadPackages = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (showUpdatable) params.updatable = 'true';

      const { data } = await api.get(`/servers/${id}/packages`, { params });
      setPackages(data.packages);
      setTotalPkgs(data.total);
      setUpdatableCount(data.updatable_count);
    } catch (err) {
      console.error('Failed to load packages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/packages/updates/history`);
      setUpdateHistory(data);
      setShowHistory(true);
    } catch (err) {
      toast.error('Failed to load update history');
    }
  };

  const updateAll = async () => {
    if (!confirm('Install all available updates?')) return;
    setUpdating(true);
    try {
      await api.post(`/servers/${id}/packages/update`, { package_names: null });
      toast.success('Update request sent');
    } catch (err) {
      toast.error('Failed to send update request');
    } finally {
      setUpdating(false);
    }
  };

  const updatePackage = async (name) => {
    try {
      await api.post(`/servers/${id}/packages/update`, { package_names: [name] });
      toast.success(`Update request for ${name} sent`);
    } catch (err) {
      toast.error('Failed to send update request');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/servers/${id}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Packages</h1>
          {updatableCount > 0 && (
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
              {updatableCount} updates
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={loadHistory} className="btn-secondary text-sm">
            Update History
          </button>
          {user?.role !== 'readonly' && updatableCount > 0 && (
            <button onClick={updateAll} disabled={updating} className="btn-primary text-sm">
              {updating ? 'Updating...' : 'Update All'}
            </button>
          )}
        </div>
      </div>

      {/* Search and filter */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field flex-1 min-w-[200px]"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showUpdatable}
              onChange={(e) => setShowUpdatable(e.target.checked)}
              className="rounded text-primary-600"
            />
            Show updatable only
          </label>
        </div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {totalPkgs} packages installed, {updatableCount} updates available
        </p>
      </div>

      {/* Package table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Package</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Available Update</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {search ? 'No packages found matching your search' : 'No packages synced yet. Install the agent to sync packages.'}
                  </td>
                </tr>
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{pkg.name}</p>
                        {pkg.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{pkg.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 font-mono text-gray-600 dark:text-gray-300">{pkg.version}</td>
                    <td className="px-6 py-3">
                      {pkg.available_update ? (
                        <span className="font-mono text-orange-600 dark:text-orange-400">{pkg.available_update}</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">Up to date</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {pkg.available_update && user?.role !== 'readonly' && (
                        <button
                          onClick={() => updatePackage(pkg.name)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update history modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Update History</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                &times;
              </button>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {updateHistory.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">No update history</div>
              ) : (
                updateHistory.map((h) => (
                  <div key={h.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{h.package_name || 'All packages'}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {h.from_version && `${h.from_version} → `}{h.to_version || 'latest'}
                        </p>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={h.status} />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(h.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
