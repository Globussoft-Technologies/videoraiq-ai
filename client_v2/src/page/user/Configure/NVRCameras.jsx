import { useState } from 'react';
import { Search, Plus, X, RefreshCw } from 'lucide-react';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getNvrs, getCamerasByNvr } from '../../../helpers/configure';
import { getChannels, getLocations } from '../../../helpers/monitoring';

// ── helpers ──────────────────────────────────────────────────────────────────
function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'online' || s === 'active') return '#22c55e';
  if (s === 'warning') return '#f5a623';
  return '#6b7796';
}

function storageColor(pct) {
  if (pct >= 85) return '#ef4444';
  if (pct >= 65) return '#f5a623';
  return '#3b82f6';
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg3,#1e2130)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct || 0)}%`, background: color || 'var(--blue)', borderRadius: 3 }} />
    </div>
  );
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

const NVR_BRANDS = ['Hikvision', 'Dahua', 'Axis', 'Bosch', 'Hanwha Vision', 'Uniview', 'CP Plus', 'Vivotek'];

// ── NVR card ─────────────────────────────────────────────────────────────────
function NvrCard({ nvr }) {
  const used    = nvr.usedChannels ?? nvr.used ?? 0;
  const total   = nvr.totalChannels ?? nvr.total ?? nvr.maxChannels ?? 0;
  const storage = nvr.storageUsed ?? nvr.storage ?? nvr.storagePercentage ?? 0;
  const sc      = statusColor(nvr.status);
  const chPct   = total ? Math.round((used / total) * 100) : 0;

  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)',
      borderRadius: 14, padding: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
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
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--tx3)' }}>
            {nvr._id?.slice(-6) || nvr.id || '—'} · {nvr.ip || nvr.ipAddress || '—'}
          </div>
        </div>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: sc,
          boxShadow: `0 0 7px ${sc}`, flexShrink: 0,
        }} />
      </div>

      {/* Model / Site */}
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginBottom: 11 }}>
        {nvr.model || nvr.brand || '—'} · {nvr.location || nvr.locationName || nvr.site || '—'}
      </div>

      {/* Channels bar */}
      <div style={{ marginBottom: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--tx2)', marginBottom: 4 }}>
          <span>Channels</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{used}/{total || '?'}</span>
        </div>
        <ProgressBar pct={chPct} color="var(--blue)" />
      </div>

      {/* Storage bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--tx2)', marginBottom: 4 }}>
          <span>Storage</span>
          <span style={{ fontFamily: 'var(--mono)' }}>{storage}%</span>
        </div>
        <ProgressBar pct={storage} color={storageColor(storage)} />
      </div>
    </div>
  );
}

// ── Camera row ────────────────────────────────────────────────────────────────
const CAM_COL = '90px 1.4fr 1fr 70px 70px 1.2fr 80px';

function CamRow({ c }) {
  const sc = statusColor(c.status);
  const engines = Array.isArray(c.detectionSettings) ? c.detectionSettings : [];

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
        {c.location || c.locationName || c.site || '—'}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
        {c.resolution || c.res || '—'}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
        {c.fps ? `${c.fps}` : '—'}
      </span>
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {engines.slice(0, 3).map((e, i) => (
          <span key={i} style={{
            fontFamily: 'var(--mono)', fontSize: 8.5, fontWeight: 600,
            color: 'var(--blue)', border: '1px solid var(--blue)',
            borderRadius: 4, padding: '1px 5px',
          }}>
            {(e.name || e.type || e).slice(0, 4).toUpperCase()}
          </span>
        ))}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}>
        View →
      </span>
    </div>
  );
}

// ── Add NVR wizard ────────────────────────────────────────────────────────────
function AddNvrModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    brand: 'Hikvision', name: '', location: '', ip: '',
    user: 'admin', pass: '', rtsp: '554', http: '80',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>Add Network Recorder</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>Connect an NVR and onboard its cameras</div>
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
                  value={form.brand} onChange={set('brand')}
                  style={{
                    width: '100%', height: 38, padding: '0 28px 0 12px', boxSizing: 'border-box',
                    borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
                    fontSize: 12.5, color: 'var(--tx)', cursor: 'pointer', outline: 'none',
                  }}
                >
                  {NVR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <ModalInput label="NVR Name" value={form.name} onChange={set('name')} placeholder="e.g. HQ Core Recorder" />
              <ModalInput label="Location" value={form.location} onChange={set('location')} placeholder="e.g. HQ Tower" />
              <div style={{ gridColumn: '1 / -1' }}>
                <ModalInput label="Public IP Address" value={form.ip} onChange={set('ip')} placeholder="e.g. 203.0.113.24" mono />
              </div>
              <ModalInput label="Username" value={form.user} onChange={set('user')} placeholder="admin" />
              <ModalInput label="Password" type="password" value={form.pass} onChange={set('pass')} placeholder="••••••••" />
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
                  0 selected
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>
                Connect the NVR to discover cameras.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderTop: '1px solid var(--bd)', flexShrink: 0 }}>
          {step === 2 && (
            <button onClick={() => setStep(1)} style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
              border: '1px solid var(--bd)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', background: 'none',
            }}>
              ← Back
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
              <button onClick={() => setStep(2)} style={{
                fontSize: 12.5, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                borderRadius: 9, padding: '9px 16px', cursor: 'pointer', border: 'none',
              }}>
                Discover Cameras →
              </button>
            ) : (
              <button onClick={onClose} style={{
                fontSize: 12.5, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                borderRadius: 9, padding: '9px 16px', cursor: 'pointer', border: 'none', opacity: 0.5,
              }}>
                Add NVR &amp; 0 Cameras
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function NVRCameras() {
  const [nvrModal, setNvrModal] = useState(false);
  const [camSearch, setCamSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');

  const nvrsApi     = useApi(() => getNvrs({ limit: 100 }), []);
  const channelsApi = useApi(() => getChannels({ limit: 200 }), []);
  const locationsApi = useApi(() => getLocations({ limit: 100 }), []);

  const nvrs      = nvrsApi.data?.nvrs ?? (Array.isArray(nvrsApi.data) ? nvrsApi.data : []);
  const channels  = channelsApi.data ?? [];
  const locations = locationsApi.data ?? [];

  const camFiltered = channels.filter(c => {
    const nameMatch = !camSearch || (c.name || c.channelName || '').toLowerCase().includes(camSearch.toLowerCase());
    const siteMatch = !siteFilter || (c.location || c.locationName || '').toLowerCase().includes(siteFilter.toLowerCase());
    return nameMatch && siteMatch;
  });

  const siteOpts = [
    { v: '', l: 'All Sites' },
    ...locations.map(l => ({ v: l.locationName || l.name, l: l.locationName || l.name })),
  ];

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
            onClick={() => nvrsApi.refetch()}
            style={{
              height: 34, width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
              cursor: 'pointer', color: 'var(--tx3)',
            }}
          >
            <RefreshCw size={12} />
          </button>
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
      <AsyncBoundary
        loading={nvrsApi.loading}
        error={nvrsApi.error}
        isEmpty={!nvrsApi.loading && !nvrsApi.error && nvrs.length === 0}
        onRetry={nvrsApi.refetch}
        minH={140}
        emptyLabel="No NVRs found"
      >
        {() => (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} className="vq-nvr-grid">
            {nvrs.map(n => <NvrCard key={n._id || n.id} nvr={n} />)}
          </div>
        )}
      </AsyncBoundary>

      {/* ── Camera Inventory ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>

        {/* Table header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--bd)' }}>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Camera Inventory</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', marginLeft: 8 }}>
            {camFiltered.length} of {channels.length} cameras
          </span>
          <button
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, color: '#fff',
              background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
              border: 'none', boxShadow: '0 0 12px rgba(99,102,241,.25)',
            }}
          >
            <Plus size={13} /> Add Camera
          </button>
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
          {['ID', 'NAME', 'SITE', 'RES', 'FPS', 'ENGINES', ''].map((h, i) => <span key={i}>{h}</span>)}
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
            {() => camFiltered.map(c => <CamRow key={c._id || c.id} c={c} />)}
          </AsyncBoundary>
        </div>
      </div>

      {/* Add NVR wizard */}
      {nvrModal && <AddNvrModal onClose={() => setNvrModal(false)} />}
    </div>
  );
}
