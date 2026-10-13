import moment from 'moment-timezone';
import { getConfiguredTimezone, utcToConfiguredTimezone } from '../../utils/timezone.js';
import { DEFAULT_REQUIRED_JOINTS, panelCounts } from './panelCounts.js';

/*
 * Turns GET /incidents/solder-line into what the Solder Line pages draw.
 * A "station" is one camera running deskSolarShoulderDetection; its operators
 * are the zones configured on that detection (OP-1 = first zone, ...).
 * Pure functions only, so the views stay dumb and this stays testable.
 */

export const OP_COLORS = ['#3b82f6', '#a855f7', '#22d3ee', '#f5a623'];
export const opColor = (i) => i == null ? '#64748b' : OP_COLORS[i % OP_COLORS.length];
const DEFAULT_POINTS = DEFAULT_REQUIRED_JOINTS;

const tzMoment = (value) => moment.tz(value, getConfiguredTimezone());
const sum = (list) => list.reduce((a, b) => a + b, 0);

/** "2m 14s" / "1h 05m" */
export function dur(sec) {
  if (sec == null || sec === '' || !Number.isFinite(Number(sec))) return '—';
  const s = Math.max(0, Math.round(sec || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export const clock = (m) => (m ? m.format('HH:mm:ss') : '—');

/** Describe the recorded zone event without claiming a specific missing point. */
export function describeSolderAlert(row) {
  if (row.type === 'absence') {
    return {
      title: `${row.zone} desk empty — ${row.opCode} away`,
      detail: [
        row.description,
        row.end ? `Returned ${clock(row.end)}` : 'Not returned',
        row.durSec != null ? `Duration ${dur(row.durSec)}` : null,
      ].filter(Boolean).join(' · '),
    };
  }
  return {
    title: `${row.type === 'soldered' ? 'Soldering complete' : 'Soldering incomplete'}${row.panelId ? ` · ${row.panelId}` : ''}`,
    detail: [`${row.completedJoints ?? '—'} joints soldered`, `${row.missedJoints ?? '—'} missed`]
      .filter(Boolean).join(' · '),
  };
}

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
    ...data.missed.filter(mine).flatMap((m) => (m.zones || []).map(z => z.zone)),
    ...data.hourly.filter(mine).flatMap((r) => r.zones.map((z) => z.zone)),
    ...(data.panels || []).filter(mine).flatMap(panel => (panel.zones || []).map(zone => zone.zone)),
  ].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach(addZone);
  const pointsPerPanel = data.pointsPerPanel || DEFAULT_POINTS;
  const panelsData = (data.panels || []).filter(mine).map(panel => ({ ...panel, ...panelCounts(panel),
    start: utcToConfiguredTimezone(panel.time || panel.timeOfIncident), image: panel.Image,
  }));

  const dayEnd = tzMoment(data.endDate).endOf('day');
  const liveEnd = moment.min(now, dayEnd);

  const absences = data.absences
    .filter((a) => String(a.channelId) === id)
    .map((a, i) => {
      const start = utcToConfiguredTimezone(a.timeOfIncident);
      const end = utcToConfiguredTimezone(a.returnedAt);
      // An open incident can carry a measured duration. Only the API can
      // update it; a missing return timestamp does not make it a live timer.
      const apiDuration = a.durationSec == null || a.durationSec === '' ? null : Number(a.durationSec);
      const durSec = apiDuration != null && Number.isFinite(apiDuration) && apiDuration >= 0
        ? apiDuration
        : end && start ? Math.max(0, end.diff(start, 'seconds', true)) : null;
      return {
        id: `AB-${String(i + 1).padStart(3, '0')}`, _id: a._id, type: 'absence',
        op: addZone(a.zone), zone: a.zone || 'Unassigned',
        start, end, durSec, active: !end, image: a.Image, description: a.description,
        incident: { ...a, incidentType: 'deskSolarShoulderDetection' },
      };
    });

  // Label the uncompleted panel slots without inventing a worker allocation.
  const missed = data.missed
    .filter(mine)
    .flatMap((m) => {
      const totals = panelCounts(m);
      return Array.from({ length: totals.missedJoints }, (_, k) => ({
        _id: `${m._id}:${k}`, incidentId: m.incidentId || m._id, type: 'missed',
        op: null, zone: 'Panel total', ...totals,
        point: totals.completedJoints + k + 1,
        panelId: m.panelId, start: tzMoment(m.timeOfIncident), image: m.Image,
        incident: {
          incidentType: 'deskSolarShoulderDetection', eventType: 'panel', panelId: m.panelId,
          zones: m.zones, ...totals,
        },
      }));
    })
    .map((m, i) => ({ ...m, id: `MS-${String(i + 1).padStart(3, '0')}` }));

  // Hour-of-day buckets ("06".."23"), summed across days for multi-day ranges.
  const buckets = new Map();
  const bucket = (hh) => {
    if (!buckets.has(hh)) buckets.set(hh, { h: hh, panels: 0, missedJoints: 0, requiredJoints: 0, ops: [] });
    return buckets.get(hh);
  };
  const opCell = (b, op) => {
    while (b.ops.length <= op) b.ops.push({ joints: 0, solderSec: 0, missed: 0 });
    return b.ops[op];
  };
  data.hourly.filter((r) => r.channelId === id).forEach((r) => {
    const b = bucket(r.hour.slice(11, 13));
    b.panels += r.panels;
    b.missedJoints += r.missedJoints || 0;
    b.requiredJoints += r.requiredJoints ?? r.panels * pointsPerPanel;
    r.zones.forEach((z) => {
      const c = opCell(b, addZone(z.zone));
      c.joints += z.joints;
      c.solderSec += z.solderSec;
    });
  });
  missed.forEach((m) => bucket(m.start.format('HH')));
  absences.forEach((a) => bucket(a.start.format('HH')));

  const present = [...buckets.keys()].map(Number);
  const hours = present.length
    ? Array.from({ length: Math.max(...present) - Math.min(...present) + 1 }, (_, k) => String(Math.min(...present) + k).padStart(2, '0'))
    : [];
  const hourly = hours.map((h) => {
    const b = buckets.get(h) || { h, panels: 0, missedJoints: 0, requiredJoints: 0, ops: [] };
    return { h, panels: b.panels, missedJoints: b.missedJoints, requiredJoints: b.requiredJoints, ops: zones.map((_, i) => ({ ...(b.ops[i] || { joints: 0, solderSec: 0 }), missed: b.missedJoints ? null : 0 })) };
  });

  // Presence window: first activity of the range until now (today) or the last activity.
  const starts = [...absences.map((a) => a.start), ...missed.map((m) => m.start)];
  const ends = [...absences.map((a) => (a.end || liveEnd)), ...missed.map((m) => m.start)];
  const windowStart = hours.length ? tzMoment(data.startDate).startOf('day').hour(Number(hours[0])) : (starts.length ? moment.min(starts) : null);
  const windowEnd = now.isBefore(dayEnd) ? now : (hours.length ? tzMoment(data.endDate).startOf('day').hour(Number(hours[hours.length - 1]) + 1) : (ends.length ? moment.max(ends) : null));
  const windowSec = windowStart && windowEnd ? Math.max(1, windowEnd.diff(windowStart, 'seconds')) : 0;

  const panelMissed = data.hourly.some(mine) ? sum(hourly.map(row => row.missedJoints)) : missed.length;
  const ops = zones.map((zone, i) => {
    const ev = absences.filter((a) => a.op === i);
    const away = sum(ev.map((a) => a.durSec));
    const joints = sum(hourly.map((r) => r.ops[i].joints));
    const solderSec = sum(hourly.map((r) => r.ops[i].solderSec));
    const config = station.zones.find((z) => z.name === zone);
    return {
      i, code: `OP-${i + 1}`, zone, color: opColor(i),
      capacity: config?.capacity ?? null, thresholdSec: config?.thresholdSec ?? null,
      alerts: ev.length, away, longest: ev.length ? Math.max(...ev.map((a) => a.durSec)) : 0,
      presence: windowSec ? Math.max(0, 1 - away / windowSec) * 100 : null,
      absentNow: ev.some((a) => a.active),
      joints, missed: panelMissed ? null : 0, solderSec, avgJoint: joints ? solderSec / joints : null,
      points: [...new Set(missed.filter((m) => m.op === i).map((m) => m.point))].sort((a, b) => a - b),
    };
  });

  const panels = sum(hourly.map((r) => r.panels));
  const joints = sum(ops.map((o) => o.joints));
  const solderSec = sum(ops.map((o) => o.solderSec));
  const pointRows = Array.from({ length: pointsPerPanel }, (_, k) => {
    const point = k + 1;
    return {
      point,
      op: null,
      cells: hours.map((h) => missed.filter((m) => m.point === point && m.start.format('HH') === h).length),
    };
  });

  return {
    ...station, zones, ops, absences, missed, panels: panelsData, hours, hourly, pointRows, pointsPerPanel,
    windowStart, windowEnd, windowSec,
    sum: {
      panels, joints, missed: panelMissed, requiredJoints: sum(hourly.map(row => row.requiredJoints)),
      coverage: panels ? (joints / sum(hourly.map(row => row.requiredJoints))) * 100 : null,
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
  const requiredJoints = sumOf('requiredJoints');
  return {
    stations,
    singleDay: data.startDate === data.endDate,
    isToday: data.endDate === now.format('YYYY-MM-DD'),
    truncated: data.truncated,
    line: {
      panels, joints, missed: sumOf('missed'), absences: sumOf('absences'), away: sumOf('away'),
      requiredJoints, coverage: requiredJoints ? (joints / requiredJoints) * 100 : null,
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
    .flatMap((s) => {
      // One log per panel event, including successful panels. Point slots are
      // still available separately for the coverage view.
      const panels = s.panels?.length ? s.panels.map(panel => ({ ...panel,
        _id: `panel:${panel._id || `${panel.panelId}:${panel.start.valueOf()}`}`,
        id: panel.panelId, panelId: panel.panelId, op: null, zone: 'Panel total',
        type: panel.missedJoints > 0 ? 'missed' : 'soldered',
      })) : [...new Map(s.missed.map(row => [row.incidentId || `${row.panelId}:${row.start.valueOf()}`, row])).values()];
      return [...s.absences, ...panels].map(row => ({ ...row, station: s, opCode: row.op == null ? 'Panel' : `OP-${row.op + 1}` }));
    })
    .sort((a, b) => b.start.valueOf() - a.start.valueOf());
}
