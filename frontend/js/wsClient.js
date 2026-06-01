let ws = null;
let onReload = null;

function tryConnect() {
  ws = new WebSocket('ws://localhost:3000');

  ws.onopen = () => {
    const lastShader = localStorage.getItem('shader3d-last-shader');
    if (lastShader) {
      ws.send(JSON.stringify({ type: 'active', path: lastShader }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'reload' && onReload) {
        onReload();
      }
    } catch {}
  };

  ws.onclose = () => {
    setTimeout(tryConnect, 2000);
  };

  ws.onerror = () => {};
}

export function connectWs(reloadCallback) {
  onReload = reloadCallback;
  tryConnect();
}

export function sendActivePath(path) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'active', path }));
  }
}
