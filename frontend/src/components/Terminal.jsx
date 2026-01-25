import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Clipboard, Copy } from 'lucide-react';
import { getToken } from '../services/auth';
import '@xterm/xterm/css/xterm.css';

function Terminal({ projectId }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [copied, setCopied] = useState(false);

  // Copy selected text from terminal
  const handleCopy = async () => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    try {
      let text = '';
      if (xterm.hasSelection()) {
        text = xterm.getSelection();
      } else {
        // If no selection, try to get the last few lines as a fallback
        const buffer = xterm.buffer.active;
        const lines = [];
        for (let i = Math.max(0, buffer.cursorY - 10); i <= buffer.cursorY; i++) {
          const line = buffer.getLine(i);
          if (line) {
            lines.push(line.translateToString(true));
          }
        }
        text = lines.join('\n').trim();
      }

      if (text) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      // Fallback for browsers that don't support clipboard API
      alert('Copy failed. Please select text and use Ctrl+C');
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: text }));
      }
    } catch (err) {
      console.error('Paste failed:', err);
    }
  };

  useEffect(() => {
    if (!terminalRef.current || !projectId) return;

    // Initialize xterm
    const xterm = new XTerm({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#f97316',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e2e8f0',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc'
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);

    // Handle Ctrl+Shift+V for paste
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        handlePaste();
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        handleCopy();
        return false;
      }
      return true;
    });

    // Handle right-click paste
    terminalRef.current.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handlePaste();
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Fit terminal to container
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getToken();
    const wsUrl = `${protocol}//${window.location.host}/ws?projectId=${projectId}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Send initial size
      ws.send(JSON.stringify({
        type: 'resize',
        cols: xterm.cols,
        rows: xterm.rows
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'output':
            xterm.write(msg.data);
            break;
          case 'connected':
            xterm.write(`\r\n\x1b[32mConnected to project: ${msg.projectName}\x1b[0m\r\n`);
            xterm.write(`\x1b[90mPath: ${msg.projectPath}\x1b[0m\r\n\r\n`);
            break;
          case 'exit':
            xterm.write(`\r\n\x1b[33mSession ended (exit code: ${msg.exitCode})\x1b[0m\r\n`);
            setStatus('disconnected');
            break;
          case 'error':
            xterm.write(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      xterm.write('\r\n\x1b[33mDisconnected from server\x1b[0m\r\n');
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('error');
    };

    // Handle terminal input
    xterm.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: xterm.cols,
          rows: xterm.rows
        }));
      }
    };

    window.addEventListener('resize', handleResize);

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(terminalRef.current);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      ws.close();
      xterm.dispose();
    };
  }, [projectId]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Claude Terminal</span>
          <span className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-green-500' :
            status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-xs text-slate-400">{status}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors flex items-center gap-1"
            title="Copy selection (Ctrl+Shift+C)"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handlePaste}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors flex items-center gap-1"
            title="Paste (Ctrl+Shift+V or Right-click)"
          >
            <Clipboard className="w-3 h-3" />
            Paste
          </button>
          <button
            onClick={() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'restart' }));
              }
            }}
            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            Restart Claude
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="flex-1" />
    </div>
  );
}

export default Terminal;
