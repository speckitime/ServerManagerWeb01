import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function Servers() {
  const [servers, setServers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [filter, setFilter] = useState({ search: '', os_type: '', group_id: '', status: '' });
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      const params = {};
      if (filter.search) params.search = filter.search;
      if (filter.os_type) params.os_type = filter.os_type;
      if (filter.group_id) params.group_id = filter.group_id;
      if (filter.status) params.status = filter.status;

      const [serversRes, groupsRes] = await Promise.all([
        api.get('/servers', { params }),
        api.get('/groups'),
      ]);
      setServers(serversRes.data);
      setGroups(groupsRes.data);
    } catch (err) {
      toast.error('Failed to load servers');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-400';
      case 'maintenance': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const deleteServer = async (id, name) => {
    if (!confirm(`Delete server "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/servers/${id}`);
      toast.success('Server deleted');
      loadData();
    } catch (err) {
      toast.error('Failed to delete server');
    }
  };

  const openEdit = async (server) => {
    try {
      const { data } = await api.get(`/servers/${server.id}`);
      setEditServer(data);
      setShowModal(true);
    } catch (err) {
      toast.error('Failed to load server details');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Servers</h1>
        {user?.role === 'admin' && (
          <button onClick={() => { setEditServer(null); setShowModal(true); }} className="btn-primary">
            Add Server
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search servers..."
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            className="input-field"
          />
          <select value={filter.os_type} onChange={(e) => setFilter((f) => ({ ...f, os_type: e.target.value }))} className="input-field">
            <option value="">All OS Types</option>
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
          </select>
          <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className="input-field">
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Maintenance</option>
            <option value="error">Error</option>
          </select>
          <select value={filter.group_id} onChange={(e) => setFilter((f) => ({ ...f, group_id: e.target.value }))} className="input-field">
            <option value="">All Groups</option>
            {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
        </div>
      </div>

      {/* Server grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      ) : servers.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No servers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <div key={server.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${statusColor(server.status)}`} />
                  <div>
                    <Link to={`/servers/${server.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-primary-600">
                      {server.display_name || server.hostname}
                    </Link>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{server.ip_address}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                  {server.os_type}
                </span>
              </div>

              {server.description && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 truncate">{server.description}</p>
              )}

              {server.latest_metrics && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <MetricBar label="CPU" value={server.latest_metrics.cpu_usage} />
                  <MetricBar label="RAM" value={server.latest_metrics.ram_usage_percent} />
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <Link to={`/servers/${server.id}/monitoring`} className="text-xs text-primary-600 hover:underline">Monitoring</Link>
                  {server.os_type === 'linux' && (
                    <Link to={`/servers/${server.id}/terminal`} className="text-xs text-primary-600 hover:underline">Terminal</Link>
                  )}
                </div>
                {user?.role === 'admin' && (
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(server)} className="text-xs text-primary-600 hover:text-primary-700">Edit</button>
                    <button onClick={() => deleteServer(server.id, server.display_name || server.hostname)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ServerFormModal
          server={editServer}
          groups={groups}
          onClose={() => { setShowModal(false); setEditServer(null); }}
          onSaved={() => { setShowModal(false); setEditServer(null); loadData(); }}
        />
      )}
    </div>
  );
}

function MetricBar({ label, value }) {
  const pct = Math.min(100, value || 0);
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>{label}</span><span>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ServerFormModal({ server, groups, onClose, onSaved }) {
  const isEdit = !!server;
  const [form, setForm] = useState({
    hostname: server?.hostname || '',
    display_name: server?.display_name || '',
    ip_address: server?.ip_address || '',
    os_type: server?.os_type || 'linux',
    os_version: server?.os_version || '',
    description: server?.description || '',
    ssh_port: server?.ssh_port || 22,
    rdp_port: server?.rdp_port || 3389,
    group_id: server?.group_id || '',
    ssh_username: '',
    ssh_password: '',
    ssh_private_key: '',
    rdp_username: '',
    rdp_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [showCredentials, setShowCredentials] = useState(!isEdit);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        hostname: form.hostname,
        display_name: form.display_name,
        ip_address: form.ip_address,
        os_type: form.os_type,
        os_version: form.os_version,
        description: form.description,
        ssh_port: parseInt(form.ssh_port, 10),
        rdp_port: parseInt(form.rdp_port, 10),
        group_id: form.group_id || null,
      };

      if (form.ssh_username) {
        payload.ssh_credentials = { username: form.ssh_username, password: form.ssh_password };
      }
      if (form.ssh_private_key) {
        payload.ssh_private_key = form.ssh_private_key;
      }
      if (form.rdp_username) {
        payload.rdp_credentials = { username: form.rdp_username, password: form.rdp_password };
      }

      if (isEdit) {
        await api.put(`/servers/${server.id}`, payload);
        toast.success('Server updated');
      } else {
        await api.post('/servers', payload);
        toast.success('Server added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'add'} server`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit Server' : 'Add Server'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hostname *</label>
              <input type="text" className="input-field" required value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
              <input type="text" className="input-field" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address *</label>
              <input type="text" className="input-field" required value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS Type *</label>
              <select className="input-field" value={form.os_type} onChange={(e) => setForm({ ...form, os_type: e.target.value })}>
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS Version</label>
              <input type="text" className="input-field" value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group</label>
              <select className="input-field" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                <option value="">No Group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {isEdit && !showCredentials ? (
            <button type="button" onClick={() => setShowCredentials(true)} className="text-sm text-primary-600 hover:text-primary-700">
              Change credentials...
            </button>
          ) : (
            <>
              {form.os_type === 'linux' && (
                <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-1">SSH Credentials {isEdit && '(leave empty to keep current)'}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Username</label>
                      <input type="text" className="input-field" value={form.ssh_username} onChange={(e) => setForm({ ...form, ssh_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Password</label>
                      <input type="password" className="input-field" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">SSH Private Key (PEM)</label>
                    <textarea className="input-field font-mono text-xs" rows={4} placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."} value={form.ssh_private_key} onChange={(e) => setForm({ ...form, ssh_private_key: e.target.value })} />
                  </div>
                  <div className="mt-2">
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">SSH Port</label>
                    <input type="number" className="input-field w-32" value={form.ssh_port} onChange={(e) => setForm({ ...form, ssh_port: e.target.value })} />
                  </div>
                </fieldset>
              )}
              {form.os_type === 'windows' && (
                <fieldset className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-1">RDP Credentials {isEdit && '(leave empty to keep current)'}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Username</label>
                      <input type="text" className="input-field" value={form.rdp_username} onChange={(e) => setForm({ ...form, rdp_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Password</label>
                      <input type="password" className="input-field" value={form.rdp_password} onChange={(e) => setForm({ ...form, rdp_password: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">RDP Port</label>
                    <input type="number" className="input-field w-32" value={form.rdp_port} onChange={(e) => setForm({ ...form, rdp_port: e.target.value })} />
                  </div>
                </fieldset>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : isEdit ? 'Update Server' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
