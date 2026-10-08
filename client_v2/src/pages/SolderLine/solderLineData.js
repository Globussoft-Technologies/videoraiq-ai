import moment from 'moment-timezone';
import { getConfiguredTimezone } from '../../utils/timezone';

/*
 * Turns GET /incidents/solder-line into what the Solder Line pages draw.
 * A "station" is one camera running deskSolarShoulderDetection; its operators
 * are the zones configured on that detection (OP-1 = first zone, ...).
 * Pure functions only, so the views stay dumb and this stays testable.
 */

export const OP_COLORS = ['#3b82f6', '#a855f7', '#22d3ee', '#f5a623'];
export const opColor = (i) => OP_COLORS[i % OP_COLORS.length];
const DEFAULT_POINTS = 6;

const tzMoment = (value) => moment.tz(value, getConfiguredTimezone());
const sum = (list) => list.reduce((a, b) => a + b, 0);

/** "2m 14s" / "1h 05m" */
export function dur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export const clock = (m) => (m ? m.format('HH:mm:ss') : '—');

function buildStation(station, data, now) {
  const id = station._id;
  const mine = (row) => String(row.channelId) === id;
  const zones = station.zones.map((z) => z.name);
  const addZone = (name) => {
    const zone = name || 'Unassigned';
    if (!zones.includes(zone)) zones.push(zone);
    return zones.indexOf(zone);
  };
  // Zones DS reports that aren't configured get a stable order (e.g.
  // worker_zone_left before worker_zone_right), so OP numbers and point
  // numbers don't depend on which event happened to arrive first.
  [...new Set([
    ...data.absences.filter(mine).map((a) => a.zone),
    ...data.missed.filter(mine).map((m) => m.zone),
    ...data.hourly.filter(mine).flatMap((r) => r.zones.map((z) => z.zone)),
  ].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach(addZone);
  const perZone = data.pointsPerZone || DEFAULT_POINTS / 2;

  const dayEnd = tzMoment(data.endDate).endOf('day');
  const liveEnd = moment.min(now, dayEnd);

  const absences = data.absences
    .filter((a) => String(a.channelId) === id)
    .map((a, i) => {
      const start = tzMoment(a.timeOfIncident);
      const end = a.returnedAt ? tzMoment(a.returnedAt) : null;
      const durSec = end
        ? (a.durationSec ?? end.diff(start, 'seconds'))
        : Math.max(a.durationSec || 0, liveEnd.diff(start, 'seconds'));
      return {
        id: `AB-${String(i + 1).padStart(3, '0')}`, _id: a._id, type: 'absence',
        op: addZone(a.zone), zone: a.zone || 'Unassigned',
        start, end, durSec, active: !end, image: a.Image, description: a.description,
      };
    });

  // The server sends one entry per zone that left joints undone on a panel
  // (`done` of perZone). DS reports counts, not which points, so the missing
  // ones are taken as the zone's last points: OP-1 owns P1–P3, OP-2 P4–P6.
  // ponytail: positional guess; use DS's point list if it ever sends one.
  const missed = data.missed
    .filter(mine)
    .flatMap((m) => {
      const op = addZone(m.zone);
      return Array.from({ length: Math.max(0, perZone - (m.done || 0)) }, (_, k) => ({
        _id: `${m._id}:${k}`, type: 'missed',
        op, zone: m.zone || 'Unassigned',
        point: op * perZone + (m.done || 0) + k + 1,
        panelId: m.panelId, start: tzMoment(m.timeOfIncident), image: m.Image,
      }));
    })
    .map((m, i) => ({ ...m, id: `MS-${String(i + 1).padStart(3, '0')}` }));

  // Hour-of-day buckets ("06".."23"), summed across days for multi-day ranges.
  const buckets = new Map();
  const bucket = (hh) => {
    if (!buckets.has(hh)) buckets.set(hh, { h: hh, panels: 0, ops: [] });
    return buckets.get(hh);
  };
  const opCell = (b, op) => {
    while (b.ops.length <= op) b.ops.push({ joints: 0, solderSec: 0, missed: 0 });
    return b.ops[op];
  };
  data.hourly.filter((r) => r.channelId === id).forEach((r) => {
    const b = bucket(r.hour.slice(11, 13));
    b.panels += r.panels;
    r.zones.forEach((z) => {
      const c = opCell(b, addZone(z.zone));
      c.joints += z.joints;
      c.solderSec += z.solderSec;
      c.missed += z.missed || 0;
    });
  });
  missed.forEach((m) => bucket(m.start.format('HH')));
  absences.forEach((a) => bucket(a.start.format('HH')));

  const present = [...buckets.keys()].map(Number);
  const hours = present.length
    ? Array.from({ length: Math.max(...present) - Math.min(...present) + 1 }, (_, k) => String(Math.min(...present) + k).padStart(2, '0'))
    : [];
  const hourly = hours.map((h) => {
    const b = buckets.get(h) || { h, panels: 0, ops: [] };
    return { h, panels: b.panels, ops: zones.map((_, i) => b.ops[i] || { joints: 0, solderSec: 0, missed: 0 }) };
  });

  // Presence window: first activity of the range until now (today) or the last activity.
  const starts = [...absences.map((a) => a.start), ...missed.map((m) => m.start)];
  const ends = [...absences.map((a) => (a.end || liveEnd)), ...missed.map((m) => m.start)];
  const windowStart = hours.length ? tzMoment(data.startDate).startOf('day').hour(Number(hours[0])) : (starts.length ? moment.min(starts) : null);
  const windowEnd = now.isBefore(dayEnd) ? now : (hours.length ? tzMoment(data.endDate).startOf('day').hour(Number(hours[hours.length - 1]) + 1) : (ends.length ? moment.max(ends) : null));
  const windowSec = windowStart && windowEnd ? Math.max(1, windowEnd.diff(windowStart, 'seconds')) : 0;

  const pointsPerPanel = zones.length ? perZone * zones.length : DEFAULT_POINTS;
  const ops = zones.map((zone, i) => {
    const ev = absences.filter((a) => a.op === i);
    const away = sum(ev.map((a) => a.durSec));
    const joints = sum(hourly.map((r) => r.ops[i].joints));
    const solderSec = sum(hourly.map((r) => r.ops[i].solderSec));
    const missedN = missed.filter((m) => m.op === i).length;
    const config = station.zones.find((z) => z.name === zone);
    return {
      i, code: `OP-${i + 1}`, zone, color: opColor(i),
      capacity: config?.capacity ?? null, thresholdSec: config?.thresholdSec ?? null,
      alerts: ev.length, away, longest: ev.length ? Math.max(...ev.map((a) => a.durSec)) : 0,
      presence: windowSec ? Math.max(0, 1 - away / windowSec) * 100 : null,
      absentNow: ev.some((a) => a.active),
      joints, missed: missedN, solderSec, avgJoint: joints ? solderSec / joints : null,
      points: [...new Set(missed.filter((m) => m.op === i).map((m) => m.point))].sort((a, b) => a - b),
    };
  });

  const panels = sum(hourly.map((r) => r.panels));
  const joints = sum(ops.map((o) => o.joints));
  const solderSec = sum(ops.map((o) => o.solderSec));
  const pointRows = Array.from({ length: pointsPerPanel }, (_, k) => {
    const point = k + 1;
    const owner = ops.find((o) => o.points.includes(point));
    return {
      point,
      op: owner ? owner.i : Math.min(zones.length - 1, Math.floor(k / Math.ceil(pointsPerPanel / Math.max(1, zones.length)))),
      cells: hours.map((h) => missed.filter((m) => m.point === point && m.start.format('HH') === h).length),
    };
  });

  return {
    ...station, zones, ops, absences, missed, hours, hourly, pointRows, pointsPerPanel,
    windowStart, windowEnd, windowSec,
    sum: {
      panels, joints, missed: missed.length,
      coverage: panels ? (joints / (panels * pointsPerPanel)) * 100 : null,
      avgJoint: joints ? solderSec / joints : null,
      absences: absences.length, away: sum(absences.map((a) => a.durSec)),
      absentNow: ops.filter((o) => o.absentNow).length,
      hasThroughput: data.hourly.some((r) => r.channelId === id),
    },
  };
}

/** View model for the whole line. `now` is a moment in the configured timezone. */
export function buildSolderLine(data, now = moment.tz(getConfiguredTimezone())) {
  if (!data) return null;
  const stations = data.stations.map((s) => buildStation(s, data, now));
  const sumOf = (k) => sum(stations.map((s) => s.sum[k] || 0));
  const panels = sumOf('panels');
  const joints = sumOf('joints');
  const solderSec = sum(stations.map((s) => sum(s.ops.map((o) => o.solderSec))));
  const ppp = Math.max(DEFAULT_POINTS, ...stations.map((s) => s.pointsPerPanel));
  return {
    stations,
    singleDay: data.startDate === data.endDate,
    isToday: data.endDate === now.format('YYYY-MM-DD'),
    truncated: data.truncated,
    line: {
      panels, joints, missed: sumOf('missed'), absences: sumOf('absences'), away: sumOf('away'),
      coverage: panels ? (joints / (panels * ppp)) * 100 : null,
      avgJoint: joints ? solderSec / joints : null,
      operators: sum(stations.map((s) => s.zones.length)),
      absentNow: sumOf('absentNow'),
      hasThroughput: data.hourly.length > 0,
    },
  };
}

/** Every alert of the line, newest first, for Alert Logs. */
export function alertRows(model) {
  if (!model) return [];
  return model.stations
    .flatMap((s) => [...s.absences, ...s.missed].map((a) => ({ ...a, station: s, opCode: `OP-${a.op + 1}` })))
    .sort((a, b) => b.start.valueOf() - a.start.valueOf());
}
