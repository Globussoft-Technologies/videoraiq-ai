/**
 * Sequential stream-start scheduler.
 *
 * Every camera tile asks this queue for permission before it builds its HLS
 * instance. Only `maxConcurrent` cameras may be *starting up* at any moment —
 * the next one is admitted only once the current one settles (first frame
 * decoded, hard error, or watchdog timeout).
 *
 * Cameras that have already settled keep streaming: the queue gates the
 * expensive startup burst (manifest fetch → MSE/SourceBuffer setup → worker
 * spawn → first keyframe decode), which is what spiked CPU when ~60 tiles
 * mounted simultaneously. Steady-state playback is comparatively cheap.
 *
 * Ordering is by `priority` ascending, then by request order, so on-screen
 * tiles always start before off-screen ones even when they enqueue later.
 */

export const STREAM_QUEUE_DEFAULTS = {
  /* "Load one camera stream at a time." Raise to 2–3 if the full-inventory
     sweep needs to finish faster on a beefy client. */
  maxConcurrent: 1,
  /* Backstop only — tiles run their own (shorter) settle timer. This catches a
     tile that is destroyed mid-startup without releasing its slot. */
  watchdogMs: 10000,
  /* Breather between admissions so React/paint/input work gets the main thread
     back between stream starts. Keeps the UI responsive while loading. */
  gapMs: 120,
};

class StreamQueue {
  constructor(options) {
    this.options = { ...STREAM_QUEUE_DEFAULTS, ...options };
    this.waiting = new Map(); // id -> entry, not yet allowed to start
    this.active = new Map();  // id -> entry, currently starting up
    this.seq = 0;
    this.pumpTimer = null;
    this.listeners = new Set();
  }

  /** Observe queue depth — `{ waiting, starting }`. Returns an unsubscribe fn. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  getStats() {
    return { waiting: this.waiting.size, starting: this.active.size };
  }

  _emit() {
    if (!this.listeners.size) return;
    const stats = this.getStats();
    this.listeners.forEach((fn) => { try { fn(stats); } catch { /* noop */ } });
  }

  /* ── Queue operations ───────────────────────────────────────────────── */

  /**
   * Ask for a start slot. `onAdmit` fires when this camera may build its
   * player. Re-requesting an id that is already admitted re-fires `onAdmit`
   * (idempotent on the caller side) so a remounted tile never hangs.
   *
   * `immediate` skips the queue entirely — for a camera the user explicitly
   * asked for (clicking a tab, opening fullscreen). Waiting on a background
   * status probe to finish before showing a clicked camera would be absurd, so
   * foreground streams jump straight in. They still occupy a slot, so queued
   * background work simply waits until the foreground stream has settled.
   */
  request(id, priority, onAdmit, immediate = false) {
    if (!id) return;

    const running = this.active.get(id);
    if (running) {
      running.onAdmit = onAdmit;
      try { onAdmit(); } catch { /* noop */ }
      return;
    }

    const queued = this.waiting.get(id);
    if (queued) {
      queued.priority = priority;
      queued.onAdmit = onAdmit;
      if (immediate) {
        this.waiting.delete(id);
        this._admit(queued);
      }
      return;
    }

    const entry = { id, priority, seq: this.seq++, onAdmit, watchdog: null };
    if (immediate) { this._admit(entry); return; }

    this.waiting.set(id, entry);
    this._emit();
    this._pump();
  }

  /** Re-rank a still-waiting camera (e.g. it scrolled into the viewport). */
  setPriority(id, priority) {
    const entry = this.waiting.get(id);
    if (entry) entry.priority = priority;
  }

  /** "I'm done starting up" — hands the slot to the next camera. */
  settle(id) {
    const entry = this.active.get(id);
    if (!entry) return;
    if (entry.watchdog) clearTimeout(entry.watchdog);
    this.active.delete(id);
    this._emit();
    this._pump();
  }

  /** "I'm gone" — unmounted, disabled, or torn down. Frees the slot. */
  release(id) {
    const running = this.active.get(id);
    if (running) {
      if (running.watchdog) clearTimeout(running.watchdog);
      this.active.delete(id);
    }
    const queued = this.waiting.delete(id);
    if (running || queued) {
      this._emit();
      this._pump();
    }
  }

  /** Drop every pending/active slot — used when the wall is torn down. */
  reset() {
    this.active.forEach((entry) => { if (entry.watchdog) clearTimeout(entry.watchdog); });
    this.active.clear();
    this.waiting.clear();
    if (this.pumpTimer) { clearTimeout(this.pumpTimer); this.pumpTimer = null; }
    this._emit();
  }

  /* ── Pump ───────────────────────────────────────────────────────────── */
  _pump() {
    if (this.pumpTimer) return;
    if (this.active.size >= this.options.maxConcurrent) return;
    if (this.waiting.size === 0) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this._admitNext();
    }, this.options.gapMs);
  }

  _admit(entry) {
    entry.watchdog = setTimeout(() => this.settle(entry.id), this.options.watchdogMs);
    this.active.set(entry.id, entry);
    this._emit();
    try { entry.onAdmit(); } catch { /* noop */ }
  }

  _admitNext() {
    // An `immediate` request can have filled the slot while this pump was
    // pending. Nothing is lost: whoever took it will settle or release, and
    // both paths pump again.
    if (this.active.size >= this.options.maxConcurrent) return;

    let next = null;
    this.waiting.forEach((entry) => {
      if (!next || entry.priority < next.priority ||
         (entry.priority === next.priority && entry.seq < next.seq)) {
        next = entry;
      }
    });
    if (!next) return;

    this.waiting.delete(next.id);
    this._admit(next);
    this._pump();
  }
}

const streamQueue = new StreamQueue();
export default streamQueue;
