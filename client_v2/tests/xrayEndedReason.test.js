import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

/** `endedReason.js` is deliberately dependency-free, so it links against nothing. */
const cardsSource = await readFile(new URL('../src/xray/endedReason.js', import.meta.url), 'utf8');
const cardsModule = new SourceTextModule(cardsSource);
await cardsModule.link(() => { throw new Error('endedReason.js must stay dependency-free'); });
await cardsModule.evaluate();
const { TONE, ENDED_CARDS, endedCardFor } = cardsModule.namespace;

/**
 * The reducer's own copy of §7's reasons, loaded for the cross-check below. The
 * card table writes its keys as literals rather than importing these, so this
 * test is the thing that keeps the two from drifting.
 */
const sessionSource = await readFile(new URL('../src/xray/session.js', import.meta.url), 'utf8');
const sessionModule = new SourceTextModule(sessionSource);
await sessionModule.link((specifier) => {
  if (specifier.includes('buttonState')) {
    return new SyntheticModule(['MODE'], function () {
      this.setExport('MODE', {
        IDLE: 'idle', STARTING: 'starting', ACTIVE: 'active', DISABLED: 'disabled',
      });
    });
  }
  throw new Error(`unexpected import: ${specifier}`);
});
await sessionModule.evaluate();
const { ENDED_REASON } = sessionModule.namespace;

// ───────────────────── the cross-check, in both directions ─────────────────────

test('every contract §7 ended reason has its own card', () => {
  for (const reason of Object.values(ENDED_REASON)) {
    const card = endedCardFor(reason);
    assert.equal(card.reason, reason, `${reason} fell through to another card`);
    assert.ok(card.title && card.detail && card.action, `${reason} is missing copy`);
  }
});

test('no card names a reason the contract does not define', () => {
  const real = new Set(Object.values(ENDED_REASON));
  for (const [key, card] of Object.entries(ENDED_CARDS)) {
    // `session_not_found` is the documented exception: it is an error code, not
    // a §7 reason, and its card reports the reason the reducer actually sets.
    if (key === 'session_not_found') {
      assert.equal(card.reason, ENDED_REASON.SESSION_EXPIRED);
      continue;
    }
    assert.ok(real.has(key), `card "${key}" is not a §7 reason`);
    assert.equal(card.reason, key);
  }
});

test('§7 has eight reasons and the UI covers exactly those eight', () => {
  // A deliberate trip-wire. If the contract gains a ninth reason, this fails
  // here rather than shipping a ninth state that silently renders the
  // internal-error card.
  assert.equal(Object.values(ENDED_REASON).length, 8);
  assert.equal(Object.keys(ENDED_CARDS).length, 9); // the eight, plus session_not_found
});

// ───────────────────────────── the copy itself ─────────────────────────────

test('the eight reasons say eight different things', () => {
  // Two of them share a title on purpose — the plan's table gives
  // `session_expired` and `idle_timeout` the same "timed out" headline — so the
  // distinctness that matters is the explanation underneath it.
  const details = Object.values(ENDED_REASON).map((r) => endedCardFor(r).detail);
  assert.equal(new Set(details).size, details.length);
  assert.equal(
    endedCardFor(ENDED_REASON.SESSION_EXPIRED).title,
    endedCardFor(ENDED_REASON.IDLE_TIMEOUT).title,
  );
});

test('every card offers a way back', () => {
  // Phase 6's rule: "every terminal state offers an obvious way back. Nobody
  // should have to reload the page." A blank action label would be a dead end.
  for (const card of Object.values(ENDED_CARDS)) {
    assert.match(card.action, /\S/);
    assert.ok(Object.values(TONE).includes(card.tone), `${card.reason} has an unknown tone`);
  }
});

test('severity is not uniform — a fault and a normal ending look different', () => {
  // If every card were the same tone the colour would carry no information, and
  // `object_lost` (which is just the end of a track) would alarm the user as
  // loudly as a server fault.
  assert.equal(endedCardFor(ENDED_REASON.OBJECT_LOST).tone, TONE.NOTICE);
  assert.equal(endedCardFor(ENDED_REASON.INTERNAL_ERROR).tone, TONE.ERROR);
  assert.equal(endedCardFor(ENDED_REASON.STREAM_STALLED).tone, TONE.WARN);
});

// ───────────────── the session_not_found flavour, non-vacuously ─────────────────

test('session_not_found gets its own sentence without inventing a §7 reason', () => {
  const plain = endedCardFor(ENDED_REASON.SESSION_EXPIRED);
  const gone = endedCardFor(ENDED_REASON.SESSION_EXPIRED, 'session_not_found');

  // The point of the test: the error code has to actually change the answer.
  // Asserting only that `gone` has a title would pass even if the lookup ignored
  // the second argument entirely.
  assert.notEqual(gone.title, plain.title);
  assert.notEqual(gone.detail, plain.detail);
  // ...while the reason reported stays inside §7's vocabulary, which three
  // codebases share.
  assert.equal(gone.reason, ENDED_REASON.SESSION_EXPIRED);
});

test('an unrelated error code does not hijack the expiry card', () => {
  const plain = endedCardFor(ENDED_REASON.SESSION_EXPIRED);
  assert.deepEqual(endedCardFor(ENDED_REASON.SESSION_EXPIRED, 'stream_not_ready'), plain);
  assert.deepEqual(endedCardFor(ENDED_REASON.OBJECT_LOST, 'session_not_found'),
    endedCardFor(ENDED_REASON.OBJECT_LOST));
});

// ────────────────────────────── the fallback ──────────────────────────────

test('an unknown or missing reason still explains itself', () => {
  // The reducer already refuses reasons outside §7, so this is belt and braces —
  // but a session has demonstrably ended, so returning null and drawing nothing
  // would leave the user with no account at all.
  for (const bad of [null, undefined, '', 'gpu_caught_fire', 42]) {
    const card = endedCardFor(bad);
    assert.equal(card.reason, ENDED_REASON.INTERNAL_ERROR);
    assert.ok(card.detail.length > 0);
  }
});
