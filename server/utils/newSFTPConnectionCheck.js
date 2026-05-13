import dotenv from "dotenv";
import Client from "ssh2-sftp-client";
import { nasLogger } from "./logger.js";
import { Mutex } from "async-mutex";
import { isMainThread, threadId } from "worker_threads";
import config from "config";

dotenv.config();

const connectionMutex = new Mutex();
const activeConnections = new Map();
const reconnecting = new Set();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const getInstanceKey = () => `pm2_${process.env.pm_id || 0}`;

const getConnectionKey = () =>
  isMainThread
    ? `${getInstanceKey()}_main`
    : `${getInstanceKey()}_worker_${threadId}`;

const sftpConfig = {
  host: config.get("SFTP.IP"),
  port: config.get("SFTP.Port"),
  username: config.get("SFTP.user-name"),
  password: config.get("SFTP.Password"),
  readyTimeout: 12000000,
  retries: 5,
  keepaliveInterval: 1000000,
  keepaliveCountMax: 5,
};

/* -------------------- CONNECT -------------------- */

export const connectSFTP = async () => {
  const connectionKey = getConnectionKey();

  const existing = activeConnections.get(connectionKey);
  if (existing?.sftp) return existing.sftp;

  const client = await createConnection(connectionKey);

  activeConnections.set(connectionKey, {
    sftp: client,
    lastConnectedTime: Date.now(),
  });

  return client;
};

/* -------------------- CREATE CONNECTION -------------------- */

const createConnection = async (connectionKey) => {
  return connectionMutex.runExclusive(async () => {
    const client = new Client();

    try {
      console.log(`🔄 Connecting: ${connectionKey}`);
      await client.connect(sftpConfig);
      console.log(`✅ Connected: ${connectionKey}`);

      // Clean only internal ssh2 listeners
      client.client?.removeAllListeners();

      // Reconnect only on CLOSE
      client.client?.once("close", async () => {
        console.warn(`⚠️ Connection closed: ${connectionKey}`);
        await handleReconnect(connectionKey);
      });

      // Log errors only
      client.client?.on("error", (err) => {
        console.error(`❌ SFTP Error (${connectionKey}): ${err.message}`);
      });

      return client;
    } catch (err) {
      console.error(`❌ Connection failed: ${err.message}`);
      throw err;
    }
  });
};

/* -------------------- RECONNECT -------------------- */

const handleReconnect = async (connectionKey) => {
  if (reconnecting.has(connectionKey)) return;

  reconnecting.add(connectionKey);

  try {
    nasLogger.info({
      nas_info: "Reconnecting SFTP...",
      server_id: connectionKey,
    });

    await disconnectSFTP(connectionKey);

    let retries = 5;

    while (retries > 0) {
      try {
        const newClient = await createConnection(connectionKey);

        activeConnections.set(connectionKey, {
          sftp: newClient,
          lastConnectedTime: Date.now(),
        });

        nasLogger.info({
          nas_info: "Reconnected successfully",
          server_id: connectionKey,
        });

        return;
      } catch (err) {
        retries--;
        await delay(2000);
      }
    }

    nasLogger.error({
      nas_err: "Reconnect failed after retries",
      server_id: connectionKey,
    });
  } finally {
    reconnecting.delete(connectionKey);
  }
};

/* -------------------- DISCONNECT -------------------- */

export const disconnectSFTP = async (
  connectionKey = getConnectionKey()
) => {
  const existing = activeConnections.get(connectionKey);
  if (!existing) return;

  const { sftp } = existing;

  try {
    if (sftp) {
      sftp.client?.removeAllListeners();
      await sftp.end();
    }

    nasLogger.info({
      nas_info: "Disconnected SFTP",
      server_id: connectionKey,
    });
  } catch (err) {
    nasLogger.error({
      nas_err: `Disconnect error: ${err.message}`,
      server_id: connectionKey,
    });
  }

  activeConnections.delete(connectionKey);
};

/* -------------------- KEEP ALIVE -------------------- */

setInterval(async () => {
  for (const [key, { sftp }] of activeConnections.entries()) {
    if (!sftp) continue;

    try {
      await sftp.list("/");
    } catch (err) {
      console.warn(`⚠️ KeepAlive failed (${key})`);
      await disconnectSFTP(key);
      // Next request will auto reconnect
    }
  }
}, 30000);
