import { useCallback, useEffect, useState } from 'react';
import { Check, Cpu, Loader2, ShieldAlert, Trash2, Wifi, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import DeleteConfirmation from '@/components/DeleteConfirmation';
import RefreshControl from '@/components/RefreshControl';
import {
  deleteRaspberryPiDevice,
  getRaspberryPiDevices,
  setRaspberryPiApproval,
} from '@/helpers/raspberryPiDevices';

const statusTone = {
  pending: ['#f59e0b', 'rgba(245,158,11,.12)'],
  approved: ['#10b981', 'rgba(16,185,129,.12)'],
  rejected: ['#ef4444', 'rgba(239,68,68,.12)'],
};

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.body?.message || error?.message || fallback;
}

function Status({ value }) {
  const [color, background] = statusTone[value] || statusTone.pending;
  return (
    <span style={{ color, background, border: `1px solid ${color}55`, borderRadius: 999, padding: '4px 9px', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
      {value || 'pending'}
    </span>
  );
}

function Detail({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: 'var(--tx)', fontSize: 12.5, fontWeight: 600, marginTop: 4, overflowWrap: 'anywhere' }}>{value || '—'}</div>
    </div>
  );
}

function DeviceCard({ device, busy, onDecision, onDelete }) {
  const connected = device.connectivityStatus === 'connected';
  const stationName = device.station?.name || device.station?.id || device.station?.stationId;
  return (
    <article style={{ background: 'var(--bg1)', border: `1px solid ${device.approvalStatus === 'pending' ? 'rgba(245,158,11,.45)' : 'var(--bd)'}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ alignItems: 'center', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 10, padding: '13px 15px' }}>
        <span style={{ background: 'rgba(59,130,246,.12)', borderRadius: 9, color: 'var(--blue)', display: 'grid', height: 36, placeItems: 'center', width: 36 }}><Cpu size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--tx)', fontSize: 13.5, fontWeight: 700 }}>{stationName || 'Raspberry Pi Station'}</div>
          <div style={{ color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 2 }}>{device.mac}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}><Status value={device.approvalStatus} /></div>
      </div>
      <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', padding: 15 }}>
        <Detail label="Pairing code" value={device.code} />
        <Detail label="IP address" value={device.ip} />
        <Detail label="Connection" value={connected ? 'Online' : 'Offline'} />
        <Detail label="Last seen" value={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'} />
      </div>
      <div style={{ alignItems: 'center', background: 'var(--bg2)', borderTop: '1px solid var(--bd)', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '11px 15px' }}>
        <span style={{ alignItems: 'center', color: connected ? 'var(--ok)' : 'var(--tx3)', display: 'inline-flex', fontSize: 11.5, gap: 6 }}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{connected ? 'Pi is connected' : 'Pi is not currently connected'}
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button disabled={busy} onClick={() => onDelete(device)} style={{ alignItems: 'center', background: 'transparent', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, color: 'var(--crit)', cursor: 'pointer', display: 'inline-flex', fontSize: 12, fontWeight: 700, gap: 6, opacity: busy ? .5 : 1, padding: '8px 12px' }}><Trash2 size={14} /> Delete</button>
          {device.approvalStatus === 'pending' && (
            <>
            <button disabled={busy} onClick={() => onDecision(device, 'rejected')} style={{ alignItems: 'center', background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, color: 'var(--crit)', cursor: 'pointer', display: 'inline-flex', fontSize: 12, fontWeight: 700, gap: 6, opacity: busy ? .5 : 1, padding: '8px 12px' }}><X size={14} /> Reject</button>
            <button disabled={busy} onClick={() => onDecision(device, 'approved')} style={{ alignItems: 'center', background: 'var(--ok)', border: 0, borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'inline-flex', fontSize: 12, fontWeight: 700, gap: 6, opacity: busy ? .5 : 1, padding: '8px 12px' }}>{busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Approve</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function RaspberryPiDevices() {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyCode, setBusyCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const isAdmin = !user?.memberId;

  const loadDevices = useCallback(async ({ quiet = false } = {}) => {
    if (!isAdmin) return;
    if (!quiet) setLoading(true);
    try {
      const nextDevices = await getRaspberryPiDevices();
      setDevices(nextDevices);
      setLoadError('');
    } catch (error) {
      const message = errorMessage(error, 'Failed to load Raspberry Pi devices');
      setLoadError(message);
      if (!quiet) toast.error(message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const decide = async (device, status) => {
    setBusyCode(device.code);
    try {
      await setRaspberryPiApproval(device.code, status);
      toast.success(`Raspberry Pi ${status}`);
      await loadDevices({ quiet: true });
    } catch (error) {
      toast.error(errorMessage(error, `Failed to mark Raspberry Pi ${status}`));
    } finally {
      setBusyCode('');
    }
  };

  const removeDevice = async () => {
    if (!deleteTarget) return;
    setBusyCode(deleteTarget.code);
    try {
      await deleteRaspberryPiDevice(deleteTarget.code);
      toast.success('Raspberry Pi connection deleted');
      setDeleteTarget(null);
      await loadDevices({ quiet: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to delete Raspberry Pi connection'));
    } finally {
      setBusyCode('');
    }
  };

  if (!isAdmin) {
    return <div style={{ margin: 22, padding: 24, border: '1px solid var(--bd)', borderRadius: 14, background: 'var(--bg1)', color: 'var(--tx2)' }}><ShieldAlert size={24} style={{ color: 'var(--crit)', marginBottom: 10 }} /><strong style={{ color: 'var(--tx)', display: 'block' }}>Administrator access required</strong>Only the security administrator can approve a Raspberry Pi.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 22 }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}>
        <div>
          <div style={{ color: 'var(--tx)', fontSize: 15, fontWeight: 700 }}>Raspberry Pi registration requests</div>
          <div style={{ color: 'var(--tx3)', fontSize: 11.5, marginTop: 3 }}>New requests appear automatically. Confirm the code, MAC and IP before approving.</div>
        </div>
        <span style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 7, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 8px' }}>{devices.length}</span>
        <div style={{ marginLeft: 'auto' }}>
          <RefreshControl
            onManualRefresh={() => loadDevices({ quiet: true })}
            storageKey="raspberry_pi_devices"
            defaultActive
            defaultInterval={10}
          />
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--tx3)', padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} style={{ margin: '0 auto 8px' }} />Loading devices...</div>
        : loadError ? <div role="alert" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 14, color: 'var(--crit)', padding: 24, textAlign: 'center' }}><ShieldAlert size={24} style={{ margin: '0 auto 9px' }} /><strong style={{ display: 'block' }}>Unable to load Raspberry Pi connections</strong><span style={{ display: 'block', fontSize: 12, marginTop: 6 }}>{loadError}</span><button type="button" onClick={() => loadDevices()} style={{ background: 'var(--bg1)', border: '1px solid var(--bd2)', borderRadius: 8, color: 'var(--tx)', cursor: 'pointer', fontWeight: 700, marginTop: 14, padding: '8px 14px' }}>Try again</button></div>
        : devices.length === 0 ? <div style={{ background: 'var(--bg1)', border: '1px dashed var(--bd2)', borderRadius: 14, color: 'var(--tx3)', padding: 32, textAlign: 'center' }}>No registration requests yet. Use the refresh control to check again or configure automatic refresh.</div>
          : <div style={{ display: 'grid', gap: 13, gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))' }}>{devices.map((device) => <DeviceCard busy={busyCode === device.code} device={device} key={device.id || device.code} onDecision={decide} onDelete={setDeleteTarget} />)}</div>}

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete this Raspberry Pi connection?"
        icon={<Trash2 className="h-7 w-7 text-[var(--crit)]" />}
        message={`Deleting ${deleteTarget?.mac || 'this Raspberry Pi'} invalidates its station token. If it registers again, it will return as a new pending request.`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeDevice}
        confirmLabel="Delete Connection"
        cancelLabel="Cancel"
        loading={Boolean(deleteTarget && busyCode === deleteTarget.code)}
      />
    </div>
  );
}
