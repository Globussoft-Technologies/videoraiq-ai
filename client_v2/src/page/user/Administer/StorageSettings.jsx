import { useEffect, useMemo, useState } from 'react';
import { Cloud, Database, HardDrive, Headphones, Loader2, Mail, Save, Server, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminStorage,
  saveAdminStorage,
  testAdminStorage,
} from '@/helpers/adminStorage';
import videoraLogo from '@/assets/videoraiq-logo-color.png';
import { usePermissions } from '@/context/PermissionContext';

const PROVIDERS = [
  { value: 'nas', label: 'NAS / SFTP', icon: Server },
  { value: 'aws', label: 'Amazon S3', icon: Cloud },
  { value: 'gcp', label: 'Google Cloud Storage', icon: Cloud },
  { value: 'oracle', label: 'Oracle Object Storage', icon: Database },
];

const EMPTY = {
  provider: 'nas', label: '', host: '', port: 22, username: '', password: '', basePath: '',
  region: '', bucket: '', accessKeyId: '', secretAccessKey: '', sessionToken: '', namespace: '',
  endpoint: '', forcePathStyle: false,
};

const errorMessage = (error) => error?.response?.data?.message || error?.message || 'Request failed';

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return (
    <label className="storage-field">
      <span>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default function StorageSettings() {
  const { permissions } = usePermissions();
  const storagePermission = permissions?.storageSettings || {};
  const canEdit = storagePermission === true || storagePermission.edit === true;
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [tested, setTested] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await getAdminStorage();
      setStatus(next);
      setTested(false);
      const effective = next?.effective || {};
      setForm((current) => ({
        ...EMPTY,
        ...effective,
        password: '',
        secretAccessKey: '',
        sessionToken: '',
        provider: effective.provider || current.provider || 'nas',
      }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const payload = useMemo(() => {
    const common = { provider: form.provider, label: form.label };
    if (form.provider === 'nas') {
      return { ...common, host: form.host, port: Number(form.port) || 22, username: form.username, password: form.password, basePath: form.basePath };
    }
    const object = {
      ...common, region: form.region, bucket: form.bucket, accessKeyId: form.accessKeyId,
      secretAccessKey: form.secretAccessKey, endpoint: form.endpoint,
    };
    if (form.provider === 'aws') return { ...object, sessionToken: form.sessionToken, forcePathStyle: form.forcePathStyle };
    if (form.provider === 'oracle') return { ...object, namespace: form.namespace };
    return object;
  }, [form]);

  const set = (key) => (value) => {
    setTested(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const run = async (kind, action) => {
    setBusy(kind);
    try {
      const result = await action();
      toast.success(result?.message || (kind === 'test' ? 'Connection successful' : 'Storage configuration saved'));
      if (kind !== 'test') await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setTested(false);
    try {
      const response = await fetch(videoraLogo);
      if (!response.ok) throw new Error('Could not load the VideoraIQ test logo');
      const logo = await response.blob();
      const result = await testAdminStorage(payload, logo);
      setTested(true);
      toast.success(result?.message || 'Upload, fetch and cleanup test completed successfully. You can save this configuration.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="storage-loading"><Loader2 size={22} className="spin" /> Loading storage configuration…</div>;

  return (
    <div className="storage-page">
      <style>{`
        .storage-page{padding:24px;max-width:1080px;margin:0 auto;color:var(--tx1)}
        .storage-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}
        .storage-head h2{font-size:20px;margin:0 0 5px}.storage-head p{margin:0;color:var(--tx3);font-size:13px}
        .storage-card{background:var(--bg2);border:1px solid var(--bd1);border-radius:14px;padding:20px;margin-bottom:16px}
        .storage-status{display:flex;align-items:center;gap:12px}.storage-status-icon{width:42px;height:42px;border-radius:11px;background:rgba(34,197,94,.12);color:#22c55e;display:grid;place-items:center}
        .storage-status strong{display:block;font-size:14px}.storage-status small{color:var(--tx3)}
        .provider-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 20px}
        .provider-btn{background:var(--bg1);border:1px solid var(--bd1);color:var(--tx2);border-radius:10px;padding:13px;display:flex;gap:9px;align-items:center;cursor:pointer}
        .provider-btn.active{border-color:#7c3aed;color:#a78bfa;background:rgba(124,58,237,.1)}
        .storage-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        .storage-field{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--tx2)}
        .storage-field input{background:var(--bg1);border:1px solid var(--bd1);border-radius:9px;color:var(--tx1);padding:10px 12px;outline:none}.storage-field input:focus{border-color:#7c3aed}
        .storage-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--tx2);margin-top:16px}
        .storage-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.storage-actions button{border:1px solid var(--bd1);border-radius:9px;padding:9px 14px;background:var(--bg1);color:var(--tx1);cursor:pointer;display:flex;align-items:center;gap:7px}.storage-actions button.primary{background:#7c3aed;border-color:#7c3aed;color:white}.storage-actions button:disabled{opacity:.55;cursor:not-allowed}
        .storage-note{padding:14px;border-radius:10px;background:rgba(59,130,246,.08);color:var(--tx2);font-size:13px;line-height:1.5;margin-top:16px}.storage-loading{padding:40px;display:flex;gap:10px;align-items:center;color:var(--tx3)}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        .storage-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(2,6,23,.64);display:grid;place-items:center;padding:20px;backdrop-filter:blur(3px)}
        .storage-modal{width:min(460px,100%);background:var(--bg2);border:1px solid var(--bd1);border-radius:16px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
        .storage-modal-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.storage-modal-head h3{margin:0;font-size:17px}.storage-modal-close{border:0;background:transparent;color:var(--tx3);cursor:pointer;padding:4px}
        .storage-modal p{color:var(--tx2);font-size:13px;line-height:1.6;margin:14px 0}.storage-support-email{display:flex;align-items:center;gap:9px;padding:12px;border-radius:10px;background:var(--bg1);border:1px solid var(--bd1);color:var(--tx1);font-weight:600}
        .storage-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.storage-modal-actions a,.storage-modal-actions button{display:flex;align-items:center;gap:7px;border-radius:9px;padding:9px 14px;text-decoration:none;cursor:pointer}.storage-modal-actions button{border:1px solid var(--bd1);background:var(--bg1);color:var(--tx1)}.storage-modal-actions a{background:#7c3aed;color:#fff;border:1px solid #7c3aed}
        @media(max-width:760px){.provider-grid,.storage-form{grid-template-columns:1fr}.storage-head{flex-direction:column}.storage-page{padding:16px}}
      `}</style>

      <div className="storage-head">
        <div><h2>Storage Configuration</h2><p>Choose where this organisation stores new images, videos and reports.</p></div>
      </div>

      <section className="storage-card storage-status">
        <div className="storage-status-icon"><ShieldCheck size={22} /></div>
        <div>
          <strong>{status?.configured ? 'Organisation override active' : 'Deployment storage active'}</strong>
          <small>{status?.effective?.provider?.toUpperCase()} · source: {status?.effective?.source}</small>
        </div>
      </section>

      {!status?.featureAvailable ? (
        <section className="storage-card">
          <div className="storage-status"><HardDrive size={22} /><strong>Managed by this on-prem deployment</strong></div>
          <div className="storage-note">Admin-specific storage is disabled here. All operations continue to use the existing server ENV configuration.</div>
        </section>
      ) : (
        <section className="storage-card">
          <strong>Provider</strong>
          <div className="provider-grid">
            {PROVIDERS.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" className={`provider-btn ${form.provider === value ? 'active' : ''}`} onClick={() => set('provider')(value)}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </div>

          <div className="storage-form">
            <Field label="Configuration name" value={form.label} onChange={set('label')} placeholder="Primary storage" />
            {form.provider === 'nas' ? <>
              <Field label="Host" value={form.host} onChange={set('host')} required />
              <Field label="Port" value={form.port} onChange={set('port')} type="number" required />
              <Field label="Username" value={form.username} onChange={set('username')} required />
              <Field label="Password" value={form.password} onChange={set('password')} type="password" placeholder={status?.configured ? 'Leave blank to keep current password' : ''} required={!status?.configured} />
              <Field label="Base path" value={form.basePath} onChange={set('basePath')} placeholder="/media/videoraiq" required />
            </> : <>
              <Field label="Region" value={form.region} onChange={set('region')} required />
              <Field label="Bucket" value={form.bucket} onChange={set('bucket')} required />
              <Field label="Access key ID" value={form.accessKeyId} onChange={set('accessKeyId')} placeholder={status?.effective?.hasAccessKey ? 'Leave blank to keep current key' : ''} required={!status?.configured} />
              <Field label="Secret access key" value={form.secretAccessKey} onChange={set('secretAccessKey')} type="password" placeholder={status?.effective?.hasSecret ? 'Leave blank to keep current secret' : ''} required={!status?.configured} />
              <Field label="Endpoint (optional)" value={form.endpoint} onChange={set('endpoint')} placeholder="https://…" />
              {form.provider === 'oracle' && <Field label="Namespace" value={form.namespace} onChange={set('namespace')} />}
              {form.provider === 'aws' && <Field label="Session token (optional)" value={form.sessionToken} onChange={set('sessionToken')} type="password" />}
            </>}
          </div>
          {form.provider === 'aws' && <label className="storage-check"><input type="checkbox" checked={form.forcePathStyle} onChange={(event) => set('forcePathStyle')(event.target.checked)} /> Force path-style URLs</label>}
          <div className="storage-note">Test Connection uploads the VideoraIQ logo, fetches and byte-verifies it, then removes the test object. Credentials are encrypted when you save.</div>
          <div className="storage-actions">
            {status?.configured && <button type="button" onClick={() => setSupportOpen(true)} disabled={!!busy}><Headphones size={15} /> Switch to VideoraIQ Cloud</button>}
            <button type="button" onClick={test} disabled={!!busy || !canEdit}>{busy === 'test' ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />} Test Connection</button>
            <button type="button" className="primary" onClick={() => run('save', () => saveAdminStorage(payload))} disabled={!!busy || !tested || !canEdit}>{busy === 'save' ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Save</button>
          </div>
        </section>
      )}

      {supportOpen && (
        <div className="storage-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSupportOpen(false); }}>
          <section className="storage-modal" role="dialog" aria-modal="true" aria-labelledby="storage-support-title">
            <div className="storage-modal-head">
              <h3 id="storage-support-title">Switch to VideoraIQ Cloud</h3>
              <button type="button" className="storage-modal-close" aria-label="Close" onClick={() => setSupportOpen(false)}><X size={20} /></button>
            </div>
            <p>Your active storage credentials cannot be revoked from this page. To switch this organisation to the VideoraIQ-managed cloud provider, please contact our support team.</p>
            <div className="storage-support-email"><Mail size={17} /> support@videoraiq.com</div>
            <div className="storage-modal-actions">
              <button type="button" onClick={() => setSupportOpen(false)}>Close</button>
              <a href="mailto:support@videoraiq.com?subject=Switch%20to%20VideoraIQ%20Cloud%20Storage"><Mail size={15} /> Contact Support</a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
