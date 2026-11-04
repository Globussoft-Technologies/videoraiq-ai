// Coalesce count-event bursts without overlapping authorized API reads.
export function subscribeGenderAgeCounts(socket, adminId, refresh, delayMs = 150) {
  const channel = `genderAgeCounts_${adminId}`;
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
  socket.on(channel, schedule);
  socket.on('connect', schedule);
  return () => {
    active = false;
    if (timer !== null) clearTimeout(timer);
    socket.off(channel, schedule);
    socket.off('connect', schedule);
  };
}
