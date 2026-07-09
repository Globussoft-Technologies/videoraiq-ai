import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X, Loader2, ArrowLeft, Pencil, ListVideo, Play, Maximize2, Minimize2, ArrowUpRight, Cctv, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import DeleteConfirmation from '../../../components/DeleteConfirmation';
import {
  getNvrs,
  getCamerasByNvr,
  registerAndFetchCameras,
  addSelectedCameras,
  updateNvrById,
  deleteNvrById,
  getNvrCamerasForEdit,
} from '../../../helpers/configure';
import { getChannels, getLocations } from '../../../helpers/monitoring';
import { createLocation } from '../Locations/Api';
import { encrypt, decrypt } from '../../../helpers/decryptNvr';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import { streamUrl } from '../../../lib/stream';

// ── helpers ──────────────────────────────────────────────────────────────────
function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'online' || s === 'active') return '#22c55e';
  if (s === 'warning') return '#f5a623';
  return '#6b7796';
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{children}</div>;
}

function ModalInput({ label, ...props }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        {...props}
        style={{
          width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
          borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
          fontSize: 12.5, color: 'var(--tx)', outline: 'none',
          ...(props.mono ? { fontFamily: 'var(--mono)' } : {}),
        }}
      />
    </div>
  );
}

const NVR_BRANDS = [
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'cpplus', label: 'CP Plus' },
];

// ── Shimmering placeholder block for loading states ────────────────────────
function SkeletonBlock({ width = '100%', height = 12, radius = 5, style = {} }) {
  return (
    <span style={{
      display: 'inline-block', width, height, borderRadius: radius,
      background: 'var(--bg2)', position: 'relative', overflow: 'hidden', ...style,
    }}>
      <span style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)',
        animation: 'vqshimmer 1.6s ease-in-out infinite',
      }} />
    </span>
  );
}

// ── NVR card loading placeholder ────────────────────────────────────────────
function NvrCardSkeleton() {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)', flexShrink: 0 }} />
        <SkeletonBlock width="55%" height={13} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['ID', 'IP', 'Model', 'Location', 'Camera'].map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{label}:</span>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 5, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
              <SkeletonBlock width={90} height={10} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NVR card ─────────────────────────────────────────────────────────────────
function NvrCard({ nvr, onEdit, onCameraSettings, onDelete }) {
  const cameraCount = nvr.cameraCount ?? nvr.usedChannels ?? nvr.used ?? 0;
  const sc          = statusColor(nvr.status);

  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)',
      borderRadius: 14, padding: 16, position: 'relative',
    }}>
      {/* Actions */}
      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8 }}>
        <button
          onClick={() => onCameraSettings(nvr)}
          title="Camera Settings"
          style={{
            display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px',
            borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: 'var(--bg2)', border: '1px solid var(--bd)',
            color: 'var(--tx2)', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Cctv size={15} /> Camera Settings
        </button>
        <button
          onClick={() => onEdit(nvr)}
          title="Edit NVR"
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg2)', border: '1px solid var(--bd)',
            color: 'var(--tx3)', cursor: 'pointer',
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => onDelete(nvr)}
          title="Delete NVR"
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg2)', border: '1px solid var(--bd)',
            color: 'var(--crit)', cursor: 'pointer',
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13, paddingRight: 175 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="1.7">
            <rect x="3" y="4" width="18" height="7" rx="1.5" />
            <rect x="3" y="13" width="18" height="7" rx="1.5" />
            <circle cx="7" cy="7.5" r=".9" fill="var(--tx2)" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nvr.name || nvr.nvrName || 'Unknown NVR'}
          </div>
        </div>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: sc,
          boxShadow: `0 0 7px ${sc}`, flexShrink: 0,
        }} />
      </div>

      {/* Field list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
        {[
          { label: 'ID',       val: nvr._id ? nvr._id.slice(-6) : null, mono: true },
          { label: 'IP',       val: nvr._id ? (nvr.ip || nvr.ipAddress || '—') : null, mono: true },
          { label: 'Model',    val: (nvr.model || nvr.brand || nvr.location || nvr.locationName || nvr.site) ? (nvr.model || nvr.brand || '—') : null },
          { label: 'Location', val: (nvr.model || nvr.brand || nvr.location || nvr.locationName || nvr.site) ? (nvr.location || nvr.locationName || nvr.site || '—') : null },
          { label: 'Camera',   val: String(cameraCount), mono: true },
        ].map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--tx2)', flexShrink: 0 }}>{f.label}:</span>
            {f.val == null ? (
              <SkeletonBlock width={90} height={10} />
            ) : (
              <span style={{
                display: 'inline-block', maxWidth: '100%',
                padding: '2px 8px', borderRadius: 5,
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                fontWeight: 600, color: 'var(--tx2)', fontFamily: f.mono ? 'var(--mono)' : undefined,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{f.val}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Camera row ────────────────────────────────────────────────────────────────
const CAM_COL = '90px 2fr 1.4fr 80px';

function CamRow({ c, site, onView }) {
  const sc = statusColor(c.status);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: CAM_COL,
      padding: '11px 16px', borderBottom: '1px solid var(--bd)',
      alignItems: 'center', fontSize: 12.5,
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx2)' }}>
        {c._id?.slice(-6) || c.channelId || '—'}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0 }} />
        {c.name || c.channelName || 'Camera'}
      </span>
      <span style={{ color: 'var(--tx2)' }}>
        {site || '—'}
      </span>
      <span
        onClick={() => onView(c)}
        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}
      >
        View <ArrowUpRight size={12} />
      </span>
    </div>
  );
}

// ── Camera checkbox row (Step 2 / Manage Cameras) ──────────────────────────
function DiscoveredCameraRow({ cam, checked, onToggle, onPreview }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 9, border: '1px solid var(--bd)', cursor: 'pointer',
        background: checked ? 'rgba(59,130,246,.06)' : 'var(--bg2)',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cam.name || `Camera ${cam.channelId}`}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>Channel {cam.channelId}</div>
      </div>
      {cam.isAdded && (
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>
          Added
        </span>
      )}
      {cam.dbId && onPreview && (
        <button
          onClick={e => { e.stopPropagation(); onPreview(cam); }}
          title="Preview stream"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            fontSize: 10, fontWeight: 600, color: 'var(--blue)',
            background: 'rgba(59,130,246,.08)', border: '1px solid var(--blue)',
            borderRadius: 20, padding: '3px 9px', cursor: 'pointer',
          }}
        >
          <Play size={10} fill="currentColor" /> Preview
        </button>
      )}
    </div>
  );
}

// ── Live stream preview modal ───────────────────────────────────────────────
function CameraPreviewModal({ cam, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const url = streamUrl(cam);

  useHlsPlayer(videoRef, url, {
    autoPlay: true,
    onError: (msg) => { setErrorMsg(msg); setIsLoading(false); setHasError(true); },
  });

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(4,6,12,.85)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        ref={containerRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '100%', background: 'var(--bg1)',
          border: '1px solid var(--bd)', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{cam.name || `Camera ${cam.channelId}`}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--tx)', background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6, padding: '2px 8px' }}>
              Channel {cam.channelId}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--bd2)', color: 'var(--tx)', cursor: 'pointer' }}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--bd2)', color: 'var(--tx)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
          {isLoading && !hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,.8)', zIndex: 2 }}>
              <Loader2 size={26} className="animate-spin" style={{ color: '#fff' }} />
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Connecting to stream…</span>
            </div>
          )}
          {hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,.85)', zIndex: 3, color: '#fff', textAlign: 'center', padding: 16 }}>
              <span style={{ fontSize: 13 }}>Unable to load stream</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{errorMsg || 'Camera offline'}</span>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay muted playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onCanPlay={() => { setIsLoading(false); setHasError(false); }}
            onPlaying={() => { setIsLoading(false); setHasError(false); }}
          />
          <span style={{ position: 'absolute', bottom: 10, left: 10, fontSize: 9.5, fontWeight: 700, color: 'var(--crit)', background: 'rgba(0,0,0,.55)', border: '1px solid var(--crit)', borderRadius: 5, padding: '3px 8px', letterSpacing: '.05em' }}>
            LIVE PREVIEW
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Manage Cameras modal (existing NVR) ─────────────────────────────────────
function ManageCamerasModal({ nvr, onClose, onSaved }) {
  const [cameras, setCameras] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [initialAdded, setInitialAdded] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCam, setPreviewCam] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getNvrCamerasForEdit(nvr._id).then(body => {
      if (cancelled) return;
      if (body?.status === 'success') {
        const available = body.data.availableCameras || [];
        const addedMap = new Map();
        const selectedSet = new Set();
        available.forEach(cam => {
          if (cam.isAdded && cam.dbId) {
            addedMap.set(cam.channelId, cam.dbId);
            selectedSet.add(cam.channelId);
          }
        });
        setCameras(available);
        setInitialAdded(addedMap);
        setSelected(selectedSet);
      } else {
        toast.error(friendlyErrorMessage(body, 'Failed to load cameras for this NVR.'));
        onClose();
      }
    }).catch(e => {
      if (cancelled) return;
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Failed to load cameras from NVR.'));
      onClose();
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nvr._id]);

  const toggleCamera = (channelId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(cameras.map(c => c.channelId)));
  const clearAll = () => setSelected(new Set());

  async function handleSave() {
    setSaving(true);
    try {
      const toAdd = cameras.filter(cam => selected.has(cam.channelId) && !initialAdded.has(cam.channelId));
      const toRemove = cameras.filter(cam => !selected.has(cam.channelId) && initialAdded.has(cam.channelId));

      if (toAdd.length === 0 && toRemove.length === 0) {
        toast.info('No changes made');
        onClose();
        return;
      }

      // The backend's add-cameras endpoint syncs every camera's isAdded flag
      // to "is it present in cameraIds" — the same bulk sync handles single
      // removals already. It only special-cases a literally EMPTY array as a
      // validation error, so a fully-cleared selection sends a sentinel that
      // matches no real channelId, keeping the request in the same "sync to
      // this set" shape instead of a separate unlink-all call.
      const idsToSend = selected.size > 0 ? Array.from(selected) : ['__none__'];
      const resp = await addSelectedCameras({ nvrId: nvr._id, cameraIds: idsToSend });
      const body = resp?.data?.body;
      if (body?.status !== 'success') {
        toast.error(friendlyErrorMessage(body, 'Failed to update cameras. Please try again.'));
        return;
      }
      const parts = [];
      if (toAdd.length > 0) parts.push(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
      if (toRemove.length > 0) parts.push(`${toRemove.length} camera${toRemove.length > 1 ? 's' : ''} removed`);
      toast.success(parts.join(', '));
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Something went wrong while saving. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, maxWidth: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg1)', border: '1px solid var(--bd)',
          borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ListVideo size={17} color="var(--blue)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>Manage Cameras</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>Check to add · Uncheck to remove</div>
          </div>
          {cameras.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={selectAll} style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--blue)',
                border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', background: 'none',
              }}>
                Add all
              </button>
              <button onClick={clearAll} style={{
                fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)',
                border: '1px solid var(--bd)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', background: 'none',
              }}>
                Clear all
              </button>
            </div>
          )}
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--tx3)', border: '1px solid var(--bd)', background: 'none', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px 20px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--blue)' }} />
            </div>
          ) : cameras.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>
              No cameras found on this NVR.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cameras.map(cam => (
                <DiscoveredCameraRow
                  key={cam.channelId}
                  cam={cam}
                  checked={selected.has(cam.channelId)}
                  onToggle={() => toggleCamera(cam.channelId)}
                  onPreview={(c) => setPreviewCam({ ...c, streamingUrl: `stream/${nvr._id}-${c.dbId}/playlist.m3u8` })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '15px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
            border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 16px', cursor: saving ? 'default' : 'pointer', background: 'none',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 9, padding: '9px 18px', border: 'none',
              cursor: (saving || loading) ? 'wait' : 'pointer',
              opacity: (saving || loading) ? 0.6 : 1,
            }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {previewCam && <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />}
    </div>
  );
}

// ── Turn a backend fail response into a message a user can act on ─────────
function friendlyErrorMessage(body, fallback) {
  const detail = body?.error || body?.data;
  const raw = typeof detail === 'string' ? detail : body?.message;
  if (!raw) return fallback;

  if (/"?ip"?.*(does not match|fails to match|not allowed)/i.test(raw) || /"ip".*must be/i.test(raw)) {
    return 'Please enter a plain IP address or hostname (no "http://" or "https://" prefix, no port).';
  }
  if (/"?port"?.*(must be|required)/i.test(raw)) {
    return 'Please enter a valid port number between 1 and 65535.';
  }
  if (/"?rtspPort"?.*(must be|required)/i.test(raw)) {
    return 'Please enter a valid RTSP port number between 1 and 65535.';
  }
  if (/"?nvrName"?.*(required|pattern)/i.test(raw)) {
    return 'NVR name is required and cannot contain special characters like < > " \' ( ) { } [ ].';
  }
  if (/"?location"?.*required/i.test(raw)) {
    return 'Please select or create a location.';
  }
  if (/"?username"?.*required/i.test(raw)) {
    return 'Username is required.';
  }
  if (/"?password"?.*required/i.test(raw)) {
    return 'Password is required.';
  }
  if (/"?oldPassword"?.*required/i.test(raw)) {
    return 'Old password is required.';
  }
  if (/"?newPassword"?.*required/i.test(raw)) {
    return 'New password is required.';
  }
  if (/"?brand"?.*required/i.test(raw)) {
    return 'Please select an NVR brand.';
  }
  if (raw === 'Validation Failed' && !detail) {
    return fallback;
  }
  return raw;
}

// ── Add / Edit NVR wizard ───────────────────────────────────────────────────
function AddNvrModal({ onClose, onSaved, editingNvr }) {
  const isEdit = !!editingNvr;

  const [step, setStep] = useState(1);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(isEdit ? {
    brand: editingNvr.brand || 'hikvision',
    name: editingNvr.name || editingNvr.nvrName || '',
    location: editingNvr.location || editingNvr.locationName || '',
    ip: decrypt(editingNvr.ipAddress || editingNvr.ip || ''),
    user: editingNvr.username || 'admin',
    oldPass: '', newPass: '',
    rtsp: editingNvr.rtspPort || '554',
    http: editingNvr.port || '80',
  } : {
    brand: 'hikvision', name: '', location: '', ip: '',
    user: 'admin', pass: '', rtsp: '554', http: '80',
  });

  const [savedNvrId, setSavedNvrId] = useState(isEdit ? editingNvr._id : null);
  const [fetchedCameras, setFetchedCameras] = useState([]);
  const [initialAdded, setInitialAdded] = useState(new Map());
  const [selectedCameras, setSelectedCameras] = useState(new Set());
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [previewCam, setPreviewCam] = useState(null);

  useEffect(() => {
    getLocations(0, 100).then(data => setLocations(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const applyFetchedCameras = (available) => {
    // registerAndFetchCameras (brand-new NVR) returns raw saved Camera docs
    // (dbId lives at `_id`); editNvrCameras (existing NVR) already normalizes
    // to `dbId`. Normalize here so Preview works the same for both.
    const normalized = (available || []).map((cam) => ({ ...cam, dbId: cam.dbId ?? cam._id ?? null }));
    const addedMap = new Map();
    const selectedSet = new Set();
    normalized.forEach((cam) => {
      if (cam.isAdded && cam.dbId) {
        addedMap.set(cam.channelId, cam.dbId);
        selectedSet.add(cam.channelId);
      }
    });
    setFetchedCameras(normalized);
    setInitialAdded(addedMap);
    setSelectedCameras(selectedSet);
  };

  async function handleCreateLocation() {
    if (!newLocation.trim()) return;
    setCreatingLocation(true);
    try {
      const resp = await createLocation({ locationName: newLocation.trim() });
      if (resp?.data?.body?.status === 'success') {
        toast.success(resp?.data?.body?.message || 'Location created');
        setLocations(prev => [...prev, { locationName: newLocation.trim() }]);
        setForm(f => ({ ...f, location: newLocation.trim() }));
        setNewLocation('');
      } else {
        toast.error(resp?.data?.body?.message || 'Failed to create location');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to create location');
    } finally {
      setCreatingLocation(false);
    }
  }

  async function handleConnect() {
    const ip = form.ip.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

    if (!form.name.trim() || !form.location.trim() || !ip || !form.user.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (ip !== form.ip.trim()) {
      toast.error('The IP address should not include "http://", "https://", or a port — using the cleaned value.');
      setForm(f => ({ ...f, ip }));
    }
    if (!isEdit && !form.pass) {
      toast.error('Password is required.');
      return;
    }
    if (isEdit && (!form.oldPass || !form.newPass)) {
      toast.error('Old and new password are required.');
      return;
    }

    setConnecting(true);
    try {
      if (isEdit) {
        const payload = {
          ip: encrypt(ip),
          port: Number(form.http),
          rtspPort: Number(form.rtsp),
          username: form.user,
          oldPassword: form.oldPass,
          newPassword: form.newPass,
          nvrName: form.name,
          location: form.location,
          brand: form.brand,
        };
        const resp = await updateNvrById(editingNvr._id, payload);
        const body = resp?.data?.body;
        if (body?.status !== 'success') {
          toast.error(friendlyErrorMessage(body, 'Failed to update NVR. Please check the details and try again.'));
          return;
        }
        toast.success(body?.message || 'NVR updated');

        const camerasBody = await getNvrCamerasForEdit(editingNvr._id);
        if (camerasBody?.status === 'success') {
          applyFetchedCameras(camerasBody.data.availableCameras || []);
          setStep(2);
        } else {
          toast.error(friendlyErrorMessage(camerasBody, 'Failed to load cameras for this NVR.'));
          onSaved?.();
          onClose();
        }
      } else {
        const payload = {
          ip,
          port: Number(form.http),
          rtspPort: Number(form.rtsp),
          username: form.user,
          password: form.pass,
          nvrName: form.name,
          location: form.location,
          brand: form.brand,
        };
        const resp = await registerAndFetchCameras(payload);
        const body = resp?.data?.body;
        if (body?.status === 'success') {
          setSavedNvrId(body.data.nvr._id);
          applyFetchedCameras(body.data.cameras || []);
          setStep(2);
        } else {
          toast.error(friendlyErrorMessage(body, 'Failed to connect to NVR. Please check the connection details and try again.'));
        }
      }
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Failed to connect to NVR. Please check your network and try again.'));
    } finally {
      setConnecting(false);
    }
  }

  const toggleCamera = (channelId) => {
    setSelectedCameras(prev => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });
  };
  const allSelected = fetchedCameras.length > 0 && selectedCameras.size === fetchedCameras.length;
  const toggleSelectAll = () => setSelectedCameras(allSelected ? new Set() : new Set(fetchedCameras.map(c => c.channelId)));

  async function handleSaveCameras() {
    setSaving(true);
    try {
      const toAdd = fetchedCameras.filter(c => selectedCameras.has(c.channelId) && !initialAdded.has(c.channelId));

      if (toAdd.length === 0) {
        toast.info('No new cameras selected');
        onSaved?.();
        onClose();
        return;
      }

      const resp = await addSelectedCameras({ nvrId: savedNvrId, cameraIds: toAdd.map(c => c.channelId) });
      const body = resp?.data?.body;
      if (body?.status !== 'success') {
        toast.error(friendlyErrorMessage(body, 'Failed to add cameras. Please try again.'));
        return;
      }
      toast.success(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(friendlyErrorMessage(e?.response?.data?.body, 'Something went wrong while saving cameras. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 600, maxWidth: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg1)', border: '1px solid var(--bd)',
          borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--bd)', flexShrink: 0 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--bg2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.7">
              <rect x="3" y="4" width="18" height="7" rx="1.5" />
              <rect x="3" y="13" width="18" height="7" rx="1.5" />
              <circle cx="7" cy="7.5" r=".9" fill="var(--blue)" />
              <circle cx="7" cy="16.5" r=".9" fill="var(--blue)" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>
              {isEdit ? 'Edit Network Recorder' : 'Add Network Recorder'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>
              {isEdit ? 'Update NVR credentials and manage cameras' : 'Connect an NVR and onboard its cameras'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--tx3)', border: '1px solid var(--bd)', background: 'none', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 6px', flexShrink: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            background: step >= 1 ? 'var(--blue)' : 'var(--bg2)',
            color: step >= 1 ? '#fff' : 'var(--tx3)',
            border: `1px solid ${step >= 1 ? 'var(--blue)' : 'var(--bd)'}`,
          }}>1</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>Connection</span>
          <div style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            background: step >= 2 ? 'var(--blue)' : 'var(--bg2)',
            color: step >= 2 ? '#fff' : 'var(--tx3)',
            border: `1px solid ${step >= 2 ? 'var(--blue)' : 'var(--bd)'}`,
          }}>2</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: step >= 2 ? 'var(--tx)' : 'var(--tx2)' }}>Select Cameras</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {step === 1 && (
            <div style={{ padding: '14px 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>NVR Brand</FieldLabel>
                <select
                  value={form.brand} onChange={set('brand')} disabled={isEdit}
                  style={{
                    width: '100%', height: 38, padding: '0 28px 0 12px', boxSizing: 'border-box',
                    borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
                    fontSize: 12.5, color: 'var(--tx)', cursor: isEdit ? 'default' : 'pointer', outline: 'none',
                    opacity: isEdit ? 0.6 : 1,
                  }}
                >
                  {NVR_BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <ModalInput label="NVR Name" value={form.name} onChange={set('name')} placeholder="e.g. HQ Core Recorder" />
              <div>
                <FieldLabel>Location</FieldLabel>
                <select
                  value={form.location} onChange={set('location')}
                  style={{
                    width: '100%', height: 38, padding: '0 28px 0 12px', boxSizing: 'border-box',
                    borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
                    fontSize: 12.5, color: 'var(--tx)', cursor: 'pointer', outline: 'none', marginBottom: 6,
                  }}
                >
                  <option value="">Select location…</option>
                  {locations.map((l, i) => {
                    const name = l.locationName || l.name || l;
                    return <option key={i} value={name}>{name}</option>;
                  })}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="Or create new location"
                    style={{
                      flex: 1, height: 30, padding: '0 10px', boxSizing: 'border-box',
                      borderRadius: 7, background: 'var(--bg2)', border: '1px solid var(--bd)',
                      fontSize: 11.5, color: 'var(--tx)', outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCreateLocation}
                    disabled={creatingLocation || !newLocation.trim()}
                    style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--blue)',
                      background: 'rgba(59,130,246,.1)', border: '1px solid var(--blue)',
                      borderRadius: 7, padding: '0 10px', cursor: 'pointer',
                      opacity: creatingLocation || !newLocation.trim() ? 0.5 : 1,
                    }}
                  >
                    {creatingLocation ? '…' : 'Add'}
                  </button>
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <ModalInput label="Public IP Address" value={form.ip} onChange={set('ip')} placeholder="e.g. 203.0.113.24 (no http:// or port)" mono />
              </div>
              <ModalInput label="Username" value={form.user} onChange={set('user')} placeholder="admin" />
              {isEdit ? (
                <div />
              ) : (
                <ModalInput label="Password" type="password" value={form.pass} onChange={set('pass')} placeholder="••••••••" />
              )}
              {isEdit && (
                <>
                  <ModalInput label="Old Password" type="password" value={form.oldPass} onChange={set('oldPass')} placeholder="••••••••" />
                  <ModalInput label="New Password" type="password" value={form.newPass} onChange={set('newPass')} placeholder="••••••••" />
                </>
              )}
              <ModalInput label="RTSP Port" value={form.rtsp} onChange={set('rtsp')} placeholder="554" mono />
              <ModalInput label="HTTP Port" value={form.http} onChange={set('http')} placeholder="80" mono />
            </div>
          )}
          {step === 2 && (
            <div style={{ padding: '14px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>Discovered Cameras</span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--blue)',
                  background: 'rgba(59,130,246,.12)', borderRadius: 6, padding: '2px 8px',
                }}>
                  {selectedCameras.size} selected
                </span>
                {fetchedCameras.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {fetchedCameras.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>
                  No cameras discovered on this NVR.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
                  {fetchedCameras.map(cam => (
                    <DiscoveredCameraRow
                      key={cam.channelId}
                      cam={cam}
                      checked={selectedCameras.has(cam.channelId)}
                      onToggle={() => toggleCamera(cam.channelId)}
                      onPreview={(c) => setPreviewCam({ ...c, streamingUrl: `stream/${savedNvrId}-${c.dbId}/playlist.m3u8` })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          {step === 2 && (
            <button onClick={() => setStep(1)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
              border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', background: 'none',
            }}>
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button onClick={onClose} style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--tx3)',
            cursor: 'pointer', padding: '9px 6px', background: 'none', border: 'none',
          }}>
            Cancel
          </button>
          <span style={{ marginLeft: 'auto' }}>
            {step === 1 ? (
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12.5, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  borderRadius: 9, padding: '9px 16px', cursor: connecting ? 'wait' : 'pointer', border: 'none',
                  opacity: connecting ? 0.7 : 1,
                }}
              >
                {connecting && <Loader2 size={13} className="animate-spin" />}
                {connecting ? 'Connecting…' : 'Discover Cameras →'}
              </button>
            ) : (
              <button
                onClick={handleSaveCameras}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 12.5, fontWeight: 600, color: '#fff',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  borderRadius: 9, padding: '9px 16px', cursor: saving ? 'wait' : 'pointer', border: 'none',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'Saving…' : `Add NVR & ${selectedCameras.size} Camera${selectedCameras.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </span>
        </div>
      </div>

      {previewCam && <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function NVRCameras() {
  const navigate = useNavigate();
  const [nvrModal, setNvrModal] = useState(false);
  const [editingNvr, setEditingNvr] = useState(null);
  const [manageCamerasNvr, setManageCamerasNvr] = useState(null);
  const [nvrPickerOpen, setNvrPickerOpen] = useState(false);
  const [camSearch, setCamSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const nvrPickerRef = useRef(null);

  useEffect(() => {
    if (!nvrPickerOpen) return;
    const h = (e) => { if (nvrPickerRef.current && !nvrPickerRef.current.contains(e.target)) setNvrPickerOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [nvrPickerOpen]);

  const nvrsApi     = useApi(() => getNvrs(0, 100), []);
  const channelsApi = useApi(() => getChannels({ limit: 200 }), []);

  /* Only show the NVR skeleton once loading has actually taken a moment,
     so a fast response never flashes placeholder cards. */
  const [showNvrSkeleton, setShowNvrSkeleton] = useState(false);
  useEffect(() => {
    if (!nvrsApi.loading) { setShowNvrSkeleton(false); return; }
    const t = setTimeout(() => setShowNvrSkeleton(true), 200);
    return () => clearTimeout(t);
  }, [nvrsApi.loading]);

  const nvrs      = nvrsApi.data?.nvrs ?? (Array.isArray(nvrsApi.data) ? nvrsApi.data : []);
  const channels  = channelsApi.data ?? [];

  /* Channels don't carry their own location — it lives on the parent NVR.
     Only one NVR is registered on most installs, so also fall back to it
     directly when a channel's NVR reference can't be resolved by id. */
  const siteByNvrId = useMemo(() => {
    const map = new Map();
    nvrs.forEach(n => {
      const site = n.location || n.locationName || n.site || '';
      [n._id, n.id, n.nvrId].filter(Boolean).forEach(key => map.set(key, site));
    });
    return map;
  }, [nvrs]);

  /* `nvrId` on a channel is the populated NVR document itself (not a bare id
     string), so its `location` can be read straight off — the id-map lookup
     is only a fallback for shapes where nvrId comes back unpopulated. */
  const channelNvrId = (c) => c.nvrId?._id || c.nvr?._id || c.nvrId || c.nvr || c.nvrID || null;

  const siteOf = (c) => {
    const direct = c.location || c.locationName || c.site || c.nvrId?.location || c.nvr?.location;
    if (direct) return direct;
    const viaId = siteByNvrId.get(channelNvrId(c));
    if (viaId) return viaId;
    // Single-NVR installs: every channel belongs to the only NVR present.
    if (nvrs.length === 1) return nvrs[0].location || nvrs[0].locationName || nvrs[0].site || '';
    return '';
  };

  const camFiltered = channels.filter(c => {
    const nameMatch = !camSearch || (c.name || c.channelName || '').toLowerCase().includes(camSearch.toLowerCase());
    const siteMatch = !siteFilter || siteOf(c).trim().toLowerCase() === siteFilter.trim().toLowerCase();
    return nameMatch && siteMatch;
  });

  const handleViewCamera = (c) => {
    const camId = c._id || c.channelId;
    navigate(`/v2/wall${camId ? `?cam=${camId}` : ''}`);
  };

  const handleConfirmDeleteNvr = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNvrById(deleteTarget._id || deleteTarget.id);
      toast.success('NVR deleted successfully');
      setDeleteTarget(null);
      nvrsApi.refetch();
      channelsApi.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.body?.message || 'Failed to delete NVR');
    } finally {
      setDeleting(false);
    }
  };

  /* Built from the NVRs' own `location` field — the same source siteOf()
     reads for the filter — so every option here is guaranteed matchable.
     (The standalone Location collection is a separate free-text list that
     doesn't necessarily agree in spelling/casing with what's on each NVR.) */
  const nvrSites = [...new Set(nvrs.map(n => (n.location || n.locationName || n.site || '').trim()).filter(Boolean))].sort();
  const siteOpts = [
    { v: '', l: 'All Sites' },
    ...nvrSites.map(s => ({ v: s, l: s })),
  ];

  function handleManageCamerasClick() {
    if (nvrs.length === 0) {
      toast.error('Add an NVR first before managing cameras.');
      return;
    }
    if (nvrs.length === 1) {
      setManageCamerasNvr(nvrs[0]);
      return;
    }
    setNvrPickerOpen(true);
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Title + filters ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>Network Recorders</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)',
          background: 'var(--bg2)', border: '1px solid var(--bd)',
          borderRadius: 6, padding: '3px 9px',
        }}>
          {nvrs.length} NVR{nvrs.length !== 1 ? 's' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
          <button
            onClick={() => setNvrModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
              border: 'none', whiteSpace: 'nowrap',
              boxShadow: '0 0 14px rgba(99,102,241,.3)',
            }}
          >
            <Plus size={14} /> Add NVR
          </button>
        </div>
      </div>

      {/* ── NVR cards ─────────────────────────────────────────────────────── */}
      {nvrsApi.loading ? (
        showNvrSkeleton ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }} className="vq-nvr-grid">
            {Array.from({ length: 2 }, (_, i) => <NvrCardSkeleton key={i} />)}
          </div>
        ) : (
          <div style={{ minHeight: 140 }} />
        )
      ) : (
        <AsyncBoundary
          loading={false}
          error={nvrsApi.error}
          isEmpty={!nvrsApi.error && nvrs.length === 0}
          onRetry={nvrsApi.refetch}
          minH={140}
          emptyLabel="No NVRs found"
        >
          {() => (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }} className="vq-nvr-grid">
              {nvrs.map(n => (
                <NvrCard
                  key={n._id || n.id}
                  nvr={n}
                  onEdit={setEditingNvr}
                  onCameraSettings={(nvr) => navigate('/v2/camera-settings', { state: { nvrId: nvr._id || nvr.id } })}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </AsyncBoundary>
      )}

      {/* ── Camera Inventory ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Table header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Camera Inventory</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 8 }}>
            {camFiltered.length} of {channels.length} cameras
          </span>
          <div ref={nvrPickerRef} style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleManageCamerasClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              }}
            >
              <ListVideo size={13} /> Manage Cameras
            </button>
            {nvrPickerOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                minWidth: 200, background: 'var(--bg1solid)', border: '1px solid var(--bd)',
                borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,.3)', overflow: 'hidden',
              }}>
                {nvrs.map(n => (
                  <div
                    key={n._id || n.id}
                    onClick={() => { setManageCamerasNvr(n); setNvrPickerOpen(false); }}
                    style={{ padding: '9px 14px', fontSize: 12.5, color: 'var(--tx)', cursor: 'pointer', borderBottom: '1px solid var(--bd)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {n.name || n.nvrName || 'Unknown NVR'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx3)' }}>
            <Search size={13} />
            <input
              value={camSearch}
              onChange={e => setCamSearch(e.target.value)}
              placeholder="Search camera or ID"
              style={{ background: 'transparent', border: 0, outline: 'none', fontSize: 12, width: 140, color: 'var(--tx)' }}
            />
          </div>
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            style={{
              height: 32, padding: '0 26px 0 11px', borderRadius: 8,
              background: 'var(--bg2)', border: '1px solid var(--bd)',
              fontSize: 11.5, color: 'var(--tx)', cursor: 'pointer', outline: 'none',
            }}
          >
            {siteOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {(camSearch || siteFilter) && (
            <button
              onClick={() => { setCamSearch(''); setSiteFilter(''); }}
              style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--blue)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: CAM_COL,
          padding: '10px 16px', borderBottom: '1px solid var(--bd)',
          fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.07em', color: 'var(--tx3)',
        }}>
          {['ID', 'NAME', 'SITE', ''].map((h, i) => <span key={i}>{h}</span>)}
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 430, overflowY: 'auto' }}>
          <AsyncBoundary
            loading={channelsApi.loading}
            error={channelsApi.error}
            isEmpty={!channelsApi.loading && !channelsApi.error && camFiltered.length === 0}
            onRetry={channelsApi.refetch}
            minH={100}
            emptyLabel="No cameras found"
          >
            {() => camFiltered.map(c => (
              <CamRow key={c._id || c.id} c={c} site={siteOf(c)} onView={handleViewCamera} />
            ))}
          </AsyncBoundary>
        </div>
      </div>

      {/* Add / Edit NVR wizard */}
      {(nvrModal || editingNvr) && (
        <AddNvrModal
          editingNvr={editingNvr}
          onClose={() => { setNvrModal(false); setEditingNvr(null); }}
          onSaved={() => { nvrsApi.refetch(); channelsApi.refetch(); }}
        />
      )}

      {/* Manage Cameras */}
      {manageCamerasNvr && (
        <ManageCamerasModal
          nvr={manageCamerasNvr}
          onClose={() => setManageCamerasNvr(null)}
          onSaved={() => { nvrsApi.refetch(); channelsApi.refetch(); }}
        />
      )}

      {/* Delete NVR confirmation */}
      <DeleteConfirmation
        open={!!deleteTarget}
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={
          <>
            Are you sure you want to delete "{deleteTarget?.name || deleteTarget?.nvrName || ''}"? This action cannot be undone. Once deleted, this NVR and all channels associated with it cannot be recovered.
          </>
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteNvr}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={deleting}
      />
    </div>
  );
}
