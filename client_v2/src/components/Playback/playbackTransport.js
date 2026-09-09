// Keep user intent separate from pauses caused by loading or replacing a source.
export function createPlaybackTransport(video, {
  onPlaying = () => {},
  onBuffering = () => {},
  onReady = () => {},
  onError = () => {},
} = {}) {
  let wantsPlayback = false;
  let active = false;
  let disposed = false;
  let generation = 0;
  let playbackRate = 1;
  let pendingPlay = null;
  let recoveryTimer = null;
  let recoveryAttempts = 0;

  const clearRecovery = () => {
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  };
  const invalidate = () => {
    generation += 1;
    pendingPlay = null;
    clearRecovery();
    recoveryAttempts = 0;
  };
  const scheduleRecovery = () => {
    if (disposed || !active || !wantsPlayback || recoveryTimer !== null || recoveryAttempts >= 2) return;
    const attempt = generation;
    recoveryAttempts += 1;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (attempt === generation) resume();
    }, 0);
  };

  const fail = (error) => {
    if (disposed) return;
    active = false;
    wantsPlayback = false;
    invalidate();
    video.pause();
    onPlaying(false);
    onBuffering(false);
    onError(error);
  };

  const resume = () => {
    if (disposed || !active || !wantsPlayback || video.ended || video.readyState < 2) return;
    video.playbackRate = playbackRate;
    if (!video.paused || pendingPlay !== null) return;

    const attempt = generation;
    pendingPlay = attempt;
    try {
      Promise.resolve(video.play()).catch((error) => {
        if (disposed || attempt !== generation || !wantsPlayback) return;
        // A new source or fullscreen transition can interrupt a pending play().
        if (error?.name === 'AbortError') scheduleRecovery();
        else fail(error);
      }).finally(() => {
        if (pendingPlay === attempt) pendingPlay = null;
      });
    } catch (error) {
      pendingPlay = null;
      fail(error);
    }
  };

  const ready = () => {
    if (disposed || !active || video.readyState < 2) return;
    video.playbackRate = playbackRate;
    onReady();
    onBuffering(wantsPlayback && video.readyState < 3);
    resume();
  };
  const playing = () => {
    if (disposed || !active || video.paused) return;
    if (!wantsPlayback) { video.pause(); return; }
    clearRecovery();
    recoveryAttempts = 0;
    onPlaying(true);
    onBuffering(false);
  };
  const paused = () => {
    if (disposed || !video.paused) return;
    onPlaying(false);
    // Fullscreen can deliver its pause event after the layout's animation frame.
    // Explicit Pause clears wantsPlayback before this handler runs.
    scheduleRecovery();
  };
  const waiting = () => {
    if (disposed || !active || !wantsPlayback) return;
    onPlaying(false);
    onBuffering(true);
  };
  const ended = () => {
    if (disposed || !active) return;
    wantsPlayback = false;
    invalidate();
    onPlaying(false);
    onBuffering(false);
  };
  const listeners = {
    loadeddata: ready,
    canplay: ready,
    playing,
    pause: paused,
    waiting,
    stalled: () => { if (video.readyState < 3) waiting(); },
    ended,
    error: () => { if (active && video.error) fail(video.error); },
  };
  Object.entries(listeners).forEach(([event, handler]) => video.addEventListener(event, handler));

  return {
    get wantsPlayback() { return wantsPlayback; },
    prepare({ autoplay = wantsPlayback } = {}) {
      invalidate();
      active = false;
      wantsPlayback = autoplay;
      video.pause();
      onPlaying(false);
      onBuffering(true);
    },
    attach() { active = true; },
    play() {
      recoveryAttempts = 0;
      wantsPlayback = true;
      if (video.ended) video.currentTime = 0;
      onBuffering(video.readyState < 3);
      resume();
    },
    pause() {
      wantsPlayback = false;
      invalidate();
      video.pause();
      onPlaying(false);
      onBuffering(false);
    },
    setRate(rate) { playbackRate = rate; video.playbackRate = rate; },
    resume,
    fail,
    destroy() {
      disposed = true;
      active = false;
      wantsPlayback = false;
      invalidate();
      Object.entries(listeners).forEach(([event, handler]) => video.removeEventListener(event, handler));
    },
  };
}
