import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket, subscribeToServer } from '../services/socket';

export default function ServerLogs() {
  const { id } = useParams();
  const [logFiles, setLogFiles] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef(null);

  useEffect(() => {
    loadLogFiles();
    subscribeToServer(id);

    const socket = getSocket();
    socket.on('log_content', (data) => {
      if (data.server_id === id) {
        setLogContent(data.content || '');
      }
    });

    return () => {
      socket.off('log_content');
    };
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !selectedLog) return;
    const interval = setInterval(() => requestLog(selectedLog), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedLog]);

  const loadLogFiles = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/logs`);
      setLogFiles(data.default_logs);
    } catch (err) {
      toast.error('Failed to load log files');
    } finally {
      setLoading(false);
    }
  };

  const requestLog = async (logPath) => {
    try {
      setSelectedLog(logPath);
      await api.post(`/servers/${id}/logs/request`, {
        log_path: logPath,
        lines: 200,
        search: search || null,
      });
    } catch (err) {
      toast.error('Failed to request log');
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
      <div className="flex items-center gap-3">
        <Link to={`/servers/${id}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Log Files</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Log file list */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Available Logs</h3>
          <div className="space-y-1">
            {logFiles.map((log) => (
              <button
                key={log.path}
                onClick={() => requestLog(log.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedLog === log.path
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
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
              onKeyDown={(e) => e.key === 'Enter' && selectedLog && requestLog(selectedLog)}
              className="input-field flex-1 min-w-[200px]"
            />
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
            {logContent || (
              <span className="text-gray-500">
                {selectedLog ? 'Loading log content...' : 'Select a log file to view its contents'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
