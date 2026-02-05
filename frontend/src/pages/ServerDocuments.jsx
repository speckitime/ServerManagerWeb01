import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import api from '../services/api';
import useAuthStore from '../store/authStore';

// ── Rich‑text editor toolbar config ──────────────────────────────────────────

const QUILL_FORMATS = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'code-block', 'blockquote',
  'list', 'bullet',
  'link', 'image',
  'color', 'background',
  'align',
  'clean',
];

// ── Helper ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// ── DocumentForm ─────────────────────────────────────────────────────────────

function DocumentForm({ serverId, document, onClose, onSaved }) {
  const [title, setTitle] = useState(document?.title || '');
  const [content, setContent] = useState(document?.content || '');
  const [saving, setSaving] = useState(false);

  const quillModules = useMemo(() => ({
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      ['code-block', 'blockquote'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image'],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      ['clean'],
    ],
  }), []);

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
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="input-field"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Document title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Content
        </label>
        <div className="quill-editor-wrapper rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          <ReactQuill
            theme="snow"
            value={content}
            onChange={setContent}
            modules={quillModules}
            formats={QUILL_FORMATS}
            placeholder="Write your documentation here..."
            style={{ minHeight: '300px' }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : document ? 'Update Document' : 'Create Document'}
        </button>
      </div>

      {/* Scoped editor styles */}
      <style>{`
        .quill-editor-wrapper .ql-toolbar {
          border: none;
          border-bottom: 1px solid rgb(209 213 219);
          background: rgb(249 250 251);
        }
        .dark .quill-editor-wrapper .ql-toolbar {
          border-bottom-color: rgb(75 85 99);
          background: rgb(31 41 55);
        }
        .quill-editor-wrapper .ql-container {
          border: none;
          font-size: 0.95rem;
          min-height: 300px;
        }
        .quill-editor-wrapper .ql-editor {
          min-height: 300px;
          color: rgb(31 41 55);
        }
        .dark .quill-editor-wrapper .ql-editor {
          color: rgb(229 231 235);
        }
        .quill-editor-wrapper .ql-editor.ql-blank::before {
          color: rgb(156 163 175);
          font-style: italic;
        }
        .dark .quill-editor-wrapper .ql-editor.ql-blank::before {
          color: rgb(107 114 128);
        }
        .dark .quill-editor-wrapper .ql-toolbar .ql-stroke {
          stroke: rgb(209 213 219);
        }
        .dark .quill-editor-wrapper .ql-toolbar .ql-fill {
          fill: rgb(209 213 219);
        }
        .dark .quill-editor-wrapper .ql-toolbar .ql-picker-label {
          color: rgb(209 213 219);
        }
        .dark .quill-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .dark .quill-editor-wrapper .ql-toolbar .ql-picker-label:hover .ql-stroke {
          stroke: rgb(96 165 250);
        }
        .dark .quill-editor-wrapper .ql-toolbar button:hover .ql-fill,
        .dark .quill-editor-wrapper .ql-toolbar .ql-picker-label:hover .ql-fill {
          fill: rgb(96 165 250);
        }
        .dark .quill-editor-wrapper .ql-toolbar button.ql-active .ql-stroke {
          stroke: rgb(96 165 250);
        }
        .dark .quill-editor-wrapper .ql-toolbar button.ql-active .ql-fill {
          fill: rgb(96 165 250);
        }
        .dark .quill-editor-wrapper .ql-toolbar .ql-picker-options {
          background: rgb(31 41 55);
          border-color: rgb(75 85 99);
        }
      `}</style>
    </form>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

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

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        {user?.role !== 'readonly' && (
          <button
            onClick={() => {
              setSelectedDoc(null);
              setShowForm(true);
              setEditing(false);
            }}
            className="btn-primary text-sm"
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Document
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Document list sidebar ──────────────────────────────────────── */}
        <div className="card p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Documents</h3>
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {documents.length}
            </span>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-8">
              <svg
                className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No documents yet</p>
              {user?.role !== 'readonly' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Click "New Document" to get started
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => loadDocument(doc.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                      isSelected
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 ring-1 ring-primary-300 dark:ring-primary-700 shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <svg
                        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          isSelected
                            ? 'text-primary-500 dark:text-primary-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          v{doc.version} &middot; {new Date(doc.updated_at).toLocaleDateString()}
                        </p>
                        {doc.created_at && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Created {new Date(doc.created_at).toLocaleDateString()}
                          </p>
                        )}
                        {doc.updated_by_name && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            by {doc.updated_by_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Document content / form ────────────────────────────────────── */}
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
            <div className="animate-fade-in" key={selectedDoc.id}>
              {/* Document header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedDoc.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400">
                      <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Updated {new Date(selectedDoc.updated_at).toLocaleString()}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      v{selectedDoc.version}
                    </span>
                  </div>
                  {selectedDoc.updated_by_name && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      Last edited by {selectedDoc.updated_by_name}
                    </p>
                  )}
                </div>
                {user?.role !== 'readonly' && (
                  <div className="flex gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => {
                        setEditing(true);
                        setShowForm(true);
                      }}
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

              {/* Rendered content */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                <div
                  className="prose dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 prose-headings:font-semibold prose-a:text-primary-600 dark:prose-a:text-primary-400 prose-img:rounded-lg prose-code:text-sm prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded"
                  dangerouslySetInnerHTML={{
                    __html: selectedDoc.content || '<em class="text-gray-400">No content</em>',
                  }}
                />
              </div>

              {/* Attachments */}
              {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 animate-slide-up">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                    Attachments
                    <span className="text-xs font-normal text-gray-400">
                      ({selectedDoc.attachments.length})
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {selectedDoc.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/api/documents/attachments/${att.id}/download`}
                        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 hover:underline transition-colors"
                      >
                        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                        {att.original_name}
                        <span className="text-gray-400 dark:text-gray-500">
                          ({formatBytes(att.file_size)})
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Version history */}
              {selectedDoc.versions && selectedDoc.versions.length > 1 && (
                <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4 animate-slide-up">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Version History
                  </h4>
                  <div className="space-y-2">
                    {selectedDoc.versions.map((v, idx) => (
                      <div
                        key={v.id}
                        className={`text-sm flex items-center gap-2 px-3 py-1.5 rounded ${
                          idx === 0
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span className="font-medium">v{v.version}</span>
                        <span>&middot;</span>
                        <span>{new Date(v.created_at).toLocaleString()}</span>
                        {v.changed_by_name && (
                          <>
                            <span>&middot;</span>
                            <span>{v.changed_by_name}</span>
                          </>
                        )}
                        {idx === 0 && (
                          <span className="ml-auto text-xs font-medium text-primary-600 dark:text-primary-400">
                            current
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <svg
                className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-sm">Select a document to view, or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
