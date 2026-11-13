import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import useHlsPlayer from '@/hooks/useHlsPlayer';
import { streamUrl } from '@/lib/stream';
import { mediaUrl } from '@/lib/format';
import { usePermissions } from '@/context/PermissionContext';
import { machineOpsFormError, rectangleZone, MACHINE_OPS_SETTING_TYPE } from '@/helpers/machineOpsDetection';
import { createZoneDetectionSetting, updateZoneDetectionSetting } from './DetectionZoneMarking/api/detectionZoneApi';

const newMachine = index => ({ machineId: crypto.randomUUID(), name: `Machine ${index + 1}`,
  profileId: 'green-indicator', machineZone: [], indicatorZone: [] });

export default function MachineOpsZoneEditor({ camera, activeType, onSaved, onBack }) {
  const saved = activeType?.setting?.settings || {};
  const [machines, setMachines] = useState(() => saved.machines?.length ? structuredClone(saved.machines) : [newMachine(0)]);
  const [selected, setSelected] = useState(0);
  const [zone, setZone] = useState('machineZone');
  const [anchor, setAnchor] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [videoError, setVideoError] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const { permissions } = usePermissions();
  const permission = permissions?.detectionSettings || {};
  const canWrite = !!permission[activeType?.settingId ? 'edit' : 'create'];
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const snapshot = mediaUrl(camera?.latestSnapshot?.path || '');
  useHlsPlayer(videoRef, streamUrl(camera), { onError: () => { setVideoError(true); setPreviewReady(false); }, onStarted: () => { setVideoError(false); setPreviewReady(true); } });
  useEffect(() => {
    setMachines(saved.machines?.length ? structuredClone(saved.machines) : [newMachine(0)]);
    setSelected(0); setError('');
  }, [camera?._id, activeType?.settingId]);
  const update = changes => setMachines(current => current.map((m, i) => i === selected ? { ...m, ...changes } : m));
  const point = event => {
    const rect = overlayRef.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))];
  };
  const finish = event => {
    if (!anchor) return;
    const end = point(event);
    if (Math.abs(end[0] - anchor[0]) > .003 && Math.abs(end[1] - anchor[1]) > .003) {
      update({ [zone]: rectangleZone(anchor, end) }); setError('');
    }
    setAnchor(null); setCursor(null);
  };
  const save = async () => {
    const problem = machineOpsFormError(machines);
    if (problem) { setError(problem); return; }
    if (!canWrite || saving) return;
    setSaving(true); setError('');
    const body = { name: activeType?.setting?.name || 'Machine Operations', settingType: MACHINE_OPS_SETTING_TYPE,
      NVRId: camera.nvrId?._id || camera.nvrId, channelId: [camera._id], enabled: activeType?.setting?.enabled ?? false,
      settings: { ...saved, machines, levelOfImportance: saved.levelOfImportance || 'low',
        trigger_notification: saved.trigger_notification ?? true } };
    try {
      const response = activeType?.settingId ? await updateZoneDetectionSetting(activeType.settingId, body) : await createZoneDetectionSetting(body);
      if (response?.status === false || response?.status === 'failed') throw new Error(response?.message || 'Could not save machine zones.');
      toast.success('Machine zones saved'); onSaved?.();
    } catch (failure) {
      const data = failure?.response?.data;
      setError(data?.body?.error || data?.body?.message || data?.error || data?.message || failure.message || 'Could not save machine zones.');
    }
    finally { setSaving(false); }
  };
  return <section className="p-4 space-y-4 text-[var(--tx1)]">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Machine Operations</h2>
      <button type="button" onClick={onBack}>Back</button></div>
    <p className="text-sm text-[var(--tx2)]">Select a machine, then drag its machine area and indicator area. Keep the indicator entirely inside its machine area.</p>
    <div className="flex gap-2 flex-wrap">
      {machines.map((m, i) => <button type="button" key={m.machineId} onClick={() => { setSelected(i); setAnchor(null); }}
        className={`border rounded px-3 py-2 ${selected === i ? 'border-blue-500' : 'border-[var(--bd)]'}`}>{m.name || `Machine ${i + 1}`}</button>)}
      {canWrite && machines.length < 32 && <button type="button" onClick={() => { setMachines([...machines, newMachine(machines.length)]); setSelected(machines.length); }}>+ Add machine</button>}
    </div>
    {machines[selected] && <div className="flex gap-3 flex-wrap items-center">
      <label>Machine name <input className="border rounded bg-[var(--bg2)] p-2" value={machines[selected].name} disabled={!canWrite} onChange={e => update({ name: e.target.value })} /></label>
      <label>Indicator profile <input className="border rounded bg-[var(--bg2)] p-2" value={machines[selected].profileId || ''} disabled={!canWrite} onChange={e => update({ profileId: e.target.value })} /></label>
      {canWrite && <><button type="button" onClick={() => setZone('machineZone')} aria-pressed={zone === 'machineZone'} className={zone === 'machineZone' ? 'text-blue-400' : ''}>Draw machine area</button>
        <button type="button" onClick={() => setZone('indicatorZone')} aria-pressed={zone === 'indicatorZone'} className={zone === 'indicatorZone' ? 'text-green-400' : ''}>Draw indicator area</button></>}
      {permission.delete && canWrite && machines.length > 1 && <button type="button" onClick={() => { setMachines(machines.filter((_, i) => i !== selected)); setSelected(0); }}>Remove machine</button>}
    </div>}
    <div className="relative w-full bg-black rounded overflow-hidden" style={{ aspectRatio: aspect }}>
      <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 w-full h-full object-fill"
        onLoadedMetadata={() => { setAspect(videoRef.current.videoWidth / videoRef.current.videoHeight || 16 / 9); setPreviewReady(true); }} />
      {videoError && snapshot && <img src={snapshot} alt="Camera snapshot" className="absolute inset-0 w-full h-full object-fill" onLoad={e => { setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); setPreviewReady(true); }} />}
      {videoError && !snapshot && <p className="absolute inset-0 flex items-center justify-center">Camera preview unavailable. Reconnect before drawing zones.</p>}
      <svg ref={overlayRef} className="absolute inset-0 w-full h-full touch-none" viewBox="0 0 1000 1000" preserveAspectRatio="none"
        style={{ cursor: canWrite ? 'crosshair' : 'default' }}
        onPointerDown={e => { if (!canWrite || !previewReady) return; e.currentTarget.setPointerCapture(e.pointerId); setAnchor(point(e)); setCursor(point(e)); }}
        onPointerMove={e => { if (anchor) setCursor(point(e)); }} onPointerUp={finish}
        onPointerCancel={() => { setAnchor(null); setCursor(null); }}>
        {machines.flatMap((machine, i) => ['machineZone', 'indicatorZone'].map(role => machine[role]?.length ? <polygon key={`${machine.machineId}-${role}`}
          points={machine[role].map(p => `${p[0] * 1000},${p[1] * 1000}`).join(' ')}
          fill={role === 'machineZone' ? '#3b82f620' : '#22c55e50'} stroke={role === 'machineZone' ? '#60a5fa' : '#4ade80'} strokeWidth={i === selected ? 4 : 2} /> : null))}
        {anchor && cursor && <polygon points={rectangleZone(anchor, cursor).map(p => `${p[0] * 1000},${p[1] * 1000}`).join(' ')} fill="#ffffff20" stroke="white" strokeWidth="3" />}
      </svg>
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <button type="button" onClick={save} disabled={!canWrite || saving} className="px-4 py-2 rounded bg-blue-600 disabled:opacity-40">{saving ? 'Saving…' : 'Save machines'}</button>
  </section>;
}
