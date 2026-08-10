const DOTS = [
  { angle: 0, opacity: 1 },
  { angle: 45, opacity: 0.86 },
  { angle: 90, opacity: 0.72 },
  { angle: 135, opacity: 0.58 },
  { angle: 180, opacity: 0.44 },
  { angle: 225, opacity: 0.5 },
  { angle: 270, opacity: 0.68 },
  { angle: 315, opacity: 0.84 },
];

export default function BufferingIndicator({
  title = 'Buffering...',
  subtitle = 'Please wait while we load the stream',
  size = 88,
  compact = false,
}) {
  const dot = Math.max(10, Math.round(size * 0.19));
  const radius = (size - dot) / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? 8 : 12, textAlign: 'center' }}>
      <style>{`
        @keyframes vq-buffering-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          position: 'relative',
          animation: 'vq-buffering-spin 1.05s linear infinite',
        }}
      >
        {DOTS.map(({ angle, opacity }) => (
          <span
            key={angle}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: dot,
              height: dot,
              marginLeft: -dot / 2,
              marginTop: -dot / 2,
              borderRadius: '50%',
              background: '#8b5cf6',
              opacity,
              boxShadow: '0 0 12px rgba(139,92,246,.55)',
              transform: `rotate(${angle}deg) translateY(-${radius}px)`,
              transformOrigin: 'center',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 4 : 8 }}>
        <div style={{ color: '#8b5cf6', fontSize: compact ? 15 : 22, fontWeight: 800, lineHeight: 1 }}>
          {title}
        </div>
        {!compact && (
          <div style={{ color: 'rgba(148,163,184,.86)', fontSize: 16, lineHeight: 1.25 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
