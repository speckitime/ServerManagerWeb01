import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 3 AM', value: '0 3 * * *' },
  { label: 'Weekly (Sunday midnight)', value: '0 0 * * 0' },
  { label: 'Monthly (1st at midnight)', value: '0 0 1 * *' },
];

export default function ServerTasks() {
  const { id } = useParams();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    loadTasks();
  }, [id]);

  const loadTasks = async () => {
    try {
      const { data } = await api.get(`/servers/${id}/tasks`);
      setTasks(data);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId, name) => {
    if (!confirm(`Delete task "${name}"?`)) return;
    try {
      await api.delete(`/servers/${id}/tasks/${taskId}`);
      toast.success('Task deleted');
      loadTasks();
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const viewTaskDetail = async (taskId) => {
    try {
      const { data } = await api.get(`/servers/${id}/tasks/${taskId}`);
      setSelectedTask(data);
    } catch (err) {
      toast.error('Failed to load task details');
    }
  };

  const toggleActive = async (task) => {
    try {
      await api.put(`/servers/${id}/tasks/${task.id}`, { is_active: !task.is_active });
      toast.success(`Task ${task.is_active ? 'disabled' : 'enabled'}`);
      loadTasks();
    } catch (err) {
      toast.error('Failed to update task');
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
        <div className="flex items-center gap-3">
          <Link to={`/servers/${id}`} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            &larr; Back
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Scheduled Tasks</h1>
        </div>
        {user?.role !== 'readonly' && (
          <button onClick={() => { setEditTask(null); setShowForm(true); }} className="btn-primary text-sm">
            Create Task
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Run</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No scheduled tasks
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-3">
                      <button
                        onClick={() => viewTaskDetail(task.id)}
                        className="font-medium text-primary-600 hover:underline"
                      >
                        {task.name}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-300 capitalize">{task.type}</td>
                    <td className="px-6 py-3 font-mono text-gray-600 dark:text-gray-300">{task.cron_expression}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        task.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {task.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400">
                      {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user?.role !== 'readonly' && (
                          <>
                            <button
                              onClick={() => toggleActive(task)}
                              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                            >
                              {task.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => { setEditTask(task); setShowForm(true); }}
                              className="text-xs text-primary-600 hover:text-primary-700"
                            >
                              Edit
                            </button>
                          </>
                        )}
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => deleteTask(task.id, task.name)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <TaskForm
          serverId={id}
          task={editTask}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadTasks(); }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

function TaskForm({ serverId, task, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: task?.name || '',
    description: task?.description || '',
    type: task?.type || 'update',
    cron_expression: task?.cron_expression || '0 3 * * *',
    script_content: task?.script_content || '',
    is_active: task?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (task) {
        await api.put(`/servers/${serverId}/tasks/${task.id}`, form);
      } else {
        await api.post(`/servers/${serverId}/tasks`, form);
      }
      toast.success(task ? 'Task updated' : 'Task created');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {task ? 'Edit Task' : 'Create Task'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input type="text" className="input-field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="update">Automatic Updates</option>
              <option value="reboot">Scheduled Reboot</option>
              <option value="script">Custom Script</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Schedule (Cron) *</label>
            <input type="text" className="input-field font-mono" required value={form.cron_expression} onChange={(e) => setForm({ ...form, cron_expression: e.target.value })} />
            <div className="mt-2 flex flex-wrap gap-1">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm({ ...form, cron_expression: p.value })}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {form.type === 'script' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Script Content *</label>
              <textarea
                className="input-field font-mono text-sm"
                rows={8}
                value={form.script_content}
                onChange={(e) => setForm({ ...form, script_content: e.target.value })}
                placeholder="#!/bin/bash&#10;# Your script here"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded text-primary-600"
            />
            Active
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : task ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{task.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Type</p>
              <p className="font-medium text-gray-900 dark:text-white capitalize">{task.type}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Schedule</p>
              <p className="font-mono text-gray-900 dark:text-white">{task.cron_expression}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Status</p>
              <p className="font-medium text-gray-900 dark:text-white">{task.is_active ? 'Active' : 'Disabled'}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Last Run</p>
              <p className="text-gray-900 dark:text-white">{task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}</p>
            </div>
          </div>

          {task.description && (
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Description</p>
              <p className="text-gray-900 dark:text-white">{task.description}</p>
            </div>
          )}

          {task.script_content && (
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Script</p>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">{task.script_content}</pre>
            </div>
          )}

          {task.logs && task.logs.length > 0 && (
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Execution History</p>
              <div className="space-y-2">
                {task.logs.map((log) => (
                  <div key={log.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className={`font-medium ${log.status === 'completed' ? 'text-green-600' : log.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                        {log.status}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {new Date(log.started_at).toLocaleString()}
                      </span>
                    </div>
                    {log.output && (
                      <pre className="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{log.output}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
