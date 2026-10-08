import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dur } from './solderLineData';
import { BAD, OK, WARN, CY, mono, label, Kpi, KpiGrid, OpBadge, Chip, fmt } from './ui';

const stationStatus = (station) => {
  if (station.sum.absentNow) return BAD;
  const lastHour = station.hourly[station.hourly.length - 1];
  return lastHour?.ops.some((operator) => operator.missed) ? WARN : OK;
};

export default function SolderSummary({ model, selected, onSelect }) {
  const { line, stations } = model;
  if (!stations.length) return null;

  const index = Math.min(selected, stations.length - 1);
  const station = stations[index];
  const totals = station.sum;
  const worst = [...stations].sort((a, b) => b.sum.missed - a.sum.missed)[0];
  const fastest = stations.filter((s) => s.sum.avgJoint != null).sort((a, b) => a.sum.avgJoint - b.sum.avgJoint)[0];
  const step = (amount) => onSelect((index + amount + stations.length) % stations.length);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...label, fontWeight: 700 }}>Line · all camera stations</span>
        <span style={{ ...mono, fontSize: 10, color: 'var(--tx3)' }}>{stations.length} STATIONS · {line.operators} OPERATORS</span>
        <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
      </div>
      <KpiGrid>
        <Kpi label="Panels · line" value={line.hasThroughput ? line.panels.toLocaleString('en-IN') : '—'} sub={`${stations.length} stations`} color={CY} />
        <Kpi label="Coverage · line" value={fmt(line.coverage, 2)} unit={line.coverage != null ? '%' : ''} sub={line.hasThroughput ? `${line.joints.toLocaleString('en-IN')} joints done` : 'Waiting for panel data'} color={OK} valueColor={OK} />
        <Kpi label="Missed · line" value={line.missed} sub={worst?.sum.missed ? `Most at ${worst.name} (${worst.sum.missed})` : 'No missed points'} color={BAD} valueColor={BAD} />
        <Kpi label="Absence alerts" value={line.absences} sub={`${line.absentNow} desk${line.absentNow === 1 ? '' : 's'} empty right now`} color={WARN} valueColor={WARN} />
        <Kpi label="Unavailable time" value={dur(line.away)} sub={`All ${line.operators} operators`} color="#a855f7" />
        <Kpi label="Avg / joint · line" value={fmt(line.avgJoint, 2)} unit={line.avgJoint != null ? 's' : ''} sub={fastest ? `Fastest ${fastest.name} · ${fastest.sum.avgJoint.toFixed(2)} s` : 'Waiting for panel data'} color="#94a3b8" />
        <Kpi label="At desk now" value={`${line.operators - line.absentNow} / ${line.operators}`} sub="Operators present on line" color={OK} />
      </KpiGrid>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, background: 'linear-gradient(90deg, rgba(59,130,246,.16), rgba(168,85,247,.07) 55%, transparent)', border: '1px solid rgba(59,130,246,.38)' }}>
        {stations.length > 1 && <button type="button" aria-label="Previous station" onClick={() => step(-1)} style={arrowStyle}><ChevronLeft size={15} /></button>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ ...label, fontSize: 9 }}>Viewing station</span>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{station.name} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)' }}>{station.nvrName}</span></span>
        </div>
        <span style={{ width: 1, height: 34, background: 'var(--bd2)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {station.ops.map((operator) => <span key={operator.i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><OpBadge op={operator.i} /><span style={{ fontWeight: 600 }}>{operator.zone}</span></span>)}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {stations.map((item, i) => <Chip key={item._id} on={i === index} color="linear-gradient(135deg, #3b82f6, #a855f7)" onClick={() => onSelect(i)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: stationStatus(item) }} />{item.name}</Chip>)}
        </div>
        {stations.length > 1 && <button type="button" aria-label="Next station" onClick={() => step(1)} style={arrowStyle}><ChevronRight size={15} /></button>}
      </div>
      <KpiGrid>
        <Kpi label="Panels counted" value={totals.hasThroughput ? totals.panels.toLocaleString('en-IN') : '—'} sub="Conveyor count" color={CY} />
        <Kpi label="Solder joints" value={totals.hasThroughput ? totals.joints.toLocaleString('en-IN') : '—'} unit={totals.hasThroughput ? `/ ${(totals.panels * station.pointsPerPanel).toLocaleString('en-IN')}` : ''} sub={`${station.pointsPerPanel} points per panel`} color="#3b82f6" />
        <Kpi label="Coverage" value={fmt(totals.coverage, 2)} unit={totals.coverage != null ? '%' : ''} sub="Joints done ÷ joints required" color={OK} valueColor={OK} />
        <Kpi label="Missed solders" value={totals.missed} sub={station.ops.map((o) => `${o.code} ${o.missed}`).join(' · ')} color={BAD} valueColor={BAD} />
        <Kpi label="Absence alerts" value={totals.absences} sub={station.ops.map((o) => `${o.code} ${o.alerts}`).join(' · ')} color={WARN} valueColor={WARN} />
        <Kpi label="Unavailable time" value={dur(totals.away)} sub="All desks combined" color="#a855f7" />
        <Kpi label="Avg / joint" value={fmt(totals.avgJoint, 2)} unit={totals.avgJoint != null ? 's' : ''} sub={station.ops.map((o) => `${o.code} ${fmt(o.avgJoint, 2)}`).join(' · ')} color="#94a3b8" />
      </KpiGrid>
    </>
  );
}

const arrowStyle = { width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)', border: '1px solid var(--bd2)', background: 'var(--bg2)' };
