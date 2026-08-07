import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Panel } from '../../../components/primitives';
import { useApi } from '../../../hooks/useApi';
import { getChannels, getNvrs, getDetectionTypes, toggleChannelDetection } from '../../../helpers/configure';
import ConfirmationModal from '../../../components/DeleteConfirmation';
import MultiSelect from '../../../components/MultiSelect';
import { usePermissions } from '@/context/PermissionContext';

function isTypeEnabled(camera, key) {
  return !!(camera?.detections?.[key]?.id && camera.detections[key].enabled);
}

/** Single-pick dropdown with a scrollable, custom-styled option panel —
 * a plain <select>'s native option list can't be restyled, so this swaps
 * it for a portal-rendered panel (same positioning approach as MultiSelect)
 * capped at maxHeight with its own scrollbar. */
function SingleSelect({ options, value, onChange, placeholder = 'Select...', maxHeight = 260 }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value) || null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', height: 40, padding: '0 28px 0 12px', borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 14, fontWeight: 400,
          outline: 'none', cursor: 'pointer', color: 'var(--tx)', boxSizing: 'border-box',
          textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {selected ? selected.label : placeholder}
      </button>
      <ChevronDown
        size={13}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: `translateY(-50%) ${open ? 'rotate(180deg)' : ''}`,
          pointerEvents: 'none', color: 'var(--tx3)', transition: 'transform .15s',
        }}
      />
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            ...pos, zIndex: 200, maxHeight, overflowY: 'auto',
            background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.25)', padding: 4,
          }}
          className="vq-scroll"
        >
          {options.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--tx3)' }}>No options</div>
          )}
          {options.map((o) => {
            const active = o.id === value;
            return (
              <div
                key={o.id}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  padding: '8px 12px', borderRadius: 7, fontSize: 14, cursor: 'pointer',
                  color: 'var(--tx)', fontWeight: 400,
                  background: active ? 'var(--bg3)' : 'transparent',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg3)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="vq-singleselect-label">{o.label}</span>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// Cycled per detection type so each row gets a distinct dot color, same idea
// as the reference System Controls mock (green/red/orange/violet/cyan/blue).
const DOT_COLORS = ['var(--ok)', 'var(--crit)', 'var(--warn)', 'var(--violet)', 'var(--cyan)', 'var(--blue)'];

function MiniToggle({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={onChange}
      style={{
        width: 34, height: 19, borderRadius: 11, flex: '0 0 auto', border: 'none',
        cursor: 'pointer', padding: 0,
        background: value ? 'linear-gradient(90deg,var(--blue),var(--violet))' : 'var(--toggleoff)',
        position: 'relative', transition: 'background .18s',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: value ? 17 : 2,
          width: 15, height: 15, borderRadius: '50%', background: '#fff',
          transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,.35)',
        }}
      />
    </button>
  );
}

/** One detection-type row, styled like the reference mock: colored dot,
 * label + small description line, toggle switch on the right. */
function DetectionTypeRow({ label, color, enabled, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10,
        padding: '7px 9px',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
          background: color, boxShadow: `0 0 6px ${color}`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.1, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 1 }}>
          {enabled ? 'Active' : 'Not applied'}
        </div>
      </div>
      <MiniToggle value={enabled} onChange={onToggle} />
    </div>
  );
}

export default function SystemControls() {
  const { permissions } = usePermissions();
  const canViewControls = !!permissions?.detectionSettings?.view && !!permissions?.detectionSettings?.edit;

  const [nvrFilter, setNvrFilter] = useState([]);
  const [cameraFilter, setCameraFilter] = useState(null);
  const [detectionConfirm, setDetectionConfirm] = useState(null);
  const [detectionActionLoading, setDetectionActionLoading] = useState(false);

  const nvrsApi = useApi(() => getNvrs(0, 500), []);
  const nvrs = nvrsApi.data?.nvrs ?? [];
  const nvrOptions = useMemo(() => nvrs.map((n) => ({ id: n._id, label: n.nvrName })), [nvrs]);

  // No NVR is pre-selected. This used to default to the first one so the panel
  // wasn't "empty" on first view, but an empty selection already means every
  // camera on the account (see the camera pool below) — so the default was
  // narrowing the panel, not filling it.

  const typesApi = useApi(() => getDetectionTypes(), []);
  const typeLabels = typesApi.data || {};
  const detectionKeys = useMemo(() => Object.keys(typeLabels), [typeLabels]);

  // Camera pool scoped to the chosen NVR(s) — when none are picked, every
  // camera on the account is selectable. `nvrId` on a channel comes back as
  // the populated NVR document (nvrId._id), not a bare id — fall back to a
  // raw id/nvr shape defensively, same as NVRCameras.jsx's channelNvrId.
  const channelsApi = useApi(() => getChannels({ limit: 500 }), []);
  const allCameras = channelsApi.data?.channels ?? [];
  const channelNvrId = (c) => c.nvrId?._id || c.nvr?._id || c.nvrId || c.nvr || null;
  const scopedCameras = useMemo(
    () => (nvrFilter.length ? allCameras.filter((c) => nvrFilter.includes(channelNvrId(c))) : allCameras),
    [allCameras, nvrFilter],
  );
  const cameraOptions = useMemo(
    () => [
      { id: '', label: 'Select Camera' },
      ...scopedCameras.map((c) => ({ id: c._id, label: c.customName || c.name })),
    ],
    [scopedCameras],
  );

  // Only one camera can be selected at a time. `null` means the picker has
  // not defaulted yet; an empty string is the user's explicit "Select Camera"
  // choice and should remain selectable.
  useEffect(() => {
    if (cameraFilter === '') return;
    if (scopedCameras.some((c) => c._id === cameraFilter)) return;
    if (scopedCameras.length) {
      setCameraFilter(scopedCameras[0]._id);
    }
  }, [scopedCameras, cameraFilter]);

  const selectedCamera = useMemo(
    () => scopedCameras.find((c) => c._id === cameraFilter) || null,
    [scopedCameras, cameraFilter],
  );

  const refetchAll = () => channelsApi.refetch();

  const handleDetectionToggleRequest = (detectionType, label, currentlyEnabled) => {
    if (!selectedCamera) {
      toast.error('Select a camera first.');
      return;
    }
    setDetectionConfirm({ detectionType, label, currentlyEnabled });
  };

  const handleConfirmDetectionToggle = async () => {
    if (!detectionConfirm || !selectedCamera) return;
    setDetectionActionLoading(true);
    try {
      const enable = !detectionConfirm.currentlyEnabled;
      await toggleChannelDetection({
        channelId: selectedCamera._id,
        detectionType: detectionConfirm.detectionType,
        enable,
      });
      toast.success(`${detectionConfirm.label} ${enable ? 'enabled' : 'disabled'} on ${selectedCamera.customName || selectedCamera.name}`);
      refetchAll();
      setDetectionConfirm(null);
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to update detection type.');
    } finally {
      setDetectionActionLoading(false);
    }
  };

  if (!canViewControls) return null;

  return (
    <Panel style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ShieldCheck size={15} color="var(--tx2)" strokeWidth={1.7} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>System Controls</span>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx)', marginBottom: 7 }}>
        Cameras &amp; Detection
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <MultiSelect
          options={nvrOptions}
          value={nvrFilter}
          onChange={setNvrFilter}
          placeholder="Select NVR"
          searchPlaceholder="Search NVRs..."
          className="flex-1 min-w-0"
        />
        <SingleSelect
          options={cameraOptions}
          value={cameraFilter}
          onChange={setCameraFilter}
          placeholder="Select Camera"
        />
      </div>

      {!selectedCamera ? (
        <div style={{ padding: '18px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--tx3)', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10 }}>
          Select a camera to view and apply detection types.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 245, overflowY: 'auto' }} className="vq-scroll">
          {detectionKeys.filter((key) => typeLabels[key]).map((key, i) => {
            const label = typeLabels[key];
            const enabled = isTypeEnabled(selectedCamera, key);
            return (
              <DetectionTypeRow
                key={key}
                label={label}
                color={DOT_COLORS[i % DOT_COLORS.length]}
                enabled={enabled}
                onToggle={() => handleDetectionToggleRequest(key, label, enabled)}
              />
            );
          })}
        </div>
      )}

      <ConfirmationModal
        open={!!detectionConfirm}
        title="Detection Control"
        message={detectionConfirm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            <div>Camera: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{selectedCamera?.customName || selectedCamera?.name || 'Camera'}</span></div>
            <div>Detection Type: <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{detectionConfirm.label || detectionConfirm.detectionType}</span></div>
            <div>Status: <span style={{ fontWeight: 600, color: detectionConfirm.currentlyEnabled ? 'var(--ok)' : 'var(--crit)' }}>{detectionConfirm.currentlyEnabled ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        )}
        confirmLabel={detectionActionLoading ? (detectionConfirm?.currentlyEnabled ? 'Stopping...' : 'Starting...') : (detectionConfirm?.currentlyEnabled ? 'Stop Detection' : 'Start Detection')}
        cancelLabel="Cancel"
        onClose={() => !detectionActionLoading && setDetectionConfirm(null)}
        onConfirm={handleConfirmDetectionToggle}
        loading={detectionActionLoading}
        confirmClass={detectionConfirm?.currentlyEnabled ? 'bg-[var(--crit)] text-white hover:opacity-90 shadow-sm shadow-[var(--crit)]/20' : 'bg-[var(--blue)] text-white hover:opacity-90 shadow-sm shadow-[var(--blue)]/20'}
      />
    </Panel>
  );
}
