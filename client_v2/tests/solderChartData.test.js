import assert from 'node:assert/strict';
import test from 'node:test';
import moment from 'moment-timezone';
import { buildChartSeries } from '../src/pages/SolderLine/chartData.js';
import { buildSolderLine } from '../src/pages/SolderLine/solderLineData.js';

const record = (date, panels, left, right, missed = 0, channelId = 'camera1') => ({
  channelId, hour: `${date}T10`, panels, missedJoints: missed, requiredJoints: panels * 6,
  zones: [{ zone: 'worker 1', joints: left, solderSec: left * 2 }, { zone: 'worker 2', joints: right, solderSec: right * 3 }],
});
const chart = (startDate, endDate, records = [], timezone = 'UTC') => buildChartSeries({
  startDate, endDate, records, timezone, zones: ['worker 1', 'worker 2'],
  hourly: [{ h: '10', panels: 2, missedJoints: 3, ops: [{ joints: 5 }, { joints: 4 }] }],
});

test('short selections keep the hourly chart and week-long selections remain hourly', () => {
  for (const end of ['2026-10-01', '2026-10-07']) {
    const result = chart('2026-10-01', end);
    assert.equal(result.unit, 'hour');
    assert.equal(result.rows[0].label, '10');
    assert.equal(result.rows[0].tooltipLabel, '10:00-11:00');
    assert.deepEqual(result.rows[0].ops.map(zone => zone.joints), [5, 4]);
  }
});

test('full and rolling calendar months use weeks; a longer inclusive range uses months', () => {
  for (const [start, end] of [['2026-02-01', '2026-02-28'], ['2024-02-01', '2024-02-29'], ['2026-10-01', '2026-10-31'], ['2026-09-15', '2026-10-14']]) {
    assert.equal(chart(start, end).unit, 'week', `${start} to ${end}`);
  }
  assert.equal(chart('2026-10-01', '2026-10-14').unit, 'week');
  assert.equal(chart('2026-09-15', '2026-10-15').unit, 'month');
});

test('weekly totals preserve worker counts, zero weeks, and the partial final week', () => {
  const result = chart('2026-10-01', '2026-10-31', [
    record('2026-10-01', 2, 7, 4, 1), record('2026-10-07', 1, 5, 1),
    record('2026-10-08', 3, 10, 7, 1), record('2026-10-31', 1, 0, 6),
    record('2026-09-30', 99, 500, 94), record('2026-11-01', 99, 500, 94),
  ]);
  assert.deepEqual(result.rows.map(row => row.panels), [3, 3, 0, 0, 1]);
  assert.deepEqual(result.rows.map(row => row.missedJoints), [1, 1, 0, 0, 0]);
  assert.deepEqual(result.rows[0].ops.map(zone => zone.joints), [12, 5]);
  assert.equal(result.rows[0].requiredJoints, 18);
  assert.equal(result.rows[4].tooltipLabel, '29 Oct 2026-31 Oct 2026');
  assert.equal(result.rows[4].labelDetail, '29-31 Oct');
});

test('monthly totals remain separate across years and include zero-activity months', () => {
  const result = chart('2026-11-15', '2027-02-05', [
    record('2026-11-14', 99, 400, 194), record('2026-11-15', 1, 5, 1),
    record('2026-12-31', 2, 7, 4, 1), record('2027-02-05', 1, 2, 2, 2),
    record('2027-02-06', 99, 400, 194),
  ]);
  assert.deepEqual(result.rows.map(row => row.label), ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
  assert.deepEqual(result.rows.map(row => row.panels), [1, 2, 0, 1]);
  assert.equal(result.rows[0].tooltipLabel, '15 Nov 2026-30 Nov 2026');
  assert.equal(result.rows[3].tooltipLabel, '01 Feb 2027-05 Feb 2027');
  assert.equal(result.rows.reduce((sum, row) => sum + row.missedJoints, 0), 3);
});

test('local date keys group correctly across daylight-saving changes', () => {
  const result = chart('2026-10-29', '2026-11-11', [record('2026-11-04', 1, 5, 1), record('2026-11-05', 1, 4, 1, 1)], 'America/New_York');
  assert.equal(result.unit, 'week');
  assert.deepEqual(result.rows.map(row => row.panels), [1, 1]);
  assert.equal(result.rows[0].tooltipLabel, '29 Oct 2026-04 Nov 2026');
});

test('station charts use complete camera-scoped API aggregates independently of capped logs', () => {
  const model = buildSolderLine({ startDate: '2026-10-01', endDate: '2026-10-31', timezone: 'Asia/Kolkata',
    stations: ['camera1', 'camera2'].map(_id => ({ _id, name: _id, zones: [{ name: 'worker 1' }, { name: 'worker 2' }] })),
    absences: [], missed: [], panels: [],
    hourly: [record('2026-10-01', 10, 50, 7, 3), record('2026-10-10', 20, 90, 28, 2), record('2026-10-10', 50, 200, 90, 10, 'camera2')],
  }, moment.utc('2026-11-01'));
  assert.deepEqual(model.stations.map(station => station.chart.rows.reduce((sum, row) => sum + row.panels, 0)), [30, 50]);
  for (const station of model.stations) {
    assert.equal(station.chart.rows.reduce((sum, row) => sum + row.missedJoints, 0), station.sum.missed);
    assert.equal(station.chart.rows.reduce((sum, row) => sum + row.ops.reduce((total, zone) => total + zone.joints, 0), 0), station.sum.joints);
  }
  assert.equal(model.stations[0].hourly[0].h, '10');
  assert.equal(model.stations[0].hourly[0].panels, 30);
});
