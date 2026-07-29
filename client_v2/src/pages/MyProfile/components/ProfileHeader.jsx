const STAT_COLOR = {
  blue: 'var(--blue)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  violet: 'var(--violet)',
};

function StatTile({ label, value, color, last }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderRight: last ? 'none' : '1px solid var(--bd)',
      }}
    >
      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--disp)',
          fontWeight: 700,
          fontSize: 20,
          marginTop: 3,
          color: STAT_COLOR[color] || 'var(--tx)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ProfileHeader({
  initials,
  name,
  role,
  status,
  email,
  subtitle,
  totalCameras,
  configured,
  nonConfigured,
  detectionsEnabled,
}) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 16, overflow: 'hidden' }}>
      <div
        style={{
          height: 84,
          background: 'linear-gradient(120deg,rgba(59,130,246,.22),rgba(168,85,247,.16))',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 16px,transparent 16px 32px)',
          }}
        />
      </div>

      <div style={{ padding: '0 22px 20px', marginTop: -34, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <span
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--disp)',
            fontSize: 28,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg,var(--blue),var(--violet))',
            border: '3px solid var(--bg1)',
            boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          }}
        >
          {initials}
        </span>
        <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22 }}>{name}</span>
            {role && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: '#a855f7',
                  border: '1px solid #a855f7',
                  borderRadius: 6,
                  padding: '2px 9px',
                }}
              >
                {role}
              </span>
            )}
            {status && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ok)' }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--ok)',
                    boxShadow: '0 0 7px var(--ok)',
                  }}
                />
                {status}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--tx3)', marginTop: 5 }}>
            {email}
            {subtitle ? ` · ${subtitle}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderTop: '1px solid var(--bd)' }}>
        <StatTile label="Total Cameras" value={totalCameras} color="blue" />
        <StatTile label="Configured" value={configured} color="ok" />
        <StatTile label="Non-Configured" value={nonConfigured} color="warn" />
        <StatTile label="Detections Enabled" value={detectionsEnabled} color="violet" last />
      </div>
    </div>
  );
}
