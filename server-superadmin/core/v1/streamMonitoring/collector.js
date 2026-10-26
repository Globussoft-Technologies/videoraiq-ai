import logger from "../../../utils/logger.js";
import { monitoringSettings } from "./settings.js";
import { readInventory } from "./inventory.js";
import { monitoringStore, acquireFileLease, cameraMuted } from "./localStore.js";
import { readStatuses, summarize } from "./statusAdapter.js";
import { sendDownReports, registerStreamMonitorWake } from "./telegramSender.js";
import { readMonitoringControl, subscribeMonitoringControl } from "./control.js";

function saveResults(state, rows, snapshot) {
  const cameras = new Map(snapshot.cameras.map(camera => [camera.cameraId, camera]));
  for (const [id, saved] of Object.entries(state.cameras)) {
    if (!cameras.has(id) || cameras.get(id).sourceKey !== saved.sourceKey || cameraMuted(state, snapshot, id))
      delete state.cameras[id];
  }
  for (const row of rows) {
    if (cameras.get(row.cameraId)?.sourceKey !== row.sourceKey || cameraMuted(state, snapshot, row.cameraId)) continue;
    const previous = state.cameras[row.cameraId];
    state.cameras[row.cameraId] = { ...row,
      downSince: row.status === "ALIVE" ? null : previous?.downSince || (row.status === "DOWN" ? row.checkedAt : null),
      lastSuccessfulCheckAt: row.status === "ALIVE" ? row.checkedAt : previous?.lastSuccessfulCheckAt || null };
  }
}

export function startStreamMonitoring() {
  let settings;
  try { settings = monitoringSettings(); }
  catch {
    logger.error("[STREAM_MONITORING] Invalid configuration; monitoring disabled");
    return () => {}; // A monitoring configuration error must not stop other backend modules.
  }
  const store = monitoringStore(settings);
  let stopped = false, running = false, timer, controller, lease, renewing = false, checkingControl = false;
  const wake = () => {
    if (stopped || running) return;
    clearTimeout(timer); timer = setTimeout(run, 0); timer.unref();
  };
  const unsubscribe = subscribeMonitoringControl(() => { controller?.abort(); wake(); });
  const unregisterWake = registerStreamMonitorWake(wake);
  const watch = setInterval(async () => {
    if (stopped || checkingControl) return;
    checkingControl = true;
    try {
      const control = await readMonitoringControl(settings);
      if (!control.enabled || (controller && controller.revision !== control.revision)) controller?.abort();
      wake();
    } catch { controller?.abort(); }
    finally { checkingControl = false; }
  }, 5000);
  watch.unref();
  const renew = setInterval(async () => {
    if (!lease || renewing) return;
    renewing = true;
    const currentLease = lease;
    try { if (!await currentLease.renew() && lease === currentLease) controller?.abort(); }
    catch { if (lease === currentLease) controller?.abort(); }
    finally { renewing = false; }
  }, 10000);
  renew.unref();

  async function run() {
    if (stopped || running) return;
    running = true;
    let deadline, scanId;
    try {
      const control = await readMonitoringControl(settings);
      if (!control.enabled) return;
      let state = await store.read();
      const scanKey = value => control.revision + ":" + value.anchor + ":" + Math.floor(Math.max(0, Date.now() - value.anchor) / settings.intervalMs);
      if (state.anchor && state.scan?.id === scanKey(state)) return;
      lease = await acquireFileLease(settings.stateDir, "collector", 60000);
      if (!lease || stopped) return;
      state = await store.update(value => { value.control ||= control; value.anchor ||= Date.now(); });
      if (!state.control.enabled || state.control.revision !== control.revision) return;
      scanId = scanKey(state);
      if (state.scan?.id === scanId) return;
      controller = new AbortController();
      controller.revision = control.revision;
      const active = async () => {
        if (stopped || controller.signal.aborted || !await lease?.owns()) return false;
        const current = (await store.read()).control;
        return current.enabled && current.revision === control.revision;
      };
      const slot = Math.floor(Math.max(0, Date.now() - state.anchor) / settings.intervalMs);
      const nextAt = state.anchor + (slot + 1) * settings.intervalMs;
      const budget = Math.min(settings.intervalMs - 10000, nextAt - Date.now() - 1000);
      if (budget < 1000) return;
      deadline = setTimeout(() => controller.abort(), budget); deadline.unref();
      const reportSlot = Math.floor(Math.max(0, Date.now() - state.anchor) / settings.reportIntervalMs);
      const reportId = control.revision + ":" + state.anchor + ":report:" + reportSlot;
      const reportDue = reportSlot > 0 && state.report?.id !== reportId;
      await store.update(value => { value.scan = { id: scanId, nextAt: new Date(nextAt).toISOString(), startedAt: new Date().toISOString() }; });
      let snapshot = await readInventory(settings, null, controller.signal);
      state = await store.read();
      const cameras = snapshot.cameras.filter(camera => !cameraMuted(state, snapshot, camera.cameraId));
      let rows = await readStatuses(cameras, settings, controller.signal);
      if (!await active()) return;
      if (reportDue) {
        // Refresh old Down observations before a report, using the same status API.
        const oldDown = new Set(rows.filter(row => row.status === "DOWN"
          && Date.now() - Date.parse(row.checkedAt) > settings.sourceMaxAgeMs / 2).map(row => row.cameraId));
        if (oldDown.size) {
          const fresh = new Map((await readStatuses(cameras.filter(camera => oldDown.has(camera.cameraId)),
            settings, controller.signal)).map(row => [row.cameraId, row]));
          rows = rows.map(row => fresh.get(row.cameraId) || row);
        }
        snapshot = await readInventory(settings, null, controller.signal);
      }
      if (!await active()) return;
      const current = new Map(snapshot.cameras.map(camera => [camera.cameraId, camera]));
      rows = rows.filter(row => current.get(row.cameraId)?.sourceKey === row.sourceKey);
      state = await store.update(async value => {
        if (value.scan?.id === scanId && await active()) saveResults(value, rows, snapshot);
      });
      let deliveries = { planned: 0, sent: 0, failed: 0 };
      if (reportDue && await active()) {
        let claimed = false;
        await store.update(async value => {
          if (value.report?.id === reportId || !await active()) return;
          value.report = { id: reportId, startedAt: new Date().toISOString() }; claimed = true;
        });
        // Claim before sending. A restart/ambiguous response cannot replay this report.
        if (claimed) deliveries = await sendDownReports(rows.map(row => state.cameras[row.cameraId] || row),
          snapshot, settings, { reportId, store, active, signal: controller.signal });
      }
      await store.update(value => {
        if (value.scan?.id === scanId) Object.assign(value.scan,
          { finishedAt: new Date().toISOString(), counts: summarize(rows), deliveries });
      });
      logger.info("[STREAM_MONITORING] checked=" + rows.length + " down=" + summarize(rows).DOWN + " sent=" + deliveries.sent);
    } catch { logger.error("[STREAM_MONITORING] Check interrupted; next scheduled scan will retry"); }
    finally {
      clearTimeout(deadline); controller?.abort(); controller = null;
      await lease?.release().catch(() => {}); lease = null;
      running = false;
      if (!stopped) { timer = setTimeout(run, 5000); timer.unref(); }
    }
  }
  wake();
  return () => {
    stopped = true; controller?.abort(); clearTimeout(timer); clearInterval(watch); clearInterval(renew);
    unsubscribe(); unregisterWake();
  };
}
