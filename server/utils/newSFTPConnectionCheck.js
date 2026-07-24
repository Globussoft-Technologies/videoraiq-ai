import dotenv from "dotenv";
import Client from "ssh2-sftp-client";
import { nasLogger } from "./logger.js";
import { Mutex } from "async-mutex";
import { isMainThread, threadId } from "worker_threads";
import config from "config";

dotenv.config();

const isPM2 = () => process.env.pm_id !== undefined && process.env.pm_id !== null;

const getInstanceKey = () => {
  if (isPM2()) return `pm2_${process.env.pm_id}`;
  return `pid_${process.pid}`;
};

const getConnectionKey = () => {
  const instance = getInstanceKey();
  return isMainThread ? `${instance}_main` : `${instance}_worker_${threadId}`;
};

const SFTP_CONFIG = {
  host: config.get("SFTP.IP"),
  port: config.get("SFTP.Port"),
  username: config.get("SFTP.user-name"),
  password: config.get("SFTP.Password"),
  readyTimeout: 30000,
  retries: 5,
  keepaliveInterval: 5000,
  keepaliveCountMax: 3,
};

const POOL_CONFIG = {
  minConnections: 2,
  maxConnections: 8,
  idleTimeout: 10 * 60 * 1000,
  acquireTimeout: 15000,
};

class SFTPConnectionPool {
  constructor(poolConfig) {
    this.poolConfig = poolConfig;
    this.pools = new Map();
    this.createMutex = new Mutex();
  }

  getPool(key) {
    if (!this.pools.has(key)) {
      this.pools.set(key, {
        available: [],
        inUse: new Set(),
        creatingCount: 0,
        stats: { totalCreated: 0, totalReleased: 0, totalFailed: 0 },
      });
    }
    return this.pools.get(key);
  }

  async acquire(key) {
    const pool = this.getPool(key);
    const startTime = Date.now();

    while (Date.now() - startTime < this.poolConfig.acquireTimeout) {
      if (pool.available.length > 0) {
        const conn = pool.available.pop();
        if (await this.isAlive(conn)) {
          pool.inUse.add(conn);
          return conn;
        } else {
          await this.closeConnection(conn, key);
        }
      }

      const totalConns = pool.available.length + pool.inUse.size + pool.creatingCount;
      if (totalConns < this.poolConfig.maxConnections) {
        pool.creatingCount++;
        try {
          const conn = await this.createConnection(key);
          pool.inUse.add(conn);
          pool.stats.totalCreated++;
          nasLogger.info({ nas_info: `New SFTP connection created (${key})`, server_id: key });
          return conn;
        } catch (err) {
          pool.stats.totalFailed++;
          nasLogger.error({ nas_err: `Failed to create connection (${key}): ${err.message}`, server_id: key });
          throw err;
        } finally {
          pool.creatingCount--;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Failed to acquire SFTP connection after ${this.poolConfig.acquireTimeout}ms. Pool exhausted.`);
  }

  async release(conn, key) {
    const pool = this.getPool(key);
    pool.inUse.delete(conn);

    if (await this.isAlive(conn)) {
      conn.lastUsed = Date.now();
      pool.available.push(conn);
      pool.stats.totalReleased++;
    } else {
      await this.closeConnection(conn, key);
      nasLogger.warn({ nas_warn: `Dead connection discarded on release (${key})`, server_id: key });
    }
  }

  async isAlive(conn) {
    if (!conn || !conn.sftp) return false;
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), 2000)
      );
      await Promise.race([conn.sftp.cwd(), timeout]);
      return true;
    } catch {
      return false;
    }
  }

  async createConnection(key) {
    return await this.createMutex.runExclusive(async () => {
      const client = new Client();
      try {
        nasLogger.info({ nas_info: `Creating SFTP connection (${key})...`, server_id: key });
        await client.connect(SFTP_CONFIG);

        // Remove all listeners before adding new ones — fixes MaxListenersExceededWarning
        ["error", "close", "end"].forEach((event) =>
          client.client?.removeAllListeners(event)
        );

        client.client?.once("error", (err) => {
          nasLogger.error({ nas_err: `Connection error (${key}): ${err.message}`, server_id: key });
        });

        nasLogger.info({ nas_info: `Connected successfully (${key})`, server_id: key });

        return { sftp: client, key, createdAt: Date.now(), lastUsed: Date.now() };
      } catch (err) {
        nasLogger.error({ nas_err: `Failed to create SFTP connection (${key}): ${err.message}`, server_id: key });
        throw err;
      }
    });
  }

  async closeConnection(conn, key) {
    if (!conn?.sftp) return;
    try {
      conn.sftp.client?.removeAllListeners();
      await conn.sftp.end();
      nasLogger.info({ nas_info: `Connection closed (${key})`, server_id: key });
    } catch (err) {
      nasLogger.warn({ nas_warn: `Error closing connection (${key}): ${err.message}`, server_id: key });
    }
  }

  async cleanup(key) {
    const pool = this.getPool(key);
    const now = Date.now();
    const toRemove = pool.available.filter(
      (conn) =>
        pool.available.length > this.poolConfig.minConnections &&
        now - conn.lastUsed > this.poolConfig.idleTimeout
    );
    for (const conn of toRemove) {
      pool.available = pool.available.filter((c) => c !== conn);
      await this.closeConnection(conn, key);
      nasLogger.info({ nas_info: `Idle connection cleaned up (${key})`, server_id: key });
    }
  }

  async drainPool(key) {
    const pool = this.getPool(key);
    for (const conn of pool.available) {
      await this.closeConnection(conn, key);
    }
    pool.available = [];
    nasLogger.info({ nas_info: `Pool drained (${key})`, server_id: key });
  }

  getStats(key) {
    const pool = this.getPool(key);
    return {
      available: pool.available.length,
      inUse: pool.inUse.size,
      creating: pool.creatingCount,
      total: pool.available.length + pool.inUse.size,
      maxConnections: this.poolConfig.maxConnections,
      stats: pool.stats,
    };
  }
}

// ============= INITIALIZATION =============

const pool = new SFTPConnectionPool(POOL_CONFIG);

console.log(`[SFTP Pool] Mode: ${isPM2() ? `PM2 (instance ${process.env.pm_id})` : `Standalone (PID ${process.pid})`}`);
console.log(`[SFTP Pool] Min: ${POOL_CONFIG.minConnections}, Max: ${POOL_CONFIG.maxConnections}`);
console.log(`[SFTP Pool] Key: ${getConnectionKey()}`);

// Cleanup idle connections every 5 minutes
setInterval(() => {
  for (const key of pool.pools.keys()) {
    pool.cleanup(key).catch((err) =>
      nasLogger.error({ nas_err: `Cleanup error (${key}): ${err.message}` })
    );
  }
}, 5 * 60 * 1000);

// Health check idle connections every 2 minutes
setInterval(() => {
  for (const [key, poolData] of pool.pools.entries()) {
    for (const conn of [...poolData.available]) {
      pool.isAlive(conn)
        .then((alive) => {
          if (!alive) {
            poolData.available = poolData.available.filter((c) => c !== conn);
            pool.closeConnection(conn, key);
            nasLogger.warn({ nas_warn: `Stale connection removed (${key})`, server_id: key });
          }
        })
        .catch(() => {
          poolData.available = poolData.available.filter((c) => c !== conn);
        });
    }
  }
}, 2 * 60 * 1000);

// ============= EXPORTS =============
// connectSFTP — used by incidents.service.js, uploads.service.js, storage.service.js, authorizedUsers.service.js
// checkSftpConnection — used by users.service.js, authorizedUsers.service.js
// Both return the raw sftp client (no auto-release — caller must call sftp.end() when done)

export const connectSFTP = async () => {
  const key = getConnectionKey();
  try {
    const conn = await pool.acquire(key);
    return conn.sftp;
  } catch (err) {
    nasLogger.error({ nas_err: `connectSFTP error: ${err.message}`, server_id: key });
    throw err;
  }
};

export const checkSftpConnection = async () => {
  const key = getConnectionKey();
  try {
    const conn = await pool.acquire(key);
    return conn.sftp;
  } catch (err) {
    nasLogger.error({ nas_err: `checkSftpConnection error: ${err.message}`, server_id: key });
    throw err;
  }
};

export const withSFTPConnection = async (callback) => {
  const key = getConnectionKey();
  let conn;
  try {
    conn = await pool.acquire(key);
    return await callback(conn.sftp);
  } finally {
    if (conn) await pool.release(conn, key);
  }
};

// Return a raw client (from connectSFTP/checkSftpConnection) back to the pool.
// Those helpers hand out `conn.sftp` and drop the wrapper, so callers can't
// call pool.release directly — this maps the client back to its wrapper and
// releases it. Call it in a finally. Idempotent: a second call (or a client
// that was never pooled) is a no-op, so it never closes a live pooled conn.
export const releaseSFTP = async (sftp, key = getConnectionKey()) => {
  if (!sftp) return;
  const poolData = pool.getPool(key);
  for (const conn of poolData.inUse) {
    if (conn.sftp === sftp) {
      await pool.release(conn, key);
      return;
    }
  }
};

export const disconnectSFTP = async (key = getConnectionKey()) => {
  await pool.drainPool(key);
};

export const getPoolStats = (key = getConnectionKey()) => pool.getStats(key);

export const debugPool = () => {
  const stats = {};
  for (const key of pool.pools.keys()) stats[key] = pool.getStats(key);
  return stats;
};
