/**
 * Low-level visual primitives for the V2 design language. All styling is driven
 * by the CSS variables defined in theme/tokens.css so dark/light just work.
 */

/** Glassy panel/card used across every view. */
export function Panel({ children, className = '', style = {}, gradient = false, ...rest }) {
  return (
    <div
      className={className}
      style={{
        background: gradient ? 'linear-gradient(180deg,var(--bg2),var(--bg1))' : 'var(--bg1)',
        border: '1px solid var(--bd)',
        borderRadius: 13,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Section header row (title + optional action on the right). */
export function PanelHeader({ title, dot, dotColor = 'var(--crit)', blink = false, action, children, style = {} }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '13px 16px 11px',
        borderBottom: '1px solid var(--bd)',
        ...style,
      }}
    >
      {dot && (
        <span
          className={blink ? 'vq-blink' : ''}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
            flex: '0 0 auto',
          }}
        />
      )}
      {title && (
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>{title}</span>
      )}
      {children}
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}

/** Small status dot. */
export function StatusDot({ color = 'var(--ok)', size = 7, glow = true, blink = false, style = {} }) {
  return (
    <span
      className={blink ? 'vq-blink' : ''}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: glow ? `0 0 8px ${color}` : 'none',
        flex: '0 0 auto',
        display: 'inline-block',
        ...style,
      }}
    />
  );
}

/** Severity / status pill. */
export function Badge({ children, color = 'var(--tx2)', solid = false, mono = true, style = {} }) {
  return (
    <span
      style={{
        fontFamily: mono ? 'var(--mono)' : 'var(--ui)',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '.02em',
        padding: '2px 7px',
        borderRadius: 5,
        color: solid ? '#06070d' : color,
        background: solid ? color : 'transparent',
        border: solid ? '0' : `1px solid ${color}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** iOS-style toggle matching the prototype. */
export function Toggle({ on, onChange, disabled = false }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: 38,
        height: 21,
        borderRadius: 11,
        flex: '0 0 auto',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--toggleoff)',
        transition: 'background .2s',
        position: 'relative',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 19 : 2.5,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }}
      />
    </div>
  );
}

/** Link-style action text. */
export function ActionLink({ children, onClick, color = 'var(--blue)', style = {} }) {
  return (
    <span
      onClick={onClick}
      style={{ fontSize: 11.5, fontWeight: 500, color, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}
    >
      {children}
    </span>
  );
}

/**
 * Sparkline polyline from an array of numbers (auto-scaled to a 64x20 box).
 */
export function Sparkline({ values = [], color = 'var(--blue)', width = 64, height = 20 }) {
  const pts = sparkPoints(values, width, height);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" preserveAspectRatio="none" style={{ flex: 1 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function sparkPoints(values = [], width = 64, height = 20) {
  if (!values.length) return `0,${height} ${width},${height}`;
  // Auto-scale from the DATA's own min/max only — clamping min to 0 (as a
  // prior version did) inflates the range for series that never go near
  // zero (e.g. cameras-online counts in the hundreds), squashing the real
  // day-to-day variation into a sliver at the top and making a genuinely
  // wiggly series render as a flat line. Matches the HTML prototype's own
  // spark() helper (VideoraIQ Command.dc.html), including its 0.85/0.075
  // padding factors so the line never touches the box edges.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
