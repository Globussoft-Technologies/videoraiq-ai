import { useState } from 'react';
import { ChevronDown, Save, Trash2 } from 'lucide-react';
import ZoneScheduleFields, { TimezoneField } from '../../ZoneScheduleFields';

function normalizeTelegramChannels(channels = []) {
  return (Array.isArray(channels) ? channels : [])
    .filter(channel => channel?.chatId)
    .map(channel => ({
      chatId: String(channel.chatId),
      label:
        channel.channelName ||
        channel.channelTitle ||
        (channel.channelUsername ? `@${channel.channelUsername}` : null) ||
        String(channel.chatId),
    }));
}

export default function ZoneSettingsPanel({
  zones,
  extraFields,
  isLineCrossing = false,
  activeIndex,
  onSetActive,
  onUpdateField,
  onSave,
  onDelete,
  savingIndex,
  canDelete,
  errors = {},
  telegramChannels = [],
}) {
  const [expanded, setExpanded] = useState(null);
  const areaLabel = isLineCrossing ? 'line' : 'zone';
  const areaTitle = isLineCrossing ? 'Line Settings' : 'Zone Settings';
  const nameLabel = isLineCrossing ? 'Line Name' : 'Zone Name';
  const channelOptions = normalizeTelegramChannels(telegramChannels);
  const shouldRequireTelegramChannel = channelOptions.length > 1;

  if (zones.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14, marginBottom: 5 }}>{areaTitle}</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>
        {zones.length} {areaLabel}{zones.length === 1 ? '' : 's'} drawn on this camera for this detection type.
      </div>
      <div style={{ marginBottom: 12 }}>
        <TimezoneField />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {zones.map((z, i) => {
          const isOpen = expanded === i;
          return (
            <div
              key={i}
              style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}
              onMouseEnter={() => onSetActive(i)}
              onMouseLeave={() => onSetActive(null)}
            >
              <div
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer',
                  background: activeIndex === i ? 'rgba(245,158,11,.1)' : 'transparent',
                }}
              >
                <ChevronDown size={14} style={{ color: 'var(--tx3)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
                {canDelete && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                    title="Delete this zone"
                    style={{ display: 'flex', color: '#ef4444', cursor: 'pointer', opacity: savingIndex === i ? 0.5 : 1 }}
                  >
                    <Trash2 size={14} />
                  </span>
                )}
              </div>
              {isOpen && (
                <div style={{ padding: '10px 11px', borderTop: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>{nameLabel} *</label>
                    <input
                      value={z.name}
                      onChange={e => onUpdateField(i, 'name', e.target.value)}
                      maxLength={50}
                      style={{
                        width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                        background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-name`] ? '#ef4444' : 'var(--bd)'}`, fontSize: 12, color: 'var(--tx)', outline: 'none',
                      }}
                    />
                    {errors[`zone-${i}-name`] && (
                      <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>{errors[`zone-${i}-name`]}</div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>
                      Telegram Channel{shouldRequireTelegramChannel ? ' *' : ''}
                    </label>
                    <select
                      value={z.telegramChatId || ''}
                      onChange={e => onUpdateField(i, 'telegramChatId', e.target.value)}
                      disabled={!channelOptions.length}
                      style={{
                        width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                        background: 'var(--bg2)',
                        border: `1px solid ${errors[`zone-${i}-telegramChatId`] ? '#ef4444' : 'var(--bd)'}`,
                        fontSize: 12, color: channelOptions.length ? 'var(--tx)' : 'var(--tx3)', outline: 'none',
                        cursor: channelOptions.length ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <option value="">
                        {channelOptions.length ? 'Select Telegram channel' : 'No Telegram channel connected'}
                      </option>
                      {channelOptions.map(channel => (
                        <option key={channel.chatId} value={channel.chatId}>
                          {channel.label}
                        </option>
                      ))}
                    </select>
                    {errors[`zone-${i}-telegramChatId`] && (
                      <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>{errors[`zone-${i}-telegramChatId`]}</div>
                    )}
                  </div>
                  {isLineCrossing && (
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Mode</label>
                      <select
                        value={z.countMode || 'entry'}
                        onChange={e => onUpdateField(i, 'countMode', e.target.value)}
                        style={{
                          width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none', cursor: 'pointer',
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
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Capacity *</label>
                      <input
                        type="number"
                        min={0}
                        value={z.capacity}
                        onChange={e => onUpdateField(i, 'capacity', e.target.value)}
                        placeholder="e.g. 10"
                        style={{
                          width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-capacity`] ? '#ef4444' : 'var(--bd)'}`, fontSize: 12, color: 'var(--tx)', outline: 'none',
                        }}
                      />
                      {errors[`zone-${i}-capacity`] && (
                        <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>{errors[`zone-${i}-capacity`]}</div>
                      )}
                    </div>
                  )}
                  {extraFields.includes('threshold') && (
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Threshold (sec) *</label>
                      <input
                        type="number"
                        min={0}
                        value={z.threshold}
                        onChange={e => onUpdateField(i, 'threshold', e.target.value)}
                        placeholder="e.g. 30"
                        style={{
                          width: '100%', height: 34, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: `1px solid ${errors[`zone-${i}-threshold`] ? '#ef4444' : 'var(--bd)'}`, fontSize: 12, color: 'var(--tx)', outline: 'none',
                        }}
                      />
                      {errors[`zone-${i}-threshold`] && (
                        <div style={{ marginTop: 5, fontSize: 10.5, color: '#ef4444' }}>{errors[`zone-${i}-threshold`]}</div>
                      )}
                    </div>
                  )}
                  <ZoneScheduleFields
                    value={z.schedule}
                    onChange={schedule => onUpdateField(i, 'schedule', schedule)}
                  />
                  <button
                    onClick={() => onSave(i)}
                    disabled={savingIndex === i}
                    style={{
                      alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px',
                      borderRadius: 7, background: 'var(--blue)', border: 'none', fontSize: 11.5, fontWeight: 600, color: '#fff',
                      cursor: savingIndex === i ? 'not-allowed' : 'pointer', opacity: savingIndex === i ? 0.6 : 1,
                    }}
                  >
                    <Save size={12} /> {savingIndex === i ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
