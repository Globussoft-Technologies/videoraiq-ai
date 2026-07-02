import { useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { fetchAdmin, fetchLogsSound, updateLogsSound } from '../../../helpers/administer';

// ── helpers ──────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 13,
        background: value
          ? 'linear-gradient(90deg,var(--blue),var(--violet))'
          : 'var(--bg3,#2a2d3a)',
        position: 'relative', cursor: disabled ? 'default' : 'pointer',
        transition: 'background .2s', flexShrink: 0,
        border: '1px solid var(--bd)',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 22 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      }} />
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange, disabled, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 0',
      borderBottom: last ? 'none' : '1px solid var(--bd)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg1)', border: '1px solid var(--bd)',
      borderRadius: 14, padding: 18, ...style,
    }}>
      {children}
    </div>
  );
}

function PanelTitle({ children }) {
  return (
    <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>{children}</div>;
}

function ReadOnlyField({ value }) {
  return (
    <div style={{
      height: 38, display: 'flex', alignItems: 'center',
      padding: '0 12px', borderRadius: 9,
      background: 'var(--bg2)', border: '1px solid var(--bd)',
      fontSize: 12.5, color: 'var(--tx2)',
    }}>
      {value}
    </div>
  );
}

// ── static config ─────────────────────────────────────────────────────────────
const ALERT_CHANNELS = [
  { key: 'email',   label: 'Email Alerts',  desc: 'security@org.com, ops@org.com' },
  { key: 'sms',     label: 'SMS Alerts',    desc: 'Critical events to on-call phones' },
  { key: 'push',    label: 'Mobile Push',   desc: 'VideoraIQ app notifications' },
  { key: 'webhook', label: 'Webhook / API', desc: 'POST events to your endpoint' },
];

const COMPLIANCE_ROWS = [
  { key: 'gdpr',    label: 'GDPR Mode',           desc: 'EU data residency & right-to-erasure', on: true },
  { key: 'hipaa',   label: 'HIPAA Safeguards',     desc: 'Healthcare-grade encryption & logs',  on: true },
  { key: 'purge',   label: 'Face Data Auto-Purge', desc: 'Delete biometric vectors after 90 days', on: true },
  { key: 'audit',   label: 'Immutable Audit Trail', desc: 'Log every admin & access action',    on: true },
  { key: 'privacy', label: 'Privacy Masking',       desc: 'Blur faces for non-authorized roles', on: false },
];

const INTEGRATIONS = [
  { name: 'Slack',           desc: 'Alert channel #security-ops',    on: true  },
  { name: 'Microsoft Teams', desc: 'Incident notifications',          on: false },
  { name: 'AWS S3',          desc: 'Long-term clip archival',         on: true  },
  { name: 'REST API',        desc: 'Key — 7f3a · 2 apps connected',  on: true  },
];

// ── main ───────────────────────────────────────────────────────────────────────
export default function SystemSettings() {
  const adminApi    = useApi(() => fetchAdmin(), []);
  const soundApi    = useApi(() => fetchLogsSound(), []);
  const [soundSaving, setSoundSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const orgName = adminApi.data?.name || adminApi.data?.orgName || adminApi.data?.organizationName || 'Acme Security Operations';

  // local UI state (no real backend for these)
  const [alertChannels, setAlertChannels] = useState(
    Object.fromEntries(ALERT_CHANNELS.map(c => [c.key, c.key !== 'webhook']))
  );
  const [compliance, setCompliance] = useState(
    Object.fromEntries(COMPLIANCE_ROWS.map(c => [c.key, c.on]))
  );
  const [retention, setRetention]   = useState(30);
  const [confidence, setConfidence] = useState(85);

  const soundEnabled = soundApi.data ?? false;

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSoundToggle = async (val) => {
    setSoundSaving(true);
    try {
      await updateLogsSound(val);
      soundApi.refetch();
      showToast(`Alert sound ${val ? 'enabled' : 'disabled'}`);
    } catch {
      showToast('Failed to update', 'err');
    } finally {
      setSoundSaving(false);
    }
  };

  return (
    <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>

      {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* General */}
        <Panel>
          <PanelTitle>General</PanelTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <FieldLabel>Organization Name</FieldLabel>
              <input
                defaultValue={orgName}
                style={{
                  width: '100%', height: 38, padding: '0 12px', boxSizing: 'border-box',
                  borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
                  fontSize: 13, color: 'var(--tx)', outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
              <div>
                <FieldLabel>Timezone</FieldLabel>
                <ReadOnlyField value="UTC +05:30 (IST)" />
              </div>
              <div>
                <FieldLabel>Language</FieldLabel>
                <ReadOnlyField value="English (US)" />
              </div>
            </div>
          </div>
        </Panel>

        {/* Alert Channels */}
        <Panel>
          <PanelTitle>Alert Channels</PanelTitle>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>
            Where VideoraIQ sends real-time detections.
          </div>
          {ALERT_CHANNELS.map((c, i) => (
            <ToggleRow
              key={c.key}
              label={c.label}
              desc={c.desc}
              value={alertChannels[c.key]}
              onChange={v => setAlertChannels(p => ({ ...p, [c.key]: v }))}
              last={i === ALERT_CHANNELS.length - 1}
            />
          ))}
        </Panel>

        {/* Cloud Video Retention */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Cloud Video Retention</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>
              {retention} days
            </span>
          </div>
          <input
            type="range" min={7} max={90} value={retention}
            onChange={e => setRetention(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--blue)', height: 5, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 6 }}>
            <span>7d</span><span>30d</span><span>60d</span><span>90d</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 12 }}>
            Est. storage: <span style={{ color: 'var(--tx2)', fontFamily: 'var(--mono)' }}>~4.2 TB</span> across 1,310 cameras at H.265.
          </div>
        </Panel>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* AI Detection Defaults */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>AI Detection Defaults</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--violet)' }}>
              {confidence}%
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 7 }}>Minimum confidence threshold</div>
          <input
            type="range" min={50} max={99} value={confidence}
            onChange={e => setConfidence(+e.target.value)}
            style={{ width: '100%', accentColor: 'var(--violet)', height: 5, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', marginTop: 6 }}>
            <span>50%</span><span>75%</span><span>99%</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 11, lineHeight: 1.5 }}>
            Detections below this threshold are logged but won't trigger alerts — tune to balance sensitivity vs false positives.
          </div>
        </Panel>

        {/* Privacy & Compliance */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Privacy &amp; Compliance</div>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
              color: 'var(--ok)', border: '1px solid var(--ok)',
              borderRadius: 4, padding: '1px 6px',
            }}>
              GDPR · HIPAA
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>
            Built-in safeguards for biometric &amp; video data.
          </div>
          {COMPLIANCE_ROWS.map((c, i) => (
            <ToggleRow
              key={c.key}
              label={c.label}
              desc={c.desc}
              value={compliance[c.key]}
              onChange={v => setCompliance(p => ({ ...p, [c.key]: v }))}
              last={i === COMPLIANCE_ROWS.length - 1}
            />
          ))}
        </Panel>

        {/* Integrations */}
        <Panel>
          <PanelTitle>Integrations</PanelTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {INTEGRATIONS.map(it => (
              <div key={it.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 11, borderRadius: 11,
                background: 'var(--bg2)', border: '1px solid var(--bd)',
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: it.on ? '#22c55e' : '#6b7796',
                  boxShadow: `0 0 7px ${it.on ? '#22c55e' : '#6b7796'}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{it.desc}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--blue)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Manage
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 24, zIndex: 300,
          background: toast.type === 'err' ? 'rgba(239,68,68,.9)' : 'rgba(34,197,94,.9)',
          color: '#fff', padding: '10px 18px', borderRadius: 9,
          fontSize: 12.5, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
