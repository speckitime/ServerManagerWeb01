import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getSocket } from '../services/socket';
import useTerminalStore from '../store/terminalStore';

function TerminalTab({ serverId, session, isActive }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const listenersSetupRef = useRef(false);
  const termDataDisposableRef = useRef(null);
  const termResizeDisposableRef = useRef(null);
  const { appendBuffer, clearBuffer } = useTerminalStore();
  const sid = session.id;

  // Initialize terminal
  useEffect(() => {
    if (!isActive || !terminalRef.current) return;

    let mounted = true;
    let term = null;
    let fitAddon = null;

    const init = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      if (!mounted || !terminalRef.current) return;

      // Load xterm CSS
      if (!document.querySelector('link[href*="xterm"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css';
        document.head.appendChild(link);
      }

      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"Fira Code", "Cascadia Code", Menlo, monospace',
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6',
          cursor: '#c0caf5',
          black: '#32344a',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#ad8ee6',
          cyan: '#449dab',
          white: '#787c99',
          brightBlack: '#444b6a',
          brightRed: '#ff7a93',
          brightGreen: '#b9f27c',
          brightYellow: '#ff9e64',
          brightBlue: '#7da6ff',
          brightMagenta: '#bb9af7',
          brightCyan: '#0db9d7',
          brightWhite: '#acb0d0',
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(terminalRef.current);

      setTimeout(() => fitAddon.fit(), 10);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Restore buffer or show welcome
      if (session.buffer && session.buffer.length > 0) {
        session.buffer.forEach((chunk) => term.write(chunk));
        term.writeln('\r\n\x1b[33m--- Session restored ---\x1b[0m');
      } else {
        term.writeln('Welcome to ServerManager SSH Terminal');
        term.writeln(`Session: ${session.title}`);
        term.writeln('');
        startConnection(term);
      }
    };

    init();

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mounted = false;
      window.removeEventListener('resize', handleResize);
      cleanupListeners();
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [isActive, sid]);

  // Refit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current.fit(), 50);
    }
  }, [isActive]);

  const cleanupListeners = () => {
    const socket = getSocket();
    socket.off('ssh_connected', handleConnected);
    socket.off('ssh_data', handleData);
    socket.off('ssh_error', handleError);
    socket.off('ssh_closed', handleClosed);
    listenersSetupRef.current = false;

    if (termDataDisposableRef.current) {
      termDataDisposableRef.current.dispose();
      termDataDisposableRef.current = null;
    }
    if (termResizeDisposableRef.current) {
      termResizeDisposableRef.current.dispose();
      termResizeDisposableRef.current = null;
    }
  };

  const handleConnected = (payload) => {
    if (payload?.sessionId !== sid) return;
    setConnected(true);
    setConnecting(false);
    setError(null);

    const term = xtermRef.current;
    const socket = getSocket();

    if (term) {
      // Dispose old handlers first
      if (termDataDisposableRef.current) termDataDisposableRef.current.dispose();
      if (termResizeDisposableRef.current) termResizeDisposableRef.current.dispose();

      // Set up input handler - this sends keystrokes to backend
      termDataDisposableRef.current = term.onData((data) => {
        socket.emit('ssh_data', { sessionId: sid, data });
      });

      // Set up resize handler
      termResizeDisposableRef.current = term.onResize(({ cols, rows }) => {
        socket.emit('ssh_resize', { sessionId: sid, cols, rows });
      });
    }
  };

  const handleData = (payload) => {
    if (payload?.sessionId !== sid) return;
    const text = payload.data;
    if (text && xtermRef.current) {
      xtermRef.current.write(text);
      appendBuffer(serverId, sid, text);
    }
  };

  const handleError = (payload) => {
    if (payload?.sessionId !== sid) return;
    setConnecting(false);
    setConnected(false);
    const msg = payload.error || 'Connection failed';
    setError(msg);
    if (xtermRef.current) {
      xtermRef.current.writeln(`\r\n\x1b[31mError: ${msg}\x1b[0m`);
    }
  };

  const handleClosed = (payload) => {
    if (payload?.sessionId !== sid) return;
    setConnected(false);
    if (xtermRef.current) {
      xtermRef.current.writeln('\r\n\x1b[33mConnection closed\x1b[0m');
    }
  };

  const startConnection = (term) => {
    const socket = getSocket();

    // Clean up any existing listeners first
    cleanupListeners();

    setConnecting(true);
    setError(null);

    if (term) {
      term.writeln('Connecting...');
    }

    // Set up socket listeners
    socket.on('ssh_connected', handleConnected);
    socket.on('ssh_data', handleData);
    socket.on('ssh_error', handleError);
    socket.on('ssh_closed', handleClosed);
    listenersSetupRef.current = true;

    // Send connect request
    socket.emit('ssh_connect', {
      serverId,
      sessionId: sid,
      cols: term?.cols || 80,
      rows: term?.rows || 24,
    });
  };

  const reconnect = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      clearBuffer(serverId, sid);
      startConnection(xtermRef.current);
    }
  };

  const disconnect = () => {
    const socket = getSocket();
    socket.emit('ssh_disconnect', { sessionId: sid });
    setConnected(false);
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
            connected ? 'bg-green-500 shadow-lg shadow-green-500/50' :
            connecting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'
          }`} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="flex gap-2">
          {connected && (
            <button onClick={disconnect} className="text-xs px-3 py-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all">
              Disconnect
            </button>
          )}
          {!connected && !connecting && (
            <button onClick={reconnect} className="btn-primary text-sm">
              Reconnect
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-2 animate-slide-up">
          {error}
        </div>
      )}

      <div
        ref={terminalRef}
        className="flex-1 min-h-[400px] bg-[#1a1b26] rounded-lg overflow-hidden shadow-lg"
        style={{ padding: '8px' }}
      />
    </div>
  );
}

export default function ServerTerminal() {
  const { id } = useParams();
  const { getServerSessions, getActiveTab, setActiveTab, addSession, removeSession, ensureSession } = useTerminalStore();

  useEffect(() => {
    ensureSession(id);

    return () => {
      const socket = getSocket();
      const sessions = useTerminalStore.getState().getServerSessions(id);
      sessions.forEach((session) => {
        socket.emit('ssh_disconnect', { sessionId: session.id });
      });
    };
  }, [id]);

  const sessions = getServerSessions(id);
  const activeTab = getActiveTab(id);

  return (
    <div className="h-full flex flex-col">
      {/* Terminal tabs */}
      <div className="flex items-center gap-1 mb-3">
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto flex-1 shadow-inner">
          {sessions.map((session, index) => (
            <div
              key={session.id}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-all duration-200 whitespace-nowrap ${
                activeTab === index
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md transform scale-[1.02]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
              onClick={() => setActiveTab(id, index)}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              {session.title}
              {sessions.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const socket = getSocket();
                    socket.emit('ssh_disconnect', { sessionId: session.id });
                    removeSession(id, session.id);
                  }}
                  className="ml-1 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => addSession(id)}
          className="flex-shrink-0 p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-all rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:shadow-md"
          title="New Terminal"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Active terminal */}
      <div className="flex-1">
        {sessions.map((session, index) => (
          <TerminalTab
            key={session.id}
            serverId={id}
            session={session}
            isActive={activeTab === index}
          />
        ))}
      </div>
    </div>
  );
}
