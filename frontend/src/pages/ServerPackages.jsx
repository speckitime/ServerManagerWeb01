import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket, subscribeToServer } from '../services/socket';
import useAuthStore from '../store/authStore';

// ---------------------------------------------------------------------------
// Inline keyframe styles injected once
// ---------------------------------------------------------------------------
const STYLE_ID = 'server-packages-animations';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes sp-fadeInUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes sp-slideDown {
      from { opacity: 0; max-height: 0; }
      to   { opacity: 1; max-height: 600px; }
    }
    @keyframes sp-progressStripe {
      0%   { background-position: 1rem 0; }
      100% { background-position: 0 0; }
    }
    @keyframes sp-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: .55; }
    }
    @keyframes sp-scaleIn {
      from { opacity: 0; transform: scale(.92); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes sp-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes sp-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .sp-fade-in-up  { animation: sp-fadeInUp .35s ease-out both; }
    .sp-slide-down  { animation: sp-slideDown .4s ease-out both; overflow: hidden; }
    .sp-scale-in    { animation: sp-scaleIn .25s ease-out both; }
    .sp-pulse       { animation: sp-pulse 1.8s ease-in-out infinite; }
    .sp-spin        { animation: sp-spin .7s linear infinite; }
    .sp-progress-bar {
      background-image: linear-gradient(
        45deg,
        rgba(255,255,255,.15) 25%, transparent 25%,
        transparent 50%, rgba(255,255,255,.15) 50%,
        rgba(255,255,255,.15) 75%, transparent 75%,
        transparent
      );
      background-size: 1rem 1rem;
      animation: sp-progressStripe .6s linear infinite;
    }
    .sp-shimmer {
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.08) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: sp-shimmer 1.8s infinite;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SVG icon helpers (inline so we avoid extra dependencies)
// ---------------------------------------------------------------------------
const Icon = {
  Package: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  ),
  ArrowUp: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
    </svg>
  ),
  Clock: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Refresh: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
    </svg>
  ),
  Search: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  X: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  ),
  Check: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  AlertTriangle: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  ),
  History: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
    </svg>
  ),
  Terminal: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  ChevronDown: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Shield: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ServerPackages() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);

  // Data state
  const [packages, setPackages] = useState([]);
  const [totalPkgs, setTotalPkgs] = useState(0);
  const [updatableCount, setUpdatableCount] = useState(0);
  const [lastSynced, setLastSynced] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Search / filter
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [showUpdatable, setShowUpdatable] = useState(false);

  // Update progress (real-time)
  const [updateProgress, setUpdateProgress] = useState(null); // { message, status, progress, output }
  const outputRef = useRef(null);

  // Individual package loading
  const [updatingPkgs, setUpdatingPkgs] = useState(new Set());

  // Modals
  const [showHistory, setShowHistory] = useState(false);
  const [updateHistory, setUpdateHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showConfirmAll, setShowConfirmAll] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);

  // Row animation stagger
  const [rowsVisible, setRowsVisible] = useState(false);

  // Inject CSS once
  useEffect(() => { injectStyles(); }, []);

  // ---------------------------------------------------------------------------
  // Socket subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    subscribeToServer(id);
    const socket = getSocket();

    const handleProgress = (data) => {
      if (data.server_id !== id) return;

      setUpdateProgress((prev) => {
        const prevOutput = prev?.output || '';
        const newChunk = data.output || '';
        const combinedOutput = newChunk ? prevOutput + newChunk : prevOutput;
        return {
          message: data.message || prev?.message || 'Update in progress...',
          status: data.status || 'running',
          progress: data.progress ?? prev?.progress ?? 0,
          output: combinedOutput,
        };
      });

      if (data.status === 'completed') {
        toast.success(data.message || 'Update completed successfully');
        // Reload packages after a short delay to let the backend settle
        setTimeout(() => {
          loadPackages();
          setUpdatingPkgs(new Set());
          setUpdatingAll(false);
        }, 1500);
      } else if (data.status === 'failed') {
        toast.error(data.message || 'Update failed');
        setUpdatingPkgs(new Set());
        setUpdatingAll(false);
      }
    };

    socket.on('update_progress', handleProgress);

    return () => {
      socket.off('update_progress', handleProgress);
    };
  }, [id]);

  // Auto-scroll output panel
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [updateProgress?.output]);

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------
  const loadPackages = useCallback(async (opts = {}) => {
    try {
      if (opts.showSync) setSyncing(true);
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (showUpdatable) params.updatable = 'true';

      const { data } = await api.get(`/servers/${id}/packages`, { params });
      setPackages(data.packages || []);
      setTotalPkgs(data.total || 0);
      setUpdatableCount(data.updatable_count || 0);
      setLastSynced(new Date());

      // Trigger row animation
      setRowsVisible(false);
      requestAnimationFrame(() => setRowsVisible(true));
    } catch (err) {
      console.error('Failed to load packages:', err);
      if (opts.showSync) toast.error('Failed to sync packages');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [id, debouncedSearch, showUpdatable]);

  // Initial load + socket
  useEffect(() => {
    setLoading(true);
    loadPackages();
  }, [loadPackages]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const { data } = await api.get(`/servers/${id}/packages/updates/history`);
      setUpdateHistory(data || []);
    } catch (err) {
      toast.error('Failed to load update history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const updateAll = async () => {
    setShowConfirmAll(false);
    setUpdatingAll(true);
    setUpdateProgress({ message: 'Starting full system update...', status: 'running', progress: 0, output: '' });
    try {
      await api.post(`/servers/${id}/packages/update`, { package_names: null });
      toast.success('Update request sent');
    } catch (err) {
      toast.error('Failed to send update request');
      setUpdatingAll(false);
      setUpdateProgress(null);
    }
  };

  const updatePackage = async (name) => {
    setUpdatingPkgs((prev) => new Set(prev).add(name));
    setUpdateProgress({ message: `Updating ${name}...`, status: 'running', progress: 0, output: '' });
    try {
      await api.post(`/servers/${id}/packages/update`, { package_names: [name] });
      toast.success(`Update request for ${name} sent`);
    } catch (err) {
      toast.error('Failed to send update request');
      setUpdatingPkgs((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setUpdateProgress(null);
    }
  };

  const handleSync = () => {
    loadPackages({ showSync: true });
  };

  const dismissProgress = () => {
    if (updateProgress?.status === 'completed' || updateProgress?.status === 'failed') {
      setUpdateProgress(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 dark:border-gray-700" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-transparent border-t-primary-500 sp-spin" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading packages...</p>
      </div>
    );
  }

  const isReadonly = user?.role === 'readonly';
  const isUpdateActive = updateProgress && (updateProgress.status === 'running' || updateProgress.status === 'pending');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Stats bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Icon.Package className="w-5 h-5" />}
          label="Total Packages"
          value={totalPkgs}
          color="primary"
        />
        <StatCard
          icon={<Icon.ArrowUp className="w-5 h-5" />}
          label="Updates Available"
          value={updatableCount}
          color={updatableCount > 0 ? 'orange' : 'green'}
          pulse={updatableCount > 0}
        />
        <StatCard
          icon={<Icon.Clock className="w-5 h-5" />}
          label="Last Synced"
          value={lastSynced ? formatRelativeTime(lastSynced) : 'Never'}
          color="gray"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Action bar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <Icon.Refresh className={`w-4 h-4 ${syncing ? 'sp-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Packages'}
          </button>
          <button
            onClick={loadHistory}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <Icon.History className="w-4 h-4" />
            Update History
          </button>
        </div>
        {!isReadonly && updatableCount > 0 && (
          <button
            onClick={() => setShowConfirmAll(true)}
            disabled={updatingAll || isUpdateActive}
            className="btn-primary text-sm inline-flex items-center gap-2 relative overflow-hidden"
          >
            {updatingAll ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full sp-spin" />
                Updating...
              </>
            ) : (
              <>
                <Icon.Shield className="w-4 h-4" />
                Update All ({updatableCount})
              </>
            )}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Real-time update progress panel                                    */}
      {/* ------------------------------------------------------------------ */}
      {updateProgress && (
        <div className="sp-slide-down">
          <UpdateProgressPanel
            progress={updateProgress}
            outputRef={outputRef}
            onDismiss={dismissProgress}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Search / filter bar                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search packages..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-10"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Icon.X className="w-4 h-4" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={showUpdatable}
              onChange={(e) => setShowUpdatable(e.target.checked)}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            Updatable only
          </label>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Package table                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/60 dark:to-gray-700/40">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Package</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Installed Version</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Available Update</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Icon.Package className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {debouncedSearch
                          ? `No packages found matching "${debouncedSearch}"`
                          : 'No packages synced yet. Install the agent to begin.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                packages.map((pkg, idx) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    index={idx}
                    visible={rowsVisible}
                    isReadonly={isReadonly}
                    isUpdating={updatingPkgs.has(pkg.name)}
                    isUpdateActive={isUpdateActive}
                    onUpdate={updatePackage}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {packages.length > 0 && (
          <div className="px-6 py-3 bg-gray-50/50 dark:bg-gray-700/20 border-t border-gray-100 dark:border-gray-700/40 text-xs text-gray-500 dark:text-gray-400">
            Showing {packages.length} of {totalPkgs} packages
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Confirm All Updates modal                                          */}
      {/* ------------------------------------------------------------------ */}
      {showConfirmAll && (
        <ModalBackdrop onClose={() => setShowConfirmAll(false)}>
          <div className="card w-full max-w-md sp-scale-in">
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
                <Icon.AlertTriangle className="w-7 h-7 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Confirm System Update
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                This will install all <span className="font-semibold text-orange-600 dark:text-orange-400">{updatableCount}</span> available updates on this server.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                The server may require a restart after the update completes.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-center">
              <button
                onClick={() => setShowConfirmAll(false)}
                className="btn-secondary text-sm min-w-[100px]"
              >
                Cancel
              </button>
              <button
                onClick={updateAll}
                className="btn-primary text-sm min-w-[100px] inline-flex items-center justify-center gap-2"
              >
                <Icon.Shield className="w-4 h-4" />
                Update All
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Update history modal                                               */}
      {/* ------------------------------------------------------------------ */}
      {showHistory && (
        <ModalBackdrop onClose={() => setShowHistory(false)}>
          <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col sp-scale-in">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                  <Icon.History className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Update History</h2>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Icon.X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="relative">
                    <div className="h-8 w-8 rounded-full border-4 border-gray-200 dark:border-gray-700" />
                    <div className="absolute inset-0 h-8 w-8 rounded-full border-4 border-transparent border-t-primary-500 sp-spin" />
                  </div>
                  <p className="text-sm text-gray-400">Loading history...</p>
                </div>
              ) : updateHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Icon.History className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400">No update history yet</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary-300 via-gray-200 to-gray-200 dark:from-primary-600 dark:via-gray-700 dark:to-gray-700" />

                  <div className="space-y-1">
                    {updateHistory.map((h, idx) => (
                      <HistoryTimelineItem key={h.id} item={h} index={idx} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card component
// ---------------------------------------------------------------------------
function StatCard({ icon, label, value, color, pulse }) {
  const colorMap = {
    primary: {
      bg: 'bg-primary-50 dark:bg-primary-900/20',
      icon: 'text-primary-600 dark:text-primary-400',
      ring: 'ring-primary-200 dark:ring-primary-800',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      icon: 'text-orange-600 dark:text-orange-400',
      ring: 'ring-orange-200 dark:ring-orange-800',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      icon: 'text-green-600 dark:text-green-400',
      ring: 'ring-green-200 dark:ring-green-800',
    },
    gray: {
      bg: 'bg-gray-50 dark:bg-gray-700/30',
      icon: 'text-gray-500 dark:text-gray-400',
      ring: 'ring-gray-200 dark:ring-gray-700',
    },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className="card p-4 sp-fade-in-up">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} ring-1 ${c.ring} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold text-gray-900 dark:text-white ${pulse ? 'sp-pulse' : ''}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update progress panel
// ---------------------------------------------------------------------------
function UpdateProgressPanel({ progress, outputRef, onDismiss }) {
  const { message, status, progress: pct, output } = progress;
  const percentage = Math.min(Math.max(pct || 0, 0), 100);
  const isFinished = status === 'completed' || status === 'failed';

  const statusConfig = {
    running: {
      gradient: 'from-blue-500 to-primary-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-300',
      label: 'Running',
      icon: <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full sp-spin" />,
    },
    pending: {
      gradient: 'from-yellow-400 to-orange-500',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-700 dark:text-yellow-300',
      label: 'Pending',
      icon: <Icon.Clock className="w-4 h-4 sp-pulse" />,
    },
    completed: {
      gradient: 'from-green-400 to-emerald-600',
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-700 dark:text-green-300',
      label: 'Completed',
      icon: <Icon.Check className="w-4 h-4" />,
    },
    failed: {
      gradient: 'from-red-400 to-red-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-300',
      label: 'Failed',
      icon: <Icon.X className="w-4 h-4" />,
    },
  };

  const cfg = statusConfig[status] || statusConfig.running;

  return (
    <div className={`card overflow-hidden border ${cfg.border}`}>
      {/* Header strip */}
      <div className={`${cfg.bg} px-5 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 ${cfg.text} font-medium text-sm`}>
            {cfg.icon}
            <span>{cfg.label}</span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-300">{message}</span>
        </div>
        <div className="flex items-center gap-3">
          {percentage > 0 && (
            <span className={`text-sm font-mono font-semibold ${cfg.text}`}>{Math.round(percentage)}%</span>
          )}
          {isFinished && (
            <button
              onClick={onDismiss}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Icon.X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full bg-gradient-to-r ${cfg.gradient} transition-all duration-500 ease-out ${status === 'running' ? 'sp-progress-bar' : ''}`}
          style={{ width: `${isFinished && status === 'completed' ? 100 : percentage}%` }}
        />
      </div>

      {/* Output console */}
      {output && (
        <div
          ref={outputRef}
          className="max-h-48 overflow-y-auto bg-gray-900 text-gray-200 px-5 py-3 font-mono text-xs leading-relaxed"
          style={{ scrollBehavior: 'smooth' }}
        >
          {output.split('\n').map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-600 select-none flex-shrink-0">{String(i + 1).padStart(3)}</span>
              <span className={
                line.toLowerCase().includes('error') ? 'text-red-400' :
                line.toLowerCase().includes('warning') ? 'text-yellow-400' :
                line.toLowerCase().includes('done') || line.toLowerCase().includes('complete') ? 'text-green-400' :
                ''
              }>
                {line || '\u00A0'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package row with staggered animation
// ---------------------------------------------------------------------------
function PackageRow({ pkg, index, visible, isReadonly, isUpdating, isUpdateActive, onUpdate }) {
  const staggerDelay = Math.min(index * 30, 600); // cap at 600ms

  return (
    <tr
      className="group hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors duration-150"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity .3s ease ${staggerDelay}ms, transform .3s ease ${staggerDelay}ms`,
      }}
    >
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pkg.available_update ? 'bg-orange-400' : 'bg-green-400'}`} />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{pkg.name}</p>
            {pkg.description && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs mt-0.5">{pkg.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-3.5">
        <code className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 font-mono">
          {pkg.version}
        </code>
      </td>
      <td className="px-6 py-3.5">
        {pkg.available_update ? (
          <div className="inline-flex items-center gap-1.5">
            <Icon.ArrowUp className="w-3.5 h-3.5 text-orange-500" />
            <code className="text-xs px-2 py-1 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-mono font-medium">
              {pkg.available_update}
            </code>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
            <Icon.Check className="w-3.5 h-3.5" />
            Up to date
          </span>
        )}
      </td>
      <td className="px-6 py-3.5 text-right">
        {pkg.available_update && !isReadonly && (
          <button
            onClick={() => onUpdate(pkg.name)}
            disabled={isUpdating || isUpdateActive}
            className={`
              inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200
              ${isUpdating
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-500 cursor-not-allowed'
                : 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed'
              }
            `}
          >
            {isUpdating ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-primary-300 border-t-primary-600 rounded-full sp-spin" />
                Updating...
              </>
            ) : (
              <>
                <Icon.ArrowUp className="w-3 h-3" />
                Update
              </>
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// History timeline item
// ---------------------------------------------------------------------------
function HistoryTimelineItem({ item, index }) {
  const staggerDelay = Math.min(index * 50, 500);

  const statusConfig = {
    pending: {
      dot: 'bg-yellow-400 ring-yellow-100 dark:ring-yellow-900/50',
      badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: <Icon.Clock className="w-3 h-3" />,
    },
    running: {
      dot: 'bg-blue-500 ring-blue-100 dark:ring-blue-900/50',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      icon: <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full sp-spin" />,
    },
    completed: {
      dot: 'bg-green-500 ring-green-100 dark:ring-green-900/50',
      badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      icon: <Icon.Check className="w-3 h-3" />,
    },
    failed: {
      dot: 'bg-red-500 ring-red-100 dark:ring-red-900/50',
      badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      icon: <Icon.X className="w-3 h-3" />,
    },
  };

  const cfg = statusConfig[item.status] || statusConfig.pending;

  return (
    <div
      className="relative pl-12 pb-6 last:pb-0 sp-fade-in-up"
      style={{ animationDelay: `${staggerDelay}ms` }}
    >
      {/* Timeline dot */}
      <div className={`absolute left-[14px] top-1 w-3 h-3 rounded-full ${cfg.dot} ring-4`} />

      <div className="card p-4 hover:shadow-md transition-shadow duration-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                {item.package_name || 'Full System Update'}
              </p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${cfg.badge}`}>
                {cfg.icon}
                {item.status}
              </span>
            </div>
            {(item.from_version || item.to_version) && (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
                {item.from_version && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{item.from_version}</span>}
                {item.from_version && item.to_version && (
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                )}
                {item.to_version && (
                  <span className="px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                    {item.to_version}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {formatDate(item.created_at)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {formatTime(item.created_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal backdrop
// ---------------------------------------------------------------------------
function ModalBackdrop({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelativeTime(date) {
  if (!date) return 'Never';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
