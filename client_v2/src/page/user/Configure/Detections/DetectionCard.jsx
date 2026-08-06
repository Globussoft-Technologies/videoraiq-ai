import { Toggle } from '../../../../components/primitives';

/**
 * One detection model tile in the catalogue grid: coloured category dot, name,
 * sub-type and enable toggle. Clicking the body selects
 * the model (which drives the detail panel on the right); the toggle is
 * click-isolated so flipping it never changes the selection.
 */
export default function DetectionCard({ model, color, selected, onSelect, onToggle, toggleDisabled = false }) {
  return (
    <div
      className="vq-det-card"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: selected ? 'linear-gradient(135deg,rgba(59,130,246,.10),rgba(168,85,247,.05))' : 'var(--bg1)',
        border: `1px solid ${selected ? 'rgba(59,130,246,.55)' : 'var(--bd)'}`,
        boxShadow: selected ? 'inset 0 0 0 1px rgba(59,130,246,.35)' : 'none',
        borderRadius: 12,
        padding: '12px 13px 10px',
        cursor: 'pointer',
        outline: 'none',
        opacity: model.active ? 1 : 0.65,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            flex: '0 0 auto',
            background: model.active ? color : 'var(--toggleoff)',
            boxShadow: model.active ? `0 0 7px ${color}` : 'none',
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--tx)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={model.name}
        >
          {model.name}
        </span>
        <span onClick={(e) => e.stopPropagation()} style={{ flex: '0 0 auto' }}>
          <Toggle on={model.active} onChange={onToggle} disabled={toggleDisabled} />
        </span>
      </div>

      {/* Sub-type line, flush with the status dot above it. --tx (full
          text color, not the dim --tx2/--tx3 secondary tones) at a larger
          size so this label is clearly legible against the card
          background in both themes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--mono)',
            fontSize: 11.5,
            fontWeight: 500,
            color: 'var(--tx)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {model.subtitle}
        </span>
      </div>
    </div>
  );
}
