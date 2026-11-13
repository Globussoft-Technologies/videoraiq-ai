import WhatsAppRecipientSelect from './WhatsAppRecipientSelect';
import TelegramChannelMultiSelect from './TelegramChannelMultiSelect';
import ZoneScheduleFields from '../../ZoneScheduleFields';

export default function MachineOpsNotifications({ zone, onChange, whatsappApi, channelOptions = [], disabled, errors = {} }) {
  const telegramChatIds = Array.isArray(zone.telegramChatIds) ? zone.telegramChatIds
    : (zone.telegramChatId ? [String(zone.telegramChatId)] : []);
  return <fieldset disabled={disabled} style={{ minWidth: 0, border: 0, borderTop: '1px solid var(--bd)', padding: '12px 0 0', margin: 0, display: 'grid', gap: 12 }}>
    <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>Machine notifications</legend>
    <WhatsAppRecipientSelect api={whatsappApi} value={zone.whatsappRecipientIds} scopeLabel="machine" onChange={value => onChange('whatsappRecipientIds', value)} />
    <div>
      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Telegram Channels</label>
      <TelegramChannelMultiSelect value={telegramChatIds} options={channelOptions}
        onChange={value => onChange('telegramChatIds', value)} disabled={disabled || !channelOptions.length}
        placeholder="Select Telegram channels" noOptionsLabel="No Telegram channel connected" error={!!errors.telegramChatId} />
      {errors.telegramChatId && <div style={{ fontSize: 10.5, color: 'var(--crit)', marginTop: 5 }}>{errors.telegramChatId}</div>}
    </div>
    <ZoneScheduleFields value={zone.schedule} onChange={value => onChange('schedule', value)}
      disabled={disabled || !telegramChatIds.length} disabledMessage="Please select at least one Telegram channel before setting a schedule." />
    {errors.schedule && <div style={{ fontSize: 10.5, color: 'var(--crit)' }}>{errors.schedule}</div>}
  </fieldset>;
}
