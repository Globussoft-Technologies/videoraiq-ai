// Matches client_v2's live-camera rule. A failed status request is not a down stream.
export function streamAlive(sample) {
  if (sample?.rtsp_online === false) return false;
  if (sample?.rtsp_online !== true || typeof sample.stream_status !== "string" || !sample.stream_status.trim()) return null;
  return sample.stream_status === "running";
}

export function freshState(state, camera, now, settings) {
  const age = now - new Date(state?.observedAt).getTime();
  return !!state && state.sourceKey === camera.sourceKey && !camera.mappingError
    && String(state.adminId) === String(camera.adminId) && String(state.nvrId) === String(camera.nvrId)
    && age >= 0 && age <= settings.staleAfterMs;
}

export function nextState(previous, camera, reading, settings) {
  const continuousDown = reading.alive === false && previous?.alive === false
    && freshState(previous, camera, reading.observedAt.getTime(), settings);
  const downSince = continuousDown && previous.downSince ? previous.downSince : reading.observedAt;
  // Keep the outage identity through missing samples until recovery is confirmed.
  const sameCamera = previous?.sourceKey === camera.sourceKey
    && String(previous?.adminId) === String(camera.adminId) && String(previous?.nvrId) === String(camera.nvrId);
  const telegramDownSince = reading.alive === true ? null
    : (sameCamera && previous?.telegramDownSince) || (reading.alive === false ? downSince : null);
  return {
    _id: String(camera.cameraId), adminId: camera.adminId, nvrId: camera.nvrId, cameraId: camera.cameraId,
    sourceKey: camera.sourceKey, revision: (previous?.revision || 0) + 1,
    alive: reading.alive, observedAt: reading.observedAt,
    downSince: reading.alive === false ? downSince : null,
    telegramDownSince,
  };
}
