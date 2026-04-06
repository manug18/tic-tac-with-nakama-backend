// Nakama client singleton + authentication helpers
import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const HOST       = import.meta.env.VITE_NAKAMA_HOST       ?? "localhost";
const PORT       = Number(import.meta.env.VITE_NAKAMA_PORT ?? 7350);
const USE_SSL    = import.meta.env.VITE_NAKAMA_USE_SSL     === "true";
const SERVER_KEY = import.meta.env.VITE_NAKAMA_SERVER_KEY  ?? "defaultkey";

export const nakamaClient = new Client(SERVER_KEY, HOST, String(PORT), USE_SSL);

let _session: Session | null = null;
let _socket:  Socket  | null = null;

export function getSession(): Session | null { return _session; }
export function getSocket():  Socket  | null { return _socket;  }

/** Authenticate with device-id (auto-creates account on first run) */
export async function authenticate(username?: string): Promise<Session> {
  // Reuse stored session if still valid (>5 min remaining)
  const stored = localStorage.getItem("nakama_token");
  const storedRefresh = localStorage.getItem("nakama_refresh_token");
  if (stored) {
    try {
      const s = Session.restore(stored, storedRefresh ?? "");
      if (!s.isexpired(Date.now() / 1000 + 300)) {
        _session = s;
        return s;
      }
    } catch {
      localStorage.removeItem("nakama_token");
      localStorage.removeItem("nakama_refresh_token");
    }
  }

  // Use a stable device-id stored in localStorage
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    // crypto.randomUUID is only available in secure contexts (HTTPS/localhost)
    // Fall back to a manual UUID v4 for HTTP deployments
    if (typeof crypto.randomUUID === "function") {
      deviceId = crypto.randomUUID();
    } else {
      deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
    localStorage.setItem("device_id", deviceId);
  }

  const session = await nakamaClient.authenticateDevice(
    deviceId,
    true,
    username ?? `Player_${deviceId.slice(0, 6)}`,
  );

  localStorage.setItem("nakama_token", session.token);
  if (session.refresh_token) {
    localStorage.setItem("nakama_refresh_token", session.refresh_token);
  }
  _session = session;
  return session;
}

/** Open a real-time socket (idempotent – returns existing if already open) */
export async function openSocket(session: Session): Promise<Socket> {
  if (_socket) return _socket;
  _socket = nakamaClient.createSocket(USE_SSL);
  await _socket.connect(session, true);
  return _socket;
}

export function closeSocket() {
  _socket?.disconnect(true);
  _socket = null;
}
