import { useState } from 'react';
import { DoorOpen } from 'lucide-react';

// Door detection is never drawn: the AI team sets each door camera up and
// sends its door points (DS door contract §4), pasted here as they came.
export default function DoorSetupBar({ doorCount, saving, onLoad, onSave }) {
  const [editing, setEditing] = useState(doorCount === 0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const err = onLoad(text);
    setError(err || '');
    if (!err) { setEditing(false); setText(''); }
  };

  return (
    <div style={{ marginTop: 12, border: '1px solid var(--bd)', borderRadius: 12, padding: 12, background: 'var(--bg2)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DoorOpen size={15} color="var(--blue)" />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Door setup from the AI team</span>
        {doorCount > 0 && !editing && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--tx3)' }}>
            {doorCount} door{doorCount === 1 ? '' : 's'} set
          </span>
        )}
      </div>

      {editing ? (
        <>
          <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
            Doors aren't drawn. Paste the door points the AI team sent for this camera, exactly as sent.
          </div>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            rows={4}
            placeholder='{ "camera_id": "...", "zones": [[[88, 75], [1081, 18], [1152, 1048], [246, 1063]]], "zone_names": ["Main Door"] }'
            style={{
              width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 9, resize: 'vertical',
              background: 'var(--bg1solid)', border: `1px solid ${error ? '#ef4444' : 'var(--bd)'}`,
              fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--tx)', outline: 'none',
            }}
          />
          {error && <div style={{ fontSize: 10.5, color: '#ef4444' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {doorCount > 0 && (
              <button type="button" onClick={() => { setEditing(false); setError(''); }} style={secondary}>Cancel</button>
            )}
            <button type="button" onClick={load} disabled={!text.trim()} style={{ ...primary, opacity: text.trim() ? 1 : 0.5 }}>
              Use these door points
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setEditing(true)} style={secondary}>Replace door points</button>
          <button type="button" onClick={onSave} disabled={saving} style={{ ...primary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save door settings'}
          </button>
        </div>
      )}
    </div>
  );
}

const secondary = {
  height: 34, padding: '0 14px', borderRadius: 9, background: 'var(--bg1solid)', border: '1px solid var(--bd)',
  fontSize: 12, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer',
};
const primary = {
  height: 34, padding: '0 14px', borderRadius: 9, background: 'linear-gradient(135deg,var(--blue),var(--violet))',
  border: 'none', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
};
