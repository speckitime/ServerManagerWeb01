import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const KEY_TYPES = [
  { value: 'ed25519', label: 'ED25519 (Recommended)', bits: [] },
  { value: 'rsa', label: 'RSA', bits: [2048, 3072, 4096] },
  { value: 'ecdsa', label: 'ECDSA', bits: [256, 384, 521] },
];

const KEY_TYPE_ICONS = {
  ed25519: '⚡',
  rsa: '🔑',
  ecdsa: '🔒',
};

function KeyBadge({ type, bits }) {
  const label = type === 'ed25519' ? 'ED25519' : `${type.toUpperCase()}-${bits || ''}`;
  const colors = {
    ed25519: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rsa: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ecdsa: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}

export default function SSHIdentities() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null); // 'generate' | 'import' | null
  const [submitting, setSubmitting] = useState(false);

  // Generate form
  const [genForm, setGenForm] = useState({
    name: '',
    description: '',
    key_type: 'ed25519',
    key_bits: '',
    passphrase: '',
    passphrase_confirm: '',
  });

  // Import form
  const [importForm, setImportForm] = useState({
    name: '',
    description: '',
    public_key: '',
    private_key: '',
    passphrase: '',
  });

  const loadIdentities = useCallback(async () => {
    try {
      const { data } = await api.get('/ssh-identities');
      setIdentities(data);
    } catch (err) {
      toast.error('Failed to load SSH identities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  const generateKey = async () => {
    if (!genForm.name) { toast.error('Name is required'); return; }
    if (genForm.passphrase !== genForm.passphrase_confirm) {
      toast.error('Passphrases do not match');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/ssh-identities/generate', {
        name: genForm.name,
        description: genForm.description || undefined,
        key_type: genForm.key_type,
        key_bits: genForm.key_bits ? parseInt(genForm.key_bits) : undefined,
        passphrase: genForm.passphrase || undefined,
      });
      toast.success('SSH key pair generated successfully');
      setShowModal(null);
      setGenForm({ name: '', description: '', key_type: 'ed25519', key_bits: '', passphrase: '', passphrase_confirm: '' });
      loadIdentities();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate key pair');
    } finally {
      setSubmitting(false);
    }
  };

  const importKey = async () => {
    if (!importForm.name || !importForm.public_key || !importForm.private_key) {
      toast.error('Name, public key, and private key are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/ssh-identities/import', importForm);
      toast.success('SSH key imported successfully');
      setShowModal(null);
      setImportForm({ name: '', description: '', public_key: '', private_key: '', passphrase: '' });
      loadIdentities();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import key');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteIdentity = async (identity) => {
    if (!confirm(`Delete identity "${identity.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/ssh-identities/${identity.id}`);
      toast.success('Identity deleted');
      loadIdentities();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete identity');
    }
  };

  const exportPublicKey = async (identity) => {
    try {
      const response = await api.get(`/ssh-identities/${identity.id}/export/public`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${identity.name.replace(/\s+/g, '_')}.pub`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to export public key');
    }
  };

  const exportPrivateKey = async (identity) => {
    if (!confirm(`Export private key for "${identity.name}"? This action will be logged.`)) return;
    try {
      const response = await api.get(`/ssh-identities/${identity.id}/export/private`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = identity.name.replace(/\s+/g, '_');
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Private key exported (action logged)');
    } catch (err) {
      toast.error('Failed to export private key');
    }
  };

  const copyPublicKey = (publicKey) => {
    navigator.clipboard.writeText(publicKey);
    toast.success('Public key copied to clipboard');
  };

  const selectedKeyType = KEY_TYPES.find((t) => t.value === genForm.key_type);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
            SSH Identity Vault
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage SSH key pairs and assign them to servers
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowModal('import')}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import Key
            </button>
            <button
              onClick={() => setShowModal('generate')}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              Generate Key
            </button>
          </div>
        )}
      </div>

      {/* Identity List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : identities.length === 0 ? (
        <div className="card p-16 text-center">
          <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No SSH Identities</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Generate a new key pair or import an existing one
          </p>
          {isAdmin && (
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowModal('import')} className="btn-secondary">Import Key</button>
              <button onClick={() => setShowModal('generate')} className="btn-primary">Generate Key</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {identities.map((identity) => (
            <div key={identity.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Key info */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl">
                    {KEY_TYPE_ICONS[identity.key_type] || '🔑'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{identity.name}</h3>
                      <KeyBadge type={identity.key_type} bits={identity.key_bits} />
                      {identity.has_passphrase && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          Passphrase
                        </span>
                      )}
                      {identity.server_count > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {identity.server_count} server{identity.server_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {identity.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{identity.description}</p>
                    )}
                    {identity.fingerprint && (
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-1 truncate">
                        {identity.fingerprint}
                      </p>
                    )}
                    {/* Public key preview */}
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-md">
                        {identity.public_key?.split('\n')[1]?.substring(0, 50)}...
                      </code>
                      <button
                        onClick={() => copyPublicKey(identity.public_key)}
                        className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 flex-shrink-0"
                        title="Copy public key"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Created {new Date(identity.created_at).toLocaleDateString()}
                      {identity.created_by_name && ` by ${identity.created_by_name}`}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => exportPublicKey(identity)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Download public key"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => exportPrivateKey(identity)}
                        className="p-2 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                        title="Export private key (logged)"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteIdentity(identity)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete identity"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Key Modal */}
      {showModal === 'generate' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="card p-6 w-full max-w-lg animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Generate SSH Key Pair</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Production Server Key"
                  value={genForm.name}
                  onChange={(e) => setGenForm({ ...genForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Key for production servers"
                  value={genForm.description}
                  onChange={(e) => setGenForm({ ...genForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Key Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {KEY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setGenForm({ ...genForm, key_type: t.value, key_bits: t.bits[t.bits.length - 1]?.toString() || '' })}
                      className={`p-3 rounded-lg border-2 text-center transition-colors ${
                        genForm.key_type === t.value
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xl mb-1">{KEY_TYPE_ICONS[t.value]}</div>
                      <div className="text-xs font-medium">{t.value.toUpperCase()}</div>
                      {t.value === 'ed25519' && <div className="text-xs text-green-600">Recommended</div>}
                    </button>
                  ))}
                </div>
              </div>
              {selectedKeyType && selectedKeyType.bits.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Key Size (bits)</label>
                  <select
                    className="input-field"
                    value={genForm.key_bits}
                    onChange={(e) => setGenForm({ ...genForm, key_bits: e.target.value })}
                  >
                    {selectedKeyType.bits.map((b) => (
                      <option key={b} value={b}>{b} bits</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Passphrase (optional)
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Leave empty for no passphrase"
                  value={genForm.passphrase}
                  onChange={(e) => setGenForm({ ...genForm, passphrase: e.target.value })}
                />
              </div>
              {genForm.passphrase && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Passphrase
                  </label>
                  <input
                    type="password"
                    className={`input-field ${genForm.passphrase_confirm && genForm.passphrase !== genForm.passphrase_confirm ? 'border-red-500' : ''}`}
                    placeholder="Repeat passphrase"
                    value={genForm.passphrase_confirm}
                    onChange={(e) => setGenForm({ ...genForm, passphrase_confirm: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={generateKey}
                disabled={submitting}
                className="btn-primary flex items-center gap-2"
              >
                {submitting && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                Generate Key Pair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Key Modal */}
      {showModal === 'import' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="card p-6 w-full max-w-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Import SSH Key</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="My SSH Key"
                    value={importForm.name}
                    onChange={(e) => setImportForm({ ...importForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Optional description"
                    value={importForm.description}
                    onChange={(e) => setImportForm({ ...importForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Public Key *</label>
                <textarea
                  className="input-field h-24 font-mono text-xs resize-none"
                  placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                  value={importForm.public_key}
                  onChange={(e) => setImportForm({ ...importForm, public_key: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Private Key *</label>
                <textarea
                  className="input-field h-32 font-mono text-xs resize-none"
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  value={importForm.private_key}
                  onChange={(e) => setImportForm({ ...importForm, private_key: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Passphrase (if key is encrypted)
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Leave empty if no passphrase"
                  value={importForm.passphrase}
                  onChange={(e) => setImportForm({ ...importForm, passphrase: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={importKey}
                disabled={submitting}
                className="btn-primary flex items-center gap-2"
              >
                {submitting && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
                Import Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
