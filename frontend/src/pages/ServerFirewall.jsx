import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function ServerFirewall() {
  const { id: serverId } = useParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [numberedRules, setNumberedRules] = useState([]);
  const [newRule, setNewRule] = useState({
    port: '',
    protocol: 'tcp',
    action: 'allow',
    from: '',
    direction: 'in',
  });

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/firewall/${serverId}/status`);
      setStatus(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load firewall status');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  const loadNumberedRules = async () => {
    try {
      const { data } = await api.get(`/firewall/${serverId}/rules/numbered`);
      setNumberedRules(data);
    } catch (err) {
      console.error('Failed to load numbered rules');
    }
  };

  useEffect(() => {
    loadStatus();
    loadNumberedRules();
  }, [loadStatus]);

  const toggleFirewall = async () => {
    setToggling(true);
    try {
      await api.post(`/firewall/${serverId}/toggle`, { enable: !status.enabled });
      toast.success(`Firewall ${status.enabled ? 'disabled' : 'enabled'}`);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle firewall');
    } finally {
      setToggling(false);
    }
  };

  const addRule = async () => {
    if (!newRule.port) {
      toast.error('Port is required');
      return;
    }

    try {
      await api.post(`/firewall/${serverId}/rules`, newRule);
      toast.success('Rule added successfully');
      setShowAddRule(false);
      setNewRule({ port: '', protocol: 'tcp', action: 'allow', from: '', direction: 'in' });
      loadStatus();
      loadNumberedRules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add rule');
    }
  };

  const deleteRule = async (ruleNumber) => {
    if (!confirm(`Delete rule #${ruleNumber}?`)) return;

    try {
      await api.delete(`/firewall/${serverId}/rules`, { data: { ruleNumber } });
      toast.success('Rule deleted');
      loadStatus();
      loadNumberedRules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const setDefaultPolicy = async (direction, policy) => {
    try {
      await api.post(`/firewall/${serverId}/default`, { direction, policy });
      toast.success(`Default ${direction} policy set to ${policy}`);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set default policy');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (status?.type === 'none') {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Firewall Detected</h3>
          <p className="text-gray-500 dark:text-gray-400">
            UFW or iptables is not installed on this server.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Install UFW with: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">sudo apt install ufw</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Status Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${
              status?.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              <svg className={`h-7 w-7 ${status?.enabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {status?.type?.toUpperCase()} Firewall
              </h2>
              <p className={`text-sm ${status?.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                {status?.enabled ? 'Active and protecting' : 'Inactive'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleFirewall}
            disabled={toggling}
            className={`${status?.enabled ? 'btn-danger' : 'btn-primary'} flex items-center gap-2`}
          >
            {toggling && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
            {status?.enabled ? 'Disable' : 'Enable'} Firewall
          </button>
        </div>

        {status?.enabled && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Default Incoming</p>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  status?.defaultIncoming === 'deny' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {status?.defaultIncoming || 'deny'}
                </span>
                <select
                  className="input-field text-sm py-1"
                  value={status?.defaultIncoming || 'deny'}
                  onChange={(e) => setDefaultPolicy('incoming', e.target.value)}
                >
                  <option value="deny">Deny</option>
                  <option value="allow">Allow</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Default Outgoing</p>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  status?.defaultOutgoing === 'deny' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {status?.defaultOutgoing || 'allow'}
                </span>
                <select
                  className="input-field text-sm py-1"
                  value={status?.defaultOutgoing || 'allow'}
                  onChange={(e) => setDefaultPolicy('outgoing', e.target.value)}
                >
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Firewall Rules</h3>
          <button onClick={() => setShowAddRule(true)} className="btn-primary text-sm flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Rule
          </button>
        </div>

        {numberedRules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <p>No rules configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {numberedRules.map((rule) => (
              <div
                key={rule.number}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium">
                    {rule.number}
                  </span>
                  <code className="text-sm text-gray-700 dark:text-gray-300">{rule.rule}</code>
                </div>
                <button
                  onClick={() => deleteRule(rule.number)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Common Ports Quick Add */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Add Common Ports</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { port: '22', name: 'SSH' },
            { port: '80', name: 'HTTP' },
            { port: '443', name: 'HTTPS' },
            { port: '3306', name: 'MySQL' },
            { port: '5432', name: 'PostgreSQL' },
            { port: '6379', name: 'Redis' },
            { port: '27017', name: 'MongoDB' },
            { port: '8080', name: 'Alt HTTP' },
          ].map((item) => (
            <button
              key={item.port}
              onClick={() => {
                setNewRule({ ...newRule, port: item.port });
                setShowAddRule(true);
              }}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-gray-500 ml-1">:{item.port}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Add Rule Modal */}
      {showAddRule && (
        <div className="modal-overlay" onClick={() => setShowAddRule(false)}>
          <div className="card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Firewall Rule</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="22 or 8000:8100"
                    value={newRule.port}
                    onChange={(e) => setNewRule({ ...newRule, port: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protocol</label>
                  <select
                    className="input-field"
                    value={newRule.protocol}
                    onChange={(e) => setNewRule({ ...newRule, protocol: e.target.value })}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="any">Any</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
                  <select
                    className="input-field"
                    value={newRule.action}
                    onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                    <option value="reject">Reject</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Direction</label>
                  <select
                    className="input-field"
                    value={newRule.direction}
                    onChange={(e) => setNewRule({ ...newRule, direction: e.target.value })}
                  >
                    <option value="in">Incoming</option>
                    <option value="out">Outgoing</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From IP (optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="any or 192.168.1.0/24"
                  value={newRule.from}
                  onChange={(e) => setNewRule({ ...newRule, from: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddRule(false)} className="btn-secondary">Cancel</button>
              <button onClick={addRule} className="btn-primary">Add Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
