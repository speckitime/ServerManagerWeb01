import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ServerLogs() {
  const { id } = useParams();
  const [logFiles, setLogFiles] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef(null);

  useEffect(() => {
    loadLogFiles();
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !selectedLog) return;
    const interval = setInterval(() => fetchLog(selectedLog), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedLog]);

  const loadLogFiles = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/logs`);
      setLogFiles(data.default_logs || []);
    } catch (err) {
      toast.error('Failed to load log files');
    } finally {
      setLoading(false);
    }
  };

  const fetchLog = async (logPath) => {
    try {
      setSelectedLog(logPath);
      setFetching(true);
      const { data } = await api.post(`/servers/${id}/logs/request`, {
        log_path: logPath,
        lines: 200,
        search: search || null,
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
    a.download = `${selectedLog?.replace(/\//g, '_') || 'log'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Log file list */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Available Logs</h3>
          <div className="space-y-1">
            {logFiles.map((log) => (
              <button
                key={log.path}
                onClick={() => fetchLog(log.path)}
                disabled={fetching}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedLog === log.path
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${fetching ? 'opacity-50' : ''}`}
              >
                <p className="font-medium truncate">{log.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{log.path}</p>
              </button>
            ))}
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
                className="btn-secondary text-sm flex items-center gap-1.5"
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
            <button onClick={scrollToBottom} className="btn-secondary text-sm">
              Scroll Bottom
            </button>
            {logContent && (
              <button onClick={downloadLog} className="btn-secondary text-sm">
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
    </div>
  );
}
