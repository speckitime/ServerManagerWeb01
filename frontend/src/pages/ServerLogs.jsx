import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// Category icons and colors
const CATEGORY_CONFIG = {
  system: { icon: '🖥️', color: 'blue', label: 'System' },
  package: { icon: '📦', color: 'purple', label: 'Package' },
  webserver: { icon: '🌐', color: 'green', label: 'Web Server' },
  database: { icon: '🗄️', color: 'orange', label: 'Database' },
  container: { icon: '🐳', color: 'cyan', label: 'Container' },
  mail: { icon: '📧', color: 'pink', label: 'Mail' },
  security: { icon: '🔒', color: 'red', label: 'Security' },
  custom: { icon: '📝', color: 'gray', label: 'Custom' },
};

export default function ServerLogs() {
  const { id } = useParams();
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showDetectModal, setShowDetectModal] = useState(false);

  // Add log form
  const [newLogName, setNewLogName] = useState('');
  const [newLogPath, setNewLogPath] = useState('');
  const [newLogCategory, setNewLogCategory] = useState('custom');

  // Templates and detection
  const [templates, setTemplates] = useState({});
  const [detectedLogs, setDetectedLogs] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [selectedDetected, setSelectedDetected] = useState([]);

  useEffect(() => {
    loadLogs();
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !selectedLog) return;
    const interval = setInterval(() => fetchLog(selectedLog), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedLog]);

  const loadLogs = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/logs`);
      setLogs(data.logs || []);
    } catch (err) {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/logs/templates`);
      setTemplates(data.templates || {});
      setShowTemplateModal(true);
    } catch (err) {
      toast.error('Failed to load templates');
    }
  };

  const detectLogs = async () => {
    setDetecting(true);
    setDetectedLogs([]);
    setSelectedDetected([]);
    setShowDetectModal(true);
    try {
      const { data } = await api.get(`/servers/${id}/logs/detect`);
      setDetectedLogs(data.detected || []);
      // Pre-select all detected logs
      setSelectedDetected(data.detected?.map(l => l.path) || []);
    } catch (err) {
      toast.error('Failed to detect logs: ' + (err.response?.data?.error || err.message));
    } finally {
      setDetecting(false);
    }
  };

  const addDetectedLogs = async () => {
    const logsToAdd = detectedLogs.filter(l => selectedDetected.includes(l.path));
    if (logsToAdd.length === 0) {
      toast.error('No logs selected');
      return;
    }
    try {
      const { data } = await api.post(`/servers/${id}/logs/bulk`, { logs: logsToAdd });
      toast.success(`Added ${data.added} logs`);
      setShowDetectModal(false);
      loadLogs();
    } catch (err) {
      toast.error('Failed to add logs');
    }
  };

  const addTemplateLog = async (template, category) => {
    try {
      await api.post(`/servers/${id}/logs`, {
        name: template.name,
        path: template.path,
        category,
      });
      toast.success('Log added');
      loadLogs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add log';
      toast.error(msg);
    }
  };

  const addCustomLog = async () => {
    if (!newLogName.trim() || !newLogPath.trim()) {
      toast.error('Name and path are required');
      return;
    }
    try {
      await api.post(`/servers/${id}/logs`, {
        name: newLogName,
        path: newLogPath,
        category: newLogCategory,
      });
      toast.success('Log added');
      setShowAddModal(false);
      setNewLogName('');
      setNewLogPath('');
      setNewLogCategory('custom');
      loadLogs();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add log';
      toast.error(msg);
    }
  };

  const removeLog = async (logId) => {
    if (!confirm('Remove this log from the list?')) return;
    try {
      await api.delete(`/servers/${id}/logs/${logId}`);
      toast.success('Log removed');
      if (selectedLog?.id === logId) {
        setSelectedLog(null);
        setLogContent('');
      }
      loadLogs();
    } catch (err) {
      toast.error('Failed to remove log');
    }
  };

  const fetchLog = async (log) => {
    try {
      setSelectedLog(log);
      setFetching(true);
      const { data } = await api.post(`/servers/${id}/logs/request`, {
        log_path: log.path,
        lines: 200,
        search: search || null,
        isCommand: log.path.startsWith('journalctl') || log.path.startsWith('dmesg'),
      });
      setLogContent(data.content || '(empty)');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to fetch log';
      toast.error(msg);
      setLogContent(`Error: ${msg}`);
    } finally {
      setFetching(false);
    }
  };

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  const downloadLog = () => {
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedLog?.name?.replace(/[^a-z0-9]/gi, '_') || 'log'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group logs by category
  const logsByCategory = logs.reduce((acc, log) => {
    const cat = log.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(log);
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
    <div className="space-y-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">
            Server Logs
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {logs.length === 0 ? 'No logs configured yet' : `${logs.length} log${logs.length !== 1 ? 's' : ''} configured`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={detectLogs}
            className="btn-secondary text-sm flex items-center gap-2 hover:scale-105 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            Auto-Detect
          </button>
          <button
            onClick={loadTemplates}
            className="btn-secondary text-sm flex items-center gap-2 hover:scale-105 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Templates
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-sm flex items-center gap-2 hover:scale-105 transition-transform"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Log
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
              <svg className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Logs Configured</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Add log files to monitor on this server. Use auto-detect to find available logs, browse templates, or add a custom path.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={detectLogs}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Auto-Detect Logs
              </button>
              <button
                onClick={loadTemplates}
                className="btn-secondary flex items-center gap-2"
              >
                Browse Templates
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Main content */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          {/* Log file list */}
          <div className="card p-4 lg:col-span-1 overflow-y-auto max-h-[600px]">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
              Configured Logs
            </h3>
            <div className="space-y-4">
              {Object.entries(logsByCategory).map(([category, categoryLogs]) => {
                const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <span>{config.icon}</span>
                      <span>{config.label}</span>
                    </div>
                    <div className="space-y-1">
                      {categoryLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`group relative w-full text-left px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                            selectedLog?.id === log.id
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 shadow-sm'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          } ${fetching && selectedLog?.id === log.id ? 'opacity-50' : ''}`}
                          onClick={() => !fetching && fetchLog(log)}
                        >
                          <p className="font-medium truncate pr-6">{log.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{log.path}</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeLog(log.id); }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Log content */}
          <div className="card p-4 lg:col-span-3 flex flex-col">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <input
                type="text"
                placeholder="Filter logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && selectedLog && fetchLog(selectedLog)}
                className="input-field flex-1 min-w-[200px]"
              />
              {selectedLog && (
                <button
                  onClick={() => fetchLog(selectedLog)}
                  disabled={fetching}
                  className="btn-secondary text-sm flex items-center gap-1.5 hover:scale-105 transition-transform"
                >
                  {fetching ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-500" />
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                  )}
                  Refresh
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded text-primary-600"
                />
                Auto-refresh
              </label>
              <button onClick={scrollToBottom} className="btn-secondary text-sm hover:scale-105 transition-transform">
                Scroll Bottom
              </button>
              {logContent && (
                <button onClick={downloadLog} className="btn-secondary text-sm hover:scale-105 transition-transform">
                  Download
                </button>
              )}
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 min-h-[400px] max-h-[600px] overflow-auto bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 whitespace-pre-wrap"
            >
              {fetching && !logContent ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500" />
                  Fetching log via SSH...
                </div>
              ) : logContent ? (
                logContent
              ) : (
                <span className="text-gray-500">
                  Select a log file to view its contents
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Log Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 animate-slideUp">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Custom Log</h3>
              <p className="text-sm text-gray-500 mt-1">Add a custom log path to monitor</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newLogName}
                  onChange={(e) => setNewLogName(e.target.value)}
                  placeholder="e.g., My Application Log"
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Path or Command</label>
                <input
                  type="text"
                  value={newLogPath}
                  onChange={(e) => setNewLogPath(e.target.value)}
                  placeholder="e.g., /var/log/myapp.log or journalctl -u myservice"
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">File path or command like journalctl</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={newLogCategory}
                  onChange={(e) => setNewLogCategory(e.target.value)}
                  className="input-field w-full"
                >
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.icon} {config.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={addCustomLog} className="btn-primary">
                Add Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Browser Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col animate-slideUp">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Log Templates</h3>
              <p className="text-sm text-gray-500 mt-1">Click on a log to add it to your server</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {Object.entries(templates).map(([category, categoryTemplates]) => {
                const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom;
                return (
                  <div key={category}>
                    <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                      <span className="text-lg">{config.icon}</span>
                      <span>{config.label}</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {categoryTemplates.map((template, idx) => (
                        <button
                          key={idx}
                          onClick={() => addTemplateLog(template, category)}
                          className="text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                        >
                          <p className="font-medium text-gray-900 dark:text-white text-sm">{template.name}</p>
                          <p className="text-xs text-gray-500 truncate">{template.path}</p>
                          {template.description && (
                            <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button onClick={() => setShowTemplateModal(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Detect Modal */}
      {showDetectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col animate-slideUp">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Auto-Detected Logs</h3>
              <p className="text-sm text-gray-500 mt-1">
                {detecting ? 'Scanning server for available logs...' : `Found ${detectedLogs.length} readable log files`}
              </p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {detecting ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mb-4" />
                  <p className="text-gray-500">Scanning server via SSH...</p>
                </div>
              ) : detectedLogs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-gray-500">No readable log files found</p>
                  <p className="text-sm text-gray-400 mt-1">The SSH user may not have read permissions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedDetected.length === detectedLogs.length}
                        onChange={(e) => setSelectedDetected(e.target.checked ? detectedLogs.map(l => l.path) : [])}
                        className="rounded text-primary-600"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Select all</span>
                    </label>
                    <span className="text-sm text-gray-500">{selectedDetected.length} selected</span>
                  </div>
                  {Object.entries(
                    detectedLogs.reduce((acc, log) => {
                      const cat = log.category || 'custom';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(log);
                      return acc;
                    }, {})
                  ).map(([category, categoryLogs]) => {
                    const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom;
                    return (
                      <div key={category}>
                        <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-2">
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </h4>
                        <div className="space-y-1">
                          {categoryLogs.map((log, idx) => (
                            <label
                              key={idx}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedDetected.includes(log.path)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedDetected([...selectedDetected, log.path]);
                                  } else {
                                    setSelectedDetected(selectedDetected.filter(p => p !== log.path));
                                  }
                                }}
                                className="rounded text-primary-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm">{log.name}</p>
                                <p className="text-xs text-gray-500 truncate">{log.path}</p>
                              </div>
                              {log.isCommand && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                  Command
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowDetectModal(false)} className="btn-secondary">
                Cancel
              </button>
              {!detecting && detectedLogs.length > 0 && (
                <button onClick={addDetectedLogs} className="btn-primary" disabled={selectedDetected.length === 0}>
                  Add {selectedDetected.length} Log{selectedDetected.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
