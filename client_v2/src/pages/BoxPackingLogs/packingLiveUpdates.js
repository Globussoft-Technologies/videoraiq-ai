// Share the application's authenticated socket; never create a second connection.
export function watchPackingIncidents({ socket, adminId, refresh, isLive = () => true,
  windowTarget = window, documentTarget = document,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  let disposed = false, running = false, queued = false;
  const request = async (initial = false) => {
    if (disposed) return;
    if (running) { queued = true; return; }
    running = true;
    try { await refresh(initial); }
    finally {
      running = false;
      if (queued && !disposed) { queued = false; void request(); }
    }
  };
  const detection = (incident) => {
    if (!isLive()) return;
    if (incident?.incidentType === 'boxPackingDetection'
      || (!incident?.incidentType && incident?.boxId && incident?.completedBy)) void request();
  };
  const resume = () => { if (documentTarget.visibilityState !== 'hidden') void request(); };
  const topic = adminId ? `cameradetection_${adminId}` : null;
  if (topic) socket?.on(topic, detection);
  socket?.on('connect', resume);
  windowTarget.addEventListener('focus', resume);
  documentTarget.addEventListener('visibilitychange', resume);
  const timer = setIntervalFn(() => {
    if (isLive() && documentTarget.visibilityState !== 'hidden') void request();
  }, 5000);
  void request(true);
  return () => {
    disposed = true;
    clearIntervalFn(timer);
    if (topic) socket?.off(topic, detection);
    socket?.off('connect', resume);
    windowTarget.removeEventListener('focus', resume);
    documentTarget.removeEventListener('visibilitychange', resume);
  };
}
