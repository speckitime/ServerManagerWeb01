import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function Fail2BanPanel({ serverId, addon, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedJail, setSelectedJail] = useState(null);
  const [showAddJail, setShowAddJail] = useState(false);
  const [showBanIp, setShowBanIp] = useState(false);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [availableJails, setAvailableJails] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [configData, setConfigData] = useState({ bantime: 600, findtime: 600, maxretry: 5 });
  const [newJail, setNewJail] = useState({ name: 'sshd', port: 'ssh', maxretry: 5, bantime: '10m', findtime: '10m' });
  const [banData, setBanData] = useState({ jail: '', ip: '' });
  const [newWhitelistIp, setNewWhitelistIp] = useState('');

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

  const installFail2Ban = async () => {
    setActionLoading('install');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'install'
      });
      toast.success('Fail2Ban installed successfully');
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

  const loadAvailableJails = async () => {
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'get-available-jails'
      });
      setAvailableJails(data.jails || []);
    } catch (err) {
      toast.error('Failed to load available jails');
    }
  };

  const loadWhitelist = async () => {
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'get-whitelist'
      });
      setWhitelist(data.whitelist || []);
    } catch (err) {
      toast.error('Failed to load whitelist');
    }
  };

  const loadConfig = async () => {
    try {
      const { data } = await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'get-config'
      });
      setConfigData(data);
    } catch (err) {
      toast.error('Failed to load config');
    }
  };

  const enableJail = async () => {
    setActionLoading('enable-jail');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'enable-jail',
        jailName: newJail.name,
        port: newJail.port,
        maxretry: newJail.maxretry,
        bantime: newJail.bantime,
        findtime: newJail.findtime
      });
      toast.success(`Jail "${newJail.name}" enabled`);
      setShowAddJail(false);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enable jail');
    } finally {
      setActionLoading(null);
    }
  };

  const disableJail = async (jailName) => {
    setActionLoading(`disable-${jailName}`);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'disable-jail',
        jailName
      });
      toast.success(`Jail "${jailName}" disabled`);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disable jail');
    } finally {
      setActionLoading(null);
    }
  };

  const banIp = async () => {
    if (!banData.jail || !banData.ip) return;
    setActionLoading('ban');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'ban',
        jail: banData.jail,
        ip: banData.ip
      });
      toast.success(`${banData.ip} banned in ${banData.jail}`);
      setShowBanIp(false);
      setBanData({ jail: '', ip: '' });
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ban IP');
    } finally {
      setActionLoading(null);
    }
  };

  const unbanIp = async (jail, ip) => {
    setActionLoading(`unban-${jail}-${ip}`);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'unban',
        jail,
        ip
      });
      toast.success(`${ip} unbanned from ${jail}`);
      await checkStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unban IP');
    } finally {
      setActionLoading(null);
    }
  };

  const addToWhitelist = async () => {
    if (!newWhitelistIp) return;
    setActionLoading('whitelist');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'whitelist',
        ip: newWhitelistIp
      });
      toast.success(`${newWhitelistIp} added to whitelist`);
      setNewWhitelistIp('');
      await loadWhitelist();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add to whitelist');
    } finally {
      setActionLoading(null);
    }
  };

  const removeFromWhitelist = async (ip) => {
    setActionLoading(`remove-${ip}`);
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'remove-whitelist',
        ip
      });
      toast.success(`${ip} removed from whitelist`);
      await loadWhitelist();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove from whitelist');
    } finally {
      setActionLoading(null);
    }
  };

  const saveConfig = async () => {
    setActionLoading('save-config');
    try {
      await api.post(`/servers/${serverId}/addons/${addon.id}/action`, {
        action: 'update-config',
        ...configData
      });
      toast.success('Configuration saved');
      setShowConfig(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save config');
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
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Fail2Ban not installed</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Install Fail2Ban to protect your server from brute-force attacks.
        </p>
        <button
          onClick={installFail2Ban}
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
              Install Fail2Ban
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

  const isRunning = status?.running;
  const jails = status?.jails || [];
  const totalBanned = jails.reduce((sum, j) => sum + (j.banned || j.currently_banned || 0), 0);
  const totalFailed = jails.reduce((sum, j) => sum + (j.failed || j.currently_failed || 0), 0);
  const activeJails = jails.filter(j => j.enabled !== false).length;
  const selectedJailData = selectedJail ? jails.find(j => j.name === selectedJail) : null;
  const bannedIPs = selectedJailData?.banned_ips || [];

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fail2Ban</p>
              <p className="font-semibold text-gray-900 dark:text-white">{isRunning ? 'Running' : 'Stopped'}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Jails</p>
          <p className="font-semibold text-gray-900 dark:text-white">{activeJails} active</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Banned</p>
          <p className="font-semibold text-red-500">{totalBanned} IP{totalBanned !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Failed</p>
          <p className="font-semibold text-yellow-500">{totalFailed} attempt{totalFailed !== 1 ? 's' : ''}</p>
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

        <button onClick={() => { loadAvailableJails(); setShowAddJail(true); }} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Jail
        </button>

        <button onClick={() => { setBanData({ jail: jails[0]?.name || '', ip: '' }); setShowBanIp(true); }} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Ban IP
        </button>

        <button onClick={() => { loadWhitelist(); setShowWhitelist(true); }} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Whitelist
        </button>

        <button onClick={() => { loadConfig(); setShowConfig(true); }} className="btn-secondary text-sm flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          </svg>
          Config
        </button>

        <button onClick={checkStatus} className="btn-secondary text-sm flex items-center gap-2 ml-auto">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Jails List */}
      {jails.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Configured Jails</h4>
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {jails.map((jail) => {
              const banned = jail.banned || jail.currently_banned || 0;
              const failed = jail.failed || jail.currently_failed || 0;
              const isSelected = selectedJail === jail.name;

              return (
                <div key={jail.name} className="p-3">
                  <button onClick={() => setSelectedJail(isSelected ? null : jail.name)} className="w-full text-left">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${jail.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{jail.name}</span>
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
                        <button
                          onClick={(e) => { e.stopPropagation(); disableJail(jail.name); }}
                          disabled={actionLoading === `disable-${jail.name}`}
                          className="text-red-500 hover:text-red-600 p-1"
                          title="Disable jail"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                        <svg className={`h-4 w-4 text-gray-400 transition-transform ${isSelected ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {isSelected && (
                    <div className="mt-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700">
                      {bannedIPs.length > 0 ? (
                        <div className="space-y-2">
                          {bannedIPs.map((ip) => (
                            <div key={ip} className="flex items-center justify-between py-1">
                              <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{ip}</span>
                              <button
                                onClick={() => unbanIp(jail.name, ip)}
                                disabled={actionLoading === `unban-${jail.name}-${ip}`}
                                className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                              >
                                {actionLoading === `unban-${jail.name}-${ip}` ? (
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
          <button onClick={() => { loadAvailableJails(); setShowAddJail(true); }} className="mt-2 text-sm text-primary-500 hover:text-primary-600">
            Add your first jail
          </button>
        </div>
      )}

      {/* Add Jail Modal */}
      {showAddJail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddJail(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Enable Jail</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jail Type</label>
                <select
                  className="input-field"
                  value={newJail.name}
                  onChange={(e) => setNewJail({ ...newJail, name: e.target.value })}
                >
                  {availableJails.length > 0 ? (
                    availableJails.map(j => <option key={j} value={j}>{j}</option>)
                  ) : (
                    <>
                      <option value="sshd">sshd (SSH)</option>
                      <option value="apache-auth">apache-auth</option>
                      <option value="nginx-http-auth">nginx-http-auth</option>
                      <option value="vsftpd">vsftpd (FTP)</option>
                      <option value="postfix">postfix (Mail)</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="ssh, 22, 80, etc."
                  value={newJail.port}
                  onChange={(e) => setNewJail({ ...newJail, port: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Retry</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newJail.maxretry}
                    onChange={(e) => setNewJail({ ...newJail, maxretry: parseInt(e.target.value) || 5 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ban Time</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="10m"
                    value={newJail.bantime}
                    onChange={(e) => setNewJail({ ...newJail, bantime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Find Time</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="10m"
                    value={newJail.findtime}
                    onChange={(e) => setNewJail({ ...newJail, findtime: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddJail(false)} className="btn-secondary">Cancel</button>
              <button onClick={enableJail} disabled={actionLoading === 'enable-jail'} className="btn-primary">
                {actionLoading === 'enable-jail' ? 'Enabling...' : 'Enable Jail'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban IP Modal */}
      {showBanIp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBanIp(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ban IP Address</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jail</label>
                <select
                  className="input-field"
                  value={banData.jail}
                  onChange={(e) => setBanData({ ...banData, jail: e.target.value })}
                >
                  {jails.map(j => <option key={j.name} value={j.name}>{j.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="192.168.1.100"
                  value={banData.ip}
                  onChange={(e) => setBanData({ ...banData, ip: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowBanIp(false)} className="btn-secondary">Cancel</button>
              <button onClick={banIp} disabled={!banData.ip || actionLoading === 'ban'} className="btn-danger">
                {actionLoading === 'ban' ? 'Banning...' : 'Ban IP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Whitelist Modal */}
      {showWhitelist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowWhitelist(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">IP Whitelist</h3>
            <p className="text-sm text-gray-500 mb-4">Whitelisted IPs are never banned by Fail2Ban.</p>

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {whitelist.map((ip) => (
                <div key={ip} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                  <span className="font-mono text-sm">{ip}</span>
                  <button
                    onClick={() => removeFromWhitelist(ip)}
                    disabled={actionLoading === `remove-${ip}`}
                    className="text-red-500 hover:text-red-600 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {whitelist.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-2">No IPs whitelisted</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder="Add IP (e.g., 192.168.1.0/24)"
                value={newWhitelistIp}
                onChange={(e) => setNewWhitelistIp(e.target.value)}
              />
              <button onClick={addToWhitelist} disabled={!newWhitelistIp || actionLoading === 'whitelist'} className="btn-primary">
                Add
              </button>
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setShowWhitelist(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConfig(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Default Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ban Time (seconds)</label>
                <input
                  type="number"
                  className="input-field"
                  value={configData.bantime}
                  onChange={(e) => setConfigData({ ...configData, bantime: parseInt(e.target.value) || 600 })}
                />
                <p className="text-xs text-gray-500 mt-1">How long an IP is banned (default: 600 = 10 min)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Find Time (seconds)</label>
                <input
                  type="number"
                  className="input-field"
                  value={configData.findtime}
                  onChange={(e) => setConfigData({ ...configData, findtime: parseInt(e.target.value) || 600 })}
                />
                <p className="text-xs text-gray-500 mt-1">Time window to count failures (default: 600)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Retry</label>
                <input
                  type="number"
                  className="input-field"
                  value={configData.maxretry}
                  onChange={(e) => setConfigData({ ...configData, maxretry: parseInt(e.target.value) || 5 })}
                />
                <p className="text-xs text-gray-500 mt-1">Failed attempts before ban (default: 5)</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowConfig(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveConfig} disabled={actionLoading === 'save-config'} className="btn-primary">
                {actionLoading === 'save-config' ? 'Saving...' : 'Save Config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
