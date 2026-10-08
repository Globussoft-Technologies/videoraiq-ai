import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ImageOff, LayoutGrid, Rows3 } from 'lucide-react';
import CameraStream from '@/components/CameraStream';
import { mediaUrl } from '@/lib/format';
import { clock, dur, opColor } from './solderLineData';
import {
  BAD, OK, WARN, CY, mono, label, Panel, PanelHead, SectionHead, Kpi, KpiGrid,
  OpBadge, StatusPill, Chip, Waiting, SnapshotPreview, fmt,
} from './ui';
import { downloadXlsx } from './exports';

const NO_THROUGHPUT = 'Panel counts and solder times appear here once DS posts one event per panel to /incidents/solder-line/panels.';
const NO_MISSED = 'Missed-solder alerts appear here once DS raises deskSolarShoulderDetection incidents with eventType "missedSolder".';

function stationStatus(s) {
  if (s.sum.absentNow) return ['ABSENCE', BAD];
  const lastHour = s.hourly[s.hourly.length - 1];
  if (lastHour && lastHour.ops.some((o) => o.missed)) return ['MISSED', WARN];
  return ['OK', OK];
}

function Snap({ image, children, onOpen, ratio = '16 / 9' }) {
  return (
    <div style={{ position: 'relative', aspectRatio: ratio, borderRadius: 10, overflow: 'hidden', background: '#0a0e15', border: '1px solid var(--bd2)' }}>
      {image
        ? <img src={mediaUrl(image)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)' }}><ImageOff size={18} /></span>}
      {children}
      {image && onOpen && <button type="button" onClick={onOpen} title="View full screen" style={{ position: 'absolute', inset: 0, background: 'none', border: 'none', cursor: 'zoom-in' }} />}
    </div>
  );
}

// ---------------------------------------------------------------- line + stations

function LineSection({ model, sel, setSel }) {
  const [matrix, setMatrix] = useState(false);
  const { line, stations } = model;
  const worst = [...stations].sort((a, b) => b.sum.missed - a.sum.missed)[0];
  const fastest = stations.filter((s) => s.sum.avgJoint != null).sort((a, b) => a.sum.avgJoint - b.sum.avgJoint)[0];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...label, fontWeight: 700 }}>Line · all camera stations</span>
        <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
      </div>
      <KpiGrid>
        <Kpi label="Panels · line" value={line.hasThroughput ? line.panels.toLocaleString('en-IN') : '—'} sub={`${stations.length} stations`} color={CY} />
        <Kpi label="Coverage · line" value={fmt(line.coverage, 2)} unit={line.coverage != null ? '%' : ''} sub={line.hasThroughput ? `${line.joints.toLocaleString('en-IN')} joints done` : 'Waiting for panel data'} color={OK} valueColor={OK} />
        <Kpi label="Missed · line" value={line.missed} sub={worst?.sum.missed ? `Most at ${worst.name} (${worst.sum.missed})` : 'No missed points'} color={BAD} valueColor="#ff6b6b" />
        <Kpi label="Absence alerts" value={line.absences} sub={`${line.absentNow} desk${line.absentNow === 1 ? '' : 's'} empty right now`} color={WARN} valueColor={WARN} />
        <Kpi label="Unavailable time" value={dur(line.away)} sub={`All ${line.operators} operators`} color="#a855f7" />
        <Kpi label="Avg / joint · line" value={fmt(line.avgJoint, 2)} unit={line.avgJoint != null ? 's' : ''} sub={fastest ? `Fastest ${fastest.name} · ${fastest.sum.avgJoint.toFixed(2)} s` : 'Waiting for panel data'} color="#94a3b8" />
        <Kpi label="At desk now" value={`${line.operators - line.absentNow} / ${line.operators}`} sub="Operators present on line" color={OK} />
      </KpiGrid>

      <Panel>
        <PanelHead
          title="Camera stations"
          sub="Same detection runs on every station — pick one to see its operators"
          right={(
            <span style={{ display: 'flex', gap: 4 }}>
              <Chip on={!matrix} color="var(--blue)" onClick={() => setMatrix(false)}><LayoutGrid size={13} />Cards</Chip>
              <Chip on={matrix} color="var(--blue)" onClick={() => setMatrix(true)}><Rows3 size={13} />Compare</Chip>
            </span>
          )}
        />
        {matrix ? <CompareTable stations={stations} sel={sel} setSel={setSel} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 12 }}>
            {stations.map((s, i) => <StationCard key={s._id} s={s} selected={i === sel} onClick={() => setSel(i)} />)}
          </div>
        )}
      </Panel>
    </>
  );
}

function StationCard({ s, selected, onClick }) {
  const [status, color] = stationStatus(s);
  const latest = [...s.absences, ...s.missed].filter((a) => a.image).sort((a, b) => b.start - a.start)[0];
  const spark = s.hourly.map((r) => {
    const j = r.ops.reduce((a, o) => a + o.joints, 0);
    return j ? r.ops.reduce((a, o) => a + o.solderSec, 0) / j : 0;
  });
  const spMax = Math.max(...spark, 0.01);
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: selected ? 'linear-gradient(180deg, rgba(59,130,246,.12), var(--bg1) 50%)' : 'var(--bg2)',
      border: `1px solid ${selected ? 'var(--blue)' : 'var(--bd)'}`, transition: 'all .2s',
    }}>
      <div style={{ position: 'relative' }}>
        <Snap image={latest?.image} ratio="16 / 9" />
        <span style={{ position: 'absolute', left: 8, top: 8, ...mono, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px #000' }}>{s.name}</span>
        <span style={{ position: 'absolute', right: 8, top: 8, ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: '#fff', background: color, padding: '3px 7px', borderRadius: 5 }}>{status}</span>
      </div>
      <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {s.ops.map((o) => (
          <div key={o.i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <OpBadge op={o.i} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.zone}</span>
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: o.absentNow ? BAD : OK }}>{o.absentNow ? 'AWAY' : 'AT DESK'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${o.presence ?? 0}%`, background: o.color }} />
              </span>
              <span style={{ ...mono, fontSize: 10, color: 'var(--tx3)', width: 44, textAlign: 'right' }}>{o.presence == null ? '—' : `${o.presence.toFixed(1)}%`}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, paddingTop: 9, borderTop: '1px solid var(--bd)' }}>
          {[
            ['PANELS', s.sum.hasThroughput ? s.sum.panels : '—'],
            ['COVER', s.sum.coverage == null ? '—' : `${s.sum.coverage.toFixed(1)}%`, OK],
            ['MISSED', s.sum.missed, s.sum.missed ? '#ff6b6b' : OK],
            ['S/JOINT', fmt(s.sum.avgJoint, 2)],
          ].map(([l, v, c]) => (
            <div key={l} style={{ minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.06em', color: 'var(--tx3)' }}>{l}</div>
              <div style={{ ...mono, fontSize: 13, fontWeight: 700, marginTop: 2, color: c || 'var(--tx)' }}>{v}</div>
            </div>
          ))}
        </div>
        {spark.some(Boolean) && (
          <div style={{ height: 28, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
            {spark.map((v, k) => (
              <span key={k} style={{ flex: 1, height: `${18 + (v / spMax) * 82}%`, borderRadius: '2px 2px 0 0', background: k === spark.length - 1 ? CY : 'var(--bd2)' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompareTable({ stations, sel, setSel }) {
  const presence = (s) => {
    const p = s.ops.map((o) => o.presence).filter((v) => v != null);
    return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null;
  };
  // [label, value, better direction (1 = higher is better), format]
  const cols = [
    ['PANELS', (s) => (s.sum.hasThroughput ? s.sum.panels : null), 1, (v) => String(v)],
    ['COVERAGE', (s) => s.sum.coverage, 1, (v) => `${v.toFixed(2)}%`],
    ['MISSED', (s) => s.sum.missed, -1, (v) => String(v)],
    ['ABSENCES', (s) => s.sum.absences, -1, (v) => String(v)],
    ['AWAY TIME', (s) => s.sum.away, -1, (v) => dur(v)],
    ['OP-1 S/J', (s) => s.ops[0]?.avgJoint ?? null, -1, (v) => `${v.toFixed(2)} s`],
    ['OP-2 S/J', (s) => s.ops[1]?.avgJoint ?? null, -1, (v) => `${v.toFixed(2)} s`],
    ['PRESENCE', presence, 1, (v) => `${v.toFixed(1)}%`],
  ];
  const ranges = cols.map(([, get]) => {
    const vals = stations.map(get).filter((v) => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
  });
  const grid = { display: 'grid', gridTemplateColumns: `minmax(200px, 1.4fr) repeat(${cols.length}, minmax(80px, 1fr)) 96px` };
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--bd)', overflowX: 'auto' }}>
      <div style={{ minWidth: 1000 }}>
        <div style={{ ...grid, ...mono, fontSize: 9, letterSpacing: '.07em', color: 'var(--tx3)', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ padding: '10px 14px' }}>STATION · OPERATORS</span>
          {cols.map(([l]) => <span key={l} style={{ padding: '10px 8px' }}>{l}</span>)}
          <span style={{ padding: '10px 8px' }}>STATUS</span>
        </div>
        {stations.map((s, i) => {
          const [status, color] = stationStatus(s);
          return (
            <div key={s._id} onClick={() => setSel(i)} style={{ ...grid, cursor: 'pointer', borderBottom: '1px solid var(--bd)', background: i === sel ? 'rgba(59,130,246,.1)' : 'transparent', boxShadow: i === sel ? 'inset 3px 0 0 var(--blue)' : 'none' }}>
              <span style={{ padding: '10px 14px', minWidth: 0 }}>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{s.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.zones.join(' · ')}</span>
              </span>
              {cols.map(([l, get, dir, f], ci) => {
                const v = get(s);
                const [lo, hi] = ranges[ci];
                const t = v == null || hi === lo ? 0.5 : (v - lo) / (hi - lo);
                const g = dir > 0 ? t : 1 - t;
                const bg = v == null ? 'transparent' : g >= 0.5 ? `rgba(34,197,94,${((g - 0.5) * 0.56).toFixed(2)})` : `rgba(255,77,77,${((0.5 - g) * 0.56).toFixed(2)})`;
                return <span key={l} style={{ padding: '10px 8px', display: 'flex', alignItems: 'center', ...mono, fontSize: 12.5, fontWeight: 700, background: bg }}>{v == null ? '—' : f(v)}</span>;
              })}
              <span style={{ padding: '10px 8px', display: 'flex', alignItems: 'center' }}><StatusPill text={status} color={color} active={status === 'ABSENCE'} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StationBar({ model, sel, setSel }) {
  const s = model.stations[sel];
  const n = model.stations.length;
  const arrow = (d, Icon) => (
    <button type="button" onClick={() => setSel((sel + d + n) % n)} style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)', border: '1px solid var(--bd2)', background: 'var(--bg2)' }}>
      <Icon size={15} />
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, background: 'linear-gradient(90deg, rgba(59,130,246,.16), rgba(168,85,247,.07) 55%, transparent)', border: '1px solid rgba(59,130,246,.38)' }}>
      {n > 1 && arrow(-1, ChevronLeft)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ ...label, fontSize: 9 }}>Viewing station</span>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{s.name} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)' }}>{s.nvrName}</span></span>
      </div>
      <span style={{ width: 1, height: 34, background: 'var(--bd2)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {s.ops.map((o) => (
          <span key={o.i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <OpBadge op={o.i} /><span style={{ fontWeight: 600 }}>{o.zone}</span>
            {o.thresholdSec != null && <span style={{ color: 'var(--tx3)', fontSize: 11 }}>alert after {o.thresholdSec}s empty</span>}
          </span>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {model.stations.map((st, i) => {
          const c = stationStatus(st)[1];
          return (
            <Chip key={st._id} on={i === sel} color="linear-gradient(135deg, #3b82f6, #a855f7)" onClick={() => setSel(i)}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{st.name}
            </Chip>
          );
        })}
      </div>
      {n > 1 && arrow(1, ChevronRight)}
    </div>
  );
}

// ---------------------------------------------------------------- 01 · zone absence

function LiveCamera({ s }) {
  const [w, h] = s.videoResolution;
  const polys = s.zonePolygons.length && typeof s.zonePolygons[0]?.[0] === 'number' ? [s.zonePolygons] : s.zonePolygons;
  return (
    <div style={{ position: 'relative', aspectRatio: `${w} / ${h}`, background: '#0a0e15' }}>
      {s.streamingUrl
        ? <CameraStream channel={s} rounded={false} minH={0} immediate />
        : <Waiting title="No stream for this camera" minH={0}>Check the camera on Cameras &amp; NVRs.</Waiting>}
      {/* ponytail: zones are drawn in the detection's videoResolution space; assumes the stream keeps that aspect ratio. */}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {polys.map((poly, i) => {
          const absent = s.ops[i]?.absentNow;
          return (
            <polygon key={i} points={poly.map((p) => p.join(',')).join(' ')} vectorEffect="non-scaling-stroke"
              fill={absent ? 'rgba(255,77,77,.18)' : 'rgba(59,130,246,.06)'} stroke={absent ? BAD : opColor(i)} strokeWidth={2} />
          );
        })}
      </svg>
      {polys.map((poly, i) => {
        const o = s.ops[i];
        if (!o || !poly[0]) return null;
        const [x, y] = poly.reduce(([ax, ay], [px, py]) => [Math.min(ax, px), Math.min(ay, py)], [Infinity, Infinity]);
        return (
          <span key={i} style={{ position: 'absolute', left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%`, transform: 'translateY(-100%)', ...mono, fontSize: 9, fontWeight: 700, color: '#fff', background: o.absentNow ? BAD : o.color, padding: '2px 7px', borderRadius: '3px 3px 0 0', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {o.code} · {o.zone} · {o.absentNow ? 'ABSENT' : 'PRESENT'}
          </span>
        );
      })}
    </div>
  );
}

function PresenceCard({ o }) {
  const C = 2 * Math.PI * 50;
  const pct = o.presence ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 18px', borderRadius: 16, background: 'var(--bg1)', flexWrap: 'wrap', border: `1px solid ${o.absentNow ? `${BAD}8c` : 'var(--bd)'}`, boxShadow: o.absentNow ? `0 0 0 3px ${BAD}1f` : 'none' }}>
      <div style={{ position: 'relative', width: 118, height: 118, flex: '0 0 auto' }}>
        <svg width="118" height="118" viewBox="0 0 118 118" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
          <circle cx="59" cy="59" r="50" fill="none" stroke="var(--track)" strokeWidth="10" />
          <circle cx="59" cy="59" r="50" fill="none" stroke={o.color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${((C * pct) / 100).toFixed(1)} ${C.toFixed(1)}`} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{o.presence == null ? '—' : `${o.presence.toFixed(1)}%`}</span>
          <span style={{ ...label, fontSize: 8.5, marginTop: 4 }}>Present</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <OpBadge op={o.i} />
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>{o.zone}</span>
          <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: o.absentNow ? BAD : OK }}>{o.absentNow ? 'ABSENT' : 'PRESENT'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[['Absence alerts', o.alerts, '#ff6b6b'], ['Unavailable', dur(o.away)], ['Longest gap', dur(o.longest)]].map(([l, v, c]) => (
            <div key={l} style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
              <div style={{ ...label, fontSize: 8.5 }}>{l}</div>
              <div style={{ ...mono, fontSize: 18, fontWeight: 700, marginTop: 3, color: c || 'var(--tx)' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
          {[o.capacity != null && `Capacity ${o.capacity}`, o.thresholdSec != null && `alert after ${o.thresholdSec}s empty`, o.points.length && `solders ${o.points.map((p) => `P${p}`).join(', ')}`].filter(Boolean).join(' · ') || 'Zone from the detection settings'}
        </div>
      </div>
    </div>
  );
}

function AbsenceSection({ s, model, onOpenLogs, preview }) {
  const [opFilter, setOpFilter] = useState('all');
  const latest = s.absences[s.absences.length - 1];
  const rows = [...s.absences].reverse().filter((a) => opFilter === 'all' || a.op === Number(opFilter));
  const total = s.absences.reduce((a, b) => a + b.durSec, 0);
  const span = s.windowStart && s.windowEnd ? s.windowEnd.diff(s.windowStart, 'seconds') : 0;
  const ticks = [];
  if (span) for (let m = s.windowStart.clone().startOf('hour'); m.isSameOrBefore(s.windowEnd); m.add(1, 'hour')) ticks.push(m.format('HH:mm'));
  const grid = { display: 'grid', gridTemplateColumns: '70px 110px 92px minmax(0, 1fr) 92px 92px 100px', gap: 12 };

  return (
    <>
      <SectionHead n="01" color="#3b82f6" title="Desk / Zone Absence Monitoring" sub="Alert when an operator's desk stays empty past its threshold" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 16, alignItems: 'stretch' }}>
        <Panel pad={false} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BAD, animation: 'vq-blink 1.2s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>Live · {s.name}</span>
            <span style={{ ...mono, fontSize: 9.5, color: 'var(--tx3)', border: '1px solid var(--bd2)', borderRadius: 5, padding: '2px 7px' }}>{s.videoResolution.join('×')}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, ...mono, fontSize: 10, color: 'var(--tx3)', flexWrap: 'wrap' }}>
              {s.ops.map((o) => (
                <span key={o.i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.5px solid ${o.color}` }} />{o.code} · {o.zone}
                </span>
              ))}
            </span>
          </div>
          <LiveCamera s={s} />
          <div style={{ padding: 14 }}>
            <Waiting title="Current panel" minH={110}>
              Live P1–P{s.pointsPerPanel} solder status needs a per-panel feed from DS. Panel totals and missed points below fill in from the events DS posts.
            </Waiting>
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {s.ops.length ? s.ops.map((o) => <PresenceCard key={o.i} o={o} />) : <Waiting title="No zones configured">Draw the operator zones on this camera's Desk Solar Shoulder detection.</Waiting>}
          <Panel pad={false} style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: BAD }} />
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>Latest absence snapshot</span>
              {latest && <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{latest.id}</span>}
            </div>
            {!latest ? <div style={{ padding: 16 }}><Waiting title="No absences" minH={120}>Nobody has left a desk empty in this range.</Waiting></div> : (
              <div style={{ display: 'flex', gap: 14, padding: '14px 16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                  <Snap image={latest.image} onOpen={() => preview(latest._id)}>
                    <span style={{ position: 'absolute', left: 8, bottom: 8, ...mono, fontSize: 9.5, color: '#fff', background: 'rgba(6,8,13,.75)', borderRadius: 5, padding: '3px 7px' }}>{clock(latest.start)}</span>
                  </Snap>
                </div>
                <div style={{ flex: '1 1 170px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OpBadge op={latest.op} /><StatusPill active={latest.active} /></div>
                  <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, lineHeight: 1.25 }}>{latest.description || `${latest.zone} desk empty`}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><div style={{ ...label, fontSize: 8.5 }}>Started</div><div style={{ ...mono, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{clock(latest.start)}</div></div>
                    <div><div style={{ ...label, fontSize: 8.5 }}>Duration</div><div style={{ ...mono, fontSize: 14, fontWeight: 700, marginTop: 2, color: '#ff6b6b' }}>{dur(latest.durSec)}{latest.active ? ' +' : ''}</div></div>
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {latest.image && <a href={mediaUrl(latest.image)} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: 'none' }}><Download size={13} />Image</a>}
                    <button type="button" onClick={onOpenLogs} style={btnGhost}>All alert logs →</button>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {model.singleDay && span > 0 && (
        <Panel>
          <PanelHead title="Presence timeline" sub="Red marks are absence alerts — width is the duration" />
          <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0, 1fr)', gap: '10px 14px', alignItems: 'center' }}>
            {s.ops.map((o) => (
              <div key={o.i} style={{ display: 'contents' }}>
                <OpBadge op={o.i} />
                <div style={{ position: 'relative', height: 30, borderRadius: 8, background: `linear-gradient(90deg, ${o.color}55, ${o.color}aa)`, overflow: 'hidden' }}>
                  {s.absences.filter((a) => a.op === o.i).map((a) => (
                    <div key={a._id} title={`${a.id} · ${clock(a.start)} · ${dur(a.durSec)}`} style={{
                      position: 'absolute', top: 3, bottom: 3, borderRadius: 3, background: BAD, boxShadow: '0 0 10px rgba(255,77,77,.7)',
                      left: `${Math.max(0, (a.start.diff(s.windowStart, 'seconds') / span) * 100)}%`,
                      width: `${Math.max(0.45, (a.durSec / span) * 100)}%`,
                    }} />
                  ))}
                </div>
              </div>
            ))}
            <span />
            <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 9.5, color: 'var(--tx3)' }}>{ticks.map((t) => <span key={t}>{t}</span>)}</div>
          </div>
        </Panel>
      )}

      <Panel pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Absence alert log</span>
          <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#ff6b6b', border: `1px solid ${BAD}73`, borderRadius: 5, padding: '2px 8px' }}>{s.absences.length} ALERTS</span>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>TOTAL UNAVAILABLE {dur(total)}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip on={opFilter === 'all'} onClick={() => setOpFilter('all')}>ALL</Chip>
            {s.ops.map((o) => <Chip key={o.i} on={opFilter === String(o.i)} color={o.color} onClick={() => setOpFilter(String(o.i))}>{o.code}</Chip>)}
            <button type="button" onClick={onOpenLogs} style={btnPrimary}>Logs with snapshots →</button>
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720 }}>
            <div style={{ ...grid, padding: '9px 18px', ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)', borderBottom: '1px solid var(--bd)' }}>
              <span>ALERT</span><span>OPERATOR</span><span>ALERT TIME</span><span>CONDITION</span><span>RETURNED</span><span>DURATION</span><span>STATUS</span>
            </div>
            <div style={{ maxHeight: 312, overflowY: 'auto' }}>
              {!rows.length && <div style={{ padding: 18, fontSize: 12.5, color: 'var(--tx3)' }}>No absence alerts in this range.</div>}
              {rows.map((r) => (
                <div key={r._id} style={{ ...grid, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--bd)', fontSize: 12.5 }}>
                  <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>{r.id}</span>
                  <OpBadge op={r.op} />
                  <span style={{ ...mono, fontWeight: 600 }}>{clock(r.start)}</span>
                  <span style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description || `${r.zone} desk empty`}</span>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--tx2)' }}>{clock(r.end)}</span>
                  <span style={{ ...mono, fontWeight: 700 }}>{dur(r.durSec)}{r.active ? ' +' : ''}</span>
                  <StatusPill active={r.active} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- 02 · conveyor & soldering

function Bars({ hourly, render, height = 200 }) {
  return (
    <div style={{ height, marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      {hourly.map((r, i) => (
        <div key={r.h} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          {render(r, i)}
          <span style={{ ...mono, fontSize: 10, color: 'var(--tx3)' }}>{r.h}</span>
        </div>
      ))}
    </div>
  );
}

function SolderSection({ s, preview }) {
  const has = s.sum.hasThroughput;
  const pMax = Math.max(1, ...s.hourly.map((r) => r.panels));
  const jMax = Math.max(1, ...s.hourly.flatMap((r) => r.ops.map((o) => o.joints)));
  const anyMissedData = has || s.missed.length > 0;
  return (
    <>
      <SectionHead n="02" color="#a855f7" title="Conveyor Count & Soldering Activity" sub={`${s.pointsPerPanel} solder points per panel — any miss raises an alert against the operator`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
        <Panel>
          <PanelHead title="Panels counted per hour" right={has && <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>AVG {(s.sum.panels / Math.max(1, s.hourly.filter((r) => r.panels).length)).toFixed(1)} / HR</span>} />
          {!has ? <Waiting>{NO_THROUGHPUT}</Waiting> : (
            <Bars hourly={s.hourly} render={(r) => (
              <>
                <span style={{ ...mono, fontSize: 11, fontWeight: 700 }}>{r.panels}</span>
                <div style={{ width: '100%', maxWidth: 46, height: `${(r.panels / pMax) * 82}%`, borderRadius: '7px 7px 3px 3px', background: 'linear-gradient(180deg, #22d3ee, #0e7490)' }} />
              </>
            )} />
          )}
        </Panel>
        <Panel>
          <PanelHead title="Solder joints per hour" right={(
            <span style={{ display: 'flex', gap: 12, ...mono, fontSize: 10, color: 'var(--tx3)' }}>
              {s.ops.map((o) => <span key={o.i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: o.color }} />{o.code}</span>)}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: BAD }} />MISSED</span>
            </span>
          )} />
          {!has ? <Waiting>{NO_THROUGHPUT}</Waiting> : (
            <Bars hourly={s.hourly} render={(r) => (
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
                {r.ops.map((o, i) => (
                  <div key={i} style={{ position: 'relative', flex: 1, maxWidth: 22, height: `${(o.joints / jMax) * 86}%`, borderRadius: '5px 5px 2px 2px', background: `linear-gradient(180deg, ${opColor(i)}, ${opColor(i)}66)` }}>
                    {o.missed > 0 && <span style={{ position: 'absolute', left: '50%', top: -20, transform: 'translateX(-50%)', minWidth: 18, height: 16, padding: '0 4px', borderRadius: 8, background: BAD, color: '#fff', ...mono, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−{o.missed}</span>}
                  </div>
                ))}
              </div>
            )} />
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
        <Panel>
          <PanelHead title="Solder point coverage" sub="Each cell: point × hour" right={s.sum.coverage != null && <span style={{ ...mono, fontSize: 11, color: OK }}>{s.sum.coverage.toFixed(2)}% COVERED</span>} />
          {!anyMissedData ? <Waiting>{NO_MISSED}</Waiting> : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `78px repeat(${s.hours.length}, minmax(34px, 1fr))`, gap: 5, minWidth: 78 + s.hours.length * 39 }}>
                <span />
                {s.hours.map((h) => <span key={h} style={{ textAlign: 'center', ...mono, fontSize: 9.5, color: 'var(--tx3)' }}>{h}</span>)}
                {s.pointRows.map((row) => (
                  <div key={row.point} style={{ display: 'contents' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, ...mono, fontSize: 11, fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: opColor(row.op) }} />P{row.point}
                      <span style={{ fontSize: 8.5, fontWeight: 500, color: 'var(--tx3)' }}>OP-{row.op + 1}</span>
                    </span>
                    {row.cells.map((m, k) => {
                      const c = m === 0 ? OK : m === 1 ? WARN : BAD;
                      return (
                        <div key={k} title={`P${row.point} · ${s.hours[k]}:00 · ${m} missed`} style={{ height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: 12, fontWeight: 700, color: c, background: m === 0 ? 'rgba(34,197,94,.16)' : m === 1 ? 'rgba(245,166,35,.24)' : 'rgba(255,77,77,.3)', border: `1px solid ${c}55` }}>
                          {m ? `−${m}` : '✓'}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel pad={false} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Missed solder alerts</span>
            <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: '#ff6b6b', border: `1px solid ${BAD}73`, borderRadius: 5, padding: '2px 8px' }}>{s.missed.length}</span>
            <span style={{ marginLeft: 'auto', ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{s.ops.map((o) => `${o.code} ${o.missed}`).join(' · ')}</span>
          </div>
          <div style={{ flex: 1, maxHeight: 268, overflowY: 'auto' }}>
            {!s.missed.length && <div style={{ padding: 16 }}>{anyMissedData ? <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No missed points in this range.</span> : <Waiting minH={120}>{NO_MISSED}</Waiting>}</div>}
            {[...s.missed].reverse().map((m) => (
              <div key={m._id} onClick={m.image ? () => preview(m._id) : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 18px', borderBottom: '1px solid var(--bd)', cursor: m.image ? 'pointer' : 'default' }}>
                <span style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: 8, background: 'rgba(255,77,77,.12)', border: `1px solid ${BAD}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: 10.5, fontWeight: 700, color: '#ff6b6b' }}>P{m.point ?? '?'}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>Point {m.point ?? '?'} not soldered{m.panelId ? ` · ${m.panelId}` : ''}</span>
                  <span style={{ display: 'block', ...mono, fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>{m.zone}{m.image ? ' · snapshot saved' : ''}</span>
                </span>
                <OpBadge op={m.op} />
                <span style={{ ...mono, fontSize: 11.5, color: 'var(--tx2)' }}>{clock(m.start)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 03 · hour by hour

function HourSection({ s, model }) {
  const has = s.sum.hasThroughput;
  const perJoint = (o) => (o.joints ? o.solderSec / o.joints : null);
  const series = s.ops.map((o) => s.hourly.map((r) => perJoint(r.ops[o.i])));
  const vals = series.flat().filter((v) => v != null);
  const lo = vals.length ? Math.min(...vals) - 0.2 : 0;
  const hi = vals.length ? Math.max(...vals) + 0.2 : 1;
  const W = 640, H = 220, P = 14, n = s.hourly.length;
  const X = (i) => (n > 1 ? P + (i * (W - 2 * P)) / (n - 1) : W / 2);
  const Y = (v) => P + ((hi - v) / (hi - lo || 1)) * (H - 2 * P);
  const path = (list) => list.map((v, i) => (v == null ? null : `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' ');
  const [a, b] = s.ops;
  const gaps = a && b ? s.hourly.map((r) => {
    const x = perJoint(r.ops[a.i]); const y = perJoint(r.ops[b.i]);
    return { h: r.h, d: x != null && y != null ? y - x : null };
  }) : [];
  const dMax = Math.max(0.1, ...gaps.map((g) => Math.abs(g.d || 0)));
  const widest = gaps.filter((g) => g.d != null).sort((p, q) => Math.abs(q.d) - Math.abs(p.d))[0];
  const insight = a?.avgJoint != null && b?.avgJoint != null
    ? `${a.avgJoint <= b.avgJoint ? a.code : b.code} is ${Math.abs(b.avgJoint - a.avgJoint).toFixed(2)} s faster per joint over the range.${widest ? ` Widest gap at ${widest.h}:00 (${widest.d > 0 ? '+' : ''}${widest.d.toFixed(1)} s).` : ''}`
    : null;

  const rangeLabel = (h) => `${h}:00–${String(Number(h) + 1).padStart(2, '0')}:00`;
  const exportHourly = () => downloadXlsx(
    s.hourly.map((r) => ({
      Hour: rangeLabel(r.h),
      Panels: r.panels,
      ...Object.fromEntries(s.ops.flatMap((o) => {
        const c = r.ops[o.i];
        return [[`${o.code} joints`, c.joints], [`${o.code} missed`, c.missed], [`${o.code} s/joint`, perJoint(c)?.toFixed(2) ?? ''], [`${o.code} active`, dur(c.solderSec)]];
      })),
    })),
    `solder-line_${s.name}_hourly_${model.isToday ? 'today' : 'range'}`,
  );

  return (
    <>
      <SectionHead n="03" color={CY} title="Hour-by-Hour Soldering Activity" sub={`Average solder time per joint · ${s.ops.map((o) => o.code).join(' vs ')}`} />
      {!has ? <Panel><Waiting>{NO_THROUGHPUT}</Waiting></Panel> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
            <Panel>
              <PanelHead title="Avg soldering time per joint" right={(
                <span style={{ display: 'flex', gap: 12, ...mono, fontSize: 10, color: 'var(--tx3)' }}>
                  {s.ops.map((o) => <span key={o.i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: o.color }} />{o.code} {fmt(o.avgJoint, 2)}s</span>)}
                </span>
              )} />
              <div style={{ position: 'relative', height: H }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1="0" x2={W} y1={P + t * (H - 2 * P)} y2={P + t * (H - 2 * P)} stroke="var(--grid)" vectorEffect="non-scaling-stroke" />)}
                  {series.map((list, i) => <path key={i} d={path(list)} stroke={opColor(i)} strokeWidth="2.6" fill="none" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
                </svg>
                {series.flatMap((list, i) => list.map((v, k) => v == null ? null : (
                  <span key={`${i}-${k}`} title={`OP-${i + 1} · ${s.hourly[k].h}:00 · ${v.toFixed(1)} s/joint`} style={{ position: 'absolute', left: `${(X(k) / W) * 100}%`, top: `${(Y(v) / H) * 100}%`, width: 11, height: 11, borderRadius: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg1)', border: `2.5px solid ${opColor(i)}` }} />
                )))}
                <span style={{ position: 'absolute', left: 0, top: 0, ...mono, fontSize: 9.5, color: 'var(--tx3)' }}>{hi.toFixed(1)}s</span>
                <span style={{ position: 'absolute', left: 0, bottom: 0, ...mono, fontSize: 9.5, color: 'var(--tx3)' }}>{lo.toFixed(1)}s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 10, color: 'var(--tx3)', marginTop: 6 }}>{s.hourly.map((r) => <span key={r.h}>{r.h}</span>)}</div>
            </Panel>

            <Panel style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PanelHead title={a && b ? `${a.code} vs ${b.code} · hourly gap` : 'Shift averages'} right={<span style={{ ...mono, fontSize: 10, color: 'var(--tx3)' }}>SEC / JOINT</span>} />
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(2, s.ops.length) || 1}, minmax(0, 1fr))`, gap: 10 }}>
                {s.ops.map((o) => (
                  <div key={o.i} style={{ padding: '12px 14px', borderRadius: 12, background: `linear-gradient(135deg, ${o.color}1f, transparent 70%)`, border: `1px solid ${o.color}55` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OpBadge op={o.i} /><span style={{ ...label, fontSize: 9 }}>Range avg</span></div>
                    <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 28, marginTop: 6 }}>{fmt(o.avgJoint, 2)}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)', marginLeft: 4 }}>s</span></div>
                    <div style={{ ...mono, fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>{o.joints} joints · {dur(o.solderSec)} active</div>
                  </div>
                ))}
              </div>
              {gaps.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 1px minmax(0, 1fr) 50px', gap: 8, ...mono, fontSize: 8.5, letterSpacing: '.08em', color: 'var(--tx3)' }}>
                    <span /><span style={{ textAlign: 'right' }}>{a.code} SLOWER</span><span /><span>{b.code} SLOWER</span><span style={{ textAlign: 'right' }}>Δ</span>
                  </div>
                  {gaps.map((g) => {
                    const w = g.d == null ? '0%' : `${Math.min(100, (Math.abs(g.d) / dMax) * 100)}%`;
                    return (
                      <div key={g.h} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 1px minmax(0, 1fr) 50px', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...mono, fontSize: 10, color: 'var(--tx3)' }}>{g.h}</span>
                        <div style={{ height: 12, display: 'flex', justifyContent: 'flex-end' }}><div style={{ height: '100%', width: g.d < 0 ? w : '0%', borderRadius: '4px 0 0 4px', background: `linear-gradient(270deg, ${a.color}, ${a.color}55)` }} /></div>
                        <span style={{ height: 16, background: 'var(--bd2)' }} />
                        <div style={{ height: 12, display: 'flex' }}><div style={{ height: '100%', width: g.d > 0 ? w : '0%', borderRadius: '0 4px 4px 0', background: `linear-gradient(90deg, ${b.color}, ${b.color}55)` }} /></div>
                        <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, textAlign: 'right', color: g.d > 0 ? b.color : a.color }}>{g.d == null ? '—' : `${g.d > 0 ? '+' : ''}${g.d.toFixed(1)}s`}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {insight && <div style={{ marginTop: 'auto', padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12 }}>{insight}</div>}
            </Panel>
          </div>

          <Panel pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Hourly activity log</span>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Panels, joints, misses and solder time per operator</span>
              <button type="button" onClick={exportHourly} style={{ ...btnGhost, marginLeft: 'auto' }}>XLSX</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', ...mono, fontSize: 12 }}>
                <thead>
                  <tr style={{ fontSize: 9, letterSpacing: '.07em', color: 'var(--tx3)', textAlign: 'left' }}>
                    <th style={th}>HOUR</th><th style={th}>PANELS</th>
                    {s.ops.flatMap((o) => ['JOINTS', 'MISSED', 'AVG / JOINT', 'ACTIVE TIME'].map((c) => <th key={`${o.i}${c}`} style={{ ...th, color: o.color }}>{c === 'JOINTS' ? `${o.code} ${c}` : c}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {s.hourly.map((r) => (
                    <tr key={r.h} style={{ borderTop: '1px solid var(--bd)' }}>
                      <td style={td}>{rangeLabel(r.h)}</td><td style={{ ...td, fontWeight: 700 }}>{r.panels}</td>
                      {r.ops.flatMap((c, i) => [
                        <td key={`${i}j`} style={td}>{c.joints}</td>,
                        <td key={`${i}m`} style={{ ...td, color: c.missed ? BAD : 'var(--tx3)', fontWeight: c.missed ? 700 : 400 }}>{c.missed}</td>,
                        <td key={`${i}a`} style={td}>{fmt(perJoint(c), 1)} s</td>,
                        <td key={`${i}t`} style={{ ...td, color: 'var(--tx2)' }}>{dur(c.solderSec)}</td>,
                      ])}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--bd)', background: 'var(--bg2)', fontWeight: 700 }}>
                    <td style={td}>TOTAL</td><td style={td}>{s.sum.panels}</td>
                    {s.ops.flatMap((o) => [
                      <td key={`${o.i}j`} style={td}>{o.joints}</td>,
                      <td key={`${o.i}m`} style={{ ...td, color: '#ff6b6b' }}>{o.missed}</td>,
                      <td key={`${o.i}a`} style={td}>{fmt(o.avgJoint, 2)} s</td>,
                      <td key={`${o.i}t`} style={td}>{dur(o.solderSec)}</td>,
                    ])}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

const th = { padding: '9px 10px', fontWeight: 500 };
const td = { padding: '9px 10px' };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #a855f7)' };
const btnGhost = { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--tx2)', cursor: 'pointer', border: '1px solid var(--bd2)', background: 'var(--bg2)' };

// ---------------------------------------------------------------- page

export default function Overview({ model, onOpenLogs }) {
  const [sel, setSel] = useState(0);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { if (sel >= model.stations.length) setSel(0); }, [model.stations.length, sel]);
  if (!model.stations.length) {
    return (
      <Panel>
        <Waiting title="No solder-line cameras yet" minH={240}>
          Turn on the Desk Solar Shoulder detection for a camera under Configure ▸ Detections and draw one zone per operator desk.
        </Waiting>
      </Panel>
    );
  }
  const s = model.stations[Math.min(sel, model.stations.length - 1)];
  const absentOp = s.ops.find((o) => o.absentNow);
  const sKpi = s.sum;
  return (
    <>
      {absentOp && model.isToday && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 12, background: 'linear-gradient(90deg, rgba(255,77,77,.2), rgba(255,77,77,.04) 70%)', border: `1px solid ${BAD}59` }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: BAD, animation: 'vq-blink .9s ease-in-out infinite' }} />
          <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: '#ff6b6b' }}>ABSENCE ALERT</span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{absentOp.zone} desk empty on {s.name}</span>
        </div>
      )}
      <LineSection model={model} sel={sel} setSel={setSel} />
      <StationBar model={model} sel={sel} setSel={setSel} />
      <KpiGrid>
        <Kpi label="Panels counted" value={sKpi.hasThroughput ? sKpi.panels : '—'} sub="Conveyor count" color={CY} />
        <Kpi label="Solder joints" value={sKpi.hasThroughput ? sKpi.joints.toLocaleString('en-IN') : '—'} unit={sKpi.hasThroughput ? `/ ${(sKpi.panels * s.pointsPerPanel).toLocaleString('en-IN')}` : ''} sub={`${s.pointsPerPanel} points per panel`} color="#3b82f6" />
        <Kpi label="Coverage" value={fmt(sKpi.coverage, 2)} unit={sKpi.coverage != null ? '%' : ''} sub="Joints done ÷ joints required" color={OK} valueColor={OK} />
        <Kpi label="Missed solders" value={sKpi.missed} sub={s.ops.map((o) => `${o.code} ${o.missed}`).join(' · ')} color={BAD} valueColor="#ff6b6b" />
        <Kpi label="Absence alerts" value={sKpi.absences} sub={s.ops.map((o) => `${o.code} ${o.alerts}`).join(' · ')} color={WARN} valueColor={WARN} />
        <Kpi label="Unavailable time" value={dur(sKpi.away)} sub="All desks combined" color="#a855f7" />
        <Kpi label="Avg / joint" value={fmt(sKpi.avgJoint, 2)} unit={sKpi.avgJoint != null ? 's' : ''} sub={s.ops.map((o) => `${o.code} ${fmt(o.avgJoint, 2)}`).join(' · ')} color="#94a3b8" />
      </KpiGrid>
      <AbsenceSection s={s} model={model} onOpenLogs={onOpenLogs} preview={setOpenId} />
      <SolderSection s={s} preview={setOpenId} />
      <HourSection s={s} model={model} />
      <SnapshotPreview items={[...s.absences, ...s.missed]} openId={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
