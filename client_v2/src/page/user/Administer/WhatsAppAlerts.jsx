import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { whatsappRequest } from '@/helpers/whatsapp';

const inputClass = 'w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-2.5 text-sm text-[var(--tx)]';
const buttonClass = 'rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-4 py-2 text-sm font-semibold text-[var(--tx)] disabled:opacity-50 disabled:cursor-not-allowed';
const panelClass = 'rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 sm:p-5 space-y-4';
const Field = ({ label, children }) => <label className="block space-y-1 text-xs text-[var(--tx2)]"><span>{label}</span>{children}</label>;

export default function WhatsAppAlerts() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [credentials, setCredentials] = useState({ phoneNumberId: '', businessAccountId: '', apiVersion: 'v24.0', accessToken: '', appSecret: '' });
  const [recipient, setRecipient] = useState({ name: '', phone: '', optedIn: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const owner = Boolean(user?.adminId && !user?.memberId);

  const apply = value => {
    setSettings(value);
    setCredentials(previous => ({ ...previous, phoneNumberId: value.phoneNumberId || '', businessAccountId: value.businessAccountId || '', apiVersion: value.apiVersion || 'v24.0', accessToken: '', appSecret: '' }));
  };
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    whatsappRequest('settings').then(value => {
      if (!cancelled) { apply(value); }
    }).catch(failure => { if (!cancelled) setError(failure.response?.data?.message || 'Could not load WhatsApp configuration'); });
    return () => { cancelled = true; };
  }, [owner]);

  const action = async (name, task) => {
    if (busy) return;
    setBusy(name); setError('');
    try { await task(); }
    catch (failure) { const message = failure.response?.data?.message || failure.message || 'WhatsApp request failed'; setError(message); toast.error(message); }
    finally { setBusy(''); }
  };
  useEffect(() => {
    if (!owner || (settings?.sharedKeyRequest?.status !== 'pending' && settings?.credentialSource !== 'env')) return;
    let cancelled = false;
    const timer = setInterval(() => {
      whatsappRequest('settings').then(value => { if (!cancelled) {
        if (value.sharedKeyRequest?.status === 'pending') setSettings(value);
        else apply(value);
      } }).catch(() => {});
    }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [owner, settings?.sharedKeyRequest?.status, settings?.credentialSource]);
  if (!owner) return <div className={panelClass}>Only the account owner can configure WhatsApp alerts.</div>;
  if (!settings) return <div className={panelClass}>{error || 'Loading WhatsApp settings?'}</div>;

  const defaultTemplate = settings.defaultTemplate;
  const shared = settings.credentialSource === 'env';
  const request = settings.sharedKeyRequest;
  const pending = request?.status === 'pending';
  return <div className="space-y-4">
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-[var(--tx2)]" role="status">
        {pending ? (request.type === 'cancel' ? 'Cancellation pending Super Admin approval. Admin keys remain active.' : 'Admin key request pending Super Admin approval.')
          : request?.status === 'rejected' ? 'Your last request was rejected. Your current key mode is unchanged.'
          : shared ? 'Using Admin keys for WhatsApp.'
          : settings.ownReverificationRequired ? 'Cancellation approved. Verify your own sender keys to resume alerts.' : 'Using your own WhatsApp sender.'}
      </div>
      <button type="button" className={buttonClass} disabled={!!busy || pending} onClick={() => action('key-request', async () => {
        apply(await whatsappRequest('shared-key-request', 'post', { type: shared ? 'cancel' : 'enable' }));
        toast.success('Request sent to Super Admin');
      })}>{pending ? 'Request pending' : shared ? 'Request Cancellation' : 'Request Admin Keys'}</button>
    </div>
    {settings.senderError && <p role="alert" className="text-sm text-red-500">{settings.senderError}</p>}
    {shared && <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">Using Admin keys</h2><span className="text-xs text-[var(--tx2)]">{settings.enabled ? 'Alerts enabled' : 'Alerts paused'}</span></div>
      <p className="text-xs text-[var(--tx3)]">Your sender and image/text templates are managed by the Super Admin. Your recipients and zone selections remain available.</p>
      {settings.enabled && <button disabled={!!busy} className={buttonClass} onClick={() => action('pause', async () => apply(await whatsappRequest('enabled', 'put', { enabled: false })))}>Pause WhatsApp alerts</button>}
      {!settings.enabled && settings.defaultTemplate?.approved && <button disabled={!!busy} className={buttonClass} onClick={() => action('resume', async () => apply(await whatsappRequest('enabled', 'put', { enabled: true })))}>Resume WhatsApp alerts</button>}
      <p className="text-xs text-[var(--tx3)]">Image template: {defaultTemplate?.status || 'NOT_SUBMITTED'} | Text fallback: {defaultTemplate?.fallback?.status || 'NOT_SUBMITTED'}</p>
    </section>}
    {!shared && <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">WhatsApp configuration</h2><span className="text-xs text-[var(--tx2)]">{settings.enabled ? 'Alerts enabled' : 'Alerts paused'}</span></div>
      <p className="text-xs text-[var(--tx3)]">Connect this account?s Meta WhatsApp Business sender. In Meta testing, add and verify each test recipient first. Production recipients must consent to alerts.</p>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); action('save', async () => {
        apply(await whatsappRequest('settings', 'put', credentials)); toast.success('Sender verified and saved. Submit the default template or sync its approval status.');
      }); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[['phoneNumberId', 'Sender Phone Number ID'], ['businessAccountId', 'WhatsApp Business Account ID'], ['apiVersion', 'Graph API version']].map(([key, label]) => <Field key={key} label={label}><input required className={inputClass} value={credentials[key]} onChange={event => setCredentials({ ...credentials, [key]: event.target.value })} /></Field>)}
          <Field label={settings.configured ? 'Access token (leave blank to retain)' : 'Access token'}><input type="password" autoComplete="new-password" required={!settings.configured} className={inputClass} value={credentials.accessToken} onChange={event => setCredentials({ ...credentials, accessToken: event.target.value })} /></Field>
          <Field label={settings.configured ? 'Meta App Secret (leave blank to retain)' : 'Meta App Secret'}><input type="password" autoComplete="new-password" required={!settings.configured} className={inputClass} value={credentials.appSecret} onChange={event => setCredentials({ ...credentials, appSecret: event.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-2"><button disabled={!!busy} className={buttonClass}>{busy === 'save' ? 'Verifying?' : 'Verify and save sender'}</button>
          {settings.enabled && <button type="button" disabled={!!busy} className={buttonClass} onClick={() => action('pause', async () => apply(await whatsappRequest('enabled', 'put', { enabled: false })))}>Pause WhatsApp alerts</button>}
        </div>
      </form>
    </section>}

    {settings.configured && <>
      {!shared && <section className={panelClass}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">Default incident template</h2>
          <button disabled={!!busy} className={buttonClass} onClick={() => action('sync', async () => { apply(await whatsappRequest('templates/sync', 'post', {})); toast.success('Default template status synced'); })}>{busy === 'sync' ? 'Syncing...' : 'Sync approval status'}</button>
        </div>
        <p className="text-xs text-[var(--tx3)]">Submit both default templates: an image alert with our included sample image, and a text-only fallback. Once approved, sync to select it automatically. Every zone uses this same template with its own incident details and snapshot.</p>
        <div className="flex flex-wrap gap-3 text-sm text-[var(--tx)]"><span>{defaultTemplate?.name}</span><span>{defaultTemplate?.language}</span><strong>{defaultTemplate?.status || 'NOT_SUBMITTED'}</strong></div>
        <p className="text-xs text-[var(--tx2)]">Text fallback: {defaultTemplate?.fallback?.name} - {defaultTemplate?.fallback?.status || 'NOT_SUBMITTED'}</p>
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-3 text-xs text-[var(--tx)]">{defaultTemplate?.body?.replace(/\{\{(\d+)\}\}/g, (_, index) => ['[Detection type]', '[Detection name]', '[Day]', '[Incident time]', '[Severity]', '[Camera]', '[NVR]', '[Zone]', '[Description]'][Number(index) - 1])}</pre>
        <p className="text-xs text-[var(--tx3)]">The sample image is only for approval and explicit test messages. Live alerts use the incident snapshot when available; otherwise the approved text fallback says "Snapshot unavailable".</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || defaultTemplate?.submissionComplete} className={buttonClass} onClick={() => action('request', async () => { apply(await whatsappRequest('templates', 'post', {})); toast.success('Default templates submitted. Sync to check Meta approval.'); })}>{busy === 'request' ? 'Submitting...' : 'Submit default templates for approval'}</button>
          {defaultTemplate?.approved && !settings.enabled && <button disabled={!!busy} className={buttonClass} onClick={() => action('resume', async () => apply(await whatsappRequest('enabled', 'put', { enabled: true })))}>Resume WhatsApp alerts</button>}
        </div>
        {settings.lastSyncAt && <p className="text-xs text-[var(--tx3)]">Last synced: {new Date(settings.lastSyncAt).toLocaleString()}</p>}
      </section>}

      <section className={panelClass}>
        <h2 className="font-semibold text-[var(--tx)]">WhatsApp recipients</h2>
        <p className="text-xs text-[var(--tx3)]">Add named recipients here, then select them in each detection zone. Selected recipients use this account's approved alert template. Use international numbers, for example +919876543210.</p>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); action('recipient', async () => { apply(await whatsappRequest('recipients', 'post', recipient)); setRecipient({ name: '', phone: '', optedIn: false }); toast.success('Recipient added'); }); }}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input required maxLength={100} className={inputClass} value={recipient.name} onChange={event => setRecipient({ ...recipient, name: event.target.value })} /></Field><Field label="WhatsApp number"><input required type="tel" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" className={inputClass} value={recipient.phone} onChange={event => setRecipient({ ...recipient, phone: event.target.value })} /></Field></div>
          <label className="flex gap-2 text-sm text-[var(--tx2)]"><input type="checkbox" required checked={recipient.optedIn} onChange={event => setRecipient({ ...recipient, optedIn: event.target.checked })} />This person has consented to receive WhatsApp incident alerts.</label>
          <button disabled={!!busy} className={buttonClass}>Add recipient</button>
        </form>
        <div className="space-y-2">{settings.recipients.map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bd)] pt-3"><div className="text-sm text-[var(--tx)]">{item.name}<span className="ml-2 text-[var(--tx3)]">{item.phone}</span></div><div className="flex gap-2"><button disabled={!!busy || !settings.enabled} className={buttonClass} onClick={() => action('test', async () => { const result = await whatsappRequest('test', 'post', { recipientId: item._id }); const failed = result.results?.find(value => value.status === 'failed'); if (failed) throw new Error(failed.error); toast.success('Test message accepted by Meta.'); })}>Send test alert</button>{!shared && <button disabled={!!busy} className={buttonClass} onClick={() => action('sample', async () => { await whatsappRequest('test-sample', 'post', { recipientId: item._id }); toast.success('Meta sample accepted. This does not enable live alerts.'); })}>Send sample test message</button>}<button disabled={!!busy} className={buttonClass} onClick={() => action('remove', async () => apply(await whatsappRequest(`recipients/${item._id}`, 'delete')))}>Remove</button></div></div>)}</div>
      </section>

    </>}
  </div>;
}
