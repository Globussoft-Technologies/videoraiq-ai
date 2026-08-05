export default function AnalyticsBlurb({ children, style = {} }) {
  if (!children) return null;

  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--tx3)',
        lineHeight: 1.45,
        marginTop: 4,
        fontStyle: 'italic',
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </div>
  );
}


