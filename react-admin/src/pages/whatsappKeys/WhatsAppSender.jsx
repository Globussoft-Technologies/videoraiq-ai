import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import Topbar from '../../layout/Topbar'
import { sharedSenderRequest } from './api'

const panel = 'space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-white/5'
const input = 'mt-1 w-full rounded-lg border border-gray-200 bg-transparent p-2.5 text-sm dark:border-white/10'
const button = 'rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10'
export default function WhatsAppSender() {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ phoneNumberId: '', businessAccountId: '', apiVersion: 'v24.0', accessToken: '', appSecret: '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const apply = value => {
    setSettings(value)
    setForm({ phoneNumberId: value.phoneNumberId, businessAccountId: value.businessAccountId, apiVersion: value.apiVersion, accessToken: '', appSecret: '' })
  }
  useEffect(() => {
    let active = true
    sharedSenderRequest().then(value => { if (active) apply(value) }).catch(() => { if (active) setError('Could not load the shared sender. Reopen this page to retry.') })
    return () => { active = false }
  }, [])
  const action = async (name, task) => {
    if (busy) return
    setBusy(name); setError('')
    try { const value = await task(); apply(value); toast.success(name === 'save' ? 'Shared sender verified and saved' : name === 'submit' ? 'Default templates submitted' : 'Template approval status synced') }
    catch (failure) { setError(failure.response?.data?.message || 'WhatsApp request failed. Sync status before retrying a template submission.') }
    finally { setBusy('') }
  }
  return <>
    <Topbar title="WhatsApp sender settings" eyebrow="SHARED SENDER" />
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap justify-between gap-3 text-sm"><p className="text-gray-500">Configure the sender and default templates once for all accounts approved to use Admin keys.</p><Link className="text-blue-600" to="/whatsapp-key-requests">Review access requests</Link></div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {!settings ? <p className="text-sm text-gray-500">Loading sender settings…</p> : <>
        <form className={panel} onSubmit={event => { event.preventDefault(); action('save', () => sharedSenderRequest('put', '', form)) }}>
          <h2 className="font-semibold">Shared WhatsApp Business sender</h2>
          <p className="text-xs text-gray-500">Secrets are encrypted on the backend. Leave secret fields blank to retain saved values. Changing the phone or business account requires a fresh template sync.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[['phoneNumberId', 'Sender Phone Number ID'], ['businessAccountId', 'WhatsApp Business Account ID'], ['apiVersion', 'Graph API version'], ['accessToken', 'Access token'], ['appSecret', 'Meta App Secret']].map(([key, label]) => <label key={key} className="text-xs">{label}
              <input className={input} type={['accessToken', 'appSecret'].includes(key) ? 'password' : 'text'} autoComplete="new-password" required={!['accessToken', 'appSecret'].includes(key) || !settings.configured} value={form[key]} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} />
            </label>)}
          </div>
          <button className={button} disabled={!!busy}>{busy === 'save' ? 'Verifying…' : 'Verify and save sender'}</button>
          {settings.verifiedAt && <p className="text-xs text-gray-500">Verified: {new Date(settings.verifiedAt).toLocaleString()}</p>}
        </form>
        {settings.configured && <section className={panel}>
          <h2 className="font-semibold">Default incident templates</h2>
          <p className="text-xs text-gray-500">Submit both fixed templates with one click. The included image is only an approval sample. Live alerts use their actual snapshot, or the approved text fallback when no snapshot is available.</p>
          <div className="flex flex-wrap gap-3">
            <button className={button} disabled={!!busy || settings.submissionComplete} onClick={() => action('submit', () => sharedSenderRequest('post', '/templates', {}))}>{busy === 'submit' ? 'Submitting…' : 'Submit default templates for approval'}</button>
            <button className={button} disabled={!!busy} onClick={() => action('sync', () => sharedSenderRequest('post', '/templates/sync', {}))}>{busy === 'sync' ? 'Syncing…' : 'Sync approval status'}</button>
          </div>
          {settings.templates.map(template => <div key={template.name} className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-white/10">
            <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{template.name}</strong><span>{template.status}</span></div>
            <pre className="whitespace-pre-wrap break-words text-xs text-gray-500">{template.body}</pre>
          </div>)}
          <p className="text-xs text-gray-500">Approved accounts use these statuses automatically. Account owners cannot edit or submit shared templates. A manual account pause remains respected.</p>
          {settings.lastSyncAt && <p className="text-xs text-gray-500">Last synced: {new Date(settings.lastSyncAt).toLocaleString()}</p>}
        </section>}
      </>}
    </div>
  </>
}
