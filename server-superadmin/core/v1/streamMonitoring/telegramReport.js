const short = value => String(value ?? "?").replace(/[\r\n]+/g, " ").slice(0, 120);

export function formatDuration(start, end = Date.now()) {
  const seconds = Math.max(0, Math.floor((Number(end) - new Date(start).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return 'Unknown';
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return [days && days + 'd', hours && hours + 'h', minutes && minutes + 'm', seconds % 60 + 's'].filter(Boolean).join(' ');
}
const ist = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST' : 'Unknown';
export function formatNotification(event, now) {
  const payload = event.payload || {};
  if (event.type === 'OPS_WARNING') return 'VideoraIQ ? Monitoring unavailable\nHost: ' + short(payload.host)
    + '\nIssue: ' + short(payload.reason) + '\nLast conclusive check: ' + ist(payload.lastConclusiveAt)
    + '\nReminders paused. Camera states retained.';
  const title = { DOWN: 'Streaming down', REMINDER: 'Stream still down', RECOVERED: 'Stream recovered', COMBINED_RECOVERY: 'Stream was down, now recovered' }[event.type];
  const snapshot = payload.snapshot || {};
  return 'VideoraIQ ? ' + title + '\nAdmin: ' + short(snapshot.adminName) + '\nEmail: ' + short(snapshot.email)
    + '\nNVR: ' + short(snapshot.nvrName) + '\nCamera: ' + short(snapshot.name) + ' | Channel: ' + short(snapshot.channelId)
    + '\nCamera ID: ' + String(event.cameraId || payload.cameraId || '') + '\nReason: ' + short(payload.reason)
    + '\nFirst detected down: ' + ist(payload.startedAt)
    + (payload.closedAt ? '\nRecovery confirmed: ' + ist(payload.closedAt) : '\nChecked: ' + ist(now))
    + '\nObserved duration: ' + formatDuration(payload.startedAt, payload.closedAt ? new Date(payload.closedAt).getTime() : now)
    + '\nOutage: ' + short(event.outageId);
}

export function formatNotifications(events, now) {
  if (events.some(event => event.type === 'OPS_WARNING')) return events.map(event => formatNotification(event, now)).join('\n\n');
  let text = '', previousGroup = null;
  for (const event of events) {
    const snapshot = event.payload?.snapshot || {};
    const group = JSON.stringify([event.type, snapshot.adminName, snapshot.email, snapshot.nvrName]);
    const lines = formatNotification(event, now).split('\n');
    if (group === previousGroup) text += '\n\n' + lines.slice(4).join('\n');
    else { text += (text ? '\n\n' : '') + lines.join('\n'); previousGroup = group; }
  }
  return text;
}
