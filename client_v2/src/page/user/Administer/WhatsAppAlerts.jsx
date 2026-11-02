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
  const [template, setTemplate] = useState({ name: 'videoraiq_incident_alert', language: 'en_US' });
  const [sampleFile, setSampleFile] = useState(null);
  const [imageHeader, setImageHeader] = useState(false);
  const [fallbackSelection, setFallbackSelection] = useState('');
  const [selection, setSelection] = useState('');
  const [recipient, setRecipient] = useState({ name: '', phone: '', optedIn: false });
  const [deliveries, setDeliveries] = useState([]);
  const [webhook, setWebhook] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const owner = Boolean(user?.adminId && !user?.memberId);

  const apply = value => {
    setSettings(value);
    setFallbackSelection(value.fallbackTemplate?.name ? `${value.fallbackTemplate.name}|${value.fallbackTemplate.language}` : '');
    setSelection(value.selectedTemplate?.name ? `${value.selectedTemplate.name}|${value.selectedTemplate.language}` : '');
    setCredentials(previous => ({ ...previous, phoneNumberId: value.phoneNumberId || '', businessAccountId: value.businessAccountId || '', apiVersion: value.apiVersion || 'v24.0', accessToken: '', appSecret: '' }));
  };
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    Promise.all([whatsappRequest('settings'), whatsappRequest('deliveries')]).then(([value, result]) => {
      if (!cancelled) { apply(value); setDeliveries(result.deliveries); }
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
  if (!owner) return <div className={panelClass}>Only the account owner can configure WhatsApp alerts.</div>;
  if (!settings) return <div className={panelClass}>{error || 'Loading WhatsApp settings?'}</div>;

  return <div className="space-y-4">
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">WhatsApp configuration</h2><span className="text-xs text-[var(--tx2)]">{settings.enabled ? 'Alerts enabled' : 'Alerts paused'}</span></div>
      <p className="text-xs text-[var(--tx3)]">Connect this account?s Meta WhatsApp Business sender. In Meta testing, add and verify each test recipient first. Production recipients must consent to alerts.</p>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); action('save', async () => {
        apply(await whatsappRequest('settings', 'put', credentials)); setWebhook(null); toast.success('Sender verified and saved. Select an approved template to enable alerts.');
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
    </section>

    {settings.configured && <>
      <section className={panelClass}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">Alert templates</h2><button disabled={!!busy} className={buttonClass} onClick={() => action('sync', async () => { apply(await whatsappRequest('templates/sync', 'post', {})); toast.success('Templates synced'); })}>{busy === 'sync' ? 'Syncing?' : 'Sync templates'}</button></div>
        <p className="text-xs text-[var(--tx3)]">Submit the incident template for Meta approval, then sync to check its status. Approved templates with one body variable and an optional image header are supported. Text-only fallback is optional. Without one, image alerts cannot be sent when the incident snapshot is unavailable. Meta decides approval and category.</p>
        <div className="rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-3 text-sm text-[var(--tx)]">VideoRAIQ incident alert: {'{{1}}'}. Please review the incident in your VideoRAIQ dashboard.<p className="mt-1 text-xs text-[var(--tx3)]">The variable contains the incident details, camera, time, severity, and snapshot link when available.</p></div>
        <form className="grid gap-3 sm:grid-cols-[1fr_120px_auto] items-end" onSubmit={event => { event.preventDefault(); action('request', async () => { let sampleHandle; if (imageHeader) { if (!sampleFile) throw new Error('Choose a sample image for Meta approval'); const form = new FormData(); form.append('file', sampleFile); sampleHandle = (await whatsappRequest('templates/sample', 'post', form)).handle; } apply(await whatsappRequest('templates', 'post', { ...template, imageHeader, ...(imageHeader ? { sampleHandle } : {}) })); toast.success('Template submitted to Meta'); }); }}>
          <label className="flex gap-2 text-sm text-[var(--tx2)] sm:col-span-3"><input type="checkbox" checked={imageHeader} onChange={event => { setImageHeader(event.target.checked); setTemplate(previous => ({ ...previous, name: event.target.checked ? 'videoraiq_incident_image_alert' : 'videoraiq_incident_alert' })); }} />Include incident snapshot as an image header</label>
          {imageHeader && <div className="sm:col-span-3"><Field label="Sample image for Meta approval (JPEG/PNG, up to 5 MB)"><input required type="file" accept="image/jpeg,image/png" className={inputClass} onChange={event => setSampleFile(event.target.files?.[0] || null)} /></Field><p className="mt-1 text-xs text-[var(--tx3)]">Only this sample is used for approval. Live alerts use their own incident image, which Meta must be able to access.</p></div>}
          <Field label="Template name"><input required pattern="[a-z][a-z0-9_]{2,100}" className={inputClass} value={template.name} onChange={event => setTemplate({ ...template, name: event.target.value })} /></Field>
          <Field label="Language code"><input required className={inputClass} value={template.language} onChange={event => setTemplate({ ...template, language: event.target.value })} /></Field>
          <button disabled={!!busy} className={buttonClass}>{busy === 'request' ? 'Submitting?' : 'Request approval'}</button>
        </form>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1"><Field label="Approved alert template"><select className={inputClass} value={selection} onChange={event => setSelection(event.target.value)}><option value="">Select an approved template</option>{settings.templates.filter(item => item.supported).map(item => <option key={`${item.name}|${item.language}`} disabled={!item.supported} value={`${item.name}|${item.language}`}>{item.name} - {item.language} - {item.status}</option>)}</select></Field></div>
          <button disabled={!!busy || !selection} className={buttonClass} onClick={() => action('select', async () => { const [name, language] = selection.split('|'); const [fallbackName, fallbackLanguage] = fallbackSelection.split('|'); apply(await whatsappRequest('template', 'put', { name, language, ...(fallbackName ? { fallback: { name: fallbackName, language: fallbackLanguage } } : {}) })); toast.success('WhatsApp alerts enabled'); })}>Use template and enable alerts</button>
        </div>
        {settings.templates.find(item => `${item.name}|${item.language}` === selection)?.components?.some(component => component.type === 'HEADER' && component.format === 'IMAGE') && <Field label="Text-only fallback for incidents without images (optional)"><select className={inputClass} value={fallbackSelection} onChange={event => setFallbackSelection(event.target.value)}><option value="">No text-only fallback</option>{settings.templates.filter(item => item.supported && !item.components?.some(component => component.type === 'HEADER')).map(item => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} - {item.language}</option>)}</select></Field>}
        {!settings.templates.some(item => item.supported) && <p className="text-xs text-[var(--tx3)]">No compatible approved incident template yet. Request approval above, then sync. Meta sample templates are available only for testing below.</p>}
        {settings.lastSyncAt && <p className="text-xs text-[var(--tx3)]">Last synced: {new Date(settings.lastSyncAt).toLocaleString()}</p>}
      </section>

      <section className={panelClass}>
        <h2 className="font-semibold text-[var(--tx)]">WhatsApp recipients</h2>
        <p className="text-xs text-[var(--tx3)]">These opted-in recipients receive incident alerts for this account. Use international numbers, for example +919876543210.</p>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); action('recipient', async () => { apply(await whatsappRequest('recipients', 'post', recipient)); setRecipient({ name: '', phone: '', optedIn: false }); toast.success('Recipient added'); }); }}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input required maxLength={100} className={inputClass} value={recipient.name} onChange={event => setRecipient({ ...recipient, name: event.target.value })} /></Field><Field label="WhatsApp number"><input required type="tel" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" className={inputClass} value={recipient.phone} onChange={event => setRecipient({ ...recipient, phone: event.target.value })} /></Field></div>
          <label className="flex gap-2 text-sm text-[var(--tx2)]"><input type="checkbox" required checked={recipient.optedIn} onChange={event => setRecipient({ ...recipient, optedIn: event.target.checked })} />This person has consented to receive WhatsApp incident alerts.</label>
          <button disabled={!!busy} className={buttonClass}>Add recipient</button>
        </form>
        <div className="space-y-2">{settings.recipients.map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bd)] pt-3"><div className="text-sm text-[var(--tx)]">{item.name}<span className="ml-2 text-[var(--tx3)]">{item.phone}</span></div><div className="flex gap-2"><button disabled={!!busy || !settings.enabled} className={buttonClass} onClick={() => action('test', async () => { const result = await whatsappRequest('test', 'post', { recipientId: item._id }); const failed = result.results?.find(value => value.status === 'failed'); if (failed) throw new Error(failed.error); toast.success('Test accepted by Meta. Check delivery status below.'); setDeliveries((await whatsappRequest('deliveries')).deliveries); })}>Send test alert</button><button disabled={!!busy} className={buttonClass} onClick={() => action('sample', async () => { await whatsappRequest('test-sample', 'post', { recipientId: item._id }); toast.success('Meta sample accepted. This does not enable live alerts.'); setDeliveries((await whatsappRequest('deliveries')).deliveries); })}>Send sample test message</button><button disabled={!!busy} className={buttonClass} onClick={() => action('remove', async () => apply(await whatsappRequest(`recipients/${item._id}`, 'delete')))}>Remove</button></div></div>)}</div>
      </section>

      <section className={panelClass}>
        <h2 className="font-semibold text-[var(--tx)]">Delivery webhook</h2>
        <p className="text-xs text-[var(--tx3)]">In the same Meta app, configure the public HTTPS callback and subscribe to the messages field. Subscribe the app to this WhatsApp Business Account. Delivery updates require the matching Meta App Secret.</p>
        <button disabled={!!busy} className={buttonClass} onClick={() => action('webhook', async () => setWebhook(await whatsappRequest('webhook-config')))}>Show webhook setup</button>
        {webhook && <div className="space-y-2 text-xs text-[var(--tx2)]"><p>Callback URL</p><code className="block break-all rounded bg-[var(--bg2)] p-2">{`${import.meta.env.VITE_BACKEND}/whatsapp/webhook/${user.adminId}`}</code><p>Verify token</p><code className="block break-all rounded bg-[var(--bg2)] p-2">{webhook.verifyToken}</code></div>}
      </section>
      <section className={panelClass}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold text-[var(--tx)]">Recent deliveries</h2><button disabled={!!busy} className={buttonClass} onClick={() => action('deliveries', async () => setDeliveries((await whatsappRequest('deliveries')).deliveries))}>Refresh status</button></div>
        {!deliveries.length && <p className="text-sm text-[var(--tx3)]">No messages sent yet.</p>}
        <div className="space-y-2">{deliveries.map(item => <div key={item._id} className="rounded-lg border border-[var(--bd)] p-3 text-xs text-[var(--tx2)]"><div className="flex flex-wrap justify-between gap-2"><span>{item.recipient} ? {item.template}</span><strong>{item.status}</strong></div><p className="mt-1 text-[var(--tx3)]">{new Date(item.createdAt).toLocaleString()}</p>{item.error && <p className="mt-1 text-red-500">{item.error}</p>}</div>)}</div>
        <p className="text-xs text-[var(--tx3)]">Accepted means Meta accepted the request. Delivered/read statuses arrive through the webhook. History is retained for 90 days.</p>
      </section>
    </>}
  </div>;
}
