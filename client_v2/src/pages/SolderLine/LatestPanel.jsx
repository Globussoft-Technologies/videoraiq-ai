import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X, Minus, ImageOff, LoaderCircle, Maximize2, RotateCcw } from 'lucide-react';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import { mediaUrl } from '@/lib/format';
import { buildLatestPanelState, pointReplayPhase } from './latestPanelState.js';

const buttonStyle = { width: 30, height: 30, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx2)', cursor: 'pointer' };

function PanelSnapshot({ image, panelId }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--bd)', display: 'grid', placeItems: 'center' }}>
        {image && !failed ? (
          <a href={image} target="_blank" rel="noreferrer" title="Open latest panel snapshot" style={{ display: 'block', width: '100%', height: '100%' }}>
            <img src={image} alt={`Latest panel ${panelId} snapshot`} onError={() => setFailed(true)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
          </a>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--tx3)', fontSize: 11 }}><ImageOff size={24} />{failed ? 'Snapshot could not be loaded' : 'No snapshot for this panel'}</div>
        )}
      </div>
      <div style={{ marginTop: 6, color: 'var(--tx3)', fontSize: 10 }}>Latest event snapshot · {panelId}</div>
    </div>
  );
}

function PanelResults({ panel, state, expanded = false }) {
  const { zones, done, total, complete } = state;
  const [replay, setReplay] = useState(0);
  const [playback, setPlayback] = useState({ key: state.animationKey, replay: 0, step: 0 });
  const step = playback.key === state.animationKey && playback.replay === replay ? playback.step : 0;
  const progress = total ? step / total * 100 : 0;
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPlayback({ key: state.animationKey, replay, step: reduceMotion ? total : 0 });
    if (reduceMotion || !total) return undefined;
    let revealed = 0;
    const timer = setInterval(() => {
      revealed += 1;
      setPlayback({ key: state.animationKey, replay, step: revealed });
      if (revealed >= total) clearInterval(timer);
    }, 700);
    return () => clearInterval(timer);
  }, [state.animationKey, total, replay]);
  return (
    <section aria-label="Latest panel event" style={{ padding: expanded ? 22 : 14, containerType: 'inline-size' }}>
      <style>{`
        @keyframes solder-event-enter { 0% { opacity: 0; transform: translateY(12px) scale(.82); } 70% { opacity: 1; transform: translateY(-2px) scale(1.03); } 100% { opacity: 1; transform: none; } }
        @keyframes solder-count-enter { 0% { opacity: 0; transform: scale(.4); } 70% { opacity: 1; transform: scale(1.15); } 100% { opacity: 1; transform: scale(1); } }
        .solder-event-tile { animation: solder-event-enter .48s ease both; }
        .solder-event-mark { animation: solder-count-enter .35s ease both; }
        @keyframes solder-point-spin { to { transform: rotate(360deg); } }
        @keyframes solder-point-pulse { 50% { box-shadow: 0 0 0 4px rgba(6,182,212,.14); } }
        .solder-point-spinner { animation: solder-point-spin .8s linear infinite; }
        .solder-point-processing { animation: solder-point-pulse .8s ease infinite; }
        .solder-point-pending { opacity: .45; }
        .solder-latest-content { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
        .solder-point-zones { display: grid; aspect-ratio: 16 / 9; gap: 6px; }
        .solder-point-zone { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 4px; min-height: 0; }
        @container (max-width: 580px) { .solder-latest-content { grid-template-columns: minmax(0, 1fr); } .solder-point-zones { aspect-ratio: auto; } .solder-event-tile { min-height: 58px; } }
        @media (prefers-reduced-motion: reduce) { .solder-event-tile, .solder-event-mark, .solder-point-spinner, .solder-point-processing { animation: none !important; } .solder-event-progress { transition: none !important; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ color: 'var(--tx)', fontSize: 13 }}>Latest panel event</strong>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx3)', fontSize: 11 }}>{panel.panelId}</span>
        <span style={{ marginLeft: 'auto', color: complete ? 'var(--ok)' : 'var(--warn)', border: '1px solid currentColor', borderRadius: 5, padding: '3px 7px', fontSize: 10, fontWeight: 700 }}>{done}/{total} {complete ? 'COMPLETE' : 'COMPLETED'}</span>
        <button type="button" onClick={() => setReplay(value => value + 1)} style={buttonStyle} title="Replay point animation" aria-label="Replay point animation"><RotateCcw size={15} /></button>
        {expanded ? (
          <Dialog.Close asChild><button type="button" style={buttonStyle} title="Close latest panel view" aria-label="Close latest panel view"><X size={17} /></button></Dialog.Close>
        ) : (
          <Dialog.Trigger asChild><button type="button" style={buttonStyle} title="Maximize latest panel event" aria-label="Maximize latest panel event"><Maximize2 size={15} /></button></Dialog.Trigger>
        )}
      </div>
      <div className="solder-latest-content">
      <PanelSnapshot key={panel.Image || String(panel._id)} image={panel.Image ? mediaUrl(panel.Image) : ''} panelId={panel.panelId} />
      <div style={{ minWidth: 0 }}>
      <div className="solder-point-zones" style={{ gridTemplateRows: `repeat(${zones.length}, minmax(0, 1fr))`, minHeight: zones.length * 72 }}>
        {zones.map((zone, zoneIndex) => (
          <div key={`${zone.name}-${zoneIndex}`} className="solder-point-zone">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
              <span style={{ background: zoneIndex % 2 ? '#a855f7' : '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>OP-{zoneIndex + 1}</span>
              <span style={{ color: 'var(--tx2)' }}>{zone.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{zone.done ?? '—'}/{zone.expected}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, zone.expected)}, minmax(0, 1fr))`, gap: 6, minHeight: 0 }}>
              {zone.points.map(pointState => {
                const phase = pointReplayPhase(pointState, step);
                const finished = phase === 'completed';
                const missed = phase === 'missed';
                const processing = phase === 'processing';
                const colored = finished || missed || processing;
                const point = pointState.index + 1;
                const color = finished ? '#00bf72' : missed ? '#ef4444' : processing ? '#06b6d4' : 'var(--tx3)';
                const text = finished ? 'Completed' : missed ? 'Not completed' : processing ? 'Processing' : phase === 'pending' ? 'Waiting' : 'Unknown';
                return (
                  <div key={`${state.animationKey}-${replay}-${point}-${phase}`} className={`solder-event-tile ${phase === 'pending' ? 'solder-point-pending' : ''}`} aria-label={`P${point}: ${text}`} data-point={`P${point}`} data-state={phase} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '5px 4px', borderRadius: 8, border: `1px solid ${colored ? `${color}70` : 'var(--bd)'}`, background: finished ? 'rgba(0,191,114,.09)' : missed ? 'rgba(239,68,68,.09)' : processing ? 'rgba(6,182,212,.1)' : 'var(--bg2)' }}>
                    <span className={processing ? 'solder-point-processing' : 'solder-event-mark'} style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: colored ? color : 'var(--bg1)', color: colored ? '#fff' : color, boxShadow: colored ? `0 0 12px ${color}50` : 'none' }}>{finished ? <Check size={14} strokeWidth={3} /> : missed ? <X size={14} strokeWidth={3} /> : processing ? <LoaderCircle className="solder-point-spinner" size={14} /> : <Minus size={14} />}</span>
                    <strong style={{ color: 'var(--tx)', fontSize: 11, lineHeight: 1.2 }}>P{point}</strong>
                    <span style={{ color, fontSize: 9, lineHeight: 1.2 }}>{text}</span>
                  </div>
                );
              })}
              {!zone.points.length && <span style={{ fontSize: 10, color: 'var(--tx3)', alignSelf: 'center' }}>No points assigned</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 5, marginTop: 6, borderRadius: 5, overflow: 'hidden', background: 'var(--track)' }}><div className="solder-event-progress" style={{ height: '100%', width: `${progress}%`, transition: 'width .6s ease', background: 'linear-gradient(90deg, #22d3ee, #6366f1)' }} /></div>
      </div>
      </div>
      <div style={{ marginTop: 7, color: 'var(--tx3)', fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{step < total ? 'Replaying panel results' : 'Panel results'}</span>
        <time dateTime={panel.time || panel.timeOfIncident}>{formatUtcInConfiguredTimezone(panel.time || panel.timeOfIncident, 'DD MMM HH:mm:ss', '—')}</time>
      </div>
    </section>
  );
}

export default function LatestPanel({ panel, pointsPerZone }) {
  const [expanded, setExpanded] = useState(false);
  const state = useMemo(() => buildLatestPanelState(panel, pointsPerZone), [panel, pointsPerZone]);
  if (!state) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>Waiting for the latest panel event in this date range.</div>;
  return (
    <Dialog.Root open={expanded} onOpenChange={setExpanded}>
      <PanelResults panel={panel} state={state} />
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(1440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', zIndex: 10001, background: 'var(--bg1solid)', border: '1px solid var(--bd)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
          <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Latest panel event — {panel.panelId}</Dialog.Title>
          <PanelResults panel={panel} state={state} expanded />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
