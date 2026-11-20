import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Cctv, ChevronRight, Download, ImageOff, Layers, LoaderCircle, MapPin, Power, PowerOff, ScanLine, Search, Server, Square, Table2, TriangleAlert, X } from 'lucide-react';

const inventoryMetricIcons = {
  nvrs: Server,
  cameras: Cctv,
  running: Activity,
  stopped: Square,
  detectionTypes: Layers,
  detectionsOn: Power,
  detectionsOff: PowerOff,
  camerasWithoutDetections: ScanLine,
};
import { useTimezone } from '@/context/TimezoneContext';
import { useTheme } from '@/theme/ThemeContext';
import { agentApi } from './agentApi';
import { yieldToBrowser } from './downloadUtils';
import { exportCameraInventory, inventoryMetrics } from './cameraInventoryExport';
import { createInventoryImageLoader, inventoryImageFile } from './inventoryImages';
import ZoneSnapshot from './ZoneSnapshot';
import InventorySelect from './InventorySelect';

export const inventoryLink = /^\/agent\/camera-inventory\/([a-f0-9]{32})$/i;
const exportFormats = [['pdf', 'PDF'], ['xlsx', 'Excel'], ['csv', 'CSV']];
const detectionOptions = [
  { value: 'all', label: 'All detection states' }, { value: 'on', label: 'Detections on' },
  { value: 'off', label: 'Detections off' }, { value: 'unknown', label: 'State unknown' },
];
const cameraOptions = [
  { value: 'all', label: 'All camera statuses' }, { value: 'running', label: 'Cameras running' },
  { value: 'stopped', label: 'Cameras stopped' }, { value: 'unknown', label: 'Camera status unknown' },
];

function buildPreview(camera, inventoryId, nvr, loadImage) {
  const getLoader = (href) => {
    const file = inventoryImageFile(href, inventoryId);
    return file ? () => loadImage(file) : undefined;
  };
  return {
    camera: camera.name, nvr: camera.nvr || nvr,
    variants: [
      { id: '', load: getLoader(camera.image?.href) },
      ...(camera.detections || []).map((item, index) => ({
        ...item, id: String(index), label: item.detection, load: getLoader(item.image),
      })),
    ],
  };
}

function Badge({ value, children, dot = false }) {
  return <span className="agent-inventory-badge" data-state={value}>
    {dot && <span className="agent-inventory-dot" aria-hidden="true" />}
    {children || value || 'unknown'}
  </span>;
}

function DetectionDot({ color }) {
  const safeColor = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color || '') ? color : 'var(--inventory-accent)';
  return <span className="agent-inventory-dot" style={{ color: safeColor }} aria-hidden="true" />;
}

function GroupCounts({ group, groupBy }) {
  const rows = group.rows;
  const count = (key, value) => rows.filter((row) => row[key] === value).length;
  return <span className="agent-inventory-group-counts">
    <span className="agent-inventory-group-count">{rows.length} {groupBy === 'nvr' ? (rows.length === 1 ? 'camera' : 'cameras') : (rows.length === 1 ? 'entry' : 'entries')}</span>
    {groupBy === 'nvr' ? <>
      <Badge value="running">{count('status', 'running')} running</Badge>
      <Badge value="stopped">{count('status', 'stopped')} stopped</Badge>
      <Badge value="linked">{rows.reduce((sum, row) => sum + (row.detections || []).filter((item) => item.state === 'on').length, 0)} detections on</Badge>
    </> : <>
      <Badge value="on">{count('state', 'on')} on</Badge>
      <Badge value="off">{count('state', 'off')} off</Badge>
      {rows.length > count('state', 'on') + count('state', 'off') && <span className="agent-inventory-group-count">{rows.length - count('state', 'on') - count('state', 'off')} unknown</span>}
    </>}
  </span>;
}

function ZoneImage({ camera, detection, preview, gallery }) {
  const cell = useRef(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  const label = detection ? camera.name + ' · ' + detection.detection + ' zones' : camera.name + ' zones';
  const initialVariantId = detection ? String(camera.detections.indexOf(detection)) : '';
  const load = preview?.variants.find((variant) => variant.id === initialVariantId)?.load;

  useEffect(() => {
    if (!load) return undefined;
    if (!window.IntersectionObserver) { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '100px', threshold: 0.01 });
    observer.observe(cell.current);
    return () => observer.disconnect();
  }, [load]);

  useEffect(() => {
    if (!visible || !load) return undefined;
    const controller = new AbortController();
    let url;
    load().then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [load, visible]);

  const available = load && !failed;
  const fallbackLabel = available ? 'Loading image' : 'No image available';
  return <div ref={cell}>
    {available && src ? <div className="agent-inventory-image">
      <ZoneSnapshot thumbnail src={src} label={label} initialVariantId={initialVariantId}
        inventoryPreview={preview} inventoryGallery={gallery}
        onImageError={() => setFailed(true)} />
      {!detection && camera.image?.age && <small>{camera.image.age}</small>}
    </div> : <span className="agent-inventory-image-placeholder" role="img" aria-label={fallbackLabel}
      title={available ? fallbackLabel : camera.imageNote || fallbackLabel}>
      {available && visible ? <LoaderCircle size={17} className="agent-download-spinner" aria-hidden="true" />
        : <ImageOff size={17} aria-hidden="true" />}
    </span>}
  </div>;
}

function CameraDetails({ camera, preview, gallery }) {
  return <section className="agent-inventory-expanded" aria-label={camera.name + ' detection details'}>
    <div className="agent-inventory-detection-details">
      {camera.detections.map((item, index) => <article key={index}>
        <div className="agent-inventory-detail-copy">
          <h3><DetectionDot color={item.color} />{item.detection} <Badge value={item.state} /></h3>
          <dl>
            <div><dt>Zones</dt><dd>{item.zones?.join(', ') || 'No zone drawn'}</dd></div>
            {item.severity && <div><dt>Severity</dt><dd>{item.severity}</dd></div>}
            {item.settingName && <div className="agent-inventory-detail-setting"><dt>Setting</dt><dd>{item.settingName}</dd></div>}
          </dl>
          {camera.status === 'stopped' && item.state === 'on' && <small>Detection is on, but camera processing is stopped.</small>}
        </div>
        <div className="agent-inventory-detail-media">
          <ZoneImage key={item.image} camera={camera} detection={item} preview={preview} gallery={gallery} />
        </div>
      </article>)}
    </div>
  </section>;
}

function InventoryPanel({ inventoryId, loadImage, onClose, theme }) {
  const dialog = useRef(null);
  const { timezone } = useTimezone();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [groupBy, setGroupBy] = useState('nvr');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [cameraState, setCameraState] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    agentApi.cameraInventory(inventoryId, controller.signal).then((snapshot) => {
      if (!Array.isArray(snapshot?.nvrs)) throw new Error('Invalid camera inventory');
      if (!controller.signal.aborted) setData(snapshot);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.response?.status === 404
        ? 'This saved camera table is no longer available. Ask the agent for a fresh one.'
        : 'The camera table could not be loaded.');
    });
    return () => controller.abort();
  }, [inventoryId, attempt]);

  const search = query.trim().toLowerCase();
  const matches = (...fields) => fields.some((field) => String(field ?? '').toLowerCase().includes(search));
  const matchesState = (value) => state === 'all' || (value || 'unknown') === state;
  const matchesCameraState = (value) => cameraState === 'all' || (value || 'unknown') === cameraState;
  const locations = new Map((data?.nvrs || []).flatMap((group) => group.cameras.map((camera) =>
    [camera.channelId, camera.location || group.location])));
  const groups = groupBy === 'nvr'
    ? (data?.nvrs || []).map((group) => ({ ...group, rows: group.cameras.filter((camera) =>
      matches(camera.name, camera.location || group.location, group.name) && matchesCameraState(camera.status)
      && (state === 'all' || camera.detections?.some((item) => matchesState(item.state)))) }))
    : (data?.detections || []).map((group) => ({ ...group, name: group.detection, rows: group.entries.filter((entry) =>
      matches(entry.camera, entry.nvr, locations.get(entry.channelId)) && matchesCameraState(entry.cameraStatus) && matchesState(entry.state)) }));
  const sections = groups.filter((group) => group.rows.length);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
  const previews = useMemo(() => new Map((data?.nvrs || []).flatMap((group) => group.cameras.map((camera) =>
    [camera, buildPreview(camera, inventoryId, group.name, loadImage)]))), [data, inventoryId, loadImage]);
  const gallery = groupBy === 'nvr' ? sections.flatMap((group) => group.rows.map((camera) => previews.get(camera)))
    .filter((preview) => preview.variants[0].load) : [];
  const toggleDetails = (id) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const created = new Date(data?.createdAt);
  const built = data?.createdAt && Number.isFinite(created.getTime())
    ? dateFormatter.format(created) : '';
  const download = async (format, label) => {
    if (exporting || !data) return;
    setExportError('');
    setExporting(format);
    try {
      await yieldToBrowser();
      const links = await agentApi.cameraInventoryExportLinks(inventoryId);
      await exportCameraInventory(data, format, built ? 'Snapshot: ' + built + ' (' + timezone + ')' : '',
        (href) => links.get(inventoryImageFile(href, inventoryId)));
    } catch {
      setExportError('Could not export the camera inventory as ' + label + '. Try again.');
    } finally {
      setExporting('');
    }
  };

  return createPortal(<dialog ref={dialog} className="agent-inventory-dialog" data-theme={theme} aria-label="Camera inventory"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="agent-inventory-panel">
      <header className="agent-inventory-header">
        <span className="agent-inventory-heading-icon"><Table2 size={20} aria-hidden="true" /></span>
        <div className="agent-inventory-heading"><h2>Camera inventory</h2>{built && <small>Built {built} ({timezone})</small>}</div>
        {data && <div className="agent-inventory-export-actions" role="group" aria-label="Export full inventory">
          {exportFormats.map(([format, label]) => <button key={format} type="button" data-format={format} disabled={Boolean(exporting)}
            aria-busy={exporting === format} onClick={() => download(format, label)}>
            {exporting === format ? <LoaderCircle size={15} className="agent-download-spinner" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            {label}
          </button>)}
        </div>}
        <button className="agent-inventory-close" type="button" onClick={onClose} aria-label="Close camera inventory"><X size={18} /></button>
      </header>
      {exportError && <p className="agent-inventory-export-error" role="alert">{exportError}</p>}
      <div className="agent-inventory-body">
        {error ? <div className="agent-inventory-message" role="alert">{error} <button type="button" onClick={() => { setError(''); setAttempt((n) => n + 1); }}>Retry</button></div>
          : !data ? <p className="agent-inventory-message" role="status">Loading the camera table…</p> : <>
            <dl className="agent-inventory-metrics">
              {inventoryMetrics.map(([label, key]) => {
                const Icon = inventoryMetricIcons[key];
                return <div key={key} data-metric={key}>
                  <dt><Icon size={16} aria-hidden="true" />{label}</dt>
                  <dd>{data.totals?.[key] ?? '—'}</dd>
                </div>;
              })}
            </dl>
            {data.notes?.length > 0 && <div className="agent-inventory-notes"><TriangleAlert size={16} aria-hidden="true" /><ul>{data.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
            {data.meaning && <p className="agent-inventory-meaning">{data.meaning}</p>}
            <div className="agent-inventory-filters">
              <div className="agent-inventory-grouping" role="group" aria-label="Group cameras">
                <button type="button" aria-pressed={groupBy === 'nvr'} onClick={() => setGroupBy('nvr')}><Server size={15} aria-hidden="true" /> By NVR</button>
                <button type="button" aria-pressed={groupBy === 'detection'} onClick={() => setGroupBy('detection')}><Layers size={15} aria-hidden="true" /> By detection</button>
              </div>
              <label className="agent-inventory-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Find camera, location or NVR" placeholder="Find camera, location or NVR" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <InventorySelect label="Detection state" options={detectionOptions} value={state} onChange={setState} />
              <InventorySelect label="Camera status" options={cameraOptions} value={cameraState} onChange={setCameraState} />
              {(query || state !== 'all' || cameraState !== 'all') && (
                <button type="button" className="agent-inventory-clear-filters" onClick={() => { setQuery(''); setState('all'); setCameraState('all'); }}>
                  Clear filters
                </button>
              )}
            </div>
            {!sections.length && <p>{groupBy === 'detection' && !data.detectionsRead ? 'Detection data is unavailable for this snapshot.' : 'No cameras match these filters.'}</p>}
            {sections.map((group) => <details className="agent-inventory-group" key={groupBy + ':' + (group.detectionType || group.name) + ':' + (group.location || '')} open>
              <summary>
                <ChevronRight className="agent-inventory-disclosure" size={16} aria-hidden="true" />
                {groupBy === 'nvr' ? <Server size={15} aria-hidden="true" /> : <Layers size={15} aria-hidden="true" />}
                <strong>{group.name}</strong>
                {group.location && <small className="agent-inventory-icon-label"><MapPin size={12} aria-hidden="true" />{group.location}</small>}
                <GroupCounts group={group} groupBy={groupBy} />
              </summary>
              <div className="agent-inventory-table" tabIndex={0} aria-label={group.name + ' table'}>
                {groupBy === 'nvr' ? <table><thead><tr>{['#', 'Camera', 'Location', 'Camera status', 'Detections (on / off)', 'Zones', 'Zone image'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                  <tbody>{group.rows.map((camera, row) => {
                    const hasZones = camera.detections?.some((item) => item.zones?.length);
                    return <Fragment key={camera.channelId}><tr>
                    <td>{row + 1}</td><td>{hasZones
                      ? <button type="button" className="agent-inventory-camera-toggle" aria-expanded={expanded.has(camera.channelId)} onClick={() => toggleDetails(camera.channelId)}><Cctv size={14} aria-hidden="true" />{camera.name}<ChevronRight className="agent-inventory-disclosure" size={12} aria-hidden="true" /></button>
                      : <span className="agent-inventory-icon-label"><Cctv size={14} aria-hidden="true" />{camera.name}</span>}</td><td>{camera.location || group.location || '—'}</td><td><Badge value={camera.status} dot /></td>
                    <td>{camera.detections?.length ? <div className="agent-inventory-detection-chips">{camera.detections.map((item, i) =>
                      <span className="agent-inventory-detection-chip" key={i}><DetectionDot color={item.color} />{item.detection} <Badge value={item.state} /></span>
                    )}</div> : data.detectionsRead ? 'No detection linked' : 'Not read'}</td>
                    <td>{hasZones ? camera.detections.map((item, i) =>
                      item.zones?.length ? <div className="agent-inventory-icon-label" key={i}><DetectionDot color={item.color} />{item.zones.join(', ')}</div> : null
                    ) : '—'}</td>
                    <td><ZoneImage key={camera.image?.href} camera={camera} preview={previews.get(camera)} gallery={gallery} /></td>
                  </tr>{hasZones && expanded.has(camera.channelId) && <tr className="agent-inventory-expanded-row"><td colSpan={7}><CameraDetails camera={camera} preview={previews.get(camera)} gallery={gallery} /></td></tr>}</Fragment>;
                  })}</tbody></table>
                  : <table><thead><tr>{['Camera', 'NVR', 'Camera status', 'Detection state', 'Zones', 'Severity', 'Setting name'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                    <tbody>{group.rows.map((entry, row) => <tr key={entry.channelId + ':' + row}>
                      <td><span className="agent-inventory-icon-label"><Cctv size={14} aria-hidden="true" />{entry.camera}</span></td><td>{entry.nvr}</td><td><Badge value={entry.cameraStatus} dot /></td><td><Badge value={entry.state} /></td>
                      <td>{entry.zones?.length ? <span className="agent-inventory-icon-label"><DetectionDot color={group.color} />{entry.zones.join(', ')}</span> : '—'}</td><td>{entry.severity || '—'}</td><td>{entry.settingName || '—'}</td>
                    </tr>)}</tbody></table>}
              </div>
            </details>)}
          </>}
      </div>
    </div>
  </dialog>, document.body);
}

export default function CameraInventoryButton({ inventoryId, children }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const loadImage = useMemo(() => createInventoryImageLoader(inventoryId), [inventoryId]);
  return <>
    <button type="button" className="agent-inventory-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}><Table2 size={16} aria-hidden="true" />{children}</button>
    {open && <InventoryPanel inventoryId={inventoryId} loadImage={loadImage} theme={theme} onClose={() => setOpen(false)} />}
  </>;
}
