import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';
import { Panel, Toggle } from '../../../components/primitives';
import { fetchLogsSound, updateLogsSound } from '../../../helpers/admin';

/**
 * System Controls. Only "Audio Alarm" maps to a real backend preference
 * (admin logsSound). The rest have no backend endpoint yet (see gap analysis),
 * so they persist locally and are clearly marked — no fabricated server state.
 */
const LOCAL_KEY = 'vq-system-controls';
const LOCAL_CONTROLS = [
  { id: 'aiArmed', label: 'AI Detection', desc: 'Engines armed', def: true },
  { id: 'recording', label: 'Recording', desc: 'Continuous capture', def: true },
  { id: 'autoDispatch', label: 'Auto Dispatch', desc: 'Route critical alerts', def: false },
  { id: 'nightMode', label: 'Night Mode', desc: 'IR / low-light tuning', def: false },
  { id: 'privacyMask', label: 'Privacy Mask', desc: 'Blur faces in feeds', def: false },
];

function loadLocal() {
  try {
    return { ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') };
  } catch {
    return {};
  }
}

export default function SystemControls() {
  const [local, setLocal] = useState(() => {
    const saved = loadLocal();
    return LOCAL_CONTROLS.reduce((acc, c) => ({ ...acc, [c.id]: saved[c.id] ?? c.def }), {});
  });
  const [audio, setAudio] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);

  useEffect(() => {
    fetchLogsSound().then(setAudio).catch(() => {});
  }, []);

  const toggleLocal = (id) =>
    setLocal((s) => {
      const next = { ...s, [id]: !s[id] };
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  async function toggleAudio() {
    const next = !audio;
    setAudio(next);
    setAudioBusy(true);
    try {
      await updateLogsSound(next);
    } catch {
      setAudio(!next);
      toast.error('Could not update audio alarm');
    } finally {
      setAudioBusy(false);
    }
  }

  const row = (key, label, desc, on, onToggle, backed) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: '9px 10px' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? 'var(--ok)' : 'var(--tx3)', boxShadow: on ? '0 0 7px var(--ok)' : 'none', flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.1 }}>{label}</div>
        <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {desc}{!backed ? ' · local' : ''}
        </div>
      </div>
      <Toggle on={on} onChange={onToggle} disabled={key === 'audio' && audioBusy} />
    </div>
  );

  return (
    <Panel style={{ padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        <Shield size={15} strokeWidth={1.7} style={{ color: 'var(--tx2)' }} />
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 13.5 }}>System Controls</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {LOCAL_CONTROLS.map((c) => row(c.id, c.label, c.desc, local[c.id], () => toggleLocal(c.id), false))}
        {row('audio', 'Audio Alarm', 'Sound on critical', audio, toggleAudio, true)}
      </div>
    </Panel>
  );
}
