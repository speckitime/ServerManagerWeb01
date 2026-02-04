import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSocket } from '../services/socket';

export default function ServerTerminal() {
  const { id } = useParams();
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let term;
    let fitAddon;

    const initTerminal = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      // Load xterm CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css';
      document.head.appendChild(link);

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
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln('Welcome to ServerManager SSH Terminal');
      term.writeln('Connecting...');
      term.writeln('');

      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      };
      window.addEventListener('resize', handleResize);

      connectSSH(term, fitAddon);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    };

    initTerminal();

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
      const socket = getSocket();
      socket.emit('ssh_disconnect');
      socket.off('ssh_data');
      socket.off('ssh_connected');
      socket.off('ssh_error');
      socket.off('ssh_closed');
    };
  }, [id]);

  const connectSSH = (term, fitAddon) => {
    setConnecting(true);
    const socket = getSocket();

    socket.emit('ssh_connect', {
      serverId: id,
      cols: term.cols,
      rows: term.rows,
    });

    socket.on('ssh_connected', () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      term.clear();

      term.onData((data) => {
        socket.emit('ssh_data', data);
      });

      term.onResize(({ cols, rows }) => {
        socket.emit('ssh_resize', { cols, rows });
      });
    });

    socket.on('ssh_data', (data) => {
      term.write(data);
    });

    socket.on('ssh_error', (data) => {
      setConnecting(false);
      setError(data.error);
      term.writeln(`\r\n\x1b[31mError: ${data.error}\x1b[0m`);
    });

    socket.on('ssh_closed', () => {
      setConnected(false);
      term.writeln('\r\n\x1b[33mConnection closed\x1b[0m');
    });
  };

  const reconnect = () => {
    setError(null);
    if (xtermRef.current) {
      xtermRef.current.clear();
      connectSSH(xtermRef.current, fitAddonRef.current);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm text-gray-500 dark:text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {!connected && !connecting && (
          <button onClick={reconnect} className="btn-primary text-sm">
            Reconnect
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
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
