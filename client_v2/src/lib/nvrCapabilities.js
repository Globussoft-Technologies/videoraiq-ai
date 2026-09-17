/**
 * Direct-mode NVRs expose live RTSP cameras but do not provide the recorder
 * integration used by the Playback page. Keep Playback available for mixed
 * accounts as long as at least one NVR is not direct mode.
 *
 * Empty/unknown inventories deliberately fail open so a slow or failed NVR
 * request does not make navigation disappear.
 */
export function shouldHidePlayback(nvrs) {
  if (!Array.isArray(nvrs) || nvrs.length === 0) return false;

  return nvrs.every(
    (nvr) => String(nvr?.connectionMode || '').trim().toLowerCase() === 'direct',
  );
}

