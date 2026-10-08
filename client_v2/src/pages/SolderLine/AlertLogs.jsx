import { useMemo, useState } from 'react';
import { Download, ImageOff, LayoutGrid, List, Maximize2 } from 'lucide-react';
import { mediaUrl } from '@/lib/format';
import { clock, dur } from './solderLineData';
import { BAD, WARN, mono, label, Panel, OpBadge, StatusPill, Chip, Waiting, SnapshotPreview } from './ui';
import { downloadPdf, downloadXlsx } from './exports';
import { downloadSnapshot, downloadSnapshotsZip } from './snapshots';

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
      {r.image ? <img src={mediaUrl(r.image)} alt={`Snapshot for ${r.id}`} loading="lazy" onClick={onOpen} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} /> : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#94a3b8', fontSize: 11 }}><ImageOff size={20} />No snapshot available</div>
      )}
      <button type="button" disabled={!r.image} onClick={onOpen} aria-label={`View ${r.id} full screen`} title={r.image ? 'View full screen' : 'No snapshot available'} style={{ position: 'absolute', zIndex: 2, top: 8, right: 8, width: 30, height: 30, display: 'grid', placeItems: 'center', color: '#fff', background: 'rgba(6,8,13,.8)', border: '1px solid #ffffff40', borderRadius: 5, cursor: r.image ? 'pointer' : 'not-allowed', opacity: r.image ? 1 : 0.45 }}><Maximize2 size={16} /></button>
    </div>
  );
}

function ImageDownload({ row, onDownload, busy, style }) {
  const available = Boolean(row.image);
  const buttonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, color: 'var(--tx2)', background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 8, padding: '0 12px', fontSize: 11, cursor: available ? 'pointer' : 'not-allowed', opacity: available ? 1 : 0.45, ...style };
  return (
    <button type="button" disabled={!available || busy} onClick={onDownload} title={available ? 'Download this image' : 'No snapshot available'} aria-label={`Download image for ${row.id}`} style={buttonStyle}><Download size={12} />{busy ? 'Saving…' : 'Image'}</button>
  );
}

const status = (r) => (r.type === 'missed' ? <StatusPill text="LOGGED" color={WARN} /> : <StatusPill active={r.active} />);

export default function AlertLogs({ model, rows }) {
  const [type, setType] = useState('all');
  const [op, setOp] = useState('all');
  const [grid, setGrid] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const [downloading, setDownloading] = useState({});

  const opCodes = useMemo(() => [...new Set(rows.map((r) => r.opCode))].sort(), [rows]);
  const shown = rows.filter((r) => (type === 'all' || r.type === type)
    && (op === 'all' || r.opCode === op));
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
  const runDownload = async (action) => {
    setDownloadError('');
    try { await action(); } catch (error) { setDownloadError(error.message || 'Could not download the snapshot.'); }
  };
  const saveZip = async () => {
    setZipBusy(true);
    try { await runDownload(() => downloadSnapshotsZip(shown)); } finally { setZipBusy(false); }
  };
  const saveImage = async (row) => {
    setDownloading((current) => ({ ...current, [row._id]: true }));
    try { await runDownload(() => downloadSnapshot(row)); } finally {
      setDownloading((current) => ({ ...current, [row._id]: false }));
    }
  };

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
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{shown.length} SHOWN</span>
          <Chip on={!grid} color="var(--blue)" onClick={() => setGrid(false)}><List size={13} />List</Chip>
          <Chip on={grid} color="var(--blue)" onClick={() => setGrid(true)}><LayoutGrid size={13} />Grid</Chip>
          <button type="button" disabled={zipBusy || !shown.some((r) => r.image)} onClick={saveZip} title="Download visible snapshots as ZIP" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, cursor: zipBusy ? 'wait' : 'pointer', color: 'var(--tx2)', background: 'var(--bg2)', border: '1px solid var(--bd2)', opacity: shown.some((r) => r.image) ? 1 : 0.5, ...mono, fontSize: 10.5, fontWeight: 700 }}><Download size={13} />{zipBusy ? 'PREPARING ZIP' : 'SNAPSHOTS .ZIP'}</button>
          <Chip onClick={() => downloadXlsx(exportRows(), fileName)}>XLSX</Chip>
          <Chip onClick={() => downloadPdf({ title: 'Solder Alert Logs', subtitle: `${shown.length} alerts`, rows: exportRows(), filename: fileName })}>PDF</Chip>
        </span>
      </Panel>
      {downloadError && <div role="alert" style={{ color: BAD, fontSize: 12 }}>{downloadError}</div>}

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
                    <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{r.id}</span>
                    <span style={{ marginLeft: 'auto' }}>{status(r)}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{d.detail}</div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
                    <span style={{ ...label, fontSize: 9 }}>{d.metricLabel}</span>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{d.metric}</span>
                    <ImageDownload row={r} onDownload={() => saveImage(r)} busy={downloading[r._id]} style={{ marginLeft: 'auto' }} />
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
                const cols = { display: 'grid', gridTemplateColumns: '168px 76px 116px 90px 110px minmax(0, 1fr) 92px 96px', gap: 12, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--bd)' };
                if (!r) {
                  return (
                    <div key="head" style={{ ...cols, ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>
                      <span>SNAPSHOT / ACTIONS</span><span>ALERT</span><span>TYPE</span><span>OPERATOR</span><span>TIME</span><span>DETAIL</span><span>METRIC</span><span>STATUS</span>
                    </div>
                  );
                }
                const d = describe(r);
                return (
                  <div key={r._id} style={{ ...cols, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <Thumb r={r} width={168} onOpen={() => setOpenId(r._id)} />
                      <ImageDownload row={r} onDownload={() => saveImage(r)} busy={downloading[r._id]} style={{ alignSelf: 'flex-end' }} />
                    </div>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--tx3)' }}>{r.id}</span>
                    <TypeTag type={r.type} />
                    <OpBadge op={r.op} code={r.opCode} />
                    <span style={{ ...mono, fontWeight: 600 }}>{when(r.start)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.detail}</span>
                    </span>
                    <span style={{ ...mono, fontWeight: 700 }}>{d.metric}</span>
                    {status(r)}
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
      <SnapshotPreview items={shown} openId={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} fullscreenOnOpen />
    </>
  );
}
