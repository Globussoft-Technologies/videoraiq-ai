import axios from "axios";
import { hash } from "./identity.js";
import { cameraMuted } from "./localStore.js";
import { formatDownReport } from "./telegramReport.js";
import { selectedMonitoringChannel, telegramBotToken, telegramBotIdentity } from "./telegramChannels.js";

let wake;
export const requestStreamTelegramReport = () => wake?.();
export function registerStreamMonitorWake(callback) {
  wake = callback; return () => { if (wake === callback) wake = null; };
}
const destinations = (snapshot, state) => new Set(snapshot.recipients
  .map(recipient => selectedMonitoringChannel(recipient, state)?.chatId).filter(Boolean));
const freshDown = (row, settings) => {
  const age = Date.now() - Date.parse(row.checkedAt);
  return row.status === "DOWN" && age >= -settings.sourceClockSkewMs && age <= settings.sourceMaxAgeMs;
};
const pause = (ms, signal) => new Promise(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms); signal.addEventListener("abort", done, { once: true });
  if (signal.aborted) done();
});

export async function sendDownReports(rows, snapshot, settings, { reportId, store, active, signal }) {
  const groups = new Map();
  for (const row of rows.filter(row => freshDown(row, settings))
    .sort((a, b) => a.cameraId.localeCompare(b.cameraId))) {
    const key = JSON.stringify([row.adminId, row.nvrId]), group = groups.get(key) || [];
    group.push(row); groups.set(key, group);
  }
  let state = await store.read();
  const reports = [];
  for (const [key, group] of groups) {
    const parts = []; let part = [];
    for (const row of group) {
      if (part.length && formatDownReport([...part, row]).length > 3500) { parts.push(part); part = []; }
      part.push(row);
    }
    if (part.length) parts.push(part);
    for (const chatId of destinations(snapshot, state)) parts.forEach((cameras, index) =>
      reports.push({ id: hash(JSON.stringify([reportId, chatId, key, index])), chatId, cameras }));
  }
  const stats = { planned: reports.length, sent: 0, failed: 0 };
  if (!reports.length) return stats;
  try { await telegramBotIdentity(); } catch { return { ...stats, failed: reports.length }; }
  let nextSendAt = 0;
  for (const report of reports) {
    if (!await active()) break;
    if (nextSendAt > Date.now()) await pause(nextSendAt - Date.now(), signal);
    if (!await active()) break;
    state = await store.read();
    if (Date.parse(state.telegramBackoffUntil || "") > Date.now() || !destinations(snapshot, state).has(report.chatId)) continue;
    const cameras = report.cameras.filter(row => freshDown(row, settings) && !cameraMuted(state, snapshot, row.cameraId)
      && state.cameras[row.cameraId]?.status === "DOWN" && state.cameras[row.cameraId].sourceKey === row.sourceKey);
    if (!cameras.length) continue;
    const delivery = { _id: report.id, type: "DOWN", cameraIds: cameras.map(row => row.cameraId),
      chatId: report.chatId, createdAt: new Date().toISOString(), status: "UNCERTAIN" };
    try {
      if (!await active()) break;
      const { data } = await axios.post("https://api.telegram.org/bot" + telegramBotToken() + "/sendMessage",
        { chat_id: report.chatId, text: formatDownReport(cameras), parse_mode: "HTML", link_preview_options: { is_disabled: true } },
        { signal, timeout: 5000, maxRedirects: 0, maxContentLength: 1_000_000 });
      if (!data?.ok) throw Object.assign(new Error("Telegram rejected report"), { telegramCode: data?.error_code });
      delivery.status = "SENT"; delivery.sentAt = new Date().toISOString(); stats.sent++;
    } catch (error) {
      const code = error.telegramCode || error.response?.data?.error_code || error.response?.status;
      delivery.errorCode = String(code || "NETWORK_OR_CANCELLED"); stats.failed++;
      if (code) delivery.status = "FAILED";
      const retry = Number(error.response?.data?.parameters?.retry_after);
      if (code === 429 && Number.isFinite(retry) && retry > 0)
        await store.update(value => { value.telegramBackoffUntil = new Date(Date.now() + retry * 1000).toISOString(); });
    }
    // No automatic retry: an ambiguous Telegram response must not create duplicates.
    await store.update(value => { value.deliveries.push(delivery); value.deliveries = value.deliveries.slice(-1000); });
    nextSendAt = Date.now() + 3100;
  }
  return stats;
}
