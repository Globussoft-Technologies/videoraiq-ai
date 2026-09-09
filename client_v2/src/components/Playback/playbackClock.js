// Prefer timestamps of presented frames: currentTime can advance while video
// decoding is stalled (for example, when an audio track is still progressing).
export function observePlaybackClock(video, { canAdvance, onTime }) {
  let disposed = false;
  let frameId = null;
  const hasFrameCallbacks = typeof video.requestVideoFrameCallback === 'function';

  const publish = (mediaTime) => {
    if (disposed || video.paused || video.seeking || video.readyState < (hasFrameCallbacks ? 2 : 3) || !canAdvance()) return;
    if (Number.isFinite(mediaTime)) onTime(mediaTime);
  };
  const frame = (_, metadata) => {
    if (disposed) return;
    publish(metadata.mediaTime);
    frameId = video.requestVideoFrameCallback(frame);
  };
  const timeUpdate = () => publish(video.currentTime);

  if (hasFrameCallbacks) frameId = video.requestVideoFrameCallback(frame);
  else video.addEventListener('timeupdate', timeUpdate);

  return () => {
    disposed = true;
    if (frameId !== null) video.cancelVideoFrameCallback?.(frameId);
    video.removeEventListener('timeupdate', timeUpdate);
  };
}

// Use the fragment being played, never a fragment merely downloaded ahead.
export function fragmentClockOffset(fragment) {
  if (fragment?.programDateTime == null || !Number.isFinite(fragment.start)) return null;
  const date = new Date(fragment.programDateTime);
  if (!Number.isFinite(date.getTime())) return null;
  const wallTime = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
  return wallTime - fragment.start * 1000;
}

// Keep recording time by segment identity: HLS can rebase media time to zero
// when a retry opens a rolling playlist whose earlier segments have expired.
export function createPlaylistClock(requestedTime) {
  const segments = new Map();
  const key = (fragment) => `${fragment.level ?? 0}:${fragment.cc ?? 0}:${fragment.sn}`;
  const valid = (fragment) => Number.isFinite(fragment?.sn) && Number.isFinite(fragment.start) && Number.isFinite(fragment.duration) && fragment.duration > 0;

  return {
    remember(details) {
      const fragments = (details?.fragments || []).filter(valid);
      if (fragments.length === 0) return;
      const first = fragments[0];
      const known = fragments.find((fragment) => segments.has(key(fragment)));
      let offset;
      if (known) {
        offset = segments.get(key(known)).time - known.start * 1000;
      } else if (segments.size === 0) {
        offset = requestedTime - first.start * 1000;
      } else {
        const previous = segments.get(key({ ...first, sn: first.sn - 1 }));
        if (previous) offset = previous.time + previous.duration * 1000 - first.start * 1000;
      }
      for (const fragment of fragments) {
        const explicitOffset = fragmentClockOffset(fragment);
        const recordingOffset = explicitOffset ?? offset;
        if (!Number.isFinite(recordingOffset)) continue;
        const id = key(fragment);
        if (!segments.has(id) || explicitOffset !== null) {
          segments.set(id, { time: recordingOffset + fragment.start * 1000, duration: fragment.duration });
        }
      }
      // Retain this requested recording's mappings until the next seek/source.
      // A long VOD playlist may include thousands of segments ahead of playback.
    },
    offset(fragment) {
      const explicitOffset = fragmentClockOffset(fragment);
      if (explicitOffset !== null) return explicitOffset;
      if (!valid(fragment)) return null;
      const segment = segments.get(key(fragment));
      return segment ? segment.time - fragment.start * 1000 : null;
    },
  };
}

export function rememberFragmentClock(anchors, fragment, offset) {
  if (!Number.isFinite(fragment?.start) || !Number.isFinite(fragment.duration) || fragment.duration <= 0 || !Number.isFinite(offset)) return anchors;
  const anchor = { start: fragment.start, end: fragment.start + fragment.duration, offset };
  return [...anchors.filter((entry) => entry.start !== anchor.start), anchor].slice(-64);
}

export function frameRecordingTime(mediaTime, anchors, fallbackOffset) {
  if (!Number.isFinite(mediaTime)) return null;
  if (anchors.length === 0) return fallbackOffset + mediaTime * 1000;
  // HLS currentTime can enter a new fragment before its video frame is displayed.
  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    const anchor = anchors[index];
    if (mediaTime >= anchor.start && mediaTime < anchor.end) return anchor.offset + mediaTime * 1000;
  }
  // Wait for the matching fragment instead of applying another fragment's offset.
  return null;
}

export function bufferedForwardTarget(video, extraSeconds) {
  const current = video.currentTime;
  if (video.paused || video.seeking || video.readyState < 3 || !Number.isFinite(current)) return current;
  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index) - 0.05;
    if (current >= start && current < end) {
      const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
      return Math.max(current, Math.min(current + extraSeconds, end, duration));
    }
  }
  return current;
}
