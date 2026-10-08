import { useMemo, useState } from 'react';
import { Download, LayoutGrid, List } from 'lucide-react';
import { mediaUrl } from '@/lib/format';
import { clock, dur } from './solderLineData';
import { BAD, WARN, mono, label, Panel, OpBadge, StatusPill, Chip, Waiting, SnapshotPreview } from './ui';
import { downloadPdf, downloadXlsx } from './exports';

const TYPE_META = {
  absence: { label: 'ABSENCE', color: WARN },
  missed: { label: 'MISSED SOLDER', color: BAD },
};

const describe = (r) => (r.type === 'absence'
  ? { title: `${r.zone} desk empty — ${r.opCode} away`, detail: [r.description, `returned ${clock(r.end)}`].filter(Boolean).join(' · '), metric: `${dur(r.durSec)}${r.active ? ' +' : ''}`, metricLabel: 'DURATION' }
  : { title: `Point P${r.point ?? '?'} not soldered${r.panelId ? ` · ${r.panelId}` : ''}`, detail: r.zone, metric: `P${r.point ?? '?'}`, metricLabel: 'POINT' });

function TypeTag({ type, style }) {
  const m = TYPE_META[type];
  return <span style={{ ...mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', whiteSpace: 'nowrap', justifySelf: 'start', padding: '3px 8px', borderRadius: 5, color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}73`, ...style }}>{m.label}</span>;
}

function Thumb({ r, onOpen, ratio = '16 / 9', width }) {
  return (
    <div style={{ position: 'relative', width, aspectRatio: ratio, borderRadius: 7, overflow: 'hidden', background: '#0a0e15', border: '1px solid var(--bd2)' }}>
      {r.image && <img src={mediaUrl(r.image)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {r.image && <button type="button" onClick={onOpen} title="View full screen" style={{ position: 'absolute', inset: 0, background: 'none', border: 'none', cursor: 'zoom-in' }} />}
    </div>
  );
}

const status = (r) => (r.type === 'missed' ? <StatusPill text="LOGGED" color={WARN} /> : <StatusPill active={r.active} />);

export default function AlertLogs({ model, rows }) {
  const [type, setType] = useState('all');
  const [op, setOp] = useState('all');
  const [station, setStation] = useState('all');
  const [grid, setGrid] = useState(false);
  const [openId, setOpenId] = useState(null);

  const opCodes = useMemo(() => [...new Set(rows.map((r) => r.opCode))].sort(), [rows]);
  const shown = rows.filter((r) => (type === 'all' || r.type === type)
    && (op === 'all' || r.opCode === op)
    && (station === 'all' || r.station._id === station));
  const when = (m) => (model.singleDay ? clock(m) : m.format('DD MMM HH:mm:ss'));

  const exportRows = () => shown.map((r) => {
    const d = describe(r);
    return {
      Alert: r.id, Type: TYPE_META[r.type].label, Station: r.station.name, Operator: `${r.opCode} · ${r.zone}`,
      Time: r.start.format('YYYY-MM-DD HH:mm:ss'), Detail: `${d.title}${d.detail ? ` — ${d.detail}` : ''}`,
      [d.metricLabel === 'DURATION' ? 'Duration' : 'Point']: d.metric,
      Status: r.type === 'missed' ? 'LOGGED' : r.active ? 'ACTIVE' : 'RESOLVED',
      Snapshot: r.image ? mediaUrl(r.image) : '',
    };
  });
  const fileName = `solder-alerts_${shown[0]?.start.format('YYYY-MM-DD') || 'empty'}`;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 20 }}>Solder Alert Logs</span>
        <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Every absence and missed-solder alert, with the camera snapshot taken at that moment</span>
      </div>

      <Panel style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 14px' }}>
        <span style={label}>Type</span>
        {[['all', 'ALL', '#475569'], ['absence', 'ABSENCE', '#b45309'], ['missed', 'MISSED SOLDER', '#dc2626']].map(([v, l, c]) => (
          <Chip key={v} on={type === v} color={c} onClick={() => setType(v)}>
            {l}<span style={{ opacity: 0.7 }}>{rows.filter((r) => v === 'all' || r.type === v).length}</span>
          </Chip>
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--bd2)', margin: '0 4px' }} />
        <span style={label}>Operator</span>
        <Chip on={op === 'all'} onClick={() => setOp('all')}>ALL</Chip>
        {opCodes.map((c) => <Chip key={c} on={op === c} color="var(--blue)" onClick={() => setOp(c)}>{c}</Chip>)}
        {model.stations.length > 1 && (
          <>
            <span style={{ width: 1, height: 22, background: 'var(--bd2)', margin: '0 4px' }} />
            <span style={label}>Station</span>
            <Chip on={station === 'all'} onClick={() => setStation('all')}>ALL</Chip>
            {model.stations.map((s) => <Chip key={s._id} on={station === s._id} color="var(--violet)" onClick={() => setStation(s._id)}>{s.name}</Chip>)}
          </>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{shown.length} SHOWN</span>
          <Chip on={!grid} color="var(--blue)" onClick={() => setGrid(false)}><List size={13} />List</Chip>
          <Chip on={grid} color="var(--blue)" onClick={() => setGrid(true)}><LayoutGrid size={13} />Grid</Chip>
          <Chip onClick={() => downloadXlsx(exportRows(), fileName)}>XLSX</Chip>
          <Chip onClick={() => downloadPdf({ title: 'Solder Alert Logs', subtitle: `${shown.length} alerts`, rows: exportRows(), filename: fileName })}>PDF</Chip>
        </span>
      </Panel>

      {!shown.length ? (
        <Panel><Waiting title="No alerts" minH={200}>No absence or missed-solder alerts match these filters in this date range.</Waiting></Panel>
      ) : grid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {shown.map((r) => {
            const d = describe(r);
            return (
              <Panel key={r._id} pad={false} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative' }}>
                  <Thumb r={r} onOpen={() => setOpenId(r._id)} />
                  <TypeTag type={r.type} style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(6,8,13,.78)' }} />
                  <span style={{ position: 'absolute', right: 8, bottom: 8, ...mono, fontSize: 10, color: '#fff', background: 'rgba(6,8,13,.76)', borderRadius: 5, padding: '3px 7px' }}>{when(r.start)}</span>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <OpBadge op={r.op} code={r.opCode} />
                    <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{r.station.name} · {r.id}</span>
                    <span style={{ marginLeft: 'auto' }}>{status(r)}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{d.detail}</div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
                    <span style={{ ...label, fontSize: 9 }}>{d.metricLabel}</span>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{d.metric}</span>
                    {r.image && <a href={mediaUrl(r.image)} target="_blank" rel="noreferrer" title="Open snapshot" style={{ marginLeft: 'auto', color: 'var(--tx2)' }}><Download size={15} /></a>}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1040 }}>
              {[null, ...shown].map((r) => {
                const cols = { display: 'grid', gridTemplateColumns: '132px 76px 116px 90px 110px 110px minmax(0, 1fr) 92px 96px 32px', gap: 12, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--bd)' };
                if (!r) {
                  return (
                    <div key="head" style={{ ...cols, ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>
                      <span>SNAPSHOT</span><span>ALERT</span><span>TYPE</span><span>OPERATOR</span><span>STATION</span><span>TIME</span><span>DETAIL</span><span>METRIC</span><span>STATUS</span><span />
                    </div>
                  );
                }
                const d = describe(r);
                return (
                  <div key={r._id} style={{ ...cols, fontSize: 12.5 }}>
                    <Thumb r={r} width={132} onOpen={() => setOpenId(r._id)} />
                    <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>{r.id}</span>
                    <TypeTag type={r.type} />
                    <OpBadge op={r.op} code={r.opCode} />
                    <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.station.name}</span>
                    <span style={{ ...mono, fontWeight: 600 }}>{when(r.start)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.detail}</span>
                    </span>
                    <span style={{ ...mono, fontWeight: 700 }}>{d.metric}</span>
                    {status(r)}
                    {r.image ? <a href={mediaUrl(r.image)} target="_blank" rel="noreferrer" title="Open snapshot" style={{ color: 'var(--tx2)' }}><Download size={15} /></a> : <span />}
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
      <SnapshotPreview items={shown} openId={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
