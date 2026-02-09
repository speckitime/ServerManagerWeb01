import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ServerFileManager() {
  const { id: serverId } = useParams();
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [editingFile, setEditingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', type: 'file' });
  const [pathHistory, setPathHistory] = useState(['/']);

  const loadDirectory = useCallback(async (path = '/') => {
    setLoading(true);
    try {
      const { data } = await api.get(`/files/${serverId}/list`, { params: { path } });
      setItems(data.items || []);
      setCurrentPath(data.path);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load directory');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    loadDirectory('/');
  }, [loadDirectory]);

  const navigateTo = (path) => {
    setSelectedFile(null);
    setEditingFile(false);
    setPathHistory((prev) => [...prev, path]);
    loadDirectory(path);
  };

  const goBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = [...pathHistory];
      newHistory.pop();
      const previousPath = newHistory[newHistory.length - 1];
      setPathHistory(newHistory);
      loadDirectory(previousPath);
    }
  };

  const goToParent = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parentPath);
  };

  const openFile = async (file) => {
    if (file.type === 'directory') {
      navigateTo(file.path);
      return;
    }

    setSelectedFile(file);
    setEditingFile(false);

    try {
      const { data } = await api.get(`/files/${serverId}/read`, { params: { path: file.path } });
      setFileContent(data.content);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to read file');
      setFileContent('');
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.post(`/files/${serverId}/write`, {
        path: selectedFile.path,
        content: fileContent,
      });
      toast.success('File saved successfully');
      setEditingFile(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const createItem = async () => {
    if (!newItem.name) {
      toast.error('Name is required');
      return;
    }

    // Sanitize name to prevent path traversal
    const sanitizedName = newItem.name.replace(/\.\./g, '').replace(/\//g, '');
    if (!sanitizedName) {
      toast.error('Invalid name');
      return;
    }

    try {
      const itemPath = `${currentPath}/${sanitizedName}`.replace(/\/+/g, '/');
      await api.post(`/files/${serverId}/create`, {
        path: itemPath,
        type: newItem.type,
      });
      toast.success(`${newItem.type === 'directory' ? 'Directory' : 'File'} created`);
      setShowCreateModal(false);
      setNewItem({ name: '', type: 'file' });
      loadDirectory(currentPath);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create item');
    }
  };

  const deleteItem = async (item) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    try {
      await api.post(`/files/${serverId}/delete`, { path: item.path });
      toast.success('Item deleted');
      if (selectedFile?.path === item.path) {
        setSelectedFile(null);
        setFileContent('');
      }
      loadDirectory(currentPath);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete item');
    }
  };

  const downloadFile = async (file) => {
    try {
      const response = await api.get(`/files/${serverId}/download`, {
        params: { path: file.path },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download file');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (item) => {
    if (item.type === 'directory') {
      return (
        <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      );
    }
    if (item.type === 'link') {
      return (
        <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      );
    }
    return (
      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            disabled={pathHistory.length <= 1}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Back"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <button
            onClick={goToParent}
            disabled={currentPath === '/'}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Parent Directory"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
          <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm">
            <span className="text-gray-500">/</span>
            {currentPath.split('/').filter(Boolean).map((segment, idx, arr) => (
              <span key={idx} className="flex items-center">
                <button
                  onClick={() => navigateTo('/' + arr.slice(0, idx + 1).join('/'))}
                  className="hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {segment}
                </button>
                {idx < arr.length - 1 && <span className="text-gray-500 mx-1">/</span>}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File List */}
        <div className={`${selectedFile ? 'w-1/3' : 'w-full'} border-r border-gray-200 dark:border-gray-700 overflow-y-auto`}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p>Empty directory</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2 w-24">Size</th>
                  <th className="px-4 py-2 w-32">Modified</th>
                  <th className="px-4 py-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <tr
                    key={item.path}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${
                      selectedFile?.path === item.path ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                    onClick={() => openFile(item)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {getFileIcon(item)}
                        <span className="truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {item.type === 'directory' ? '-' : formatSize(item.size)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">{item.modified}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {item.type === 'file' && (
                          <button
                            onClick={() => downloadFile(item)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Download"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => deleteItem(item)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* File Editor */}
        {selectedFile && (
          <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-2">
                {getFileIcon(selectedFile)}
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-sm text-gray-500">({formatSize(selectedFile.size)})</span>
              </div>
              <div className="flex items-center gap-2">
                {editingFile ? (
                  <>
                    <button
                      onClick={() => setEditingFile(false)}
                      className="btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveFile}
                      disabled={saving}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      {saving && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingFile(true)}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    Edit
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileContent('');
                    setEditingFile(false);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {editingFile ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-gray-100 resize-none focus:outline-none"
                  spellCheck={false}
                />
              ) : (
                <pre className="p-4 font-mono text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                  {fileContent}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="type"
                      value="file"
                      checked={newItem.type === 'file'}
                      onChange={() => setNewItem({ ...newItem, type: 'file' })}
                      className="text-primary-600"
                    />
                    <span>File</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="type"
                      value="directory"
                      checked={newItem.type === 'directory'}
                      onChange={() => setNewItem({ ...newItem, type: 'directory' })}
                      className="text-primary-600"
                    />
                    <span>Directory</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder={newItem.type === 'directory' ? 'folder-name' : 'file.txt'}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={createItem} className="btn-primary">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
