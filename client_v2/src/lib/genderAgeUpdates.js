// Coalesce count-event bursts without overlapping authorized API reads.
export function subscribeGenderAgeCounts(socket, adminId, refresh, delayMs = 150, fallbackMs = 0) {
  const channel = `genderAgeCounts_${adminId}`;
  const alertChannel = `cameradetection_${adminId}`;
  let active = true;
  let pending = false;
  let dirty = false;
  let timer = null;
  const schedule = () => {
    if (!active) return;
    dirty = true;
    if (pending || timer !== null) return;
    timer = setTimeout(async () => {
      timer = null;
      if (!active) return;
      pending = true;
      dirty = false;
      try { await refresh({ background: true }); }
      catch { /* The log view reports API failures; later events can retry. */ }
      finally {
        pending = false;
        if (active && dirty) schedule();
      }
    }, delayMs);
  };
  socket?.on(channel, schedule);
  const onAlert = incident => {
    if (incident?.incidentType === 'genderAgeDetection') schedule();
  };
  socket?.on(alertChannel, onAlert);
  socket?.on('connect', schedule);
  // The server can address an alert to one socket, leaving other open tabs
  // without an event. Reconcile from the API while automatic polling is off.
  const fallbackTimer = fallbackMs > 0 ? setInterval(schedule, fallbackMs) : null;
  return () => {
    active = false;
    if (fallbackTimer !== null) clearInterval(fallbackTimer);
    if (timer !== null) clearTimeout(timer);
    socket?.off(channel, schedule);
    socket?.off(alertChannel, onAlert);
    socket?.off('connect', schedule);
  };
}
