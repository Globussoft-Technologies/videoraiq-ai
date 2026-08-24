import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import ZoneScheduleFields, { TimezoneField, scheduleError, emptySchedule, formatTime } from '../../ZoneScheduleFields';
import TelegramChannelMultiSelect from '../components/TelegramChannelMultiSelect';
import { PRIORITY_OPTIONS } from '../constants';

function normalizeTelegramChannels(channels = []) {
  return (Array.isArray(channels) ? channels : [])
    .filter((channel) => channel?.chatId)
    .map((channel) => ({
      chatId: String(channel.chatId),
      label:
        channel.channelName ||
        channel.channelTitle ||
        (channel.channelUsername ? `@${channel.channelUsername}` : null) ||
        String(channel.chatId),
    }));
}

export default function SaveDetectionAreaModal({
  initialName,
  initialPriority,
  zones,
  extraFields,
  isLineCrossing = false,
  saving,
  onCancel,
  onSubmit,
  telegramChannels = [],
}) {
  const [detectionName, setDetectionName] = useState(initialName || '');
  const [priority, setPriority] = useState(initialPriority || 'moderate');
  const [zoneDrafts, setZoneDrafts] = useState(zones);
  const [errors, setErrors] = useState({});
  const areaLabel = isLineCrossing ? 'Line' : 'Zone';
  const channelOptions = normalizeTelegramChannels(telegramChannels).map((channel) => ({
    value: channel.chatId,
    label: channel.label,
  }));

  const updateZoneField = (index, field, value) => {
    setZoneDrafts(prev => prev.map((z, i) => {
      if (i !== index) return z;
      if (field === 'telegramChatIds') {
        const selectedChatIds = Array.isArray(value)
          ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
          : [];
        return {
          ...z,
          telegramChatIds: selectedChatIds,
          telegramChatId: selectedChatIds[0] || '',
          schedule: selectedChatIds.length ? z.schedule : emptySchedule(),
        };
      }
      if (field === 'telegramChatId' && !String(value || '').trim()) {
        return { ...z, telegramChatId: value, telegramChatIds: [], schedule: emptySchedule() };
      }
      return { ...z, [field]: value };
    }));
    setErrors(er => ({ ...er, [`zone-${index}-${field}`]: false }));
  };

  const handleSubmit = () => {
    const nextErrors = {};
    if (!detectionName.trim()) nextErrors.detectionName = true;
    zoneDrafts.forEach((z, i) => {
      const selectedTelegramChatIds = Array.isArray(z?.telegramChatIds)
        ? z.telegramChatIds.map((chatId) => String(chatId || '').trim()).filter(Boolean)
        : (String(z?.telegramChatId || '').trim() ? [String(z.telegramChatId).trim()] : []);
      const hasTelegramChannel = selectedTelegramChatIds.length > 0;
      const hasSchedule =
        Boolean(formatTime(z.schedule?.from)) && Boolean(formatTime(z.schedule?.to));
      if (!String(z.name || '').trim()) nextErrors[`zone-${i}-name`] = true;
      if (extraFields.includes('capacity') && String(z.capacity ?? '').trim() === '') {
        nextErrors[`zone-${i}-capacity`] = true;
      }
      if (extraFields.includes('threshold') && String(z.threshold ?? '').trim() === '') {
        nextErrors[`zone-${i}-threshold`] = true;
      }
      if (hasSchedule && !hasTelegramChannel) {
        nextErrors[`zone-${i}-telegramChatId`] = true;
      }
      if (hasTelegramChannel && !hasSchedule) {
        nextErrors[`zone-${i}-schedule`] = 'Please select a schedule when a Telegram channel is selected.';
      }
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    for (let i = 0; i < zoneDrafts.length; i++) {
      const err = scheduleError(zoneDrafts[i].schedule);
      if (err) { toast.error(`${areaLabel} ${i + 1}: ${err}`); return; }
    }
    onSubmit({ detectionName: detectionName.trim(), priority, zones: zoneDrafts });
  };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,9,15,.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
        borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15.5 }}>{isLineCrossing ? 'Save Detection Line' : 'Save Detection Area'}</span>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '10px',
                borderRadius: 8,
                border: '1px solid rgba(245, 158, 11, .45)',
                background: 'rgba(245, 158, 11, .08)',
              }}
            >
              <AlertTriangle size={17} color="#f59e0b" style={{ flex: '0 0 auto', marginTop: 1 }} />
              {/* No nowrap: the modal is capped at 440px, so this message has to wrap
                  inside the banner — forcing one line overflows the dialog and gives
                  the whole thing a horizontal scrollbar. */}
              <div style={{ minWidth: 0, fontSize: 11.5, lineHeight: 1.35, fontWeight: 800, color: 'var(--tx)' }}>
                Please select the Telegram channel, Time Zone and Time Range for Telegram alerts.
              </div>
            </div>
          </div>
          <span onClick={onCancel} style={{ cursor: 'pointer', color: 'var(--tx3)', display: 'flex' }}>
            <X size={17} />
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 6 }}>Detection Name</label>
              <input
                autoFocus
                value={detectionName}
                onChange={e => { setDetectionName(e.target.value); setErrors(er => ({ ...er, detectionName: false })); }}
                maxLength={50}
                placeholder="Enter detection name"
                style={{
                  width: '100%', height: 40, padding: '0 12px', borderRadius: 9, boxSizing: 'border-box',
                  background: 'var(--bg2)', border: `1px solid ${errors.detectionName ? 'var(--danger, #ef4444)' : 'var(--bd)'}`,
                  fontSize: 13, color: 'var(--tx)', outline: 'none',
                }}
              />
              {errors.detectionName && (
                <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>Detection Name is required.</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', marginBottom: 6 }}>Severity</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  style={{
                    width: '100%', height: 40, padding: '0 12px', borderRadius: 9, boxSizing: 'border-box',
                    background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 13, color: 'var(--tx)',
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
               
                <div style={{ padding: 0 }}>
                  <TimezoneField controlHeight={40} />
                </div>
              </div>
            </div>
          </div>

          {zoneDrafts.map((z, i) => (
            <div key={i} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)' }}>{areaLabel} {i + 1}</div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>{areaLabel} Name *</label>
                <input
                  value={z.name}
                  onChange={e => updateZoneField(i, 'name', e.target.value)}
                  maxLength={50}
                  placeholder={`Enter ${areaLabel.toLowerCase()} name`}
                  style={{
                    width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                    background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-name`] ? 'var(--danger, #ef4444)' : 'var(--bd)'}`,
                    fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                  }}
                />
              {errors[`zone-${i}-name`] && (
                  <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>{areaLabel} Name is required.</div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>
                  Telegram Channels
                </label>
                <TelegramChannelMultiSelect
                  value={Array.isArray(z.telegramChatIds)
                    ? z.telegramChatIds
                    : (String(z.telegramChatId || '').trim() ? [String(z.telegramChatId).trim()] : [])}
                  options={channelOptions}
                  onChange={(selected) => updateZoneField(i, 'telegramChatIds', selected)}
                  disabled={!channelOptions.length}
                  placeholder="Select Telegram channels"
                  noOptionsLabel="No Telegram channel connected"
                  error={Boolean(errors[`zone-${i}-telegramChatId`])}
                />
                {errors[`zone-${i}-telegramChatId`] && (
                  <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>
                    Please select at least one Telegram channel when a schedule is configured.
                  </div>
                )}
              </div>
              {isLineCrossing && (
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Mode</label>
                  <select
                    value={z.countMode || 'entry'}
                    onChange={e => updateZoneField(i, 'countMode', e.target.value)}
                    style={{
                      width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12.5, color: 'var(--tx)', outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="entry">Entry</option>
                    <option value="exit">Exit</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              )}
              {extraFields.includes('capacity') && (
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Capacity *</label>
                  <input
                    type="number"
                    min={0}
                    value={z.capacity}
                    onChange={e => updateZoneField(i, 'capacity', e.target.value)}
                    placeholder="e.g. 10"
                    style={{
                      width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-capacity`] ? 'var(--danger, #ef4444)' : 'var(--bd)'}`, fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                    }}
                  />
                  {errors[`zone-${i}-capacity`] && (
                    <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>Capacity is required.</div>
                  )}
                </div>
              )}
              {extraFields.includes('threshold') && (
                <div>
                  <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Threshold (sec) *</label>
                  <input
                    type="number"
                    min={0}
                    value={z.threshold}
                    onChange={e => updateZoneField(i, 'threshold', e.target.value)}
                    placeholder="e.g. 30"
                    style={{
                      width: '100%', height: 36, padding: '0 11px', borderRadius: 8, boxSizing: 'border-box',
                      background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-threshold`] ? 'var(--danger, #ef4444)' : 'var(--bd)'}`, fontSize: 12.5, color: 'var(--tx)', outline: 'none',
                    }}
                  />
                  {errors[`zone-${i}-threshold`] && (
                    <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>Threshold is required.</div>
                  )}
                </div>
              )}
              <ZoneScheduleFields
                value={z.schedule}
                onChange={schedule => updateZoneField(i, 'schedule', schedule)}
                disabled={!(Array.isArray(z.telegramChatIds)
                  ? z.telegramChatIds.length
                  : String(z.telegramChatId || '').trim())}
                disabledMessage="Please select at least one Telegram channel before setting a schedule."
              />
              {errors[`zone-${i}-schedule`] && (
                <div style={{ marginTop: -4, fontSize: 10.5, color: '#ef4444' }}>
                  {errors[`zone-${i}-schedule`]}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)',
              fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))',
              border: 'none', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
