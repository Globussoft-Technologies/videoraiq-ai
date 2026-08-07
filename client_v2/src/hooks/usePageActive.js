import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the page is actually being *viewed*.
 *
 * Returns false when the tab is backgrounded or the browser is minimised
 * (`document.visibilityState === 'hidden'`) and when the page is being unloaded
 * or frozen into the bfcache (`pagehide`). Going inactive is delayed by
 * `graceMs` so a quick alt-tab does not trigger a full stream teardown and
 * reload; coming back is always immediate.
 *
 * `pauseOnBlur` is off by default on purpose: the Live Wall is routinely parked
 * on a second monitor while the operator works in another window, and window
 * blur (unlike visibility) fires in exactly that situation.
 */
export default function usePageActive({ graceMs = 3000, pauseOnBlur = false } = {}) {
  const [active, setActive] = useState(() => (
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  ));
  const timerRef = useRef(null);

  useEffect(() => {
    const clearPending = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    const goActive = () => { clearPending(); setActive(true); };

    const goInactive = (immediate = false) => {
      if (immediate) { clearPending(); setActive(false); return; }
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setActive(false);
      }, graceMs);
    };

    const onVisibility = () => (
      document.visibilityState === 'hidden' ? goInactive() : goActive()
    );
    /* Navigating away / bfcache freeze — tear down now, no grace period. */
    const onPageHide = () => goInactive(true);
    const onPageShow = () => goActive();
    const onBlur     = () => goInactive();
    const onFocus    = () => goActive();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    if (pauseOnBlur) {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    }

    onVisibility();

    return () => {
      clearPending();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      if (pauseOnBlur) {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [graceMs, pauseOnBlur]);

  return active;
}
