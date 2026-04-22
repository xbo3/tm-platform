import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Console-side WebSocket hook.
 * Connects to `/ws/console?token=<jwt>` using the token from localStorage.
 * Auto-reconnects with exponential-ish backoff (1s..30s).
 *
 * Exposes connection state + device presence + sendDial/hangup helpers.
 * Incoming frames are dispatched via onEvent callback (ref-stable so components
 * don't thrash; consumer supplies a stable function or wraps with useCallback).
 */
export function useConsoleWs({ onEvent } = {}) {
  const [connected, setConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [lastError, setLastError] = useState(null);

  const wsRef = useRef(null);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (closedRef.current) return;
    const token = localStorage.getItem('tm_token');
    if (!token) {
      setLastError('no token');
      return;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${scheme}://${window.location.host}/ws/console?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setConnected(true);
      setLastError(null);
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'hello') {
        setDeviceId(msg.deviceId ?? null);
        setDeviceOnline(!!msg.deviceOnline);
      } else if (msg.type === 'device_presence') {
        setDeviceOnline(!!msg.online);
      } else if (msg.type === 'error') {
        setLastError(msg.error || 'unknown');
      }
      onEventRef.current && onEventRef.current(msg);
    };
    ws.onerror = () => {
      setLastError('ws error');
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (closedRef.current) return;
      const d = Math.min(30_000, 1000 * Math.pow(2, attemptRef.current));
      attemptRef.current += 1;
      setTimeout(connect, d);
    };
  }, []);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      wsRef.current?.close(1000, 'unmount');
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  const sendDial = useCallback(
    (customerId, { deviceId: explicitDeviceId } = {}) =>
      send({ type: 'dial', customer_id: customerId, deviceId: explicitDeviceId }),
    [send]
  );
  const sendHangup = useCallback(
    (callId) => send({ type: 'hangup', callId }),
    [send]
  );

  return { connected, deviceOnline, deviceId, lastError, sendDial, sendHangup, send };
}
