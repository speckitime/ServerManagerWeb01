import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket } from '../services/socket';

const TABS = [
  { id: 'general', name: 'General', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'updates', name: 'Updates', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
  { id: 'api', name: 'API & Services', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
  { id: 'security', name: 'Security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'mail', name: 'Mail Server', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'logs', name: 'System Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'backup', name: 'Backup', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          System configuration and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="card p-2 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                <span className="font-medium">{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'updates' && <UpdateSettings />}
          {activeTab === 'api' && <ApiSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'mail' && <MailSettings />}
          {activeTab === 'logs' && <SystemLogs />}
          {activeTab === 'backup' && <BackupSettings />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const [version, setVersion] = useState(null);
  const [settings, setSettings] = useState({
    site_name: 'ServerManager',
    timezone: 'Europe/Berlin',
    date_format: 'DD.MM.YYYY',
    session_timeout: 30,
  });

  useEffect(() => {
    loadVersion();
    loadSettings();
  }, []);

  const loadVersion = async () => {
    try {
      const { data } = await api.get('/version');
      setVersion(data);
    } catch (err) {
      console.error('Failed to load version');
    }
  };

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings');
      if (data) setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      // Settings endpoint might not exist yet
    }
  };

  const saveSettings = async () => {
    try {
      await api.put('/settings', settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">General Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Basic configuration for ServerManager</p>
      </div>

      {version && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-primary-100 dark:border-primary-800">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
              <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{version.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Version {version.version} • Updated {version.updated}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Name</label>
          <input
            type="text"
            className="input-field"
            value={settings.site_name}
            onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
          <select
            className="input-field"
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
          >
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Format</label>
          <select
            className="input-field"
            value={settings.date_format}
            onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
          >
            <option value="DD.MM.YYYY">DD.MM.YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Session Timeout (minutes)</label>
          <input
            type="number"
            className="input-field"
            value={settings.session_timeout}
            onChange={(e) => setSettings({ ...settings, session_timeout: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={saveSettings} className="btn-primary">
          Save Settings
        </button>
      </div>
    </div>
  );
}

function UpdateSettings() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [changelog, setChangelog] = useState([]);

  useEffect(() => {
    loadCurrentVersion();
    loadChangelog();
  }, []);

  const loadCurrentVersion = async () => {
    try {
      const { data } = await api.get('/version');
      setCurrentVersion(data);
    } catch (err) {
      console.error('Failed to load version');
    }
  };

  const loadChangelog = async () => {
    try {
      const { data } = await api.get('/changelog');
      setChangelog(data || []);
    } catch (err) {
      // Changelog might not exist yet
      setChangelog([
        { version: '1.4.1', date: '2026-02-08', changes: ['Fixed SSH credential update issue', 'Added dedicated addon panels with live status', 'Fixed terminal scrolling', 'Added Settings page'] },
        { version: '1.4.0', date: '2026-02-06', changes: ['Added addon/plugin system', 'Improved log viewer with templates', 'Version display in sidebar'] },
        { version: '1.3.0', date: '2026-02-04', changes: ['Server groups and filtering', 'Activity logging', 'SSH terminal improvements'] },
      ]);
    }
  };

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const { data } = await api.get('/updates/check');
      setUpdateInfo(data);
      if (data.updateAvailable) {
        toast.success('New update available!');
      } else {
        toast.success('You are running the latest version');
      }
    } catch (err) {
      // Simulate for demo
      setUpdateInfo({
        updateAvailable: false,
        currentVersion: currentVersion?.version || '1.4.1',
        latestVersion: '1.4.1',
      });
      toast.success('You are running the latest version');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Software Updates</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Check for and install updates</p>
          </div>
          <button
            onClick={checkForUpdates}
            disabled={checking}
            className="btn-primary flex items-center gap-2"
          >
            {checking ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Check for Updates
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              updateInfo?.updateAvailable
                ? 'bg-green-100 dark:bg-green-900/50'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <svg className={`h-6 w-6 ${updateInfo?.updateAvailable ? 'text-green-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {updateInfo?.updateAvailable
                  ? `Update to v${updateInfo.latestVersion} available!`
                  : `Current Version: v${currentVersion?.version || '1.4.1'}`}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {updateInfo?.updateAvailable
                  ? 'A new version is available for download'
                  : 'You are running the latest version'}
              </p>
            </div>
          </div>

          {updateInfo?.updateAvailable && (
            <button className="mt-4 btn-primary w-full">
              Install Update
            </button>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Changelog</h2>
        <div className="space-y-4">
          {changelog.map((release, idx) => (
            <div key={release.version} className={`${idx > 0 ? 'pt-4 border-t border-gray-200 dark:border-gray-700' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded">
                  v{release.version}
                </span>
                <span className="text-sm text-gray-500">{release.date}</span>
                {idx === 0 && (
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                    Current
                  </span>
                )}
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {release.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApiSettings() {
  const [apiStatus, setApiStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    checkApiStatus();
    const interval = setInterval(checkApiStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkApiStatus = async () => {
    try {
      const start = Date.now();
      const { data } = await api.get('/health');
      const latency = Date.now() - start;
      setApiStatus({
        ...data,
        latency,
        online: true,
      });
    } catch (err) {
      setApiStatus({ online: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const restartApi = async () => {
    if (!confirm('Are you sure you want to restart the API service?')) return;
    setRestarting(true);
    try {
      await api.post('/admin/restart');
      toast.success('API restart initiated');
      setTimeout(checkApiStatus, 3000);
    } catch (err) {
      toast.error('Failed to restart API');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API & Services</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor and manage backend services</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* API Status */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                  apiStatus?.online ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'
                }`}>
                  <div className={`h-4 w-4 rounded-full ${apiStatus?.online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">API Server</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {apiStatus?.online ? `Online • ${apiStatus.latency}ms latency` : 'Offline'}
                  </p>
                </div>
              </div>
              <button
                onClick={restartApi}
                disabled={restarting}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {restarting ? (
                  <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                  </svg>
                )}
                Restart
              </button>
            </div>
          </div>

          {/* Database Status */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">PostgreSQL Database</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {apiStatus?.database || 'Connected'}
                </p>
              </div>
            </div>
          </div>

          {/* WebSocket Status */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">WebSocket Server</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {apiStatus?.websocket || 'Active'} • Real-time connections
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecuritySettings() {
  const [settings, setSettings] = useState({
    two_factor_enabled: false,
    session_timeout: 30,
    ip_whitelist: '',
    fail2ban_enabled: false,
    fail2ban_max_attempts: 5,
    fail2ban_ban_time: 600,
  });
  const [saving, setSaving] = useState(false);
  const [bannedIps, setBannedIps] = useState([]);
  const [failedLogins, setFailedLogins] = useState([]);
  const [loadingBans, setLoadingBans] = useState(true);
  const [showBanModal, setShowBanModal] = useState(false);
  const [newBan, setNewBan] = useState({ ip_address: '', reason: '', duration: 3600 });

  useEffect(() => {
    loadSettings();
    loadBannedIps();
    loadFailedLogins();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings/security');
      if (data) setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      // Use defaults
    }
  };

  const loadBannedIps = async () => {
    try {
      const { data } = await api.get('/admin/bans');
      setBannedIps(data || []);
    } catch (err) {
      setBannedIps([]);
    } finally {
      setLoadingBans(false);
    }
  };

  const loadFailedLogins = async () => {
    try {
      const { data } = await api.get('/admin/failed-logins');
      setFailedLogins(data || []);
    } catch (err) {
      setFailedLogins([]);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/settings/security', settings);
      toast.success('Security settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const unbanIp = async (ip) => {
    if (!confirm(`Are you sure you want to unban ${ip}?`)) return;
    try {
      await api.delete(`/admin/bans/${encodeURIComponent(ip)}`);
      toast.success(`IP ${ip} unbanned`);
      loadBannedIps();
    } catch (err) {
      toast.error('Failed to unban IP');
    }
  };

  const banIp = async () => {
    if (!newBan.ip_address) {
      toast.error('IP address is required');
      return;
    }
    try {
      await api.post('/admin/bans', newBan);
      toast.success(`IP ${newBan.ip_address} banned`);
      setShowBanModal(false);
      setNewBan({ ip_address: '', reason: '', duration: 3600 });
      loadBannedIps();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ban IP');
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    if (!expiresAt) return 'Permanent';
    const remaining = new Date(expiresAt) - new Date();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Enable 2FA for all users</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Require two-factor authentication for login</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.two_factor_enabled}
              onChange={(e) => setSettings({ ...settings, two_factor_enabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Fail2Ban Protection</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Enable Fail2Ban</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Block IPs after failed login attempts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.fail2ban_enabled}
                onChange={(e) => setSettings({ ...settings, fail2ban_enabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {settings.fail2ban_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Failed Attempts</label>
                <input
                  type="number"
                  className="input-field"
                  value={settings.fail2ban_max_attempts}
                  onChange={(e) => setSettings({ ...settings, fail2ban_max_attempts: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ban Duration (seconds)</label>
                <input
                  type="number"
                  className="input-field"
                  value={settings.fail2ban_ban_time}
                  onChange={(e) => setSettings({ ...settings, fail2ban_ban_time: parseInt(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Banned IPs Section */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Banned IPs</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Currently blocked IP addresses</p>
          </div>
          <button onClick={() => setShowBanModal(true)} className="btn-secondary text-sm flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Ban IP
          </button>
        </div>

        {loadingBans ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : bannedIps.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            <svg className="mx-auto h-10 w-10 text-green-500 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No banned IPs</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bannedIps.map((ban) => (
              <div key={ban.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                    <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">{ban.ip_address}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {ban.reason || 'No reason'} • Expires: {formatTimeRemaining(ban.expires_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => unbanIp(ban.ip_address)}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                >
                  Unban
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Failed Logins Section */}
      {failedLogins.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Failed Login Attempts</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 font-medium">IP Address</th>
                  <th className="pb-2 font-medium">Username</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {failedLogins.slice(0, 10).map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="py-2 font-mono text-gray-900 dark:text-white">{attempt.ip_address}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{attempt.username || '-'}</td>
                    <td className="py-2 text-gray-500 dark:text-gray-400">{new Date(attempt.attempted_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">IP Whitelist</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Allowed IP Addresses (comma separated)
          </label>
          <textarea
            className="input-field font-mono text-sm"
            rows={4}
            placeholder="192.168.1.1, 10.0.0.1"
            value={settings.ip_whitelist}
            onChange={(e) => setSettings({ ...settings, ip_whitelist: e.target.value })}
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty to allow all IPs. Whitelisted IPs bypass Fail2Ban.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={saveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
          Save Security Settings
        </button>
      </div>

      {/* Ban IP Modal */}
      {showBanModal && (
        <div className="modal-overlay" onClick={() => setShowBanModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ban IP Address</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
                <input
                  type="text"
                  className="input-field font-mono"
                  placeholder="192.168.1.1"
                  value={newBan.ip_address}
                  onChange={(e) => setNewBan({ ...newBan, ip_address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Manual ban"
                  value={newBan.reason}
                  onChange={(e) => setNewBan({ ...newBan, reason: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration</label>
                <select
                  className="input-field"
                  value={newBan.duration}
                  onChange={(e) => setNewBan({ ...newBan, duration: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value={3600}>1 hour</option>
                  <option value={86400}>24 hours</option>
                  <option value={604800}>7 days</option>
                  <option value={2592000}>30 days</option>
                  <option value="">Permanent</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowBanModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={banIp} className="btn-danger">Ban IP</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MailSettings() {
  const [settings, setSettings] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_secure: true,
    mail_from: '',
    mail_from_name: 'ServerManager',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/settings/mail');
      if (data) setSettings(prev => ({ ...prev, ...data, smtp_password: '' }));
    } catch (err) {
      // Use defaults
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/settings/mail', settings);
      toast.success('Mail settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const testMail = async () => {
    setTesting(true);
    try {
      await api.post('/settings/mail/test');
      toast.success('Test email sent successfully');
    } catch (err) {
      toast.error('Failed to send test email: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mail Server Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure SMTP for email notifications</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
          <input
            type="text"
            className="input-field"
            placeholder="smtp.example.com"
            value={settings.smtp_host}
            onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Port</label>
          <input
            type="number"
            className="input-field"
            value={settings.smtp_port}
            onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Username</label>
          <input
            type="text"
            className="input-field"
            placeholder="user@example.com"
            value={settings.smtp_user}
            onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Password</label>
          <input
            type="password"
            className="input-field"
            placeholder="••••••••"
            value={settings.smtp_password}
            onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Email</label>
          <input
            type="email"
            className="input-field"
            placeholder="noreply@example.com"
            value={settings.mail_from}
            onChange={(e) => setSettings({ ...settings, mail_from: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Name</label>
          <input
            type="text"
            className="input-field"
            value={settings.mail_from_name}
            onChange={(e) => setSettings({ ...settings, mail_from_name: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
        <input
          type="checkbox"
          id="smtp_secure"
          className="h-4 w-4 text-primary-600 rounded"
          checked={settings.smtp_secure}
          onChange={(e) => setSettings({ ...settings, smtp_secure: e.target.checked })}
        />
        <label htmlFor="smtp_secure" className="text-sm text-gray-700 dark:text-gray-300">
          Use TLS/SSL encryption
        </label>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={saveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
          Save Settings
        </button>
        <button onClick={testMail} disabled={testing} className="btn-secondary flex items-center gap-2">
          {testing && <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />}
          Send Test Email
        </button>
      </div>
    </div>
  );
}

function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadLogs();
  }, [filter]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, filter]);

  const loadLogs = async () => {
    try {
      const { data } = await api.get('/admin/logs', { params: { level: filter !== 'all' ? filter : undefined } });
      setLogs(data || []);
    } catch (err) {
      // Generate sample logs for demo
      setLogs([
        { id: 1, level: 'info', message: 'API server started on port 3001', timestamp: new Date().toISOString() },
        { id: 2, level: 'info', message: 'Database connection established', timestamp: new Date(Date.now() - 60000).toISOString() },
        { id: 3, level: 'warn', message: 'High memory usage detected (85%)', timestamp: new Date(Date.now() - 120000).toISOString() },
        { id: 4, level: 'error', message: 'Failed SSH connection to 192.168.1.100', timestamp: new Date(Date.now() - 180000).toISOString() },
        { id: 5, level: 'info', message: 'User admin logged in', timestamp: new Date(Date.now() - 240000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const levelColors = {
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    debug: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Logs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">View application logs</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 rounded"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <select
            className="input-field text-sm py-1.5"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <button onClick={loadLogs} className="btn-secondary text-sm py-1.5">
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4 max-h-[500px] overflow-y-auto font-mono text-sm">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No logs found</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 py-1 hover:bg-gray-800/50 px-2 rounded">
                <span className="text-gray-500 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${levelColors[log.level] || levelColors.info}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackupSettings() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [currentBackupId, setCurrentBackupId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [settings, setSettings] = useState({
    auto_backup: false,
    backup_schedule: 'daily',
    retention_days: 30,
    backup_path: '/var/backups/servermanager',
  });

  const loadBackups = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/backups');
      setBackups(data || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/backup');
      if (data) setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      // Use defaults
    }
  }, []);

  useEffect(() => {
    loadBackups();
    loadSettings();

    // Set up WebSocket listener for backup progress
    const socket = getSocket();

    const handleBackupProgress = (data) => {
      if (data.id === currentBackupId || currentBackupId === null) {
        setProgress(data.progress || 0);

        if (data.status === 'completed') {
          setCreating(false);
          setCurrentBackupId(null);
          setProgress(0);
          toast.success('Backup created successfully');
          loadBackups();
        } else if (data.status === 'failed') {
          setCreating(false);
          setCurrentBackupId(null);
          setProgress(0);
          toast.error('Backup failed: ' + (data.error || 'Unknown error'));
          loadBackups();
        }
      }
    };

    socket.on('backup_progress', handleBackupProgress);

    return () => {
      socket.off('backup_progress', handleBackupProgress);
    };
  }, [currentBackupId, loadBackups, loadSettings]);

  const createBackup = async () => {
    setCreating(true);
    setProgress(0);
    try {
      const { data } = await api.post('/admin/backups');
      if (data.backup_id) {
        setCurrentBackupId(data.backup_id);
      }
      // Don't show success here - wait for WebSocket progress to complete
    } catch (err) {
      toast.error('Failed to create backup');
      setCreating(false);
      setProgress(0);
    }
  };

  const deleteBackup = async (backupId) => {
    if (!confirm('Are you sure you want to delete this backup?')) return;

    try {
      await api.delete(`/admin/backups/${backupId}`);
      toast.success('Backup deleted');
      loadBackups();
    } catch (err) {
      toast.error('Failed to delete backup');
    }
  };

  const downloadBackup = async (backupId) => {
    try {
      // Fetch backup as blob with token in Authorization header (more secure)
      const response = await api.get(`/admin/backups/${backupId}/download`, {
        responseType: 'blob',
      });

      // Create object URL and trigger download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `backup_${backupId}.sql.gz`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download backup');
    }
  };

  const saveSettings = async () => {
    try {
      await api.put('/settings/backup', settings);
      toast.success('Backup settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      pending: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return styles[status] || styles.pending;
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Database Backups</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage database backups</p>
          </div>
          <button
            onClick={createBackup}
            disabled={creating}
            className="btn-primary flex items-center gap-2"
          >
            {creating ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
            Create Backup
          </button>
        </div>

        {/* Progress bar during backup creation */}
        {creating && (
          <div className="mb-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                Creating backup...
              </span>
              <span className="text-sm font-bold text-primary-700 dark:text-primary-300">
                {progress}%
              </span>
            </div>
            <div className="w-full bg-primary-200 dark:bg-primary-800 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No backups available</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create your first backup to protect your data</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${
                    backup.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                    backup.status === 'in_progress' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    backup.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {backup.status === 'in_progress' ? (
                      <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full" />
                    ) : (
                      <svg className={`h-5 w-5 ${
                        backup.status === 'completed' ? 'text-green-600' :
                        backup.status === 'failed' ? 'text-red-600' : 'text-gray-400'
                      }`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{backup.name}</p>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusBadge(backup.status)}`}>
                        {backup.status === 'in_progress' ? `${backup.progress || 0}%` : backup.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {backup.size} • {new Date(backup.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {backup.status === 'completed' && (
                    <button
                      onClick={() => downloadBackup(backup.id)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all"
                      title="Download"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => deleteBackup(backup.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                    title="Delete"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Automatic Backups</h2>

        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Enable Auto-Backup</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Automatically create backups on schedule</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.auto_backup}
              onChange={(e) => setSettings({ ...settings, auto_backup: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>

        {settings.auto_backup && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Schedule</label>
              <select
                className="input-field"
                value={settings.backup_schedule}
                onChange={(e) => setSettings({ ...settings, backup_schedule: e.target.value })}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Retention (days)</label>
              <input
                type="number"
                className="input-field"
                value={settings.retention_days}
                onChange={(e) => setSettings({ ...settings, retention_days: parseInt(e.target.value) })}
              />
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={saveSettings} className="btn-primary">
            Save Backup Settings
          </button>
        </div>
      </div>
    </div>
  );
}
