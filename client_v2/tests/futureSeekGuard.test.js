import test from 'node:test';
import assert from 'node:assert/strict';
import { isFutureSeek } from '../src/components/Playback/playbackTimeGuard.js';

test('isFutureSeek permits seeking into earlier times of the day', () => {
  const dayStart = new Date('2026-09-10T00:00:00.000Z').getTime();
  const now = new Date('2026-09-10T15:30:00.000Z').getTime();

  // 10:00 AM (10 * 3600 * 1000 = 36,000,000 ms)
  const offsetMs = 10 * 3600 * 1000;
  assert.equal(isFutureSeek(dayStart, offsetMs, now), false);
});

test('isFutureSeek flags seeking past current wall-clock time as future seek', () => {
  const dayStart = new Date('2026-09-10T00:00:00.000Z').getTime();
  const now = new Date('2026-09-10T15:30:00.000Z').getTime();

  // 18:00 (18 * 3600 * 1000 = 64,800,000 ms)
  const futureOffsetMs = 18 * 3600 * 1000;
  assert.equal(isFutureSeek(dayStart, futureOffsetMs, now), true);
});

test('isFutureSeek permits all hours for a past day', () => {
  const pastDayStart = new Date('2026-09-09T00:00:00.000Z').getTime();
  const now = new Date('2026-09-10T15:30:00.000Z').getTime();

  // 23:59:59 on yesterday
  const lateMs = 23 * 3600 * 1000 + 59 * 60 * 1000;
  assert.equal(isFutureSeek(pastDayStart, lateMs, now), false);
});

test('isFutureSeek flags all hours for a future date', () => {
  const tomorrowDayStart = new Date('2026-09-11T00:00:00.000Z').getTime();
  const now = new Date('2026-09-10T15:30:00.000Z').getTime();

  // 00:00:00 on tomorrow
  assert.equal(isFutureSeek(tomorrowDayStart, 0, now), true);
  // 12:00:00 on tomorrow
  assert.equal(isFutureSeek(tomorrowDayStart, 12 * 3600 * 1000, now), true);
});

test('isFutureSeek handles Date objects for dayStart parameter', () => {
  const dayStartDate = new Date('2026-09-10T00:00:00.000Z');
  const now = new Date('2026-09-10T12:00:00.000Z').getTime();

  assert.equal(isFutureSeek(dayStartDate, 10 * 3600 * 1000, now), false);
  assert.equal(isFutureSeek(dayStartDate, 14 * 3600 * 1000, now), true);
});
