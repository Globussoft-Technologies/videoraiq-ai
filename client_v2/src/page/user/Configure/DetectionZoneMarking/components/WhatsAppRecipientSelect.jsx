import MultiSelect from '@/components/MultiSelect';
import { IS_FLO_MATTRESS } from '@/lib/featureFlags';

export default function WhatsAppRecipientSelect({ value, onChange, api, scopeLabel = 'zone' }) {
  if (IS_FLO_MATTRESS) return null;
  const data = api?.data;
  const options = (data?.recipients || []).map(item => ({ id: item.id, label: `${item.name} (${item.phone})` }));
  return <div>
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>WhatsApp recipients</label>
    <MultiSelect options={options} value={value || []} onChange={onChange}
      placeholder="Select WhatsApp recipients" msg={api?.loading ? 'Loading recipients...' : 'Add named recipients in Alert Recipients → WhatsApp'} />
    <p style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 5 }}>
      {api?.error ? 'Could not load WhatsApp recipients. Reopen this page to retry.'
        : value === undefined ? `Existing account routing is active. Select recipients or choose “Disable for this ${scopeLabel}”.`
        : value.length ? `Uses the account template${data?.template ? `: ${data.template}` : ''}. ${data?.enabled ? '' : 'WhatsApp alerts are paused.'}`
        : `WhatsApp is disabled for this ${scopeLabel}.`}
    </p>
    {value === undefined && <button type="button" onClick={() => onChange([])} style={{ fontSize: 11, color: 'var(--tx2)' }}>Disable for this {scopeLabel}</button>}
  </div>;
}
