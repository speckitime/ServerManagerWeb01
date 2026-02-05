import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [servers, setServers] = useState([]);
  const [selectedScript, setSelectedScript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executionOutput, setExecutionOutput] = useState(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadScripts();
    loadServers();

    const socket = getSocket();
    socket.on('script_execution_update', (data) => {
      setExecutionOutput((prev) => {
        if (!prev || prev.execution_id !== data.execution_id) return prev;
        return { ...prev, status: data.status, exit_code: data.exit_code };
      });
      // Refresh script detail to get updated executions
      if (selectedScript) {
        loadScript(selectedScript.id);
      }
    });

    socket.on('script_execution_output', (data) => {
      setExecutionOutput((prev) => {
        if (!prev || prev.execution_id !== data.execution_id) return prev;
        return {
          ...prev,
          output: (prev.output || '') + data.data,
        };
      });
    });

    return () => {
      socket.off('script_execution_update');
      socket.off('script_execution_output');
    };
  }, []);

  const loadScripts = async () => {
    try {
      const { data } = await api.get('/scripts');
      setScripts(data);
    } catch (err) {
      toast.error('Failed to load scripts');
    } finally {
      setLoading(false);
    }
  };

  const loadServers = async () => {
    try {
      const { data } = await api.get('/servers');
      setServers(data.filter((s) => s.os_type === 'linux'));
    } catch (err) {
      console.error('Failed to load servers');
    }
  };

  const loadScript = async (id) => {
    try {
      const { data } = await api.get(`/scripts/${id}`);
      setSelectedScript(data);
    } catch (err) {
      toast.error('Failed to load script');
    }
  };

  const deleteScript = async (id, name) => {
    try {
      await api.delete(`/scripts/${id}`);
      toast.success('Script deleted');
      setSelectedScript(null);
      loadScripts();
    } catch (err) {
      toast.error('Failed to delete script');
    }
  };

  const languageIcon = (lang) => {
    switch (lang) {
      case 'bash': return '#!/';
      case 'python': return 'Py';
      case 'powershell': return 'PS';
      default: return '>';
    }
  };

  const languageColor = (lang) => {
    switch (lang) {
      case 'bash': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'python': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'powershell': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Global Scripts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Store and execute shell scripts across your servers
          </p>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => { setSelectedScript(null); setShowForm(true); setEditing(false); }}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Script
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Script list */}
        <div className="card p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Scripts</h3>
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
              {scripts.length}
            </span>
          </div>
          {scripts.length === 0 ? (
            <div className="text-center py-8">
              <svg className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">No scripts yet</p>
              {user?.role === 'admin' && (
                <button
                  onClick={() => { setShowForm(true); setEditing(false); }}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Create your first script
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {scripts.map((script) => (
                <button
                  key={script.id}
                  onClick={() => loadScript(script.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    selectedScript?.id === script.id
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${languageColor(script.language)}`}>
                      {languageIcon(script.language)}
                    </span>
                    <p className="font-medium truncate flex-1">{script.name}</p>
                  </div>
                  {script.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate ml-8">{script.description}</p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-8">
                    {new Date(script.updated_at).toLocaleDateString()}
                    {script.updated_by_name && ` by ${script.updated_by_name}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Script content */}
        <div className="card p-6 lg:col-span-2">
          {showForm ? (
            <ScriptForm
              script={editing ? selectedScript : null}
              onClose={() => setShowForm(false)}
              onSaved={(script) => {
                setShowForm(false);
                loadScripts();
                loadScript(script.id);
              }}
            />
          ) : selectedScript ? (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedScript.name}</h2>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${languageColor(selectedScript.language)}`}>
                      {selectedScript.language}
                    </span>
                  </div>
                  {selectedScript.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedScript.description}</p>
                  )}
                </div>
                {user?.role === 'admin' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowExecuteModal(true)}
                      className="btn-primary text-sm flex items-center gap-1.5"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                      </svg>
                      Execute
                    </button>
                    <button
                      onClick={() => { setEditing(true); setShowForm(true); }}
                      className="btn-secondary text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete script "${selectedScript.name}"?`)) {
                          deleteScript(selectedScript.id, selectedScript.name);
                        }
                      }}
                      className="btn-danger text-sm"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Script content */}
              <div className="relative">
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <span className="text-xs text-gray-400 font-mono">{selectedScript.language}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedScript.content);
                        toast.success('Copied to clipboard');
                      }}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="p-4 text-sm text-gray-200 font-mono overflow-x-auto max-h-80 overflow-y-auto">
                    <code>{selectedScript.content}</code>
                  </pre>
                </div>
              </div>

              {/* Tags */}
              {selectedScript.tags && JSON.parse(selectedScript.tags || '[]').length > 0 && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {JSON.parse(selectedScript.tags).map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Execution history */}
              {selectedScript.executions && selectedScript.executions.length > 0 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Recent Executions</h4>
                  <div className="space-y-2">
                    {selectedScript.executions.map((exec) => (
                      <ExecutionRow key={exec.id} execution={exec} onView={() => {
                        setExecutionOutput({
                          execution_id: exec.id,
                          status: exec.status,
                          exit_code: exec.exit_code,
                          output: exec.output || '',
                          error_output: exec.error_output || '',
                          server_name: exec.server_display_name || exec.server_hostname,
                          started_at: exec.started_at,
                          completed_at: exec.completed_at,
                        });
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <svg className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <p>Select a script to view, or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* Execute modal */}
      {showExecuteModal && selectedScript && (
        <ExecuteModal
          script={selectedScript}
          servers={servers}
          onClose={() => setShowExecuteModal(false)}
          onExecuted={(execution) => {
            setShowExecuteModal(false);
            setExecutionOutput({
              execution_id: execution.id,
              status: 'running',
              output: '',
              error_output: '',
              server_name: servers.find((s) => s.id === execution.server_id)?.display_name || servers.find((s) => s.id === execution.server_id)?.hostname,
            });
            loadScript(selectedScript.id);
          }}
        />
      )}

      {/* Execution output modal */}
      {executionOutput && (
        <ExecutionOutputModal
          execution={executionOutput}
          onClose={() => setExecutionOutput(null)}
        />
      )}
    </div>
  );
}

function ScriptForm({ script, onClose, onSaved }) {
  const [name, setName] = useState(script?.name || '');
  const [description, setDescription] = useState(script?.description || '');
  const [content, setContent] = useState(script?.content || '');
  const [language, setLanguage] = useState(script?.language || 'bash');
  const [tags, setTags] = useState(script?.tags ? JSON.parse(script.tags).join(', ') : '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        content,
        language,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      let res;
      if (script) {
        res = await api.put(`/scripts/${script.id}`, payload);
      } else {
        res = await api.post('/scripts', payload);
      }
      toast.success(script ? 'Script updated' : 'Script created');
      onSaved(res.data);
    } catch (err) {
      toast.error('Failed to save script');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">
        {script ? 'Edit Script' : 'New Script'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input type="text" className="input-field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Update System Packages" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language</label>
          <select className="input-field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="bash">Bash</option>
            <option value="python">Python</option>
            <option value="powershell">PowerShell</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
        <input type="text" className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of what this script does" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Script Content *</label>
        <textarea
          className="input-field font-mono text-sm"
          rows={12}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"#!/bin/bash\n\n# Your script here\napt update && apt upgrade -y"}
          style={{ tabSize: 2 }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
        <input type="text" className="input-field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="maintenance, updates, security" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : script ? 'Update Script' : 'Create Script'}
        </button>
      </div>
    </form>
  );
}

function ExecuteModal({ script, servers, onClose, onExecuted }) {
  const [selectedServer, setSelectedServer] = useState('');
  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    if (!selectedServer) {
      toast.error('Please select a server');
      return;
    }
    setExecuting(true);
    try {
      const { data } = await api.post(`/scripts/${script.id}/execute`, { serverId: selectedServer });
      toast.success('Script execution started');
      onExecuted(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to execute script');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card w-full max-w-md animate-scale-in">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Execute Script</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Run &quot;{script.name}&quot; on a server
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Server</label>
            <select
              className="input-field"
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
            >
              <option value="">Choose a server...</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.hostname} ({s.ip_address}) - {s.status}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 p-3 rounded-lg text-sm">
            <strong>Warning:</strong> This will execute the script via SSH on the selected server. Make sure you trust the script content.
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleExecute} disabled={executing || !selectedServer} className="btn-primary flex items-center gap-2">
            {executing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Executing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Execute
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecutionRow({ execution, onView }) {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${statusColors[execution.status] || statusColors.pending}`}>
          {execution.status === 'running' && (
            <span className="inline-block animate-spin mr-1">&#8635;</span>
          )}
          {execution.status}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {execution.server_display_name || execution.server_hostname}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(execution.created_at).toLocaleString()}
            {execution.executed_by_name && ` by ${execution.executed_by_name}`}
            {execution.exit_code !== null && ` - exit ${execution.exit_code}`}
          </p>
        </div>
      </div>
      <button
        onClick={onView}
        className="text-xs text-primary-600 hover:text-primary-700 font-medium flex-shrink-0"
      >
        View Output
      </button>
    </div>
  );
}

function ExecutionOutputModal({ execution, onClose }) {
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [execution.output]);

  const statusColors = {
    pending: 'text-yellow-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card w-full max-w-3xl max-h-[80vh] flex flex-col animate-scale-in">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Execution Output</h2>
            <span className={`text-sm font-medium ${statusColors[execution.status]}`}>
              {execution.status === 'running' && (
                <span className="inline-block animate-spin mr-1">&#8635;</span>
              )}
              {execution.status}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 text-xl">
            &times;
          </button>
        </div>

        {execution.server_name && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/30 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
            Server: <strong>{execution.server_name}</strong>
            {execution.started_at && <> &middot; Started: {new Date(execution.started_at).toLocaleString()}</>}
            {execution.completed_at && <> &middot; Completed: {new Date(execution.completed_at).toLocaleString()}</>}
          </div>
        )}

        <div ref={outputRef} className="flex-1 overflow-y-auto bg-gray-900 p-4">
          {execution.output ? (
            <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap break-words">
              {execution.output}
            </pre>
          ) : (
            <p className="text-sm text-gray-500 font-mono">
              {execution.status === 'running' ? 'Waiting for output...' : 'No output'}
            </p>
          )}
          {execution.error_output && (
            <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap break-words mt-2 border-t border-gray-700 pt-2">
              {execution.error_output}
            </pre>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
