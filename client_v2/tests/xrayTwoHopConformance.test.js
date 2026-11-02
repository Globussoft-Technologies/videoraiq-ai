import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

/**
 * The only test in this suite that crosses a session boundary.
 *
 * Every other frontend test uses payloads **I** invented, which means they prove
 * my code is self-consistent and nothing about whether it agrees with the two
 * implementations it has to interoperate with. A stub you wrote yourself is the
 * one kind of test that can be confidently, uniformly wrong — and it already was
 * once here: my stub answered `403` for a camera outside the tenant, so it
 * actively hid that `isGone()` collapsed every 404 into "session expired".
 *
 * So this walks a real payload across both hops using **both other sessions'
 * real code**, and no infrastructure at all:
 *
 *   service payload (captured live by S, snake_case per §9)
 *     -> server/core/v2/xray/xray.translate.js   (B's actual translator)
 *       -> this frontend's mask parsing          (polygon.js + maskBuffer.js)
 *
 * The full chain needs a local mongod and a config file B keeps outside the
 * repo; this needs neither, and catches the class of defect that actually
 * matters between three codebases: a key that does not line up.
 */

const serverRoot = new URL('../../server/core/v2/xray/', import.meta.url);

/** B's translator, loaded from the merged tree. */
async function loadTranslator() {
  const source = await readFile(new URL('xray.translate.js', serverRoot), 'utf8');
  const module = new SourceTextModule(source);
  await module.link(() => { throw new Error('xray.translate.js gained a dependency'); });
  await module.evaluate();
  return module.namespace;
}

async function loadMine(name, link) {
  const source = await readFile(new URL(`../src/xray/${name}`, import.meta.url), 'utf8');
  const module = new SourceTextModule(source);
  await module.link(link ?? (() => { throw new Error(`${name} must stay dependency-free`); }));
  await module.evaluate();
  return module.namespace;
}

const translate = await loadTranslator();
const poly = await loadMine('polygon.js');
const buffer = await loadMine('maskBuffer.js');

/**
 * Captured from a live object by the service session, verbatim. snake_case here
 * is CORRECT and deliberate — contract §9 puts the translation in Node's lane,
 * not the service's.
 */
const SERVICE_MASK = {
  type: 'mask',
  session_id: 'abc123',
  seq: 253,
  offset: 0.6,
  emitted_at: 1793371901.8091,
  objects: [{
    obj_id: 'obj-fce4ad61',
    bbox: [100.0, 50.0, 80.0, 160.0],
    polygon: [[[100.0, 50.0], [180.0, 50.0], [180.0, 210.0]]],
  }],
};

const SERVICE_STATES = [
  { type: 'state', session_id: 'abc123', state: 'lost', reason: null, frames_behind_live: 0 },
  { type: 'state', session_id: 'abc123', state: 'ended', reason: 'object_lost', frames_behind_live: 0 },
];

test('no key reaching the browser contains an underscore', () => {
  // The symptom of a missed translation is NOT an error. My reducer ignores any
  // event whose sessionId is absent and any state outside §7's five values, so
  // a snake_case leak presents as "nothing happens" — no console output, no
  // failed request, nothing to grep for. This is the assertion that makes that
  // class of bug loud.
  const walk = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!value || typeof value !== 'object') return undefined;
    for (const [key, inner] of Object.entries(value)) {
      assert.doesNotMatch(key, /_/, `snake_case key "${key}" survived at ${path}`);
      walk(inner, `${path}.${key}`);
    }
    return undefined;
  };
  walk(translate.maskFromService(SERVICE_MASK));
  for (const state of SERVICE_STATES) walk(translate.stateFromService(state));
});

test('the mask arrives with exactly the field names my code reads', () => {
  const mask = translate.maskFromService(SERVICE_MASK);
  assert.equal(mask.sessionId, 'abc123');
  assert.equal(mask.seq, 253);
  assert.equal(mask.offset, 0.6);
  assert.equal(mask.emittedAt, 1793371901.8091);
  assert.equal(mask.objects.length, 1);
  assert.equal(mask.objects[0].objId, 'obj-fce4ad61');
});

test('polygon survives as a list of RINGS, not a flattened point list', () => {
  // The shape assumption my overlay rests on: §8 says `polygon` is a list of
  // rings with ring 0 the outer boundary, so I read `polygon[0]`. If the
  // translation flattened one level, `polygon[0]` would be a single POINT and
  // every mask would silently fail `isRing` and draw nothing.
  const object = translate.maskFromService(SERVICE_MASK).objects[0];
  assert.ok(Array.isArray(object.polygon), 'polygon must be an array');
  const outer = object.polygon[0];
  assert.ok(Array.isArray(outer), 'polygon[0] must be a ring, not a point');
  assert.ok(Array.isArray(outer[0]), 'polygon[0][0] must be a point [x, y]');
  assert.equal(outer.length, 3);
  assert.equal(poly.isRing(outer), true, 'my own validator must accept it');
});

test('bbox stays [x, y, w, h] in source pixels', () => {
  const object = translate.maskFromService(SERVICE_MASK).objects[0];
  assert.deepEqual(object.bbox, [100, 50, 80, 160]);
});

test('no score and no rle reach the browser', () => {
  // Both deliberate. There is no honest confidence for a click-seeded track
  // (SAM3 reports a constant), which is why the popover explains the absence of
  // a slider instead of shipping one that does nothing; and RLE only ever exists
  // in the harvest record.
  const object = translate.maskFromService(SERVICE_MASK).objects[0];
  assert.equal('score' in object, false);
  assert.equal('rle' in object, false);
});

test("the translated mask feeds my pipeline and produces a drawable ring", () => {
  // End to end, using only real code on both sides.
  const mask = translate.maskFromService(SERVICE_MASK);
  const ring = poly.prepareRing(mask.objects[0].polygon[0], null, poly.RING_VERTICES);
  assert.ok(ring, 'the real payload must yield a ring');
  assert.equal(ring.length, poly.RING_VERTICES);

  let masks = buffer.insertMask([], {
    seq: mask.seq, offset: mask.offset, objects: [{ objId: mask.objects[0].objId, ring }],
  });
  // The segment this mask names, as a live playlist would carry it.
  const fragments = [{ sn: 253, start: 506, duration: 2 }];
  const picked = buffer.maskAt(masks, fragments, 506.6);
  assert.ok(picked, 'the mask must be placeable on the media timeline');
  assert.equal(buffer.objectsById(picked.from).get('obj-fce4ad61').ring.length,
    poly.RING_VERTICES);
});

test('both state payloads translate into §7 vocabulary my reducer accepts', () => {
  const [lost, ended] = SERVICE_STATES.map(translate.stateFromService);

  assert.equal(lost.sessionId, 'abc123');
  assert.equal(lost.state, 'lost');
  assert.equal(lost.framesBehindLive, 0, '0 is a real value, not a missing one');

  assert.equal(ended.state, 'ended');
  // The distinction B flagged: `internal_error` and `object_lost` are REASONS.
  // The state is always `ended`. My reducer validates the two against separate
  // sets, so a reason arriving in the state field would be ignored rather than
  // rendered — correct, but silent, which is why this is asserted here.
  assert.equal(ended.reason, 'object_lost');
  assert.notEqual(ended.state, 'object_lost');
});

test('every §7 ended reason survives translation unchanged', () => {
  // My copy table has one entry per reason and falls back to `internal_error`
  // for anything else. A reason mangled in transit would therefore show the
  // wrong message rather than failing.
  const reasons = ['closed_by_user', 'object_lost', 'stream_stalled', 'stream_restarted',
                   'session_expired', 'idle_timeout', 'internal_error', 'capacity_reclaimed'];
  for (const reason of reasons) {
    const out = translate.stateFromService({
      type: 'state', session_id: 'abc123', state: 'ended', reason, frames_behind_live: 3,
    });
    assert.equal(out.reason, reason, `reason "${reason}" did not survive`);
    assert.equal(out.state, 'ended');
  }
});

test('the session payload carries the six fields Phase 3 stores', () => {
  // These drive the overlay's canvas size, the interpolation rate and the
  // object cap, so a missing one is not cosmetic.
  const session = translate.sessionFromService({
    session_id: 'abc123', width: 1920, height: 1080, frame_rate: 5.0,
    lost_after_frames: 25, max_objects: 1,
  });
  assert.equal(session.sessionId, 'abc123');
  assert.equal(session.width, 1920);
  assert.equal(session.height, 1080);
  assert.equal(session.frameRate, 5);
  assert.equal(session.lostAfterFrames, 25);
  assert.equal(session.maxObjects, 1);
});

test('the prompt response carries the resolved frame back', () => {
  // Contract §5: the server resolves to the nearest buffered frame and reports
  // which one. The click layer surfaces the delta only when it differs, so both
  // fields have to arrive.
  const prompt = translate.promptFromService({
    obj_id: 'obj-a1b2c3d4', resolved_seq: 12345, resolved_offset: 1.19,
  });
  assert.equal(prompt.objId, 'obj-a1b2c3d4');
  assert.equal(prompt.resolvedSeq, 12345);
  assert.equal(prompt.resolvedOffset, 1.19);
});
