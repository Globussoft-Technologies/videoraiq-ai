import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const empty = () => ({ version: 3, control: null, anchor: null, scan: null, report: null,
  cameras: {}, mutes: {}, selections: {}, hiddenChannels: {}, deliveries: [], telegramBackoffUntil: null });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ownerOf = async file => {
  try { return JSON.parse(await fs.readFile(file, "utf8")).owner; }
  catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
};

// Workers must share this directory. No database or Redis locks/writes.
export async function acquireFileLease(directory, name, ttlMs = 30000) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, name + ".lock"), owner = randomUUID();
  let handle;
  try { handle = await fs.open(file, "wx", 0o600); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const oldOwner = await ownerOf(file);
      if (Date.now() - (await fs.stat(file)).mtimeMs > ttlMs && oldOwner === await ownerOf(file)
        && Date.now() - (await fs.stat(file)).mtimeMs > ttlMs)
        await fs.unlink(file);
    } catch (failure) { if (failure.code !== "ENOENT") throw failure; }
    return null;
  }
  try { await handle.writeFile(JSON.stringify({ owner, pid: process.pid })); }
  finally { await handle.close(); }
  const owns = async () => {
    try { return await ownerOf(file) === owner && Date.now() - (await fs.stat(file)).mtimeMs < ttlMs; }
    catch { return false; }
  };
  return {
    owns,
    async renew() {
      if (!await owns()) return false;
      const now = new Date(); await fs.utimes(file, now, now); return true;
    },
    async release() {
      if (await ownerOf(file) === owner) await fs.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
    },
  };
}

const stores = new Map();
export function monitoringStore(settings) {
  if (stores.has(settings.stateDir)) return stores.get(settings.stateDir);
  const file = path.join(settings.stateDir, "monitoring.json");
  const read = async () => {
    try {
      const state = JSON.parse(await fs.readFile(file, "utf8"));
      if (state.version === 2) return { ...empty(), control: state.control || null, mutes: state.mutes || {},
        selections: state.selections || {}, hiddenChannels: state.hiddenChannels || {} };
      if (state.version !== 3) throw new Error("Unsupported monitoring state version");
      return state;
    } catch (error) { if (error.code === "ENOENT") return empty(); throw error; }
  };
  const update = async change => {
    let lease;
    const deadline = Date.now() + 5000;
    while (!lease && Date.now() < deadline) {
      lease = await acquireFileLease(settings.stateDir, "state");
      if (!lease) await pause(50);
    }
    if (!lease) throw new Error("Monitoring state busy");
    const temporary = file + "." + randomUUID() + ".tmp";
    try {
      const state = await read(); await change(state);
      await fs.writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600, flag: "wx" });
      if (!await lease.owns()) throw new Error("Monitoring state lease expired");
      await fs.rename(temporary, file); return state;
    } finally {
      await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
      await lease.release();
    }
  };
  const store = { read, update }; stores.set(settings.stateDir, store); return store;
}

export const cameraMuted = (state, snapshot, id) => Object.hasOwn(state.mutes, id)
  ? state.mutes[id] : snapshot.mutedCameraIds.includes(id);
