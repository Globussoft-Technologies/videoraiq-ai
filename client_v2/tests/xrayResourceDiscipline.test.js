import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * A source-level audit of `src/xray/`.
 *
 * **What this is and is not.** `tests/xraySessionLeaks.test.js` *measures*
 * teardown by driving the real hook against a real server and counting sessions.
 * It cannot reach the three `requestAnimationFrame` loops and two intervals,
 * because those live inside `.jsx` components and this repo's test harness
 * (`node:vm`, no DOM, no renderer) cannot load JSX.
 *
 * So this file checks a weaker but still useful property: **no file acquires a
 * repeating resource without a release site in the same file.** It cannot prove
 * the release runs at the right moment — only the behavioural suite does that —
 * but it does catch the regression that actually happens, which is someone
 * adding a loop or a listener and forgetting the cleanup entirely.
 *
 * Comments are stripped first: this very file names the forbidden patterns in
 * prose, and so do several of the components, so matching raw text would flag
 * the documentation rather than the code. Same reason `xrayFlag.test.js` does it.
 */

const DIR = new URL('../src/xray/', import.meta.url);

/** Block and line comments out, string contents left alone. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');

const count = (src, needle) => src.split(needle).length - 1;

/** Each repeating resource and the call that releases it. */
const PAIRS = [
  ['addEventListener(', 'removeEventListener('],
  ['requestAnimationFrame(', 'cancelAnimationFrame('],
  ['setInterval(', 'clearInterval('],
  ['setTimeout(', 'clearTimeout('],
  ['.on(', '.off('],
];

async function sources() {
  const names = (await readdir(DIR)).filter((f) => /\.jsx?$/.test(f));
  assert.ok(names.length >= 16, `expected the whole module, found ${names.length} files`);
  const out = new Map();
  for (const name of names) {
    out.set(name, stripComments(await readFile(new URL(name, DIR), 'utf8')));
  }
  return out;
}

test('nothing is acquired without a release site in the same file', async () => {
  const files = await sources();
  const found = [];
  for (const [name, src] of files) {
    for (const [acquire, release] of PAIRS) {
      const got = count(src, acquire);
      if (got === 0) continue;
      found.push(`${name}:${acquire}`);
      assert.ok(
        count(src, release) > 0,
        `${name} calls ${acquire} ${got}x with no ${release}`,
      );
    }
  }
  // Guards the guard: if a refactor moved every loop and listener out of these
  // files, the loop above would pass by finding nothing at all.
  assert.ok(found.length >= 6, `audit matched only ${found.length} resources: ${found.join(', ')}`);
});

test('every addEventListener event is also removed, by name', async () => {
  const files = await sources();
  const names = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));
  const ADDED = /addEventListener\(\s*['"]([a-z]+)['"]/g;
  const REMOVED = /removeEventListener\(\s*['"]([a-z]+)['"]/g;
  const all = new Set();
  for (const [name, src] of files) {
    const added = names(src, ADDED);
    const removed = names(src, REMOVED);
    for (const event of added) {
      all.add(event);
      assert.ok(removed.has(event), `${name} adds '${event}' and never removes it`);
    }
  }
  // Without this, a regex that matched nothing would pass by never entering the
  // loop — the exact shape of the two tests this project has already had to
  // correct for proving nothing.
  assert.deepEqual([...all].sort(), ['keydown', 'pagehide']);
});

test('every socket event subscribed to is unsubscribed, by name', async () => {
  // Contract §9's two events ride the app's existing connection. A handler left
  // attached after unmount keeps drawing another page's masks into a dead
  // component, and X-ray must never open a second socket to escape the problem.
  const files = await sources();
  const subscribed = new Set();
  for (const [name, src] of files) {
    const on = [...src.matchAll(/\.on\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const off = new Set([...src.matchAll(/\.off\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    for (const event of on) {
      subscribed.add(event);
      assert.ok(off.has(event), `${name} subscribes to '${event}' and never unsubscribes`);
    }
  }
  assert.deepEqual([...subscribed].sort(), ['xray:mask', 'xray:state']);
});

test('no X-ray module opens its own socket.io connection', async () => {
  // Plan reminder: "Never open a second socket.io connection. Use the app's
  // existing one." A second connection would authenticate separately and would
  // not be the one Node fans out to by socket id (contract §9).
  const files = await sources();
  for (const [name, src] of files) {
    assert.ok(!/from\s+['"]socket\.io-client['"]/.test(src), `${name} imports socket.io-client`);
    assert.ok(!/\bio\s*\(/.test(src), `${name} looks like it calls io()`);
  }
});

// ───────────────────── decisions that must not quietly revert ─────────────────────

test('nothing in X-ray dismisses a message on a timer', async () => {
  // Phase 6 deleted `setTimeout(stop, 4000)` from `XrayMode.jsx`: an ended
  // session's explanation used to remove itself after four seconds, which could
  // take away the only account of what happened before it was read. The way back
  // is a button now. A timer reappearing in the mount point is that regression.
  const files = await sources();
  assert.equal(count(files.get('XrayMode.jsx'), 'setTimeout('), 0,
    'XrayMode.jsx has a timer again — see the ended-card rationale');
  // Inline click feedback still fades on a timer, and should: it reports a click
  // the user just made, not a terminal state they have to act on.
  assert.ok(count(files.get('XrayClickLayer.jsx'), 'setTimeout(') > 0);
});

test('the pill stays reachable when it is unavailable', async () => {
  // Five refusal reasons live in `buttonState.js`. A real `disabled` attribute
  // takes the pill out of the tab order, so none of them is announced and the
  // `title` is hover-only — the reason exists and only mouse users get it.
  const src = (await sources()).get('XrayButton.jsx');
  assert.ok(src.includes('aria-disabled'), 'the pill lost its aria-disabled');
  assert.ok(!/\sdisabled=/.test(src),
    'the pill uses the `disabled` attribute again, which hides its own reason');
  assert.ok(src.includes('aria-pressed'));
  assert.ok(src.includes('aria-label'));
});

test('state changes and terminal states are announced, not only shown', async () => {
  const files = await sources();
  // The chip is the live region for §7's states; polite, because they are
  // frequent and mostly benign.
  assert.ok(files.get('XrayStateChip.jsx').includes('aria-live="polite"'));
  // The card is an alert: a session can end while the user is looking elsewhere
  // on the page.
  assert.ok(files.get('XrayEndedCard.jsx').includes('role="alert"'));
  // So is a refused click, anchored where the click landed.
  assert.ok(files.get('XrayClickLayer.jsx').includes('role="alert"'));
});

test('the mask overlay never takes pointer events', async () => {
  // A mask that swallowed a click would break both X-ray's own re-click and the
  // page's zone drawing underneath it.
  const src = (await sources()).get('XrayMaskOverlay.jsx');
  assert.ok(src.includes("pointerEvents: 'none'"));
});
