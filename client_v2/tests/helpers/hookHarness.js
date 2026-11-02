/**
 * A minimal React-hooks runtime, enough to drive one custom hook outside a
 * browser.
 *
 * **Why this exists.** `client_v2` has no DOM and no test renderer — tests run
 * on `node:test` + `node:vm` with zero devDependencies, deliberately. Adding
 * `jsdom` to test one hook would change the repo's test contract for all three
 * sessions, which is not this session's call. So the leak audit fakes *React*
 * rather than faking the code under test: the hook, `api.js`, axios, the HTTP
 * requests and the server responses are all real.
 *
 * **What it models**, which is exactly React's documented contract for the
 * things a leak audit cares about:
 *   - hook state keyed by call order, stable across renders;
 *   - `useEffect` runs after a render when its deps change, by `Object.is`;
 *   - on a re-run, every pending cleanup runs *before* any new effect body —
 *     two passes, as React's commit does;
 *   - `unmount()` runs every live cleanup in order.
 *
 * **What it does NOT model**, so no test here may depend on it:
 *   - batching. A `dispatch` re-renders and flushes synchronously, where React
 *     coalesces several in one event. A test that needs two dispatches in one
 *     tick to behave as one must not be written against this.
 *   - concurrent rendering, transitions, suspense, refs-to-DOM.
 *   - a changing `useReducer` reducer identity: the first one is kept. True for
 *     `useXraySession`, whose reducer is a module-level function.
 *
 * **It is a fixture that could be confidently wrong**, which is the one kind of
 * test this project has already been burned by. So the leak suite runs a
 * **negative control**: the same scenario against a deliberately broken copy of
 * the hook, asserting the harness *reports* the leak. A harness that cannot
 * detect an injected leak cannot be trusted to have found no real one.
 */

let current = null;

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

function slot(make) {
  const i = current.index;
  current.index += 1;
  if (current.hooks.length <= i) current.hooks[i] = make();
  return current.hooks[i];
}

function requireRender(name) {
  if (!current) throw new Error(`${name} called outside a render`);
}

export function useRef(initial) {
  requireRender('useRef');
  return slot(() => ({ current: initial }));
}

export function useState(initial) {
  requireRender('useState');
  const inst = current;
  const s = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
  const set = (next) => {
    s.value = typeof next === 'function' ? next(s.value) : next;
    inst.schedule();
  };
  return [s.value, set];
}

export function useReducer(reducer, initialState) {
  requireRender('useReducer');
  const inst = current;
  const s = slot(() => ({ value: initialState, reducer, dispatch: null }));
  if (!s.dispatch) {
    s.dispatch = (action) => {
      s.value = s.reducer(s.value, action);
      inst.schedule();
    };
  }
  return [s.value, s.dispatch];
}

export function useCallback(fn, deps) {
  requireRender('useCallback');
  const s = slot(() => ({ fn: null, deps: null, set: false }));
  if (!s.set || !sameDeps(s.deps, deps)) {
    s.fn = fn;
    s.deps = deps;
    s.set = true;
  }
  return s.fn;
}

export function useMemo(factory, deps) {
  requireRender('useMemo');
  const s = slot(() => ({ value: undefined, deps: null, set: false }));
  if (!s.set || !sameDeps(s.deps, deps)) {
    s.value = factory();
    s.deps = deps;
    s.set = true;
  }
  return s.value;
}

export function useEffect(fn, deps) {
  requireRender('useEffect');
  const inst = current;
  const s = slot(() => ({ deps: null, cleanup: null, set: false }));
  // No dep array means "every render", matching React.
  if (!s.set || deps === undefined || !sameDeps(s.deps, deps)) {
    s.pendingFn = fn;
    s.pendingDeps = deps;
    s.set = true;
    inst.queue.push(s);
  }
  return undefined;
}

/** The module object to link `react` against when loading a hook under test. */
export const reactStub = {
  useRef, useState, useReducer, useCallback, useMemo, useEffect,
};
export const REACT_EXPORTS = Object.keys(reactStub);

/**
 * Mount a hook and drive it.
 *
 * @param {Function} hook            the hook under test
 * @param {object}   [opts]
 * @param {*}        [opts.props]    argument passed to the hook each render
 * @param {boolean}  [opts.strict]   model StrictMode's dev double-invoke:
 *   on the FIRST commit, run effects, then every cleanup, then the effects
 *   again. This app really does render inside `<StrictMode>` (`main.jsx:22`),
 *   so a teardown that misbehaves when it runs twice misbehaves in dev.
 * @returns {{result, rerender, setProps, unmount, renders, effectRuns, cleanupRuns}}
 */
export function renderHook(hook, { props = undefined, strict = false } = {}) {
  const inst = {
    hooks: [], index: 0, queue: [], props,
    result: null, renders: 0, mounted: true,
    effectRuns: 0, cleanupRuns: 0,
    schedule: null,
  };

  const flush = () => {
    const queued = inst.queue;
    inst.queue = [];
    // Two passes, as React's commit does: every destroy, then every create.
    // One pass would let an effect's new body observe a sibling's stale
    // resource, which is a different ordering from the real thing.
    for (const s of queued) {
      if (typeof s.cleanup === 'function') { s.cleanup(); inst.cleanupRuns += 1; }
      s.cleanup = null;
    }
    for (const s of queued) {
      s.deps = s.pendingDeps;
      const out = s.pendingFn();
      s.cleanup = typeof out === 'function' ? out : null;
      inst.effectRuns += 1;
    }
  };

  const render = () => {
    if (!inst.mounted) return;
    const previous = current;
    current = inst;
    inst.index = 0;
    inst.renders += 1;
    try {
      inst.result = hook(inst.props);
    } finally {
      current = previous;
    }
    flush();
  };

  inst.schedule = render;
  render();

  if (strict) {
    // StrictMode: tear the whole mounted tree down once and build it again.
    for (const s of inst.hooks) {
      if (typeof s?.cleanup === 'function') { s.cleanup(); inst.cleanupRuns += 1; s.cleanup = null; }
    }
    for (const s of inst.hooks) {
      if (typeof s?.pendingFn === 'function') {
        const out = s.pendingFn();
        s.cleanup = typeof out === 'function' ? out : null;
        inst.effectRuns += 1;
      }
    }
  }

  return {
    get result() { return inst.result; },
    get renders() { return inst.renders; },
    get effectRuns() { return inst.effectRuns; },
    get cleanupRuns() { return inst.cleanupRuns; },
    rerender: render,
    setProps(next) { inst.props = next; render(); },
    unmount() {
      if (!inst.mounted) return;
      inst.mounted = false;
      for (const s of inst.hooks) {
        if (typeof s?.cleanup === 'function') { s.cleanup(); inst.cleanupRuns += 1; s.cleanup = null; }
      }
    },
  };
}

/**
 * A stand-in for the app's socket.io client that records every subscription, so
 * "listeners are removed" is a measurement rather than a reading of the source.
 */
export function fakeSocket() {
  const handlers = new Map();
  return {
    socket: {
      on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(fn);
      },
      off(event, fn) {
        const list = handlers.get(event) ?? [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      emit(event, payload) {
        for (const fn of [...(handlers.get(event) ?? [])]) fn(payload);
      },
    },
    connected: true,
    /** How many handlers are still attached — must be 0 after unmount. */
    listenerCount: (event) => (event
      ? (handlers.get(event) ?? []).length
      : [...handlers.values()].reduce((n, l) => n + l.length, 0)),
  };
}
