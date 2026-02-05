import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getSocket } from '../services/socket';
import useTerminalStore from '../store/terminalStore';

function TerminalTab({ serverId, session, isActive, onActivate, onClose, canClose }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const socketListenersRef = useRef(null);
  const { appendBuffer } = useTerminalStore();

  useEffect(() => {
    if (!isActive) return;

    let term;
    let fitAddon;
    let cleanup = () => {};

    const initTerminal = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      // Load xterm CSS only once
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

      if (terminalRef.current) {
        term.open(terminalRef.current);
        fitAddon.fit();
      }

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Restore session buffer
      if (session.buffer && session.buffer.length > 0) {
        session.buffer.forEach((chunk) => {
          term.write(chunk);
        });
        // If we have buffer, we were previously connected
        term.writeln('\r\n\x1b[33m--- Session restored ---\x1b[0m');
      }

      // Check if there is no previous buffer (fresh session)
      if (!session.buffer || session.buffer.length === 0) {
        term.writeln('Welcome to ServerManager SSH Terminal');
        term.writeln(`Session: ${session.title}`);
        term.writeln('Connecting...');
        term.writeln('');
        connectSSH(term, fitAddon);
      }

      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      };
      window.addEventListener('resize', handleResize);

      cleanup = () => {
        window.removeEventListener('resize', handleResize);
      };
    };

    initTerminal();

    return () => {
      cleanup();
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      // Clean up socket listeners for this session
      if (socketListenersRef.current) {
        const socket = getSocket();
        socket.off(`ssh_data_${session.id}`);
        socket.off(`ssh_connected_${session.id}`);
        socket.off(`ssh_error_${session.id}`);
        socket.off(`ssh_closed_${session.id}`);
      }
    };
  }, [isActive, session.id]);

  // Refit terminal when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current.fit();
      }, 50);
    }
  }, [isActive]);

  const connectSSH = useCallback((term, fitAddon) => {
    setConnecting(true);
    const socket = getSocket();

    // Use session-specific events
    const eventPrefix = session.id;

    socket.emit('ssh_connect', {
      serverId,
      sessionId: session.id,
      cols: term.cols,
      rows: term.rows,
    });

    const onConnected = () => {
      setConnected(true);
      setConnecting(false);
      setError(null);

      term.onData((data) => {
        socket.emit('ssh_data', { sessionId: session.id, data });
      });

      term.onResize(({ cols, rows }) => {
        socket.emit('ssh_resize', { sessionId: session.id, cols, rows });
      });
    };

    const onData = (data) => {
      term.write(data);
      appendBuffer(serverId, session.id, data);
    };

    const onError = (data) => {
      setConnecting(false);
      setError(data.error);
      term.writeln(`\r\n\x1b[31mError: ${data.error}\x1b[0m`);
    };

    const onClosed = () => {
      setConnected(false);
      term.writeln('\r\n\x1b[33mConnection closed\x1b[0m');
    };

    socket.on(`ssh_connected_${eventPrefix}`, onConnected);
    socket.on(`ssh_data_${eventPrefix}`, onData);
    socket.on(`ssh_error_${eventPrefix}`, onError);
    socket.on(`ssh_closed_${eventPrefix}`, onClosed);

    // Fallback: also listen to non-prefixed events for backward compatibility
    socket.on('ssh_connected', onConnected);
    socket.on('ssh_data', onData);
    socket.on('ssh_error', onError);
    socket.on('ssh_closed', onClosed);

    socketListenersRef.current = { onConnected, onData, onError, onClosed };
  }, [serverId, session.id, appendBuffer]);

  const reconnect = () => {
    setError(null);
    if (xtermRef.current) {
      xtermRef.current.clear();
      useTerminalStore.getState().clearBuffer(serverId, session.id);
      connectSSH(xtermRef.current, fitAddonRef.current);
    }
  };

  const disconnect = () => {
    const socket = getSocket();
    socket.emit('ssh_disconnect', { sessionId: session.id });
    setConnected(false);
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full transition-colors ${connected ? 'bg-green-500 animate-pulse' : connecting ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="flex gap-2">
          {connected && (
            <button onClick={disconnect} className="text-xs px-2 py-1 text-gray-500 hover:text-red-500 transition-colors">
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
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-2 animate-slide-up">
          {error}
        </div>
      )}

      <div
        ref={terminalRef}
        className="flex-1 min-h-[400px] bg-[#1a1b26] rounded-lg overflow-hidden"
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
      // Disconnect all sessions for this server
      const sessions = useTerminalStore.getState().getServerSessions(id);
      sessions.forEach((session) => {
        socket.emit('ssh_disconnect', { sessionId: session.id });
      });
      socket.off('ssh_data');
      socket.off('ssh_connected');
      socket.off('ssh_error');
      socket.off('ssh_closed');
    };
  }, [id]);

  const sessions = getServerSessions(id);
  const activeTab = getActiveTab(id);

  return (
    <div className="h-full flex flex-col">
      {/* Terminal tabs */}
      <div className="flex items-center gap-1 mb-2">
        <div className="flex items-center gap-0 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto flex-1">
          {sessions.map((session, index) => (
            <div
              key={session.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-all whitespace-nowrap ${
                activeTab === index
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(id, index)}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
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
          className="flex-shrink-0 p-1.5 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
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
            onActivate={() => setActiveTab(id, index)}
            onClose={() => removeSession(id, session.id)}
            canClose={sessions.length > 1}
          />
        ))}
      </div>
    </div>
  );
}
