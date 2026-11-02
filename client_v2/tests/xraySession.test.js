import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const source = await readFile(new URL('../src/xray/session.js', import.meta.url), 'utf8');

const module = new SourceTextModule(source);
await module.link((specifier) => {
  if (specifier.includes('buttonState')) {
    return new SyntheticModule(['MODE'], function () {
      this.setExport('MODE', {
        IDLE: 'idle', STARTING: 'starting', ACTIVE: 'active', DISABLED: 'disabled',
      });
    });
  }
  throw new Error(`unexpected import: ${specifier}`);
});
await module.evaluate();
const { STATUS, ENDED_REASON, initialState, isLive, buttonPhaseFor, reduce } = module.namespace;

const SID = '7f3ac091';
const SESSION = { sessionId: SID, width: 1920, height: 1080, frameRate: 5, lostAfterFrames: 25, maxObjects: 1 };

/** Walk the happy path up to a live session. */
const started = () => reduce(reduce(initialState, { type: 'start' }), { type: 'started', session: SESSION });

test('a fresh machine is idle with nothing held', () => {
  assert.equal(initialState.status, STATUS.IDLE);
  assert.equal(initialState.session, null);
  assert.equal(initialState.notLicensed, false);
  assert.equal(isLive(STATUS.IDLE), false);
});

test('start → preparing → ready, and 200 means ready (contract §4)', () => {
  const preparing = reduce(initialState, { type: 'start' });
  assert.equal(preparing.status, STATUS.PREPARING);
  assert.equal(preparing.session, null);

  const ready = reduce(preparing, { type: 'started', session: SESSION });
  // §4: a 200 is a promise that frames are already flowing, so the next state
  // is `ready` — not something more tentative that would keep clicks disabled.
  assert.equal(ready.status, STATUS.READY);
  assert.deepEqual(ready.session, SESSION);
});

test('a start response that lands after the user gave up is ignored', () => {
  // The user pressed off while POST /sessions was still in flight. Accepting
  // the response would resurrect a session nobody is watching.
  const afterStop = reduce(reduce(initialState, { type: 'start' }), { type: 'stop' });
  const late = reduce(afterStop, { type: 'started', session: SESSION });
  assert.equal(late.status, STATUS.IDLE);
  assert.equal(late.session, null);
});

test('a failed start returns to idle, not to ended', () => {
  // Contract §4: no session is created on failure, so there is nothing that
  // could have "ended". Going to `ended` would show the user a terminal card
  // for a session that never existed.
  const failed = reduce(reduce(initialState, { type: 'start' }),
    { type: 'start_failed', code: 'stream_not_ready', message: 'not streaming' });
  assert.equal(failed.status, STATUS.IDLE);
  assert.equal(failed.session, null);
  assert.equal(failed.reason, null);
  assert.deepEqual(failed.lastError, { code: 'stream_not_ready', message: 'not streaming' });
});

test('not_licensed latches and never un-latches', () => {
  let s = reduce(initialState, { type: 'start' });
  s = reduce(s, { type: 'start_failed', code: 'not_licensed', message: 'nope' });
  assert.equal(s.notLicensed, true);

  // A licence does not change between two clicks, so nothing short of a reload
  // should clear it — including a stop, a later success, or another failure.
  for (const event of [{ type: 'stop' }, { type: 'start' },
                       { type: 'started', session: SESSION },
                       { type: 'start_failed', code: 'stream_not_ready' }]) {
    s = reduce(s, event);
    assert.equal(s.notLicensed, true, `un-latched by ${event.type}`);
  }
});

test('a start failure with no code still produces a usable error', () => {
  const s = reduce(reduce(initialState, { type: 'start' }), { type: 'start_failed' });
  assert.equal(s.lastError.code, 'internal_error', 'copy tables need a code they know');
  assert.equal(s.status, STATUS.IDLE);
});

test('server states drive the machine through the §7 vocabulary', () => {
  let s = started();
  for (const next of [STATUS.TRACKING, STATUS.LOST, STATUS.TRACKING, STATUS.READY]) {
    s = reduce(s, { type: 'server_state', sessionId: SID, state: next });
    assert.equal(s.status, next);
    assert.equal(s.reason, null, 'reason is only ever set for ended');
  }
});

test('events for another session are ignored (contract §9)', () => {
  const s = started();
  const stale = reduce(s, { type: 'server_state', sessionId: 'someone-else', state: STATUS.TRACKING });
  assert.equal(stale, s, 'a stale event must be a no-op, not an error');

  // And before a session exists, every event is stale.
  const none = reduce(initialState, { type: 'server_state', sessionId: SID, state: STATUS.TRACKING });
  assert.equal(none, initialState);
});

test('an unknown state string is ignored rather than crashing the overlay', () => {
  const s = started();
  for (const bogus of ['paused', '', null, undefined, 42, 'READY']) {
    assert.equal(reduce(s, { type: 'server_state', sessionId: SID, state: bogus }), s,
      `expected no-op for ${JSON.stringify(bogus)}`);
  }
});

test('ended carries a §7 reason, and an off-vocabulary one falls back honestly', () => {
  const s = started();
  for (const reason of Object.values(ENDED_REASON)) {
    const e = reduce(s, { type: 'server_state', sessionId: SID, state: STATUS.ENDED, reason });
    assert.equal(e.status, STATUS.ENDED);
    assert.equal(e.reason, reason);
  }
  // §7's reasons are exhaustive and shared across three codebases. A value from
  // outside the list has no entry in the UI's copy table, so it must not be
  // passed through as if it did.
  for (const bogus of ['gpu_exploded', null, undefined, '']) {
    const e = reduce(s, { type: 'server_state', sessionId: SID, state: STATUS.ENDED, reason: bogus });
    assert.equal(e.reason, ENDED_REASON.INTERNAL_ERROR);
  }
});

test('framesBehindLive updates only when a real number arrives', () => {
  let s = reduce(started(), { type: 'server_state', sessionId: SID, state: STATUS.TRACKING, framesBehindLive: 142 });
  assert.equal(s.framesBehindLive, 142);
  for (const junk of [undefined, null, NaN, Infinity, 'lots']) {
    s = reduce(s, { type: 'server_state', sessionId: SID, state: STATUS.TRACKING, framesBehindLive: junk });
    assert.equal(s.framesBehindLive, 142, `clobbered by ${String(junk)}`);
  }
  s = reduce(s, { type: 'server_state', sessionId: SID, state: STATUS.TRACKING, framesBehindLive: 0 });
  assert.equal(s.framesBehindLive, 0, '0 is a real value, not a missing one');
});

test('a 404 ends the session without inventing a reason', () => {
  const s = reduce(started(), { type: 'gone', sessionId: SID, message: 'No such session' });
  assert.equal(s.status, STATUS.ENDED);
  // §7 has no `session_not_found` reason, so the nearest truthful one is used
  // and the precise code is preserved out-of-band for the UI's message.
  assert.equal(s.reason, ENDED_REASON.SESSION_EXPIRED);
  assert.equal(s.lastError.code, 'session_not_found');
});

test('a 404 for a session we no longer hold is a no-op', () => {
  assert.equal(reduce(initialState, { type: 'gone', sessionId: SID }), initialState);
  const s = started();
  assert.equal(reduce(s, { type: 'gone', sessionId: 'other' }), s);
});

test('stop clears everything that could outlive the session', () => {
  const live = reduce(started(), { type: 'server_state', sessionId: SID, state: STATUS.TRACKING, framesBehindLive: 9 });
  const s = reduce(live, { type: 'stop' });
  assert.equal(s.status, STATUS.IDLE);
  assert.equal(s.session, null, 'a stale sessionId is how a leak starts');
  assert.equal(s.reason, null);
  assert.equal(s.framesBehindLive, null);
  assert.equal(s.lastError, null);
});

test('isLive is true exactly for the states where the server holds a session', () => {
  assert.deepEqual(
    [STATUS.PREPARING, STATUS.READY, STATUS.TRACKING, STATUS.LOST, STATUS.ENDED, STATUS.IDLE]
      .map(isLive),
    [true, true, true, true, false, false],
  );
});

test('the pill phase follows the session status', () => {
  assert.equal(buttonPhaseFor(STATUS.IDLE), 'idle');
  assert.equal(buttonPhaseFor(STATUS.PREPARING), 'starting');
  for (const s of [STATUS.READY, STATUS.TRACKING, STATUS.LOST]) {
    assert.equal(buttonPhaseFor(s), 'active');
  }
  // `ended` is terminal, so the only thing left is to start again.
  assert.equal(buttonPhaseFor(STATUS.ENDED), 'idle');
  assert.equal(buttonPhaseFor('nonsense'), 'idle', 'unknown must not read as active');
});

test('the reducer never mutates the state it was given', () => {
  const before = started();
  const snapshot = JSON.stringify(before);
  for (const event of [
    { type: 'start' }, { type: 'stop' }, { type: 'gone', sessionId: SID },
    { type: 'server_state', sessionId: SID, state: STATUS.TRACKING },
    { type: 'start_failed', code: 'not_licensed' },
    { type: 'nonsense' },
  ]) {
    reduce(before, event);
    assert.equal(JSON.stringify(before), snapshot, `${event.type} mutated its input`);
  }
});

test('an unknown event is a no-op, by identity', () => {
  const s = started();
  assert.equal(reduce(s, { type: 'not_a_thing' }), s);
  assert.equal(reduce(s, {}), s);
  assert.equal(reduce(s), s);
});

// ─────────────────── Phase 4: tracked objects ───────────────────

test('an accepted click appends an object keyed by objId', () => {
  const s = reduce(started(), {
    type: 'object_added', objId: 'obj-a1', resolvedSeq: 101, resolvedOffset: 1.19,
    requestedSeq: 101, requestedOffset: 1.24, xNorm: 0.4, yNorm: 0.6,
  });
  assert.equal(s.objects.length, 1);
  assert.deepEqual(s.objects[0], {
    objId: 'obj-a1', resolvedSeq: 101, resolvedOffset: 1.19,
    requestedSeq: 101, requestedOffset: 1.24, xNorm: 0.4, yNorm: 0.6,
  });
  assert.equal(s.lastError, null, 'a success clears any previous refusal');
});

test('the object cap from the session payload is enforced', () => {
  // The server enforces it too and answers 409 max_objects_reached, but a
  // server that forgets must not be able to overfill the overlay.
  let s = reduce(started(), { type: 'object_added', objId: 'obj-a1', xNorm: 0.1, yNorm: 0.1 });
  s = reduce(s, { type: 'object_added', objId: 'obj-b2', xNorm: 0.2, yNorm: 0.2 });
  assert.equal(s.objects.length, 1, 'maxObjects is 1 in v1');
  assert.equal(s.objects[0].objId, 'obj-a1');
});

test('a duplicate objId is not appended twice', () => {
  let s = reduce(started(), { type: 'object_added', objId: 'obj-a1' });
  s = reduce(s, { type: 'object_added', objId: 'obj-a1' });
  assert.equal(s.objects.length, 1);
});

test('an object cannot be added without a live session', () => {
  // A prompt response landing after the user turned X-ray off must not
  // resurrect an object onto a dead session.
  assert.equal(reduce(initialState, { type: 'object_added', objId: 'obj-a1' }), initialState);

  const ended = reduce(started(), {
    type: 'server_state', sessionId: SID, state: STATUS.ENDED, reason: 'object_lost',
  });
  assert.equal(reduce(ended, { type: 'object_added', objId: 'obj-a1' }), ended);

  // A missing or empty objId is a no-op, by identity — there is nothing to key
  // the object by, and an unkeyed entry could never be removed again.
  const live = started();
  assert.equal(reduce(live, { type: 'object_added' }), live);
  assert.equal(reduce(live, { type: 'object_added', objId: '' }), live);
});

test('a refused click records the code and where it happened', () => {
  const s = reduce(started(), {
    type: 'prompt_failed', code: 'mask_too_small', message: 'too small', xNorm: 0.3, yNorm: 0.7,
  });
  assert.equal(s.lastError.code, 'mask_too_small');
  // The position is what lets the view anchor the message at the click instead
  // of in a corner, which is the whole point of inline click feedback.
  assert.deepEqual(s.lastError.at, { xNorm: 0.3, yNorm: 0.7 });
  assert.equal(s.objects.length, 0, 'a refusal must not leave a phantom object');
});

test('a refusal with no position still renders, just not anchored', () => {
  const s = reduce(started(), { type: 'prompt_failed', code: 'frame_not_buffered' });
  assert.equal(s.lastError.at, null);
  assert.equal(s.lastError.code, 'frame_not_buffered');
});

test('a refusal on a dead session is ignored', () => {
  assert.equal(reduce(initialState, { type: 'prompt_failed', code: 'mask_too_small' }), initialState);
});

test('ending a session clears its objects — never draw a stale mask', () => {
  // Phase 6's rule, enforced in the reducer so no view can opt out of it.
  const tracking = reduce(started(), { type: 'object_added', objId: 'obj-a1', xNorm: 0.5, yNorm: 0.5 });
  assert.equal(tracking.objects.length, 1);
  for (const event of [
    { type: 'server_state', sessionId: SID, state: STATUS.ENDED, reason: 'object_lost' },
    { type: 'gone', sessionId: SID },
    { type: 'stop' },
    { type: 'start' },
  ]) {
    assert.equal(reduce(tracking, event).objects.length, 0, `${event.type} left objects behind`);
  }
});

test('objects survive a lost state, because lost is recoverable', () => {
  // An object behind a pillar is still being tracked (contract §7) — dropping
  // it here would make re-acquisition impossible.
  const tracking = reduce(started(), { type: 'object_added', objId: 'obj-a1' });
  const lost = reduce(tracking, { type: 'server_state', sessionId: SID, state: STATUS.LOST });
  assert.equal(lost.status, STATUS.LOST);
  assert.equal(lost.objects.length, 1);
});

test('object_removed drops exactly one, by identity when absent', () => {
  const s = reduce(started(), { type: 'object_added', objId: 'obj-a1' });
  assert.equal(reduce(s, { type: 'object_removed', objId: 'obj-a1' }).objects.length, 0);
  assert.equal(reduce(s, { type: 'object_removed', objId: 'nope' }), s, 'no-op must not re-render');
  assert.equal(reduce(s, { type: 'object_removed' }), s);
});

test('error_dismissed clears the message without touching anything else', () => {
  const s = reduce(started(), { type: 'prompt_failed', code: 'mask_too_small', xNorm: 0.3, yNorm: 0.7 });
  const cleared = reduce(s, { type: 'error_dismissed' });
  assert.equal(cleared.lastError, null);
  assert.equal(cleared.status, s.status);
  assert.equal(cleared.session, s.session);
  assert.equal(reduce(cleared, { type: 'error_dismissed' }), cleared, 'idempotent, by identity');
});

test('non-finite prompt numbers are stored as null, not NaN', () => {
  const s = reduce(started(), {
    type: 'object_added', objId: 'obj-a1',
    resolvedSeq: NaN, resolvedOffset: undefined, xNorm: Infinity, yNorm: 'x',
  });
  const o = s.objects[0];
  // NaN serialises to null in JSON and silently becomes a missing coordinate;
  // storing null up front makes the absence explicit to the view.
  assert.equal(o.resolvedSeq, null);
  assert.equal(o.resolvedOffset, null);
  assert.equal(o.xNorm, null);
  assert.equal(o.yNorm, null);
});
