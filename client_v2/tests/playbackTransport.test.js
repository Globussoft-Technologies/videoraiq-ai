import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackTransport } from '../src/components/Playback/playbackTransport.js';

class Video extends EventTarget {
  paused = true;
  ended = false;
  readyState = 0;
  currentTime = 123;
  currentSrc = 'blob:recording';
  playbackRate = 1;
  playCalls = 0;
  error = null;

  play() {
    this.playCalls += 1;
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  ready() {
    this.readyState = 4;
    this.dispatchEvent(new Event('loadeddata'));
    this.dispatchEvent(new Event('canplay'));
  }
}

const settled = () => new Promise((resolve) => setImmediate(resolve));
const recovered = () => new Promise((resolve) => setTimeout(resolve, 20));

function setup() {
  const video = new Video();
  const state = { playing: false, buffering: false, ready: false, error: null };
  const transport = createPlaybackTransport(video, {
    onPlaying: (value) => { state.playing = value; },
    onBuffering: (value) => { state.buffering = value; },
    onReady: () => { state.ready = true; },
    onError: (error) => { state.error = error || true; },
  });
  return { video, state, transport };
}

test('fullscreen reconciliation resumes an interrupted video without changing source, position or speed', async () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  transport.setRate(4);
  video.ready();
  await settled();

  for (let transition = 0; transition < 4; transition += 1) {
    video.pause();
    assert.equal(state.playing, false);
    transport.resume();
    await settled();
    assert.equal(video.paused, false);
    assert.equal(state.playing, true);
    assert.equal(video.currentTime, 123);
    assert.equal(video.currentSrc, 'blob:recording');
    assert.equal(video.playbackRate, 4);
  }
  transport.destroy();
});

test('intentional pause survives fullscreen reconciliation and later readiness events', async () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  transport.pause();
  transport.resume();
  video.ready();
  assert.equal(video.playCalls, 1);
  assert.equal(video.paused, true);
  assert.equal(state.playing, false);
  assert.equal(transport.wantsPlayback, false);
  transport.destroy();
});

test('a pause arriving after the fullscreen check still recovers', async () => {
  const { video, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  transport.resume();
  video.pause();
  await recovered();
  assert.equal(video.paused, false);
  assert.equal(video.playCalls, 2);
  transport.destroy();
});

test('explicit Pause cancels an already scheduled fullscreen recovery', async () => {
  const { video, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  video.pause();
  transport.pause();
  await recovered();
  assert.equal(video.paused, true);
  assert.equal(video.playCalls, 1);
  transport.destroy();
});

test('source recovery resumes without needing a change to React playing state', async () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  transport.setRate(4);

  transport.prepare();
  video.readyState = 0;
  video.playbackRate = 1;
  transport.attach();
  transport.resume();
  assert.equal(video.playCalls, 1);
  assert.equal(state.buffering, true);
  video.ready();
  assert.equal(video.playCalls, 2);
  assert.equal(state.playing, true);
  assert.equal(state.buffering, false);
  assert.equal(video.playbackRate, 4);
  transport.destroy();
});

test('source recovery does not resume after the user pauses', async () => {
  const { video, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  transport.prepare();
  transport.pause();
  video.readyState = 0;
  transport.attach();
  video.ready();
  transport.resume();
  assert.equal(video.playCalls, 1);
  assert.equal(video.paused, true);
  transport.destroy();
});

test('buffering reports actual state without discarding play intent', async () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  video.dispatchEvent(new Event('waiting'));
  assert.equal(state.playing, false);
  assert.equal(state.buffering, true);
  assert.equal(transport.wantsPlayback, true);
  video.dispatchEvent(new Event('playing'));
  assert.equal(state.playing, true);
  assert.equal(state.buffering, false);
  transport.destroy();
});

test('an old rejected play promise cannot stop a replacement source', async () => {
  const { video, state, transport } = setup();
  let rejectOldPlay;
  video.play = () => new Promise((resolve, reject) => { rejectOldPlay = reject; });
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();

  transport.prepare({ autoplay: true });
  video.play = Video.prototype.play;
  transport.attach();
  video.ready();
  rejectOldPlay(new Error('Old source failed'));
  await settled();
  assert.equal(state.error, null);
  assert.equal(state.playing, true);
  assert.equal(transport.wantsPlayback, true);
  transport.destroy();
});

test('a network stall does not show buffering while buffered video can still play', async () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  video.dispatchEvent(new Event('stalled'));
  assert.equal(state.playing, true);
  assert.equal(state.buffering, false);
  video.readyState = 2;
  video.dispatchEvent(new Event('stalled'));
  assert.equal(state.buffering, true);
  transport.destroy();
});

test('an interrupted play request preserves intent for a later canplay event', async () => {
  const { video, state, transport } = setup();
  video.play = () => Promise.reject(Object.assign(new Error('Interrupted'), { name: 'AbortError' }));
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await settled();
  assert.equal(state.error, null);
  assert.equal(transport.wantsPlayback, true);
  video.play = Video.prototype.play;
  video.ready();
  assert.equal(state.playing, true);
  transport.destroy();
});

test('an interrupted pending play recovers without another readiness event', async () => {
  const { video, state, transport } = setup();
  let rejectPlay;
  video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  transport.resume();
  video.play = Video.prototype.play;
  rejectPlay(Object.assign(new Error('Fullscreen interruption'), { name: 'AbortError' }));
  await recovered();
  assert.equal(video.paused, false);
  assert.equal(state.playing, true);
  assert.equal(state.error, null);
  transport.destroy();
});

test('repeated interrupted play requests have a bounded retry count', async () => {
  const { video, transport } = setup();
  video.play = () => {
    video.playCalls += 1;
    return Promise.reject(Object.assign(new Error('Interrupted'), { name: 'AbortError' }));
  };
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  await recovered();
  assert.equal(video.playCalls, 3);
  transport.destroy();
});

test('terminal playback errors stop buffering and cannot be resumed by fullscreen', () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.fail(new Error('Recording unavailable'));
  video.ready();
  transport.resume();
  assert.equal(state.playing, false);
  assert.equal(state.buffering, false);
  assert.equal(state.error.message, 'Recording unavailable');
  assert.equal(video.playCalls, 0);
  transport.destroy();
});

test('ended recordings stay stopped through fullscreen', () => {
  const { video, state, transport } = setup();
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ended = true;
  video.dispatchEvent(new Event('ended'));
  transport.resume();
  assert.equal(state.playing, false);
  assert.equal(state.buffering, false);
  assert.equal(transport.wantsPlayback, false);
  assert.equal(video.playCalls, 0);
  transport.destroy();
});

test('disposal ignores pending play failures and removes media listeners', async () => {
  const { video, state, transport } = setup();
  let rejectPlay;
  video.play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  transport.prepare({ autoplay: true });
  transport.attach();
  video.ready();
  transport.destroy();
  const before = { ...state };
  video.dispatchEvent(new Event('playing'));
  video.dispatchEvent(new Event('waiting'));
  rejectPlay(new Error('Detached source'));
  await settled();
  assert.deepEqual(state, before);
});
