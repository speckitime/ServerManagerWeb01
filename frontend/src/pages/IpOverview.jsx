import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function IpOverview() {
  const [ips, setIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    loadIps();
  }, [search, typeFilter]);

  const loadIps = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (typeFilter) params.type = typeFilter;
      const { data } = await api.get('/ips', { params });
      setIps(data);
    } catch (err) {
      toast.error('Failed to load IP addresses');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    window.open('/api/ips/export/csv', '_blank');
  };

  const statusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IP Addresses</h1>
        <button onClick={exportCsv} className="btn-secondary">
          Export CSV
        </button>
      </div>

      <div className="card p-4">
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search IPs, hostnames..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field flex-1 min-w-[200px]"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="">All Types</option>
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Server</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Label</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Group</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {ips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No IP addresses found
                  </td>
                </tr>
              ) : (
                ips.map((ip) => (
                  <tr key={ip.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-3">
                      <span className="font-mono font-medium text-gray-900 dark:text-white">{ip.ip_address}</span>
                      {ip.is_primary && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-900 dark:text-white">
                      {ip.display_name || ip.hostname}
                    </td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400 uppercase text-xs">{ip.type}</td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400">{ip.label || '-'}</td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400 capitalize">{ip.os_type}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${statusColor(ip.status)}`} />
                        <span className="text-gray-600 dark:text-gray-300 capitalize">{ip.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {ip.group_name ? (
                        <span
                          className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                          style={{ backgroundColor: ip.group_color || '#6B7280' }}
                        >
                          {ip.group_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
