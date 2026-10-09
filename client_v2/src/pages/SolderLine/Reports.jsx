import { useState } from 'react';
import { Download } from 'lucide-react';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '@/utils/timezone';
import { clock, dur } from './solderLineData';
import { mono, label, Panel, OpBadge, Chip, Waiting } from './ui';
import { downloadPdf, downloadXlsx } from './exports';
import SolderPagination, { useSolderPagination } from './SolderPagination';

const TYPES = [
  { v: 'compare', t: 'Operator comparison', d: 'Presence, soldering and speed, operator by operator' },
  { v: 'absence', t: 'Absence report', d: 'Every desk-empty alert with duration' },
  { v: 'missed', t: 'Missed solder report', d: 'Skipped points by operator and panel' },
  { v: 'hourly', t: 'Hourly activity', d: 'Panels, joints and time per hour' },
];

function periods(today) {
  const t = moment.tz(today, getConfiguredTimezone());
  const d = (m) => m.format('YYYY-MM-DD');
  return [
    ['Today', today, today],
    ['Yesterday', d(t.clone().subtract(1, 'day')), d(t.clone().subtract(1, 'day'))],
    ['Last 7 days', d(t.clone().subtract(6, 'days')), today],
    ['This month', d(t.clone().startOf('month')), today],
  ];
}

// [label, hint, value(op), better ('high' | 'low'), format]
const METRICS = [
  ['Presence', '% of the range at desk', (o) => o.presence, 'high', (v) => `${v.toFixed(1)}%`],
  ['Absence alerts', 'desk empty past threshold', (o) => o.alerts, 'low', String],
  ['Unavailable time', 'total time away', (o) => o.away, 'low', dur],
  ['Longest gap', 'single absence', (o) => o.longest, 'low', dur],
  ['Solder joints', 'points completed', (o) => o.joints, 'high', String],
  ['Missed points', 'skipped joints', (o) => o.missed, 'low', String],
  ['Avg time / joint', 'weighted by joints', (o) => o.avgJoint, 'low', (v) => `${v.toFixed(2)} s`],
  ['Active solder time', 'time spent soldering', (o) => o.solderSec, 'high', dur],
];

/** Plain rows for the preview table and both downloads. */
function reportRows(type, s) {
  if (type === 'compare') {
    return METRICS.map(([l, , get, , f]) => ({
      Metric: l,
      ...Object.fromEntries(s.ops.map((o) => [`${o.code} · ${o.zone}`, get(o) == null ? '—' : f(get(o))])),
    }));
  }
  if (type === 'absence') {
    return [...s.absences].reverse().map((a) => ({
      Alert: a.id, Operator: `OP-${a.op + 1} · ${a.zone}`, Started: a.start.format('DD MMM HH:mm:ss'),
      Condition: a.description || `${a.zone} desk empty`, Returned: clock(a.end),
      Duration: `${dur(a.durSec)}${a.active ? ' +' : ''}`, Status: a.active ? 'ACTIVE' : 'RESOLVED',
    }));
  }
  if (type === 'missed') {
    return [...s.missed].reverse().map((m) => ({
      Alert: m.id, Point: `P${m.point ?? '?'}`, Panel: m.panelId || '—', Operator: `OP-${m.op + 1} · ${m.zone}`, Time: m.start.format('DD MMM HH:mm:ss'),
    }));
  }
  return s.hourly.map((r) => ({
    Hour: `${r.h}:00`,
    Panels: r.panels,
    ...Object.fromEntries(s.ops.flatMap((o) => {
      const c = r.ops[o.i];
      return [[`${o.code} joints`, c.joints], [`${o.code} missed`, c.missed], [`${o.code} s/joint`, c.joints ? (c.solderSec / c.joints).toFixed(2) : '—']];
    })),
  }));
}

function Compare({ s }) {
  const [a, b] = s.ops;
  const wins = s.ops.map(() => 0);
  const rows = METRICS.map(([l, hint, get, better, f]) => {
    const vals = s.ops.map(get);
    const known = vals.map((v, i) => [v, i]).filter(([v]) => v != null);
    let win = null;
    if (known.length > 1) {
      const sorted = [...known].sort((p, q) => (better === 'high' ? q[0] - p[0] : p[0] - q[0]));
      if (sorted[0][0] !== sorted[1][0]) { win = sorted[0][1]; wins[win] += 1; }
    }
    const max = Math.max(...known.map(([v]) => v), 0) || 1;
    return { l, hint, vals, f, win, max };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(s.ops.length, 4)}, minmax(0, 1fr))`, gap: 12 }}>
        {s.ops.map((o) => (
          <div key={o.i} style={{ padding: '14px 16px', borderRadius: 12, background: `linear-gradient(135deg, ${o.color}22, transparent 70%)`, border: `1px solid ${o.color}66` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OpBadge op={o.i} /><span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{o.zone}</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 34, lineHeight: 1 }}>{wins[o.i]}</span>
              <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>of {METRICS.length} metrics better</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 12, border: '1px solid var(--bd)', overflowX: 'auto' }}>
        {rows.map((r, k) => (
          <div key={r.l} style={{ display: 'grid', gridTemplateColumns: `minmax(150px, 1.2fr) repeat(${s.ops.length}, minmax(110px, 1fr)) 92px`, gap: 12, padding: '10px 16px', alignItems: 'center', borderTop: k ? '1px solid var(--bd)' : 'none' }}>
            <span><span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{r.l}</span><span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>{r.hint}</span></span>
            {r.vals.map((v, i) => (
              <span key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: r.win === i ? 'var(--tx)' : 'var(--tx2)' }}>{v == null ? '—' : r.f(v)}</span>
                <span style={{ height: 5, borderRadius: 3, background: 'var(--track)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${((v || 0) / r.max) * 100}%`, background: s.ops[i].color }} />
                </span>
              </span>
            ))}
            <span style={{ ...mono, fontSize: 10, fontWeight: 700, justifySelf: 'start', padding: '3px 9px', borderRadius: 5, color: '#fff', background: r.win == null ? '#64748b' : s.ops[r.win].color }}>{r.win == null ? 'EVEN' : `OP-${r.win + 1}`}</span>
          </div>
        ))}
      </div>
      {a?.avgJoint != null && b?.avgJoint != null && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5 }}>
          {a.avgJoint <= b.avgJoint ? a.code : b.code} is {Math.abs(b.avgJoint - a.avgJoint).toFixed(2)} s faster per joint, and {a.away <= b.away ? a.code : b.code} spent {dur(Math.abs(b.away - a.away))} less time away from the desk.
        </div>
      )}
    </div>
  );
}

function Table({ rows }) {
  if (!rows.length) return <Waiting title="Nothing to report" minH={200}>No data for this report in the selected period.</Waiting>;
  const head = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 6px', ...mono, fontSize: 9, letterSpacing: '.07em', fontWeight: 500, color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>{h.toUpperCase()}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
              {head.map((h) => <td key={h} style={{ padding: '9px 6px', ...(typeof r[h] === 'number' ? mono : {}) }}>{r[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports({ model, selected, onSelect, range, today, onRangeChange }) {
  const [type, setType] = useState('compare');
  const s = model.stations[Math.min(selected, model.stations.length - 1)];
  const typeMeta = TYPES.find((t) => t.v === type);
  const period = periods(today).find(([, a, b]) => a === range.startDate && b === range.endDate);
  const periodLabel = period ? period[0] : `${range.startDate} → ${range.endDate}`;
  const rows = s ? reportRows(type, s) : [];
  const pagination = useSolderPagination(rows, JSON.stringify([type, s?._id, range.startDate, range.endDate]));
  const fileName = s ? `solder-line_${s.name}_${type}_${range.startDate}_${range.endDate}`.replace(/\s+/g, '-') : 'solder-line';
  const subtitle = s ? `${s.name} · ${s.zones.join(' & ')} · ${periodLabel}` : periodLabel;
  const btn = (primary) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: primary ? '#fff' : 'var(--tx)', border: primary ? 'none' : '1px solid var(--bd2)', background: primary ? 'linear-gradient(135deg, #3b82f6, #a855f7)' : 'var(--bg2)' });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20 }}>Operator Reports</span>
        <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Pick a report and period, preview it, then download it</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', maxWidth: 340, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
            <div style={label}>Report</div>
            {TYPES.map((t) => {
              const on = t.v === type;
              return (
                <button key={t.v} type="button" onClick={() => setType(t.v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', color: 'var(--tx)', background: on ? 'linear-gradient(135deg, rgba(59,130,246,.16), rgba(168,85,247,.08))' : 'transparent', border: `1px solid ${on ? 'rgba(59,130,246,.45)' : 'var(--bd)'}` }}>
                  <span style={{ width: 16, height: 16, flex: '0 0 auto', marginTop: 2, borderRadius: '50%', boxSizing: 'border-box', border: on ? '5px solid var(--blue)' : '2px solid var(--bd2)', background: on ? '#fff' : 'transparent' }} />
                  <span><span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{t.t}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>{t.d}</span></span>
                </button>
              );
            })}
          </Panel>
          <Panel style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
            <div style={label}>Period</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {periods(today).map(([l, a, b]) => (
                <Chip key={l} on={period?.[0] === l} color="var(--blue)" onClick={() => onRangeChange({ startDate: a, endDate: b })}>{l}</Chip>
              ))}
            </div>
            {model.stations.length > 1 && (
              <>
                <div style={{ ...label, marginTop: 4 }}>Station</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {model.stations.map((st, i) => <Chip key={st._id} on={st === s} color="var(--violet)" onClick={() => onSelect(i)}>{st.name}</Chip>)}
                </div>
              </>
            )}
            <div style={{ ...label, marginTop: 4 }}>Download</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button type="button" disabled={!rows.length} onClick={() => downloadPdf({ title: typeMeta.t, subtitle, rows, filename: fileName })} style={btn(true)}><Download size={13} />PDF</button>
              <button type="button" disabled={!rows.length} onClick={() => downloadXlsx(rows, fileName)} style={btn(false)}><Download size={13} />Excel</button>
            </div>
          </Panel>
        </div>

        <Panel pad={false} style={{ flex: '999 1 560px', minWidth: 'min(100%, 560px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(135deg, rgba(59,130,246,.1), rgba(168,85,247,.06))', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...label, fontSize: 9.5 }}>Preview · Solder line</div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22, marginTop: 4 }}>{typeMeta.t} Report</div>
              <div style={{ ...mono, fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>{subtitle}</div>
            </div>
            <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)', border: '1px solid var(--bd2)', borderRadius: 6, padding: '4px 9px' }}>GENERATED {moment.tz(getConfiguredTimezone()).format('HH:mm')}</span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            {!s ? <Waiting title="No solder-line cameras" minH={200}>Turn on the Desk Solar Shoulder detection on a camera first.</Waiting>
              : type === 'compare' ? <Compare s={s} /> : <Table rows={pagination.pageRows} />}
            {s && type !== 'compare' && <SolderPagination pagination={pagination} label={typeMeta.t} />}
            {s && type !== 'absence' && !s.sum.hasThroughput && (
              <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx3)' }}>Joint, panel and solder-time figures fill in once DS posts per-panel events.</div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
