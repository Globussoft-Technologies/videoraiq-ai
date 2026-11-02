import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/xray/buttonState.js', import.meta.url), 'utf8');

const module = new SourceTextModule(source);
await module.link(() => { throw new Error('buttonState.js must stay dependency-free'); });
await module.evaluate();
const { MODE, COPY, deriveButtonState } = module.namespace;

/** A camera that is live, decoding, and has reported its native size. */
const live = {
  phase: MODE.IDLE,
  notLicensed: false,
  hasStreamUrl: true,
  videoState: 'ready',
  isSnapshot: false,
  videoWidth: 1920,
};

test('a live, decoding camera offers an enabled pill that explains itself', () => {
  const v = deriveButtonState(live);
  assert.equal(v.mode, MODE.IDLE);
  assert.equal(v.disabled, false);
  assert.equal(v.pressed, false);
  assert.equal(v.label, 'X-Ray');
  assert.equal(v.tooltip, COPY.idleTooltip);
  assert.match(v.tooltip, /click any object/i, 'the tooltip must say what X-ray does');
});

test('no arguments at all fails closed', () => {
  // The default must never be "enabled". A missing prop is a bug, and a bug
  // should not hand the user a button that cannot work.
  const v = deriveButtonState();
  assert.equal(v.mode, MODE.DISABLED);
  assert.equal(v.disabled, true);
});

test('each unavailable cause gets its own sentence', () => {
  const cases = [
    [{ ...live, isSnapshot: true }, COPY.snapshotOnly],
    [{ ...live, hasStreamUrl: false }, COPY.noStream],
    [{ ...live, videoState: 'error' }, COPY.streamUnavailable],
    [{ ...live, videoState: 'loading' }, COPY.streamStarting],
    [{ ...live, videoState: 'idle' }, COPY.streamStarting],
    [{ ...live, videoWidth: 0 }, COPY.streamStarting],
    [{ ...live, notLicensed: true }, COPY.notLicensed],
  ];
  const seen = new Set();
  for (const [facts, expected] of cases) {
    const v = deriveButtonState(facts);
    assert.equal(v.mode, MODE.DISABLED, `expected disabled for ${JSON.stringify(facts)}`);
    assert.equal(v.disabled, true);
    assert.equal(v.tooltip, expected);
    assert.notEqual(v.tooltip, COPY.idleTooltip, 'a disabled pill must not claim to be usable');
    assert.ok(v.tooltip.length > 10, 'the reason must be a sentence, not a shrug');
    seen.add(v.tooltip);
  }
  // snapshot / no-stream / unavailable / starting / not-licensed = 5 distinct
  // reasons across 7 inputs (three stream states share one honest sentence).
  assert.equal(seen.size, 5);
});

test('a camera with no native size yet is not clickable', () => {
  // videoWidth is 0 until loadedmetadata, and it is the denominator for the
  // normalised click coordinates contract §5 requires. Enabled-but-unexpressible
  // is the one failure the user could not understand, so it must not happen.
  assert.equal(deriveButtonState({ ...live, videoWidth: 0 }).disabled, true);
  assert.equal(deriveButtonState({ ...live, videoWidth: 1 }).disabled, false);
});

test('licensing outranks every other fact, including an open session', () => {
  for (const phase of [MODE.IDLE, MODE.STARTING, MODE.ACTIVE]) {
    const v = deriveButtonState({ ...live, phase, notLicensed: true });
    assert.equal(v.tooltip, COPY.notLicensed, `not_licensed must win over phase=${phase}`);
    assert.equal(v.disabled, true);
  }
});

test('starting is visible and un-pressable', () => {
  const v = deriveButtonState({ ...live, phase: MODE.STARTING });
  assert.equal(v.mode, MODE.STARTING);
  assert.equal(v.label, COPY.startingLabel);
  assert.equal(v.disabled, true, 'a second press mid-start would open a second session');
  assert.equal(v.pressed, false);
});

test('active is pressable, because that is how the user turns it off', () => {
  const v = deriveButtonState({ ...live, phase: MODE.ACTIVE });
  assert.equal(v.mode, MODE.ACTIVE);
  assert.equal(v.label, COPY.activeLabel);
  assert.equal(v.disabled, false);
  assert.equal(v.pressed, true);
  assert.match(v.tooltip, /Esc/, 'the active tooltip promises Esc, so Esc must be implemented');
});

test('a stream that dies mid-session does not strand the user', () => {
  // The regression this guards: disabling the pill whenever the stream looks
  // unhealthy. Mid-session that is wrong twice over — the session machine
  // reports it as ended/stream_stalled (contract §7), and a disabled control
  // would leave the user no way to close what they started.
  for (const broken of [{ videoState: 'error' }, { videoState: 'loading' },
                        { hasStreamUrl: false }, { isSnapshot: true }, { videoWidth: 0 }]) {
    const v = deriveButtonState({ ...live, phase: MODE.ACTIVE, ...broken });
    assert.equal(v.mode, MODE.ACTIVE, `still active with ${JSON.stringify(broken)}`);
    assert.equal(v.disabled, false, 'the user must always be able to turn X-ray off');
  }
});

test('the pressed flag only ever means "X-ray is on"', () => {
  // aria-pressed is what a screen reader announces, so it must track the real
  // mode and nothing else.
  for (const phase of [MODE.IDLE, MODE.STARTING]) {
    assert.equal(deriveButtonState({ ...live, phase }).pressed, false);
  }
  assert.equal(deriveButtonState({ ...live, phase: MODE.ACTIVE }).pressed, true);
  assert.equal(deriveButtonState({ ...live, notLicensed: true }).pressed, false);
});

test('every mode returns a label and a tooltip', () => {
  const inputs = [
    live,
    { ...live, phase: MODE.STARTING },
    { ...live, phase: MODE.ACTIVE },
    { ...live, isSnapshot: true },
    { ...live, notLicensed: true },
  ];
  for (const facts of inputs) {
    const v = deriveButtonState(facts);
    assert.ok(v.label && v.label.trim(), `empty label for ${JSON.stringify(facts)}`);
    assert.ok(v.tooltip && v.tooltip.trim(), `empty tooltip for ${JSON.stringify(facts)}`);
    assert.ok(Object.values(MODE).includes(v.mode));
  }
});

test('the feature is called X-Ray everywhere the user can read', () => {
  // Contract §14 fixes one name across all three sessions. Guarded here because
  // copy drift is invisible until a customer reads it.
  for (const [key, text] of Object.entries(COPY)) {
    if (!/x-?ray/i.test(text)) continue;
    assert.match(text, /X-Ray|X-ray/, `COPY.${key} must spell the feature "X-Ray"`);
    assert.doesNotMatch(text, /annotator|SAM3|vision mode/i, `COPY.${key} invents a second name`);
  }
  assert.equal(COPY.idleLabel, 'X-Ray');
  assert.equal(COPY.activeLabel, 'X-Ray on');
});

test('every start-failure code the backend can send has its own sentence', async () => {
  const mod = new SourceTextModule(source);
  await mod.link(() => { throw new Error('dependency-free'); });
  await mod.evaluate();
  const { START_ERROR_COPY, startErrorMessage } = mod.namespace;

  // camera_not_found arrives as a 404 and would otherwise fall through to
  // "X-Ray stopped unexpectedly", which tells the user nothing about the actual
  // problem — that the camera is not theirs.
  for (const code of ['stream_not_ready', 'max_sessions_reached', 'not_licensed',
                      'camera_not_found', 'internal_error']) {
    assert.ok(START_ERROR_COPY[code], `no message for ${code}`);
    assert.equal(startErrorMessage(code), START_ERROR_COPY[code]);
  }
  assert.match(START_ERROR_COPY.camera_not_found, /camera/i);
  assert.notEqual(START_ERROR_COPY.camera_not_found, START_ERROR_COPY.internal_error);

  // An unknown code still gets a sentence rather than undefined.
  assert.equal(startErrorMessage('something_new'), START_ERROR_COPY.internal_error);
});
