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

  const statusConfig = {
    online: { color: 'bg-emerald-500', glow: 'shadow-emerald-500/50', text: 'text-emerald-600', label: 'Online' },
    offline: { color: 'bg-gray-400', glow: '', text: 'text-gray-500', label: 'Offline' },
    maintenance: { color: 'bg-amber-500', glow: 'shadow-amber-500/50', text: 'text-amber-600', label: 'Maintenance' },
    error: { color: 'bg-red-500', glow: 'shadow-red-500/50', text: 'text-red-600', label: 'Error' },
  };

  const getStatus = (status) => statusConfig[status] || statusConfig.offline;

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

  const onlineCount = servers.filter(s => s.status === 'online').length;
  const offlineCount = servers.filter(s => s.status === 'offline').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
            Servers
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {servers.length} servers • <span className="text-emerald-600">{onlineCount} online</span> • <span className="text-gray-500">{offlineCount} offline</span>
          </p>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => { setEditServer(null); setShowModal(true); }}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all duration-300 hover:scale-105"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Server
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search servers..."
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              className="input-field pl-10"
            />
          </div>
          <select value={filter.os_type} onChange={(e) => setFilter((f) => ({ ...f, os_type: e.target.value }))} className="input-field">
            <option value="">All OS Types</option>
            <option value="linux">🐧 Linux</option>
            <option value="windows">🪟 Windows</option>
          </select>
          <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className="input-field">
            <option value="">All Status</option>
            <option value="online">🟢 Online</option>
            <option value="offline">⚫ Offline</option>
            <option value="maintenance">🟡 Maintenance</option>
            <option value="error">🔴 Error</option>
          </select>
          <select value={filter.group_id} onChange={(e) => setFilter((f) => ({ ...f, group_id: e.target.value }))} className="input-field">
            <option value="">All Groups</option>
            {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
        </div>
      </div>

      {/* Server grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="card p-12 text-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-900 dark:text-white">No servers found</p>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Add your first server to get started</p>
          {user?.role === 'admin' && (
            <button
              onClick={() => { setEditServer(null); setShowModal(true); }}
              className="btn-primary mt-4"
            >
              Add Server
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server, index) => {
            const status = getStatus(server.status);
            return (
              <div
                key={server.id}
                className="group card p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-transparent hover:border-primary-200 dark:hover:border-primary-800 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`relative flex items-center justify-center h-12 w-12 rounded-xl ${server.os_type === 'linux' ? 'bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-800/20' : 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20'}`}>
                      {server.os_type === 'linux' ? (
                        <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.002c-.06-.135-.12-.2-.283-.334-.18-.135-.72-.403-1.207-.534-.06-.003-.12 0-.18 0h-.016c.151-.467.182-.825.023-1.202-.19-.4-.505-.601-.91-.601-.94 0-2.514.655-4.286 1.133-.56.136-1.122.401-1.684.535H9.33c-.766-.268-1.347-.668-1.544-1.268l-.015-.066-.043-.2a2.675 2.675 0 010-.867c.025-.2.056-.4.155-.598.435-.867 1.023-1.467 1.678-2.067.656-.6 1.328-1.2 1.932-2.002.605-.798.993-1.598 1.078-2.398.01-.134.01-.2.015-.267.012-.135.02-.2.035-.267.014-.067.042-.133.1-.2h.003a.4.4 0 01.235-.133h.003a.4.4 0 01.135 0zm-5.516 3.073v.003c-.002.467.026.867.2 1.2h.003c.22.467.586.734 1.078.867a3.3 3.3 0 002.02-.134c.267-.135.514-.267.786-.4l.003-.003c.247-.129.5-.253.749-.38-.193.203-.416.404-.637.534-.28.2-.598.4-.934.533-.67.2-1.386.267-2.022.066h-.003c-.128-.059-.244-.119-.366-.2v-.003a1.717 1.717 0 01-.877-1.683v-.004zm10.057.667c.027 0 .06.003.086.01.19.065.332.13.492.334.02.066.039.132.04.2-.017.066-.043.132-.087.2-.044.063-.148.133-.264.133a.39.39 0 01-.174-.054c-.123-.06-.19-.134-.232-.268-.02-.066-.013-.133.013-.2.026-.064.078-.133.126-.133z"/>
                        </svg>
                      ) : (
                        <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                        </svg>
                      )}
                      <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${status.color} ${status.glow} shadow-lg ring-2 ring-white dark:ring-gray-800`} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/servers/${server.id}`}
                        className="font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors block truncate"
                      >
                        {server.display_name || server.hostname}
                      </Link>
                      <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <span className="font-mono">{server.ip_address}</span>
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${status.text} px-2 py-1 rounded-full bg-opacity-10 ${status.color.replace('bg-', 'bg-opacity-10 bg-')}`}>
                    {status.label}
                  </span>
                </div>

                {server.description && (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 truncate">{server.description}</p>
                )}

                {server.latest_metrics ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MetricBar label="CPU" value={server.latest_metrics.cpu_usage} icon="cpu" />
                    <MetricBar label="RAM" value={server.latest_metrics.ram_usage_percent} icon="ram" />
                  </div>
                ) : (
                  <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
                    <p className="text-xs text-gray-400">No metrics available</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-3">
                    <Link to={`/servers/${server.id}`} className="text-xs font-medium text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 flex items-center gap-1 transition-colors">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Overview
                    </Link>
                    <Link to={`/servers/${server.id}/monitoring`} className="text-xs font-medium text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 flex items-center gap-1 transition-colors">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                      Charts
                    </Link>
                    {server.os_type === 'linux' && (
                      <Link to={`/servers/${server.id}/terminal`} className="text-xs font-medium text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 flex items-center gap-1 transition-colors">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        SSH
                      </Link>
                    )}
                  </div>
                  {user?.role === 'admin' && (
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(server)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-all">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button onClick={() => deleteServer(server.id, server.display_name || server.hostname)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

function MetricBar({ label, value, icon }) {
  const pct = Math.min(100, value || 0);
  const color = pct > 90 ? 'from-red-500 to-red-400' : pct > 70 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400';
  const bgColor = pct > 90 ? 'bg-red-100 dark:bg-red-900/20' : pct > 70 ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-emerald-100 dark:bg-emerald-900/20';

  return (
    <div className={`p-2.5 rounded-lg ${bgColor} transition-colors`}>
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-gray-600 dark:text-gray-300">{label}</span>
        <span className="font-bold text-gray-900 dark:text-white">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-white/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-primary-50 to-white dark:from-gray-800 dark:to-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit Server' : 'Add Server'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">&times;</button>
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
                <option value="linux">🐧 Linux</option>
                <option value="windows">🪟 Windows</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS Version</label>
              <input type="text" className="input-field" placeholder="e.g., Ubuntu 22.04" value={form.os_version} onChange={(e) => setForm({ ...form, os_version: e.target.value })} />
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
            <textarea className="input-field" rows={2} placeholder="Optional description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {isEdit && !showCredentials ? (
            <button type="button" onClick={() => setShowCredentials(true)} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              Change credentials...
            </button>
          ) : (
            <>
              {form.os_type === 'linux' && (
                <fieldset className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
                  <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">SSH Credentials {isEdit && '(leave empty to keep current)'}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Username</label>
                      <input type="text" className="input-field" placeholder="root" value={form.ssh_username} onChange={(e) => setForm({ ...form, ssh_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
                      <input type="password" className="input-field" value={form.ssh_password} onChange={(e) => setForm({ ...form, ssh_password: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">SSH Private Key (PEM)</label>
                    <textarea className="input-field font-mono text-xs" rows={4} placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."} value={form.ssh_private_key} onChange={(e) => setForm({ ...form, ssh_private_key: e.target.value })} />
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">SSH Port</label>
                    <input type="number" className="input-field w-24" value={form.ssh_port} onChange={(e) => setForm({ ...form, ssh_port: e.target.value })} />
                  </div>
                </fieldset>
              )}
              {form.os_type === 'windows' && (
                <fieldset className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
                  <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 px-2">RDP Credentials {isEdit && '(leave empty to keep current)'}</legend>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Username</label>
                      <input type="text" className="input-field" placeholder="Administrator" value={form.rdp_username} onChange={(e) => setForm({ ...form, rdp_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
                      <input type="password" className="input-field" value={form.rdp_password} onChange={(e) => setForm({ ...form, rdp_password: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">RDP Port</label>
                    <input type="number" className="input-field w-24" value={form.rdp_port} onChange={(e) => setForm({ ...form, rdp_port: e.target.value })} />
                  </div>
                </fieldset>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : isEdit ? 'Update Server' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
