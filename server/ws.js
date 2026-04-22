import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { parse as parseUrl } from 'url';

const SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026';

// In-memory presence maps. Survives only within a single node process.
// Multi-replica deployment (Railway scale > 1) would require a shared
// pub/sub (Redis). TM currently runs single-instance so this is fine.
const devices = new Map();       // deviceId (users.phone_id) -> WebSocket
const consoles = new Map();      // agentId  (users.id)       -> Set<WebSocket>

function authFromRequest(req) {
  const { query } = parseUrl(req.url || '', true);
  const token = query?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
}

function broadcastToAgent(agentId, payload) {
  const set = consoles.get(agentId);
  if (!set) return 0;
  const frame = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let n = 0;
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) { ws.send(frame); n++; }
  }
  return n;
}

export function attachWs(httpServer) {
  // Two endpoints share one HTTP server. Using `server:` option twice causes
  // upgrade-dispatch conflicts (both try to handle every upgrade), which
  // surfaces as RSV1 frame errors when a second socket opens. The stable
  // pattern: noServer on each WSS + a single manual upgrade router.
  // permessage-deflate off for simplicity and proxy compatibility.
  const deviceWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const consoleWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  httpServer.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname === '/ws/device') {
      deviceWss.handleUpgrade(request, socket, head, (ws) => deviceWss.emit('connection', ws, request));
    } else if (pathname === '/ws/console') {
      consoleWss.handleUpgrade(request, socket, head, (ws) => consoleWss.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
  });

  // ────────────────────────────────────────────────
  // Device channel (phone app)
  // ────────────────────────────────────────────────
  deviceWss.on('connection', (ws, req) => {
    const user = authFromRequest(req);
    if (!user) return ws.close(1008, 'unauthorized');
    // Phone devices belong to real agents only. super_admin/center_admin/lead_monitor
    // never register as a device — they use the console channel. A dev-only override
    // (ALLOW_ADMIN_DEVICE=1) lets super_admin register for debugging/simulation.
    const isAdminOverride = process.env.ALLOW_ADMIN_DEVICE === '1' && user.role === 'super_admin';
    if (user.role !== 'agent' && !isAdminOverride) {
      return ws.close(1008, 'forbidden');
    }
    const deviceId = user.phone_id;
    if (!deviceId) return ws.close(1008, 'no phone_id on user');

    // Replace prior socket for same device (phone reconnect case)
    const prior = devices.get(deviceId);
    if (prior && prior !== ws) {
      try { prior.close(1000, 'replaced'); } catch {}
    }
    devices.set(deviceId, ws);
    ws._meta = { kind: 'device', deviceId, agentId: user.id };

    safeSend(ws, { type: 'hello', role: 'device', deviceId, agentId: user.id });
    // Let the agent's consoles know the device is online
    broadcastToAgent(user.id, { type: 'device_presence', deviceId, online: true });

    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'ping':
          safeSend(ws, { type: 'pong', t: Date.now() });
          break;

        case 'call_state':
          // Phone reports ringing/offhook/idle + duration + recording path
          broadcastToAgent(user.id, {
            type: 'call_state',
            deviceId,
            callId: msg.callId || null,
            state: msg.state,
            duration: msg.duration ?? 0,
            number: msg.number || null,
            recording_url: msg.recording_url || null,
            t: Date.now(),
          });
          break;

        case 'dial_ack':
          broadcastToAgent(user.id, {
            type: 'dial_ack',
            deviceId,
            callId: msg.callId,
            ok: !!msg.ok,
            error: msg.error || null,
          });
          break;

        default:
          // Unknown types are ignored silently
          break;
      }
    });

    ws.on('close', () => {
      if (devices.get(deviceId) === ws) devices.delete(deviceId);
      broadcastToAgent(user.id, { type: 'device_presence', deviceId, online: false });
    });
  });

  // ────────────────────────────────────────────────
  // Console channel (web UI: agent + center_admin + super_admin)
  // ────────────────────────────────────────────────
  consoleWss.on('connection', (ws, req) => {
    const user = authFromRequest(req);
    if (!user) return ws.close(1008, 'unauthorized');

    const agentId = user.id;
    let set = consoles.get(agentId);
    if (!set) { set = new Set(); consoles.set(agentId, set); }
    set.add(ws);
    ws._meta = { kind: 'console', agentId, role: user.role, phone_id: user.phone_id };

    const deviceOnline = !!(user.phone_id && devices.get(user.phone_id));
    safeSend(ws, {
      type: 'hello',
      role: 'console',
      agentId,
      deviceId: user.phone_id || null,
      deviceOnline,
    });

    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'ping':
          safeSend(ws, { type: 'pong', t: Date.now() });
          break;

        case 'dial': {
          // Console asks the server to make its device dial a number.
          // COMMIT (1) = pure relay. Mask-release + global lock lands in commit (2).
          const deviceId = msg.deviceId || user.phone_id;
          if (!deviceId) return safeSend(ws, { type: 'error', error: 'no deviceId' });
          const device = devices.get(deviceId);
          if (!device || device.readyState !== device.OPEN) {
            return safeSend(ws, { type: 'error', error: 'device offline', deviceId });
          }
          safeSend(device, {
            type: 'dial',
            callId: msg.callId || `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            phone: msg.phone,
            customer_id: msg.customer_id || null,
          });
          break;
        }

        case 'hangup': {
          const deviceId = msg.deviceId || user.phone_id;
          const device = deviceId ? devices.get(deviceId) : null;
          if (device && device.readyState === device.OPEN) {
            safeSend(device, { type: 'hangup', callId: msg.callId || null });
          }
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      const s = consoles.get(agentId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) consoles.delete(agentId);
      }
    });
  });

  // Heartbeat keeps NAT/ingress from dropping idle sockets.
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const wss of [deviceWss, consoleWss]) {
      for (const ws of wss.clients) {
        if (ws.readyState !== ws.OPEN) continue;
        safeSend(ws, { type: 'ping', t: now });
      }
    }
  }, 30_000).unref();

  return {
    deviceWss,
    consoleWss,
    stats: () => ({
      devices: devices.size,
      consoles: [...consoles.entries()].map(([agentId, s]) => ({ agentId, n: s.size })),
    }),
    shutdown: () => {
      clearInterval(heartbeat);
      for (const ws of deviceWss.clients) try { ws.close(1001, 'shutdown'); } catch {}
      for (const ws of consoleWss.clients) try { ws.close(1001, 'shutdown'); } catch {}
    },
  };
}
