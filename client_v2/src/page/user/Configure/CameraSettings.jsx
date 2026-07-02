import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, RefreshCw, Pencil, Loader2, X, Eye, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { AsyncBoundary } from '../../../components/States';
import { getNvrChannelDetails, updateChannel, refetchNvrChannels } from '../../../helpers/configure';
import { fetchDepartments } from '../Departments/Api';
import useHlsPlayer from '../../../hooks/useHlsPlayer';
import { streamUrl } from '../../../lib/stream';

// ── Alias edit popup ─────────────────────────────────────────────────────────
function AliasModal({ camera, onClose, onSave }) {
  const [value, setValue] = useState(camera.aliasName || '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave(value.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,8,13,.62)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '100%', background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 14 }}>
          {camera.aliasName ? 'Edit Alias Name' : 'Add Alias Name'}
        </div>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Enter alias name"
          style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)', border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', background: 'none' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', borderRadius: 9, padding: '9px 16px', cursor: saving ? 'wait' : 'pointer', border: 'none', opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline department multi-select (dropdown trigger + checklist) ──────────
function DeptMultiSelect({ options, selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 240) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => updateCoords();
    document.addEventListener('mousedown', h);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selectedLabels = options.filter(o => selected.includes(o.value)).map(o => o.label);

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  return (
    <div style={{ minWidth: 220 }}>
      <button
        ref={triggerRef}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 34, padding: '5px 10px',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        {selectedLabels.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Select…</span>
        ) : (
          selectedLabels.slice(0, 3).map(l => (
            <span key={l} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.12)', borderRadius: 5, padding: '2px 7px' }}>
              {l}
            </span>
          ))
        )}
        {selectedLabels.length > 3 && (
          <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>+{selectedLabels.length - 3}</span>
        )}
        <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--tx3)', flexShrink: 0 }} />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 1000,
            background: 'var(--bg1solid)', border: '1px solid var(--bd)',
            borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,.3)', padding: 10,
          }}
        >
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search department..."
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 26, paddingRight: 8, height: 28, border: '1px solid var(--bd)', borderRadius: 6, fontSize: 11.5, outline: 'none', color: 'var(--tx)', background: 'var(--bg2)' }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--tx3)', padding: '6px 4px' }}>No results</div>
            ) : (
              filtered.map(o => {
                const checked = selected.includes(o.value);
                return (
                  <div
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 6, cursor: 'pointer', background: checked ? 'rgba(59,130,246,.08)' : 'transparent' }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${checked ? 'var(--blue)' : 'var(--bd2)'}`, background: checked ? 'var(--blue)' : 'var(--bg1solid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {checked && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{o.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Live preview modal ──────────────────────────────────────────────────────
function LivePreviewModal({ camera, onClose }) {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const url = streamUrl(camera);

  useHlsPlayer(videoRef, url, {
    autoPlay: true,
    onError: (msg) => { setErrorMsg(msg); setIsLoading(false); setHasError(true); },
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(4,6,12,.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '100%', background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="vq-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{camera.aliasName || camera.cameraName}</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
          {isLoading && !hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,.8)' }}>
              <Loader2 size={26} className="animate-spin" style={{ color: '#fff' }} />
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)' }}>Connecting to stream…</span>
            </div>
          )}
          {hasError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,.85)', color: '#fff', textAlign: 'center', padding: 16 }}>
              <span style={{ fontSize: 13 }}>Unable to load stream</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{errorMsg || 'Camera offline'}</span>
            </div>
          )}
          <video ref={videoRef} autoPlay muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onCanPlay={() => { setIsLoading(false); setHasError(false); }}
            onPlaying={() => { setIsLoading(false); setHasError(false); }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CameraSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const nvrId = location.state?.nvrId;

  const [nvrDetails, setNvrDetails] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [aliasCamera, setAliasCamera] = useState(null);
  const [previewCamera, setPreviewCamera] = useState(null);

  async function loadCameraDetails() {
    if (!nvrId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await getNvrChannelDetails(nvrId);
      if (body?.status === 'success') {
        const channels = body.data?.channels || [];
        setTableData(channels.map((ch, idx) => ({
          id: ch._id,
          cameraName: ch.name || `Camera ${idx + 1}`,
          aliasName: ch.customName || '',
          departments: ch.department || [],
          streamingUrl: ch.streamingUrl || null,
        })));
        setNvrDetails(body.data?.nvr || null);
      } else {
        setError(new Error(body?.message || 'Failed to load camera details'));
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDepartments(0, 100, '').then(res => {
      const data = res?.data?.body?.data;
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setDepartmentOptions(list.map(d => ({ value: d._id, label: d.departmentName })));
    }).catch(() => {});
    loadCameraDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nvrId]);

  async function handleRefreshAll() {
    if (!nvrId) return;
    setRefreshing(true);
    try {
      const resp = await refetchNvrChannels(nvrId);
      if (resp?.data?.body?.status === 'success') {
        await loadCameraDetails();
        toast.success('Cameras refreshed successfully');
      } else {
        toast.error(resp?.data?.body?.message || 'Failed to refresh cameras');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to refresh cameras');
    } finally {
      setRefreshing(false);
    }
  }

  async function saveAlias(cameraId, aliasName) {
    try {
      const resp = await updateChannel(cameraId, { customName: aliasName });
      if (resp?.data?.body?.status === 'success') {
        toast.success(resp?.data?.body?.message || 'Alias updated');
        setTableData(prev => prev.map(c => c.id === cameraId ? { ...c, aliasName } : c));
      } else {
        toast.error(resp?.data?.body?.message || 'Failed to update alias');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to update alias');
    }
  }

  async function saveDepartments(cameraId, departmentIds) {
    const prev = tableData;
    setTableData(p => p.map(c => c.id === cameraId ? { ...c, departments: departmentIds } : c));
    try {
      const resp = await updateChannel(cameraId, { department: departmentIds });
      if (resp?.data?.body?.status !== 'success') {
        setTableData(prev);
        toast.error(resp?.data?.body?.message || 'Failed to update departments');
      } else {
        toast.success('Departments updated');
      }
    } catch (e) {
      setTableData(prev);
      toast.error(e?.response?.data?.body?.message || 'Failed to update departments');
    }
  }

  const filtered = tableData.filter(c =>
    !search ||
    c.cameraName?.toLowerCase().includes(search.toLowerCase()) ||
    c.aliasName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Back */}
      <button
        onClick={() => navigate('/v2/cameras')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx2)' }}
      >
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg2)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={14} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Go back to NVR settings</span>
      </button>

      <div>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 20 }}>Camera Settings</span>
      </div>

      {/* NVR Info */}
      {nvrDetails && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx)', borderBottom: '1px solid var(--bd)', paddingBottom: 12 }}>
            Current NVR Settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { label: 'Name', value: nvrDetails.nvrName || '' },
              { label: 'Location', value: nvrDetails.location || '' },
              { label: 'RTSP Port', value: nvrDetails.rtspPort || '' },
            ].map((f, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 5 }}>{f.label}</div>
                <input disabled value={f.value} style={{ width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task selector table */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>CCTV AI Monitoring Task Selector</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', minWidth: 220 }}>
            <Search size={13} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search camera or alias..."
              style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--tx)', fontSize: 12 }}
            />
          </div>
          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--blue)', background: 'rgba(59,130,246,.08)', border: '1px solid var(--blue)', borderRadius: 8, padding: '7px 14px', cursor: refreshing ? 'wait' : 'pointer' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh All'}
          </button>
        </div>

        <AsyncBoundary
          loading={loading}
          error={error}
          isEmpty={!loading && !error && filtered.length === 0}
          onRetry={loadCameraDetails}
          minH={160}
          emptyLabel={nvrId ? 'No cameras found on this NVR' : 'No NVR selected'}
        >
          {() => (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd)' }}>
                    {['Camera Name', 'Alias Name', 'Assigned Departments'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(camera => (
                    <tr key={camera.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {camera.cameraName}
                          {camera.streamingUrl && (
                            <button
                              onClick={() => setPreviewCamera(camera)}
                              title="View live"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx3)', cursor: 'pointer' }}
                            >
                              <Eye size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--tx2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {camera.aliasName ? (
                            <span>{camera.aliasName}</span>
                          ) : (
                            <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>No alias</span>
                          )}
                          <button
                            onClick={() => setAliasCamera(camera)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer' }}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <DeptMultiSelect
                          options={departmentOptions}
                          selected={camera.departments}
                          onChange={(ids) => saveDepartments(camera.id, ids)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncBoundary>
      </div>

      {aliasCamera && (
        <AliasModal
          camera={aliasCamera}
          onClose={() => setAliasCamera(null)}
          onSave={(value) => saveAlias(aliasCamera.id, value)}
        />
      )}
      {previewCamera && (
        <LivePreviewModal camera={previewCamera} onClose={() => setPreviewCamera(null)} />
      )}
    </div>
  );
}
