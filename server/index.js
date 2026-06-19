const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const PING_INTERVAL = 30_000;
const PEER_TIMEOUT = 60_000;

const peers = new Map(); // peerId -> { ws, lastSeen }

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>KAmesh Relay</h1><p>Online peers: ${peers.size}</p><p>WebSocket: ws://host:${PORT}</p></body></html>`);
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, peers: peers.size, online: Array.from(peers.keys()) }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let peerId = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'relay_register':
          peerId = msg.peerId;
          peers.set(peerId, { ws, lastSeen: Date.now() });
          broadcastExcept(peerId, {
            type: 'relay_peer_online',
            peerId,
            timestamp: Date.now(),
          });
          ws.send(JSON.stringify({
            type: 'relay_peer_list',
            peers: Array.from(peers.keys()),
            timestamp: Date.now(),
          }));
          break;

        case 'relay_send':
          if (!peerId) break;
          const target = peers.get(msg.targetPeerId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: 'relay_message',
              senderId: peerId,
              payload: msg.payload,
              timestamp: Date.now(),
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'relay_error',
              message: `Peer ${msg.targetPeerId} is offline`,
            }));
          }
          break;

        case 'relay_broadcast':
          if (!peerId) break;
          broadcastExcept(peerId, {
            type: 'relay_message',
            senderId: peerId,
            payload: msg.payload,
            timestamp: Date.now(),
          });
          break;

        case 'relay_ping':
          if (peerId) {
            peers.set(peerId, { ws, lastSeen: Date.now() });
          }
          break;
      }
    } catch (err) {
      console.warn('Invalid message:', err.message);
    }
  });

  ws.on('close', () => {
    if (peerId) {
      peers.delete(peerId);
      broadcastExcept(peerId, {
        type: 'relay_peer_offline',
        peerId,
        timestamp: Date.now(),
      });
    }
  });

  ws.on('error', () => {
    if (peerId) peers.delete(peerId);
  });
});

function broadcastExcept(senderId, msg) {
  const data = JSON.stringify(msg);
  for (const [id, peer] of peers) {
    if (id !== senderId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(data);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, peer] of peers) {
    if (now - peer.lastSeen > PEER_TIMEOUT) {
      peer.ws.close();
      peers.delete(id);
    }
  }
}, PING_INTERVAL);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[KAmesh Relay] running on port ${PORT}`);
  console.log(`[KAmesh Relay] WebSocket: ws://0.0.0.0:${PORT}/ws`);
});
