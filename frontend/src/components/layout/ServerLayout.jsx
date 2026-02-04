import { useState, useEffect } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import api from '../../services/api';

const tabs = [
  { path: '', label: 'Overview', end: true },
  { path: '/monitoring', label: 'Monitoring' },
  { path: '/terminal', label: 'Terminal', linuxOnly: true },
  { path: '/packages', label: 'Packages' },
  { path: '/logs', label: 'Logs' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/documents', label: 'Docs' },
];

export default function ServerLayout() {
  const { id } = useParams();
  const [server, setServer] = useState(null);

  useEffect(() => {
    api.get(`/servers/${id}`).then(({ data }) => setServer(data)).catch(() => {});
  }, [id]);

  const statusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-400';
      case 'maintenance': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const filteredTabs = tabs.filter(
    (t) => !t.linuxOnly || server?.os_type === 'linux'
  );

  return (
    <div className="space-y-0 h-full flex flex-col">
      {/* Server header with tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 -mx-4 md:-mx-6 -mt-4 md:-mt-6 px-4 md:px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Link to="/servers" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div className={`h-2.5 w-2.5 rounded-full ${statusColor(server?.status)}`} />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              {server?.display_name || server?.hostname || 'Loading...'}
            </h1>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {server?.ip_address}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-0 overflow-x-auto -mb-px">
          {filteredTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/servers/${id}${tab.path}`}
              end={tab.end}
              className={({ isActive }) =>
                `px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto pt-6">
        <Outlet />
      </div>
    </div>
  );
}
