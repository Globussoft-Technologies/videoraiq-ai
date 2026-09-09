import assert from 'node:assert/strict';
import test from 'node:test';
import { bufferedForwardTarget, createPlaylistClock, fragmentClockOffset, frameRecordingTime, observePlaybackClock, rememberFragmentClock } from '../src/components/Playback/playbackClock.js';

class Video extends EventTarget {
  paused = false;
  seeking = false;
  readyState = 4;
  currentTime = 0;
  duration = Infinity;
  buffered = { length: 0 };

  setBuffered(ranges) {
    this.buffered = {
      length: ranges.length,
      start: (index) => ranges[index][0],
      end: (index) => ranges[index][1],
    };
  }
}

class FrameVideo extends Video {
  nextId = 0;
  callbacks = new Map();
  requestVideoFrameCallback(callback) {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }
  cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
  present(mediaTime) {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(0, { mediaTime }));
  }
}

test('clock follows the displayed frame instead of a media clock that has run ahead', () => {
  const video = new FrameVideo();
  const times = [];
  const stop = observePlaybackClock(video, { canAdvance: () => true, onTime: (time) => times.push(time) });
  video.currentTime = 54;
  video.present(9);
  video.currentTime = 55;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [9]);
  video.present(10);
  assert.deepEqual(times, [9, 10]);
  stop();
});

test('pause, buffering and seeking freeze the clock until playback actually resumes', () => {
  const video = new FrameVideo();
  const times = [];
  let buffering = false;
  let playing = true;
  const stop = observePlaybackClock(video, {
    canAdvance: () => playing && !buffering,
    onTime: (time) => times.push(time),
  });
  video.present(9);
  buffering = true;
  video.present(10);
  buffering = false;
  playing = false;
  video.present(11);
  playing = true;
  video.paused = true;
  video.present(12);
  video.paused = false;
  video.seeking = true;
  video.present(13);
  video.seeking = false;
  video.readyState = 1;
  video.present(14);
  assert.deepEqual(times, [9]);
  video.readyState = 4;
  video.present(15);
  assert.deepEqual(times, [9, 15]);
  stop();
});

test('time-offset changes cannot advance the display without a presented frame', () => {
  const video = new FrameVideo();
  const times = [];
  let offset = 0;
  const stop = observePlaybackClock(video, { canAdvance: () => true, onTime: (time) => times.push(offset + time) });
  video.present(9);
  offset = 45;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [9]);
  video.present(10);
  assert.deepEqual(times, [9, 55]);
  stop();
});

test('fallback timeupdate clock also respects paused and buffering states', () => {
  const video = new Video();
  const times = [];
  let advancing = true;
  const stop = observePlaybackClock(video, { canAdvance: () => advancing, onTime: (time) => times.push(time) });
  video.currentTime = 9;
  video.dispatchEvent(new Event('timeupdate'));
  advancing = false;
  video.currentTime = 10;
  video.dispatchEvent(new Event('timeupdate'));
  advancing = true;
  video.paused = true;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [9]);
  video.paused = false;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [9, 10]);
  stop();
  video.currentTime = 20;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [9, 10]);
});

test('source replacement cancels queued frame callbacks and ignores stale delivery', () => {
  const video = new FrameVideo();
  const times = [];
  const stop = observePlaybackClock(video, { canAdvance: () => true, onTime: (time) => times.push(time) });
  const callback = [...video.callbacks.values()][0];
  stop();
  assert.equal(video.callbacks.size, 0);
  callback(0, { mediaTime: 99 });
  assert.deepEqual(times, []);
  assert.equal(video.callbacks.size, 0);
});

test('non-zero media timestamps map to recording time without clamping a negative offset', () => {
  const offset = fragmentClockOffset({ programDateTime: new Date('2026-09-09T00:00:00').getTime(), start: 45 });
  assert.equal(offset, -45000);
  assert.equal(offset + 54 * 1000, 9000);
});

test('fragment mapping includes fractional seconds and rejects missing or invalid metadata', () => {
  const offset = fragmentClockOffset({ programDateTime: new Date('2026-09-09T14:00:00.500').getTime(), start: 10.25 });
  assert.equal(offset + 11.25 * 1000, 14 * 60 * 60 * 1000 + 1500);
  assert.equal(fragmentClockOffset({ start: 0 }), null);
  assert.equal(fragmentClockOffset({ start: 0, programDateTime: 'invalid' }), null);
  assert.equal(fragmentClockOffset({ programDateTime: Date.now(), start: NaN }), null);
});

test('fast-forward stays inside the currently buffered recording range', () => {
  const video = new Video();
  video.currentTime = 9;
  video.setBuffered([[0, 11], [20, 30]]);
  assert.equal(bufferedForwardTarget(video, 6), 10.95);
  video.currentTime = 15;
  assert.equal(bufferedForwardTarget(video, 6), 15);
  video.currentTime = 22;
  assert.equal(bufferedForwardTarget(video, 6), 28);
});

test('fast-forward cannot move while paused, seeking or short of buffered data', () => {
  const video = new Video();
  video.currentTime = 9;
  video.setBuffered([[0, 30]]);
  video.paused = true;
  assert.equal(bufferedForwardTarget(video, 6), 9);
  video.paused = false;
  video.seeking = true;
  assert.equal(bufferedForwardTarget(video, 6), 9);
  video.seeking = false;
  video.readyState = 2;
  assert.equal(bufferedForwardTarget(video, 6), 9);
  video.readyState = 4;
  video.duration = 12;
  assert.equal(bufferedForwardTarget(video, 6), 12);
});

test('a delayed displayed frame keeps its own recording offset across a fragment discontinuity', () => {
  let anchors = rememberFragmentClock([], { start: 0, duration: 10 }, 0);
  anchors = rememberFragmentClock(anchors, { start: 10, duration: 10 }, 90000);
  assert.equal(frameRecordingTime(5, anchors, 90000), 5000);
  assert.equal(frameRecordingTime(12, anchors, 90000), 102000);
});

test('an unmatched frame cannot borrow the offset of the newest fragment', () => {
  const anchors = rememberFragmentClock([], { start: 10, duration: 10 }, 90000);
  assert.equal(frameRecordingTime(5, anchors, 90000), null);
  assert.equal(frameRecordingTime(25, anchors, 90000), null);
});

test('fractional fragment boundaries use the new fragment at its exact start', () => {
  let anchors = rememberFragmentClock([], { start: 1.25, duration: 0.5 }, 10000);
  anchors = rememberFragmentClock(anchors, { start: 1.75, duration: 0.5 }, 20000);
  assert.equal(frameRecordingTime(1.749, anchors, 20000), 11749);
  assert.equal(frameRecordingTime(1.75, anchors, 20000), 21750);
  assert.equal(frameRecordingTime(2.25, anchors, 20000), null);
});

test('native playback with no fragment anchors uses the requested recording offset', () => {
  assert.equal(frameRecordingTime(5.25, [], 30000), 35250);
  assert.equal(frameRecordingTime(45.5, [], -45000), 500);
});

test('invalid fragment metadata cannot replace a valid clock anchor', () => {
  const anchors = rememberFragmentClock([], { start: 0, duration: 10 }, 0);
  for (const fragment of [null, {}, { start: NaN, duration: 10 }, { start: 10, duration: 0 }, { start: 10, duration: -1 }, { start: 10, duration: Infinity }]) {
    assert.deepEqual(rememberFragmentClock(anchors, fragment, 10000), anchors);
  }
  assert.deepEqual(rememberFragmentClock(anchors, { start: 10, duration: 10 }, NaN), anchors);
});

test('a retry at the same media start replaces its stale fragment anchor', () => {
  let anchors = rememberFragmentClock([], { start: 10, duration: 10 }, 0);
  anchors = rememberFragmentClock(anchors, { start: 10, duration: 12 }, 90000);
  assert.equal(anchors.length, 1);
  assert.equal(frameRecordingTime(15, anchors, 0), 105000);
  assert.equal(frameRecordingTime(21, anchors, 0), 111000);
});

test('fragment history stays bounded and drops the oldest recording mappings', () => {
  let anchors = [];
  for (let index = 0; index < 65; index += 1) {
    anchors = rememberFragmentClock(anchors, { start: index * 10, duration: 10 }, index * 1000);
  }
  assert.equal(anchors.length, 64);
  assert.equal(anchors[0].start, 10);
  assert.equal(anchors.at(-1).start, 640);
  assert.equal(frameRecordingTime(5, anchors, 64000), null);
  assert.equal(frameRecordingTime(645, anchors, 0), 709000);
});

const requestedTime = (6 * 60 * 60 + 8 * 60 + 47) * 1000;
const playlist = (first, count, start = 0) => ({
  fragments: Array.from({ length: count }, (_, index) => ({ sn: first + index, cc: 0, level: 0, start: start + index * 6, duration: 6 })),
});

test('starting at a later segment preserves the 66 seconds preceding the displayed frame', () => {
  const clock = createPlaylistClock(requestedTime);
  const details = playlist(0, 12);
  clock.remember(details);
  const fragment = details.fragments[11];
  const anchors = rememberFragmentClock([], fragment, clock.offset(fragment));
  assert.equal(frameRecordingTime(66, anchors, requestedTime), (6 * 60 * 60 + 9 * 60 + 53) * 1000);
});

test('media timestamp adjustment removes only the PTS shift, not earlier recording segments', () => {
  const clock = createPlaylistClock(requestedTime);
  clock.remember(playlist(0, 12));
  const fragment = { sn: 11, start: 111, duration: 6 };
  const offset = clock.offset(fragment);
  assert.equal(offset, requestedTime - 45000);
  assert.equal(offset + 111 * 1000, requestedTime + 66000);
});

test('retrying a rolling playlist retains recording time when its media timeline restarts at zero', () => {
  const clock = createPlaylistClock(requestedTime);
  clock.remember(playlist(0, 12));
  const retry = playlist(11, 12);
  clock.remember(retry);
  assert.equal(clock.offset(retry.fragments[0]), requestedTime + 66000);
  assert.equal(clock.offset(retry.fragments[11]) + 66 * 1000, requestedTime + 132000);
});

test('a new seek starts its own recording clock instead of retaining the previous source mappings', () => {
  const previous = createPlaylistClock(requestedTime);
  previous.remember(playlist(0, 12));
  const next = createPlaylistClock(12 * 60 * 60 * 1000);
  const details = playlist(0, 2);
  next.remember(details);
  assert.equal(next.offset(details.fragments[0]), 12 * 60 * 60 * 1000);
  assert.equal(previous.offset(details.fragments[0]), requestedTime);
});

test('recording metadata takes precedence over the requested time across discontinuities', () => {
  const clock = createPlaylistClock(requestedTime);
  const fragment = { sn: 0, start: 1.5, duration: 6, programDateTime: new Date('2026-09-09T06:09:53').getTime() };
  clock.remember({ fragments: [fragment] });
  assert.equal(clock.offset(fragment) + 1.5 * 1000, requestedTime + 66000);
  const updated = { ...fragment, start: 2.5, programDateTime: new Date('2026-09-09T06:10:00').getTime() };
  assert.equal(clock.offset(updated) + 2.5 * 1000, (6 * 60 * 60 + 10 * 60) * 1000);
});

test('consecutive windows preserve elapsed durations and unknown gaps are not guessed', () => {
  const clock = createPlaylistClock(requestedTime);
  clock.remember(playlist(0, 2));
  const next = playlist(2, 2);
  clock.remember(next);
  assert.equal(clock.offset(next.fragments[0]), requestedTime + 12000);
  const gap = playlist(10, 2);
  clock.remember(gap);
  assert.equal(clock.offset(gap.fragments[0]), null);
});

test('a long recording playlist retains the segment currently being displayed', () => {
  const clock = createPlaylistClock(requestedTime);
  const details = playlist(0, 1200);
  clock.remember(details);
  assert.equal(clock.offset(details.fragments[0]), requestedTime);
  assert.equal(clock.offset(details.fragments[1199]), requestedTime);
});

test('presented frames resume the clock without waiting for a stale buffering UI flag', () => {
  const video = new FrameVideo();
  const times = [];
  let wantsPlayback = true;
  const stop = observePlaybackClock(video, { canAdvance: () => wantsPlayback, onTime: (time) => times.push(time) });
  video.present(1);
  video.dispatchEvent(new Event('waiting'));
  video.currentTime = 60;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [1]);
  // No new "playing" event: a displayed frame is sufficient evidence of progress.
  video.present(2);
  assert.deepEqual(times, [1, 2]);
  wantsPlayback = false;
  video.present(3);
  assert.deepEqual(times, [1, 2]);
  stop();
});

test('the timeupdate fallback freezes when only the current frame is buffered', () => {
  const video = new Video();
  const times = [];
  const stop = observePlaybackClock(video, { canAdvance: () => true, onTime: (time) => times.push(time) });
  video.readyState = 2;
  video.currentTime = 10;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, []);
  video.readyState = 3;
  video.dispatchEvent(new Event('timeupdate'));
  assert.deepEqual(times, [10]);
  stop();
});
