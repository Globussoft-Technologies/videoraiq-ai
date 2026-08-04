import { useState } from 'react';
import { ChevronDown, Save, Trash2 } from 'lucide-react';
import ZoneScheduleFields, { TimezoneField } from '../../ZoneScheduleFields';

export default function ZoneSettingsPanel({ zones, extraFields, activeIndex, onSetActive, onUpdateField, onSave, onDelete, savingIndex, canDelete }) {
  const [expanded, setExpanded] = useState(null);

  if (zones.length === 0) return null;

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 15, padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Zone Settings</div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            {zones.length} zone{zones.length === 1 ? '' : 's'} drawn on this camera for this detection type.
          </div>
        </div>
        <div style={{ minWidth: 280, width: '100%', maxWidth: 320 }}>
          <TimezoneField />
        </div>
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
                <div style={{ padding: '12px 11px', borderTop: '1px solid var(--bd)', display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Zone Name</label>
                      <input
                        value={z.name}
                        onChange={e => onUpdateField(i, 'name', e.target.value)}
                        maxLength={50}
                        style={{
                          width: '100%', height: 36, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                          background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {extraFields.includes('capacity') && (
                        <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Capacity</label>
                          <input
                            type="number"
                            min={0}
                            value={z.capacity}
                            onChange={e => onUpdateField(i, 'capacity', e.target.value)}
                            placeholder="e.g. 10"
                            style={{
                              width: '100%', height: 36, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                            }}
                          />
                        </div>
                      )}
                      {extraFields.includes('threshold') && (
                        <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>Threshold (sec)</label>
                          <input
                            type="number"
                            min={0}
                            value={z.threshold}
                            onChange={e => onUpdateField(i, 'threshold', e.target.value)}
                            placeholder="e.g. 30"
                            style={{
                              width: '100%', height: 36, padding: '0 10px', borderRadius: 8, boxSizing: 'border-box',
                              background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx)', outline: 'none',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginBottom: 4 }}>Zone schedule</div>
                      <div style={{ fontSize: 12, color: 'var(--tx2)' }}>Set the active time window for this zone.</div>
                    </div>
                    <button
                      onClick={() => onSave(i)}
                      disabled={savingIndex === i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px',
                        borderRadius: 8, background: 'var(--blue)', border: 'none', fontSize: 11.5, fontWeight: 600, color: '#fff',
                        cursor: savingIndex === i ? 'not-allowed' : 'pointer', opacity: savingIndex === i ? 0.6 : 1,
                      }}
                    >
                      <Save size={12} /> {savingIndex === i ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <ZoneScheduleFields
                    value={z.schedule}
                    onChange={schedule => onUpdateField(i, 'schedule', schedule)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
