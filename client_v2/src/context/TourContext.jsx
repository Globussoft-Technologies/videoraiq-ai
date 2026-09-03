import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '@/context/PermissionContext';
import { useLogsConfig } from '@/context/LogsConfigContext';
import { visibleNavItems } from '@/lib/navVisibility';
import { SHELL_TOUR, resolveSteps, tourForItem } from '@/lib/tour/steps';
import { fetchOnboarding, updateOnboarding, fetchTourModules } from '@/helpers/onboarding';

const TourContext = createContext(null);

/**
 * Two distinct modes, and the difference is the whole point of the feature:
 *
 *  - 'global'  the first-login onboarding run. Walks every module the user can
 *              see. Finishing it, or using the global skip, sets `onboarded`.
 *  - 'single'  one module, started by hand from the header. Never touches
 *              `onboarded` — a user who is still mid-onboarding can explore a
 *              module without that counting as having completed onboarding.
 */
const MODE_GLOBAL = 'global';
const MODE_SINGLE = 'single';

// How long to wait for a module's first anchor to mount before giving up on it.
// Pages fetch on mount, so the anchor can lag the route change by a beat; a
// module whose anchor never arrives is skipped rather than left hanging.
const ANCHOR_TIMEOUT_MS = 4000;
const ANCHOR_POLL_MS = 80;
// Brief settle once the first anchor exists, so sibling anchors rendered in the
// same pass are present before the step list is resolved against the DOM.
const ANCHOR_SETTLE_MS = 250;

/** Resolves once `selector` is in the DOM, or false on timeout. */
function waitForAnchor(selector, signal) {
  return new Promise((resolve) => {
    const deadline = Date.now() + ANCHOR_TIMEOUT_MS;
    const tick = () => {
      if (signal.cancelled) return resolve(false);
      if (document.querySelector(selector)) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, ANCHOR_POLL_MS);
    };
    tick();
  });
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { permissions } = usePermissions();
  const { logs: logsConfig } = useLogsConfig();

  // null while unknown — the auto-start effect must not fire on a guess.
  const [onboarded, setOnboarded] = useState(null);

  const [mode, setMode] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [steps, setSteps] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [run, setRun] = useState(false);

  // Guards the auto-start so it happens once per session, not on every remount
  // of the layout (a route change inside the shell re-runs effects).
  const autoStarted = useRef(false);
  // Lets an in-flight module preparation be abandoned when the user skips.
  const prepRef = useRef({ cancelled: true });

  const modules = useMemo(
    () => visibleNavItems(permissions, logsConfig),
    [permissions, logsConfig]
  );

  // enterModule runs inside an async loop that outlives several renders. Reading
  // the path from a ref (rather than closing over `location.pathname`) keeps the
  // callback stable, so the loop never navigates against a stale value.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  /* ------------------------------------------------------------------ */
  /* Onboarding flag                                                     */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let alive = true;
    fetchOnboarding()
      .then((data) => {
        if (alive) setOnboarded(data?.onboarded === true);
      })
      .catch(() => {
        // Fail closed: if we can't tell, assume onboarded so a backend blip
        // never forces the tour on someone who has already seen it.
        if (alive) setOnboarded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persistOnboarded = useCallback(() => {
    setOnboarded(true);
    updateOnboarding(true).catch((err) => {
      // Local state still flips, so the user isn't re-prompted this session.
      // The flag stays false server-side and the tour returns at next login —
      // an acceptable degradation, but worth surfacing in the console.
      console.warn('[tour] could not persist onboarded flag:', err?.message || err);
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Running a module                                                    */
  /* ------------------------------------------------------------------ */

  const stop = useCallback(() => {
    prepRef.current.cancelled = true;
    setRun(false);
    setMode(null);
    setQueue([]);
    setQueueIndex(0);
    setSteps([]);
    setStepIndex(0);
  }, []);

  /**
   * Prepare and start `queue[index]`: navigate if needed, wait for its first
   * anchor, drop steps whose anchors aren't present, then run.
   *
   * A module that yields no usable steps is skipped rather than shown empty —
   * which is what makes it safe for the registry to list optional anchors.
   */
  const enterModule = useCallback(
    async (list, index) => {
      prepRef.current.cancelled = true;
      const signal = { cancelled: false };
      prepRef.current = signal;

      const module = list[index];
      if (!module) return { ok: false, exhausted: true };

      setRun(false);
      setStepIndex(0);
      setQueueIndex(index);

      if (module.path && pathnameRef.current !== module.path) {
        navigate(module.path);
      }

      const first = module.steps[0];
      const found = first ? await waitForAnchor(first.target, signal) : false;
      if (signal.cancelled) return { ok: false };

      if (found) {
        await new Promise((r) => setTimeout(r, ANCHOR_SETTLE_MS));
        if (signal.cancelled) return { ok: false };
      }

      const usable = resolveSteps(module.steps);
      if (!usable.length) return { ok: false };

      setSteps(usable);
      setStepIndex(0);
      setRun(true);
      return { ok: true };
    },
    [navigate]
  );

  /**
   * Move to the next module in the queue, skipping any that can't run, and
   * finish the global flow when the queue is exhausted.
   */
  const advance = useCallback(
    async (fromIndex) => {
      const list = queue;
      for (let i = fromIndex + 1; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await enterModule(list, i);
        if (result.ok) return;
        if (prepRef.current.cancelled) return;
      }

      // Ran off the end of the queue.
      const wasGlobal = mode === MODE_GLOBAL;
      stop();
      if (wasGlobal) persistOnboarded();
    },
    [queue, enterModule, mode, stop, persistOnboarded]
  );

  /* ------------------------------------------------------------------ */
  /* Public actions                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * The complete run: shell orientation, then every module THIS user may open.
   *
   * "Complete" means complete for them — a role with two modules gets a
   * three-stop tour, not a walk through the whole product. The list comes from
   * the server rather than this tab's permission snapshot, so a module revoked
   * moments ago is already gone from it.
   */
  const startGlobalTour = useCallback(async () => {
    let items = null;
    try {
      const served = await fetchTourModules('');
      // An empty array is a legitimate answer — a role may be entitled to
      // nothing. Only a thrown request falls back; treating "no modules" as a
      // failure would quietly tour them through pages they cannot open.
      if (Array.isArray(served)) items = served;
    } catch {
      // Fall through to the locally filtered list below.
    }
    // Fallback keeps first-login onboarding working if that call fails. It is
    // still permission-filtered (visibleNavItems), just from this tab's copy.
    const source = items ?? modules;

    const list = [SHELL_TOUR, ...source.map(tourForItem)];
    setMode(MODE_GLOBAL);
    setQueue(list);
    for (let i = 0; i < list.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await enterModule(list, i);
      if (result.ok) return;
      if (prepRef.current.cancelled) return;
    }
    // Nothing could run at all — don't strand the user mid-flow.
    stop();
    persistOnboarded();
  }, [modules, enterModule, stop, persistOnboarded]);

  /** One module, by nav key, started from the header menu. */
  const startModuleTour = useCallback(
    async (target) => {
      // `target` is the entry the server returned for the menu — already
      // permission- and licence-filtered. Using it directly (rather than looking
      // the key up in a local list) is what guarantees a revoked module cannot
      // be started: if the server did not offer it, there is nothing to click.
      // A bare key is still accepted, and is resolved ONLY against the
      // permission-filtered set — never the full nav config.
      const key = typeof target === 'string' ? target : target?.key;
      if (!key) return;

      const item =
        key === SHELL_TOUR.key
          ? null
          : (typeof target === 'object' && target?.path ? target : null) ||
            modules.find((m) => m.key === key);
      const module = key === SHELL_TOUR.key ? SHELL_TOUR : item && tourForItem(item);
      if (!module) return;

      const list = [module];
      setMode(MODE_SINGLE);
      setQueue(list);
      const result = await enterModule(list, 0);
      if (!result.ok && !prepRef.current.cancelled) stop();
    },
    [modules, enterModule, stop]
  );

  /**
   * Skip A — this module only.
   *
   * Stops the remaining steps here and continues the onboarding flow with the
   * next module. `onboarded` deliberately stays as it is: skipping one module
   * is not completing onboarding.
   */
  const skipModule = useCallback(() => {
    if (mode === MODE_SINGLE) {
      stop();
      return;
    }
    setRun(false);
    advance(queueIndex);
  }, [mode, queueIndex, advance, stop]);

  /**
   * Skip B — the entire onboarding experience.
   *
   * Stops everything immediately and marks the user onboarded, so the tour
   * never auto-starts again. Only the global flow writes the flag; ending a
   * manually started single-module tour is just a close.
   */
  const skipAll = useCallback(() => {
    const wasGlobal = mode === MODE_GLOBAL;
    stop();
    if (wasGlobal) persistOnboarded();
  }, [mode, stop, persistOnboarded]);

  /** Last step of the last module — the natural end of the flow. */
  const finish = useCallback(() => {
    const wasGlobal = mode === MODE_GLOBAL;
    if (wasGlobal) {
      advance(queueIndex);
      return;
    }
    stop();
  }, [mode, queueIndex, advance, stop]);

  const goToStep = useCallback((index) => setStepIndex(index), []);

  /* ------------------------------------------------------------------ */
  /* Auto-start on first login                                           */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (autoStarted.current) return;
    if (onboarded !== false) return;
    // Wait for permissions to load, otherwise the queue is built from the
    // fail-open "show everything" state and would walk the user into modules
    // their role can't open.
    if (!permissions || Object.keys(permissions).length === 0) return;

    autoStarted.current = true;
    startGlobalTour();
  }, [onboarded, permissions, startGlobalTour]);

  /* ------------------------------------------------------------------ */

  const currentModule = queue[queueIndex] || null;
  const currentStep = steps[stepIndex] || null;
  const isGlobal = mode === MODE_GLOBAL;

  const value = useMemo(
    () => ({
      // state
      active: Boolean(mode),
      isGlobal,
      run,
      steps,
      stepIndex,
      onboarded,
      modules,
      currentModule,
      moduleLabel: currentModule?.label || '',
      modulePosition: isGlobal ? { index: queueIndex + 1, total: queue.length } : null,
      // the mobile sidebar drawer has to be open for a nav-anchored step
      needsSidebar: Boolean(run && currentStep?.sidebar),
      // actions
      startGlobalTour,
      startModuleTour,
      skipModule,
      skipAll,
      finish,
      goToStep,
      stop,
    }),
    [
      mode,
      isGlobal,
      run,
      steps,
      stepIndex,
      onboarded,
      modules,
      currentModule,
      currentStep,
      queueIndex,
      queue.length,
      startGlobalTour,
      startModuleTour,
      skipModule,
      skipAll,
      finish,
      goToStep,
      stop,
    ]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside a TourProvider');
  return ctx;
}

export { MODE_GLOBAL, MODE_SINGLE };
