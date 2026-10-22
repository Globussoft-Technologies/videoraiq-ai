import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Info, LayoutGrid, Maximize2, Rows3, X } from 'lucide-react';
import CameraStream from '@/components/CameraStream';
import FullscreenZoomSurface from '@/components/FullscreenZoomSurface';
import { mediaUrl } from '@/lib/format';
import { clock, dur, opColor } from './solderLineData';
import {
  BAD, OK, WARN, CY, mono, label, Panel, PanelHead, SectionHead,
  OpBadge, StatusPill, Chip, Waiting, NoPeriodData, SnapshotPreview,
} from './ui';
import { downloadXlsx, downloadPdf } from './exports';
import { buildSolderReportRows } from './reportRows.js';
import { downloadSnapshot } from './snapshots';
import DownloadButton from './DownloadButton';
import LatestPanel from './LatestPanel';
import LivePanelLog from './LivePanelLog';
import SortButton, { useTableSort } from './TableSort';
import { sortRows } from './sorting.js';
import MissedSolderAlerts from './MissedSolderAlerts';
import AbsenceLogTable from './AbsenceLogTable';
import ChartTooltip from './ChartTooltip';
import SolderPagination, { useSolderPagination } from './SolderPagination';


function stationStatus(s) {
  if (s.sum.absentNow) return ['ABSENCE', BAD];
  const lastHour = s.hourly[s.hourly.length - 1];
  if (lastHour?.missedJoints) return ['MISSED', WARN];
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

export function CameraStations({ model, sel, setSel }) {
  const [matrix, setMatrix] = useState(false);
  const { stations } = model;
  return (
    <>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, paddingTop: 9, borderTop: '1px solid var(--bd)' }}>
          {[
            ['PANELS', s.sum.hasThroughput ? s.sum.panels : '—'],
            ['MISSED', s.sum.missed, s.sum.missed ? '#ff6b6b' : OK],
          ].map(([l, v, c]) => (
            <div key={l} style={{ minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.06em', color: 'var(--tx3)' }}>{l}</div>
              <div style={{ ...mono, fontSize: 13, fontWeight: 700, marginTop: 2, color: c || 'var(--tx)' }}>{v}</div>
            </div>
          ))}
        </div>
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
    ['MISSED', (s) => s.sum.missed, -1, (v) => String(v)],
    ['ABSENCES', (s) => s.sum.absences, -1, (v) => String(v)],
    ['PRESENCE', presence, 1, (v) => `${v.toFixed(1)}%`],
  ];
  const sorting = useTableSort(stations, '', (station, key) => key === 'Station' ? station.name : cols.find(([name]) => name === key)?.[1](station));
  const ranges = cols.map(([, get]) => {
    const vals = stations.map(get).filter((v) => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 0];
  });
  const grid = { display: 'grid', gridTemplateColumns: `minmax(200px, 1.4fr) repeat(${cols.length}, minmax(80px, 1fr))` };
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--bd)', overflowX: 'auto' }}>
      <div style={{ minWidth: 200 + cols.length * 80 }}>
        <div style={{ ...grid, ...mono, fontSize: 9, letterSpacing: '.07em', color: 'var(--tx3)', background: 'var(--bg2)', borderBottom: '1px solid var(--bd)' }}>
          <span role="columnheader" aria-sort={sorting.directionFor('Station')} style={{ padding: '10px 14px' }}><SortButton column="Station" sorting={sorting}>STATION · OPERATORS</SortButton></span>
          {cols.map(([l]) => <span key={l} role="columnheader" aria-sort={sorting.directionFor(l)} style={{ padding: '10px 8px' }}><SortButton column={l} sorting={sorting}>{l}</SortButton></span>)}
        </div>
        {sorting.rows.map((s) => {
          const i = stations.indexOf(s);
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 01 · zone absence

function LiveCamera({ s }) {
  const hostRef = useRef(null);
  const closeRef = useRef(null);
  const expandRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === hostRef.current) setExpanded(true);
      else if (!fallback) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, [fallback]);
  useEffect(() => {
    if (!expanded) return;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; expandRef.current?.focus(); };
  }, [expanded]);
  const open = async () => {
    try {
      if (!hostRef.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
      await hostRef.current.requestFullscreen();
    } catch {
      setFallback(true);
    }
    setExpanded(true);
  };
  const close = async () => {
    if (document.fullscreenElement === hostRef.current) await document.exitFullscreen();
    setFallback(false);
    setExpanded(false);
  };
  const [w, h] = s.videoResolution;
  const polys = s.zonePolygons.length && typeof s.zonePolygons[0]?.[0] === 'number' ? [s.zonePolygons] : s.zonePolygons;
  return (
    <div ref={hostRef} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? `Live ${s.name}` : undefined}
      onKeyDown={(event) => {
        if (!expanded) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
          const controls = [...hostRef.current.querySelectorAll('button:not(:disabled)')];
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}
      style={{ position: fallback && expanded ? 'fixed' : 'relative', ...(fallback && expanded ? { inset: 0, zIndex: 10003 } : {}),
        ...(expanded ? { width: '100vw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { aspectRatio: `${w} / ${h}` }), background: '#0a0e15' }}>
      <div style={{ position: 'relative', width: expanded ? `min(100vw, calc(100dvh * ${w / h}))` : '100%', aspectRatio: `${w} / ${h}` }}>
      <FullscreenZoomSurface enabled={expanded} resetKey={s._id} toolbarStyle={{ right: 64 }}>
      {s.streamingUrl
        ? <CameraStream channel={s} rounded={false} minH={0} immediate clickToMaximize={false} />
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
      </FullscreenZoomSurface>
      </div>
      <button ref={expanded ? closeRef : expandRef} type="button" onClick={expanded ? close : open}
        title={expanded ? 'Close fullscreen' : 'View live camera fullscreen'} aria-label={expanded ? 'Close fullscreen' : 'View live camera fullscreen'}
        style={{ position: 'absolute', right: 14, ...(expanded ? { top: 14 } : { bottom: 12 }), zIndex: 40, width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid rgba(255,255,255,.3)', color: '#fff', background: 'rgba(15,23,42,.8)', cursor: 'pointer' }}>
        {expanded ? <X size={18} /> : <Maximize2 size={18} />}
      </button>
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
      <div style={{ flex: 1, minWidth: 'min(100%, 220px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      </div>
    </div>
  );
}

function AbsenceSection({ s, model, onOpenLogs, preview, range }) {
  const cameraColumn = useRef(null);
  const logsColumn = useRef(null);
  const [columnHeight, setColumnHeight] = useState(undefined);
  useEffect(() => {
    const camera = cameraColumn.current;
    const logs = logsColumn.current;
    if (!camera || !logs) return;
    const measure = () => {
      const sideBySide = Math.abs(camera.getBoundingClientRect().top - logs.getBoundingClientRect().top) < 2;
      setColumnHeight(sideBySide ? camera.getBoundingClientRect().height : undefined);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(camera);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const latest = s.absences[s.absences.length - 1];
  const total = s.absences.reduce((a, b) => a + b.durSec, 0);
  const span = s.windowStart && s.windowEnd ? s.windowEnd.diff(s.windowStart, 'seconds') : 0;
  const ticks = [];
  if (span) for (let m = s.windowStart.clone().startOf('hour'); m.isSameOrBefore(s.windowEnd); m.add(1, 'hour')) ticks.push(m.format('HH:mm'));

  return (
    <>
      <SectionHead n="01" color="#3b82f6" title="Desk / Zone Absence Monitoring" sub="Alert when an operator's desk stays empty past its threshold" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div ref={cameraColumn}>
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
          <LatestPanel panel={s.latestPanel} />
        </Panel>

        </div>
        <div ref={logsColumn} style={{ display: 'grid', gridTemplateRows: `repeat(${Math.max(s.ops.length, 1) + 1}, max-content) minmax(100px, 1fr)`, gap: 16, minWidth: 0, height: columnHeight, minHeight: 'min-content', alignSelf: 'start' }}>
          {s.ops.length ? s.ops.map((o) => <PresenceCard key={o.i} o={o} />) : <Waiting title="No zones configured">Draw the operator zones on this camera's Desk Solar Shoulder detection.</Waiting>}
          <Panel pad={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: BAD }} />
              <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>Latest absence snapshot</span>
              {latest && <span style={{ marginLeft: 'auto', ...mono, fontSize: 10, color: 'var(--tx3)' }}>{latest.id}</span>}
            </div>
            {!latest ? <div style={{ padding: 16 }}><NoPeriodData minH={120} /></div> : (
              <div style={{ display: 'flex', gap: 12, padding: '12px 14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 1 260px', width: 260, minWidth: 0, maxWidth: '100%' }}>
                  <Snap image={latest.image} onOpen={() => preview(latest._id)}>
                    <span style={{ position: 'absolute', left: 8, bottom: 8, ...mono, fontSize: 9.5, color: '#fff', background: 'rgba(6,8,13,.75)', borderRadius: 5, padding: '3px 7px' }}>{clock(latest.start)}</span>
                  </Snap>
                </div>
                <div style={{ flex: '1 1 180px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OpBadge op={latest.op} /><StatusPill active={latest.active} /></div>
                  <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, lineHeight: 1.25 }}>{latest.description || `${latest.zone} desk empty`}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><div style={{ ...label, fontSize: 8.5 }}>Started</div><div style={{ ...mono, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{clock(latest.start)}</div></div>
                    <div><div style={{ ...label, fontSize: 8.5 }}>Duration</div><div style={{ ...mono, fontSize: 14, fontWeight: 700, marginTop: 2, color: '#ff6b6b' }}>{dur(latest.durSec)}</div></div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {latest.image && <DownloadButton action={() => downloadSnapshot({ ...latest, station: s })} description="image" style={btnPrimary}>Image</DownloadButton>}
                    {onOpenLogs && <button type="button" onClick={onOpenLogs} style={btnGhost}>All alert logs →</button>}
                  </div>
                </div>
              </div>
            )}
          </Panel>
          <LivePanelLog key={JSON.stringify([s._id, range?.startDate, range?.endDate])} station={s} live={model.isToday} />
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 650px), 1fr))', gap: 16, padding: 16 }}>
          {!s.ops.length && <div style={{ padding: 12, fontSize: 12.5, color: 'var(--tx3)' }}>No operator zones configured.</div>}
          {s.ops.map(o => <AbsenceLogTable key={o.i} operator={o} absences={s.absences} singleDay={model.singleDay} onPreview={preview} />)}
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- 02 · conveyor & soldering

function Bars({ rows, render, height = 200, minColumnWidth = 36, label }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ overflowX: 'auto', marginTop: 16, maxWidth: '100%' }}>
    <div style={{ height, width: '100%', minWidth: rows.length * minColumnWidth + Math.max(0, rows.length - 1) * 10, display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, alignItems: 'end', gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          {render(r, i)}
          <span title={r.tooltipLabel} style={{ ...mono, fontSize: 10, color: 'var(--tx3)', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.label}{r.labelDetail && <span style={{ display: 'block', fontSize: 9 }}>{r.labelDetail}</span>}</span>
        </div>
      ))}
    </div>
    </div>
  );
}

function InfoHint({ title, lines }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  const tooltipId = `solder-info-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 296)),
    });
  }, [open]);

  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, padding: 0, color: 'var(--tx3)', background: 'transparent', border: 'none', borderRadius: '50%',  }}
      >
        <Info size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && position && createPortal(
        <div id={tooltipId} role="tooltip" style={{ position: 'fixed', zIndex: 90, top: position.top, left: position.left, width: 272, maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, background: 'var(--bg1solid)', border: '1px solid var(--bd2)', boxShadow: '0 10px 24px rgba(0,0,0,.18)', pointerEvents: 'none' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx)' }}>{title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 5 }}>
            {lines.map((line) => <div key={line} style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--tx)' }}>{line}</div>)}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

function ChartTitle({ title, lines }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{title}<InfoHint title={title} lines={lines} /></span>;
}

function SolderSection({ s }) {
  const [jointHover, setJointHover] = useState(null);
  const has = s.sum.hasThroughput;
  const chart = s.chart;
  const chartRows = chart.rows;
  const panelTitle = `Panels counted per ${chart.unit}`;
  const jointTitle = `Solder joints per ${chart.unit}`;
  const chartScope = `${s._id}:${chart.scope}:${chart.unit}`;
  const averagePeriods = chart.unit === 'hour' ? chartRows.filter(row => row.panels).length : chartRows.length;
  const axisWidth = Math.max(0, ...chartRows.map(row => Math.max(row.label.length * 6, (row.labelDetail || '').length * 6) + 12));
  const pMax = Math.max(1, ...chartRows.map((r) => r.panels));
  const jMax = Math.max(1, ...chartRows.flatMap((r) => r.ops.map((o) => o.joints)));
  const panelColumnWidth = Math.max(36, axisWidth, ...chartRows.map(row => String(row.panels).length * 7 + 12));
  const jointColumnWidth = Math.max(52, axisWidth, s.ops.length * 10 + Math.max(0, s.ops.length - 1) * 3 + 8,
    ...chartRows.map(row => String(row.missedJoints || 0).length * 6 + 12));
  const hoverHour = jointHover?.scope === chartScope ? chartRows.find(row => row.key === jointHover.bucket) : null;
  const hoverOperator = jointHover?.operator == null ? null : s.ops[jointHover.operator];
  const hoverCounts = hoverOperator ? hoverHour?.ops[hoverOperator.i] : null;
  const tooltipId = `solder-joints-${s._id}-tooltip`;
  return (
    <>
      <SectionHead n="02" color="#a855f7" title="Conveyor Count & Soldering Activity" sub={`${s.pointsPerPanel} solder joints required per panel · workers share the work`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16 }}>
        <Panel>
          <PanelHead
            title={<ChartTitle title={panelTitle} lines={[
              `Displays the number of panels processed at this station for each recorded ${chart.unit} in the selected date range.`,
              `Each bar represents one recorded ${chart.unit}. Periods with no activity are not shown.`,
              `The value above each bar is the panel count. The average uses the displayed ${chart.unit} periods.`,
            ]} />}
            right={has && <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>AVG {(s.sum.panels / Math.max(1, averagePeriods)).toFixed(1)} / {chart.unit === 'hour' ? 'HR' : chart.unit === 'week' ? 'WK' : chart.unit === 'month' ? 'MO' : 'YR'}</span>}
          />
          {!has ? <NoPeriodData /> : (
            <Bars rows={chartRows} label={`${panelTitle} chart`} minColumnWidth={panelColumnWidth} render={(r) => (
              <>
                <span title={`${r.tooltipLabel}: ${r.panels} panels`} style={{ ...mono, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.panels}</span>
                <div style={{ width: '100%', maxWidth: 46, height: `${(r.panels / pMax) * 82}%`, borderRadius: '7px 7px 3px 3px', background: 'linear-gradient(180deg, #22d3ee, #0e7490)' }} />
              </>
            )} />
          )}
        </Panel>
        <Panel style={{ position: 'relative' }}>
          <PanelHead title={<ChartTitle title={jointTitle} lines={[
            `Displays completed solder joints for each operator during every recorded ${chart.unit} in the selected date range.`,
            `Each coloured bar represents an operator. The red value above a group shows the total missed joints across all workers for that ${chart.unit}.`,
            `Only ${chart.unit} periods with recorded activity are shown. Hover or focus a bar to view its operator and period details.`,
          ]} />} right={(
            <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12, ...mono, fontSize: 10, color: 'var(--tx3)' }}>
              {s.ops.map((o) => <span key={o.i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: o.color }} />{o.code}</span>)}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: BAD }} />MISSED</span>
            </span>
          )} />
          {!has ? <NoPeriodData /> : (
            <Bars rows={chartRows} label={`${jointTitle} chart`} minColumnWidth={jointColumnWidth} render={(r) => (
              <div onMouseEnter={event => setJointHover({ scope: chartScope, bucket: r.key, operator: null, anchor: event.currentTarget })} onMouseLeave={() => setJointHover(null)} style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 30, flexShrink: 0, textAlign: 'center', color: BAD, ...mono, fontSize: 10, lineHeight: '12px', whiteSpace: 'nowrap' }}>
                  {r.missedJoints > 0 && <><span style={{ display: 'block' }}>{r.missedJoints}</span><span style={{ display: 'block' }}>missed</span></>}
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
                {r.ops.map((o, i) => (
                  <button key={i} type="button" aria-label={`${s.ops[i].code} · ${s.ops[i].zone}: ${o.joints} soldered joints during ${r.tooltipLabel}`} aria-describedby={jointHover?.scope === chartScope && jointHover.bucket === r.key && jointHover.operator === i ? tooltipId : undefined}
                    onMouseEnter={event => setJointHover({ scope: chartScope, bucket: r.key, operator: i, anchor: event.currentTarget })} onMouseLeave={event => setJointHover({ scope: chartScope, bucket: r.key, operator: null, anchor: event.currentTarget.parentElement.parentElement })}
                    onFocus={event => setJointHover({ scope: chartScope, bucket: r.key, operator: i, anchor: event.currentTarget })} onBlur={() => setJointHover(null)} onClick={event => setJointHover({ scope: chartScope, bucket: r.key, operator: i, anchor: event.currentTarget })}
                    onKeyDown={event => { if (event.key === 'Escape') setJointHover(null); }}
                    style={{ position: 'relative', flex: 1, maxWidth: 22, minHeight: 4, height: `${(o.joints / jMax) * 100}%`, padding: 0, border: 'none', cursor: 'pointer', borderRadius: '5px 5px 2px 2px', background: `linear-gradient(180deg, ${opColor(i)}, ${opColor(i)}66)` }} />
                ))}
                </div>
              </div>
            )} />
          )}
          {hoverHour && <ChartTooltip anchor={jointHover.anchor} id={tooltipId}>
            <strong>{hoverOperator ? `${hoverOperator.code} · ${hoverOperator.zone}` : 'All workers'}</strong>
            <div style={{ color: 'var(--tx3)', ...mono }}>{hoverHour.tooltipLabel}</div>
            <div>Soldered joints: <strong>{hoverCounts ? hoverCounts.joints : hoverHour.ops.reduce((sum, operator) => sum + operator.joints, 0)}</strong></div>
            <div style={{ color: BAD }}>Missed joints (all workers): <strong>{hoverHour.missedJoints ?? 0}</strong></div>
          </ChartTooltip>}
        </Panel>
      </div>

      <MissedSolderAlerts station={s} />
    </>
  );
}

// ---------------------------------------------------------------- 03 · hour by hour

function HourSection({ s, model, range }) {
  const sorting = useTableSort(s.hourly, JSON.stringify([s._id, range?.startDate, range?.endDate]), (row, key) => {
    if (key === 'Hour') return Number(row.h);
    if (key === 'Panels') return row.panels;
    if (key === 'Completed joints') return row.completedJoints;
    if (key === 'Missed joints') return row.missedJoints;
    return row.ops[s.ops.findIndex(operator => `${operator.code} joints` === key)]?.joints;
  });
  const pagination = useSolderPagination(sorting.rows, JSON.stringify([s._id, range?.startDate, range?.endDate, sorting.resetKey]));
  const rangeLabel = (h) => `${h}:00-${String(Number(h) + 1).padStart(2, '0')}:00`;
  const exportHourly = () => downloadXlsx(
    sortRows(buildSolderReportRows('hourly', s), sorting.sort),
    `solder-line_${s.name}_hourly_${model.isToday ? 'today' : 'range'}`,
  );
  const exportHourlyPdf = () => downloadPdf({
    title: 'Hourly activity log',
    subtitle: [s.name, range?.startDate, range?.endDate].filter(Boolean).join(' | '),
    rows: [
      ...sortRows(buildSolderReportRows('hourly', s), sorting.sort),
      {
        Hour: 'TOTAL', Panels: s.sum.panels,
        'Completed joints': s.sum.joints, 'Missed joints': s.sum.missed,
        ...Object.fromEntries(s.ops.map(operator => [`${operator.code} joints`, operator.joints])),
      },
    ],
    filename: `solder-line_${s.name}_hourly_${model.isToday ? 'today' : 'range'}`,
  });
  if (!s.sum.hasThroughput) return <Panel><NoPeriodData /></Panel>;
  return (
    <Panel pad={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--bd)' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Hourly activity log</span>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Panel counts, completed joints and missed joints per hour</span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <DownloadButton disabled={!s.hourly.length} action={exportHourlyPdf} description="hourly PDF report" style={btnGhost}>PDF</DownloadButton>
          <DownloadButton disabled={!s.hourly.length} action={exportHourly} description="hourly Excel report" style={btnGhost}>XLSX</DownloadButton>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', ...mono, fontSize: 12 }}>
          <thead>
            <tr style={{ fontSize: 9, letterSpacing: '.07em', color: 'var(--tx3)', textAlign: 'left' }}>
              {['Hour', 'Panels', 'Completed joints', 'Missed joints'].map(column => <th key={column} scope="col" aria-sort={sorting.directionFor(column)} style={th}><SortButton column={column} sorting={sorting}>{column.toUpperCase()}</SortButton></th>)}
              {s.ops.map(operator => <th key={operator.i} scope="col" aria-sort={sorting.directionFor(`${operator.code} joints`)} style={{ ...th, color: operator.color }}><SortButton column={`${operator.code} joints`} sorting={sorting}>{operator.code} JOINTS</SortButton></th>)}
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map(row => (
              <tr key={row.h} style={{ borderTop: '1px solid var(--bd)' }}>
                <td style={td}>{rangeLabel(row.h)}</td><td style={{ ...td, fontWeight: 700 }}>{row.panels}</td>
                <td style={td}>{row.completedJoints}</td><td style={{ ...td, color: BAD }}>{row.missedJoints}</td>
                {row.ops.map((operator, index) => <td key={index} style={td}>{operator.joints}</td>)}
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--bd)', background: 'var(--bg2)', fontWeight: 700 }}>
              <td style={td}>TOTAL</td><td style={td}>{s.sum.panels}</td>
              <td style={td}>{s.sum.joints}</td><td style={{ ...td, color: BAD }}>{s.sum.missed}</td>
              {s.ops.map(operator => <td key={operator.i} style={td}>{operator.joints}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ padding: '0 18px' }}><SolderPagination pagination={pagination} label="Hourly activity log" /></div>
    </Panel>
  );
}

const th = { padding: '9px 10px', fontWeight: 500 };
const td = { padding: '9px 10px' };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #a855f7)' };
const btnGhost = { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--tx2)', cursor: 'pointer', border: '1px solid var(--bd2)', background: 'var(--bg2)' };

// ---------------------------------------------------------------- page

export default function Overview({ model, onOpenLogs, selected, onSelect, range }) {
  const [openId, setOpenId] = useState(null);
  if (!model.stations.length) {
    return (
      <Panel>
        <Waiting title="No solder-line cameras yet" minH={240}>
          Turn on the Desk Solar Shoulder detection for a camera under Configure ▸ Detections and draw one zone per operator desk.
        </Waiting>
      </Panel>
    );
  }
  const s = model.stations[Math.min(selected, model.stations.length - 1)];
  const absentOp = s.ops.find((o) => o.absentNow);
  return (
    <>
      {absentOp && model.isToday && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 12, background: 'linear-gradient(90deg, rgba(255,77,77,.2), rgba(255,77,77,.04) 70%)', border: `1px solid ${BAD}59` }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: BAD, animation: 'vq-blink .9s ease-in-out infinite' }} />
          <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: '#ff6b6b' }}>ABSENCE ALERT</span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>{absentOp.zone} desk empty on {s.name}</span>
        </div>
      )}
      <AbsenceSection s={s} model={model} onOpenLogs={onOpenLogs} preview={setOpenId} range={range} />
      <SolderSection s={s} />
      <HourSection s={s} model={model} range={range} />
      <SnapshotPreview items={[...s.absences, ...s.missed]} openId={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
