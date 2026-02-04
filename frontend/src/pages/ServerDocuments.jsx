import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function ServerDocuments() {
  const { id } = useParams();
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadDocuments();
  }, [id]);

  const loadDocuments = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/documents`);
      setDocuments(data);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const loadDocument = async (docId) => {
    try {
      const { data } = await api.get(`/servers/${id}/documents/${docId}`);
      setSelectedDoc(data);
    } catch (err) {
      toast.error('Failed to load document');
    }
  };

  const deleteDocument = async (docId, title) => {
    if (!confirm(`Delete document "${title}"?`)) return;
    try {
      await api.delete(`/servers/${id}/documents/${docId}`);
      toast.success('Document deleted');
      setSelectedDoc(null);
      loadDocuments();
    } catch (err) {
      toast.error('Failed to delete document');
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
      <div className="flex items-center justify-between">
        <div />
        {user?.role !== 'readonly' && (
          <button onClick={() => { setSelectedDoc(null); setShowForm(true); setEditing(false); }} className="btn-primary text-sm">
            New Document
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document list */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Documents</h3>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No documents yet</p>
          ) : (
            <div className="space-y-1">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => loadDocument(doc.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedDoc?.id === doc.id
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    v{doc.version} &middot; {new Date(doc.updated_at).toLocaleDateString()}
                    {doc.updated_by_name && ` by ${doc.updated_by_name}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Document content */}
        <div className="card p-6 lg:col-span-2">
          {showForm ? (
            <DocumentForm
              serverId={id}
              document={editing ? selectedDoc : null}
              onClose={() => setShowForm(false)}
              onSaved={(doc) => {
                setShowForm(false);
                loadDocuments();
                loadDocument(doc.id);
              }}
            />
          ) : selectedDoc ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedDoc.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Version {selectedDoc.version} &middot; Updated {new Date(selectedDoc.updated_at).toLocaleString()}
                  </p>
                </div>
                {user?.role !== 'readonly' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(true); setShowForm(true); }}
                      className="btn-secondary text-sm"
                    >
                      Edit
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => deleteDocument(selectedDoc.id, selectedDoc.title)}
                        className="btn-danger text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div
                className="prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                dangerouslySetInnerHTML={{ __html: selectedDoc.content || '<em>No content</em>' }}
              />

              {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Attachments</h4>
                  <div className="space-y-2">
                    {selectedDoc.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/api/documents/attachments/${att.id}/download`}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                        {att.original_name} ({formatBytes(att.file_size)})
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedDoc.versions && selectedDoc.versions.length > 1 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Version History</h4>
                  <div className="space-y-2">
                    {selectedDoc.versions.map((v) => (
                      <div key={v.id} className="text-sm text-gray-500 dark:text-gray-400">
                        Version {v.version} - {new Date(v.created_at).toLocaleString()}
                        {v.changed_by_name && ` by ${v.changed_by_name}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Select a document to view, or create a new one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentForm({ serverId, document, onClose, onSaved }) {
  const [title, setTitle] = useState(document?.title || '');
  const [content, setContent] = useState(document?.content || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let res;
      if (document) {
        res = await api.put(`/servers/${serverId}/documents/${document.id}`, { title, content });
      } else {
        res = await api.post(`/servers/${serverId}/documents`, { title, content });
      }
      toast.success(document ? 'Document updated' : 'Document created');
      onSaved(res.data);
    } catch (err) {
      toast.error('Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
        <input type="text" className="input-field" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content (HTML)</label>
        <textarea
          className="input-field font-mono text-sm"
          rows={15}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="<h2>Server Documentation</h2><p>Write your documentation here...</p>"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : document ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
