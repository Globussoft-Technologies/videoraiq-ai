import { useCallback, useEffect, useRef } from 'react';

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [contenteditable="true"]';
const FOCUS_WATCHDOG_MS = 5_000;
const FOCUS_RETRY_DELAYS_MS = [0, 100, 500, 1_500];

export default function useStationKioskFocus() {
  const surfaceRef = useRef(null);
  const retryTimersRef = useRef([]);
  const wakeLockRef = useRef(null);

  const restoreFocus = useCallback(() => {
    if (document.visibilityState !== 'visible') return;

    const documentFocused = document.hasFocus();
    const activeElement = document.activeElement;
    const interactiveElementFocused = documentFocused
      && activeElement instanceof Element
      && Boolean(activeElement.closest(INTERACTIVE_SELECTOR));

    // Never take focus away from a control the operator is actively using.
    // When Chromium has moved focus outside the renderer, document.hasFocus()
    // is false and the station surface is focused again.
    if (interactiveElementFocused) return;

    window.focus();
    surfaceRef.current?.focus({ preventScroll: true });
  }, []);

  const scheduleRestore = useCallback(() => {
    retryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    retryTimersRef.current = FOCUS_RETRY_DELAYS_MS.map((delay) => (
      window.setTimeout(restoreFocus, delay)
    ));
  }, [restoreFocus]);

  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== 'visible' || wakeLockRef.current || !navigator.wakeLock?.request) return;

    try {
      const wakeLock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = wakeLock;
      wakeLock.addEventListener('release', () => {
        if (wakeLockRef.current === wakeLock) wakeLockRef.current = null;
      }, { once: true });
    } catch {
      // Wake Lock is an optional enhancement. Focus recovery remains active
      // when Chromium or the operating system does not permit it.
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRestore();
        requestWakeLock();
      }
    };
    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
      scheduleRestore();
    };

    scheduleRestore();
    requestWakeLock();
    const watchdog = window.setInterval(restoreFocus, FOCUS_WATCHDOG_MS);
    window.addEventListener('blur', scheduleRestore);
    window.addEventListener('focus', scheduleRestore);
    window.addEventListener('pageshow', scheduleRestore);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('focusout', scheduleRestore, true);
    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      window.clearInterval(watchdog);
      retryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      retryTimersRef.current = [];
      window.removeEventListener('blur', scheduleRestore);
      window.removeEventListener('focus', scheduleRestore);
      window.removeEventListener('pageshow', scheduleRestore);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('focusout', scheduleRestore, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [requestWakeLock, restoreFocus, scheduleRestore]);

  return surfaceRef;
}
