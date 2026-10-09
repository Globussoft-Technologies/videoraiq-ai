import { useMemo, useState } from 'react';
import { ImageOff, LayoutGrid, List, Maximize } from 'lucide-react';
import { mediaUrl } from '@/lib/format';
import { clock, dur } from './solderLineData';
import { BAD, WARN, mono, label, Panel, OpBadge, StatusPill, Chip, Waiting, SnapshotPreview } from './ui';
import { downloadPdf, downloadXlsx } from './exports';
import { downloadSnapshot, downloadSnapshotsZip } from './snapshots';
import DownloadButton from './DownloadButton';
import SolderPagination, { useSolderPagination } from './SolderPagination';

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
      {r.image ? (
        <button type="button" onClick={onOpen} aria-label={`Open snapshot for ${r.id}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in' }}>
          <img src={mediaUrl(r.image)} alt={`Snapshot for ${r.id}`} loading="lazy" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#94a3b8', fontSize: 11 }}><ImageOff size={20} />No snapshot available</div>
      )}
      <button type="button" disabled={!r.image} onClick={onOpen} aria-label={`Maximize snapshot for ${r.id}`} title={r.image ? 'Maximize image' : 'No snapshot available'} style={{ position: 'absolute', zIndex: 2, top: 8, right: 8, width: 30, height: 30, display: 'grid', placeItems: 'center', color: '#fff', background: 'rgba(6,8,13,.8)', border: '1px solid #ffffff40', borderRadius: 5, cursor: r.image ? 'pointer' : 'not-allowed', opacity: r.image ? 1 : 0.45 }}><Maximize size={16} /></button>
    </div>
  );
}

function ImageDownload({ row, style }) {
  return <DownloadButton disabled={!row.image} action={() => downloadSnapshot(row)} description="image" title={row.image ? 'Download this image' : 'No snapshot available'} aria-label={`Download image for ${row.id}`} style={style}>Image</DownloadButton>;
}

const status = (r) => (r.type === 'missed' ? <StatusPill text="LOGGED" color={WARN} /> : <StatusPill active={r.active} />);

export default function AlertLogs({ model, rows, range }) {
  const [type, setType] = useState('all');
  const [op, setOp] = useState('all');
  const [grid, setGrid] = useState(true);
  const [openId, setOpenId] = useState(null);

  const opCodes = useMemo(() => [...new Set(rows.map((r) => r.opCode))].sort(), [rows]);
  const shown = rows.filter((r) => (type === 'all' || r.type === type)
    && (op === 'all' || r.opCode === op));
  const pagination = useSolderPagination(shown, JSON.stringify([type, op, range?.startDate, range?.endDate]));
  const { pageRows } = pagination;
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
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--tx3)' }}>{shown.length} FILTERED</span>
          <Chip on={!grid} color="var(--blue)" onClick={() => setGrid(false)}><List size={13} />List</Chip>
          <Chip on={grid} color="var(--blue)" onClick={() => setGrid(true)}><LayoutGrid size={13} />Grid</Chip>
          <DownloadButton disabled={!shown.some((r) => r.image)} action={() => downloadSnapshotsZip(shown)} description="snapshots ZIP" title="Download all filtered snapshots as ZIP" style={{ ...mono, fontSize: 10.5, fontWeight: 700 }}>SNAPSHOTS .ZIP</DownloadButton>
          <DownloadButton disabled={!shown.length} action={() => downloadXlsx(exportRows(), fileName)} description="Excel report">XLSX</DownloadButton>
          <DownloadButton disabled={!shown.length} action={() => downloadPdf({ title: 'Solder Alert Logs', subtitle: `${shown.length} alerts`, rows: exportRows(), filename: fileName })} description="PDF report">PDF</DownloadButton>
        </span>
      </Panel>

      {!shown.length ? (
        <Panel><Waiting title="No alerts" minH={200}>No absence or missed-solder alerts match these filters in this date range.</Waiting></Panel>
      ) : grid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {pageRows.map((r) => {
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
                    <ImageDownload row={r} style={{ marginLeft: 'auto' }} />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1170 }}>
              {[null, ...pageRows].map((r) => {
                const cols = { display: 'grid', gridTemplateColumns: '168px 76px 116px 90px 110px minmax(0, 1fr) 92px 96px 118px', gap: 12, padding: '10px 18px', alignItems: 'center', borderBottom: '1px solid var(--bd)' };
                if (!r) {
                  return (
                    <div key="head" style={{ ...cols, ...mono, fontSize: 9, letterSpacing: '.08em', color: 'var(--tx3)' }}>
                      <span>SNAPSHOT</span><span>ALERT</span><span>TYPE</span><span>OPERATOR</span><span>TIME</span><span>DETAIL</span><span>METRIC</span><span>STATUS</span><span>DOWNLOAD IMAGE</span>
                    </div>
                  );
                }
                const d = describe(r);
                return (
                  <div key={r._id} style={{ ...cols, fontSize: 12.5 }}>
                    <Thumb r={r} width={168} onOpen={() => setOpenId(r._id)} />
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
                    <ImageDownload row={r} style={{ justifySelf: 'start' }} />
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
      <SolderPagination pagination={pagination} label="Solder Alert Logs" />
      <SnapshotPreview items={pageRows} openId={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />
    </>
  );
}
