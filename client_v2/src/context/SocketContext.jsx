import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import getAccessToken from '@/utils/getAccessToken';
import { getSessionId } from '@/utils/sessionIdentity';
import { useAuth } from './AuthContext';

// How often an open tab tells the server it's still here. Must stay well under
// the server's presence TTL (PRESENCE_TTL_SECONDS) so one missed beat doesn't
// flap the session's "Online" state in the admin session list.
const SESSION_HEARTBEAT_MS = 20000;

const SocketContext = createContext();
export const useSocket = () => useContext(SocketContext);

/**
 * Socket.IO connects to the server ORIGIN, never to the REST path. VITE_BACKEND
 * carries the full REST base (e.g. https://globussoft.videoraiq.com/api-backend/api/v2),
 * but socket.io must not receive the `/api/v2` (that becomes a bad namespace) —
 * and when the backend sits behind a reverse-proxy prefix like `/api-backend`,
 * the socket path has to be `<prefix>/socket.io` (mirrors docker-client's
 * SocketContext). We derive both from VITE_BACKEND here:
 *   - HOST       = origin only
 *   - SOCKET_PATH = <proxy-prefix>/socket.io  (proxy-prefix = whatever precedes
 *                   the trailing /api/v<n>, e.g. "/api-backend"; empty if none)
 */
function resolveSocketTarget() {
  const raw = import.meta.env.VITE_BACKEND;
  if (!raw) return { host: null, path: '/socket.io' };
  try {
    const url = new URL(raw);
    // Strip a trailing "/api/v<n>" (the REST version segment) to find the proxy
    // prefix the server is actually mounted behind, if any.
    const prefix = url.pathname.replace(/\/api\/v\d+\/?$/i, '').replace(/\/+$/, '');
    return { host: url.origin, path: `${prefix}/socket.io` };
  } catch {
    return { host: raw, path: '/socket.io' };
  }
}

const { host: HOST, path: SOCKET_PATH } = resolveSocketTarget();

/** Ported from client/src/context/Sockets/SocketContext.jsx — connects to
 * VITE_BACKEND's origin (not VITE_SOCKET_URL, which is the separate local
 * desktop-client stream socket) once a user is authenticated. */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!user || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    if (socketRef.current) return;

    if (!HOST) {
      console.error('🚨 Socket HOST is not configured. Check VITE_BACKEND env variable.');
      return;
    }

    const socket = io(HOST, {
      path: SOCKET_PATH,
      // sessionId lets the server track presence per session (this tab/device),
      // so the admin session list can show whether each session is online now.
      auth: { token, sessionId: getSessionId() || undefined },
      reconnection: true,
      // Unbounded: this page can sit open for a long time waiting on a
      // scheduled boundary, and a capped attempt count (previously 5) meant a
      // network blip or server restart could permanently kill live updates
      // until the user manually reloaded — reconnectionAttempts: Infinity
      // keeps socket.io retrying (with its built-in backoff) indefinitely.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    let heartbeatTimer = null;
    const sendSessionHeartbeat = () => {
      if (socket.connected && getSessionId()) socket.emit('session-heartbeat');
    };

    socket.on('connect', () => {
      setConnected(true);
      // A fresh sessionId (e.g. after a re-login on this tab) needs to reach the
      // server on reconnect too — auth is reused from connect time otherwise.
      const sessionId = getSessionId();
      if (sessionId) socket.auth = { ...socket.auth, sessionId };
      sendSessionHeartbeat();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(sendSessionHeartbeat, SESSION_HEARTBEAT_MS);
    });
    socket.on('disconnect', () => {
      setConnected(false);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    });
    // A fresh auth token on reconnect, in case the old one expired while the
    // socket was down — socket.io reuses the `auth` object from connect time
    // otherwise, so a long-lived page could reconnect with a stale token.
    socket.io.on('reconnect_attempt', () => {
      const freshToken = getAccessToken();
      if (freshToken) {
        socket.auth = { token: freshToken, sessionId: getSessionId() || undefined };
      }
    });

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
