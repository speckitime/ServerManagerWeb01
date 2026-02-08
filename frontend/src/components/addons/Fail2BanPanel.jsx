import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function Fail2BanPanel({ serverId, addon, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedJail, setSelectedJail] = useState(null);

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

  const unbanIP = async (jail, ip) => {
    const key = `${jail}-${ip}`;
    setActionLoading(key);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'unban',
        jail,
        ip
      });
      toast.success(`Unbanned ${ip} from ${jail}`);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unban IP');
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

  const isRunning = status?.running;
  const jails = status?.jails || [];
  const totalBanned = jails.reduce((sum, j) => sum + (j.banned || j.currently_banned || 0), 0);
  const totalFailed = jails.reduce((sum, j) => sum + (j.failed || j.currently_failed || 0), 0);
  const activeJails = jails.filter(j => j.enabled !== false).length;

  // Get banned IPs for selected jail
  const selectedJailData = selectedJail ? jails.find(j => j.name === selectedJail) : null;
  const bannedIPs = selectedJailData?.banned_ips || [];

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Service Status */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fail2Ban</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Jails */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Jails</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {activeJails} active
          </p>
        </div>

        {/* Banned IPs */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Banned</p>
          <p className="font-semibold text-red-500">
            {totalBanned} IP{totalBanned !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Failed Attempts */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Failed</p>
          <p className="font-semibold text-yellow-500">
            {totalFailed} attempt{totalFailed !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Jails List */}
      {jails.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Configured Jails
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {jails.map((jail) => {
              const banned = jail.banned || jail.currently_banned || 0;
              const failed = jail.failed || jail.currently_failed || 0;
              const isSelected = selectedJail === jail.name;

              return (
                <div key={jail.name} className="p-3">
                  <button
                    onClick={() => setSelectedJail(isSelected ? null : jail.name)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${jail.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {jail.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        {banned > 0 && (
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                            {banned} banned
                          </span>
                        )}
                        {failed > 0 && (
                          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded">
                            {failed} failed
                          </span>
                        )}
                        <svg
                          className={`h-4 w-4 text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Banned IPs Dropdown */}
                  {isSelected && (
                    <div className="mt-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700">
                      {bannedIPs.length > 0 ? (
                        <div className="space-y-2">
                          {bannedIPs.map((ip) => (
                            <div key={ip} className="flex items-center justify-between py-1">
                              <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                                {ip}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unbanIP(jail.name, ip);
                                }}
                                disabled={actionLoading === `${jail.name}-${ip}`}
                                className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                              >
                                {actionLoading === `${jail.name}-${ip}` ? (
                                  <div className="animate-spin h-3 w-3 border border-red-500 border-t-transparent rounded-full" />
                                ) : (
                                  <>
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Unban
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 py-2">No banned IPs in this jail</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {jails.length === 0 && isRunning && (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <p className="text-sm text-gray-500">No jails configured</p>
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
