/**
 * Top KPI row — six stat cards, responsive down to two columns.
 * Data from GET /measurement-logs/analytics (kpis). Falls back to em-dash
 * placeholders while loading or on error.
 */
const fmt = (v, suffix = '') =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v}${suffix}`;

const buildCards = (k) => [
  {
    label: 'Measured · Shift',
    value: fmt(k?.measured),
    color: 'var(--tx)',
    hint: 'Total mattress units measured in the selected date range.',
  },
  {
    label: 'Pass Rate',
    value: k?.passRate === null || k?.passRate === undefined ? '—' : `${k.passRate}%`,
    color: 'var(--ok)',
    hint: 'Share of measured units where every axis is within its tolerance (not a mismatch, not a QR error).',
  },
  {
    label: 'Size Mismatch',
    value: fmt(k?.sizeMismatch),
    color: 'var(--crit)',
    hint: 'Units whose measured L / W / H differs from the printed label by more than the allowed tolerance.',
  },
  {
    label: 'QR Read Errors',
    value: fmt(k?.qrReadErrors),
    color: 'var(--warn)',
    hint: 'Units where the label QR code could not be read, so the print size is unknown.',
  },
  {
    label: 'Avg Deviation',
    value: fmt(k?.avgDeviationIn, ' in'),
    color: 'var(--cyan)',
    hint: 'Average absolute gap between printed and measured size, across all axes and all units in the range.',
  },
  {
    label: 'Avg Confidence',
    value: k?.avgConfidence === null || k?.avgConfidence === undefined ? '—' : `${k.avgConfidence}`,
    color: 'var(--tx)',
    hint: 'Average confidence score (0–1) the measurement service reported. Below ~0.6, verify against the photo.',
  },
];

const MeasurementKpis = ({ kpis, loading = false, error = '' }) => {
  const cards = buildCards(kpis);
  return (
    <div>
      {error && (
        <div className="mb-2 text-[11px] text-[var(--crit)]">{error}</div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-[14px]">
        {cards.map((k) => (
          <div
            key={k.label}
            className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[13px] p-[15px] cursor-help"
            title={k.hint}
          >
            <div className="text-[11px] text-[var(--tx2)]">{k.label}</div>
            <div
              className="font-[var(--disp)] font-bold text-[26px] mt-[5px]"
              style={{ color: loading && !kpis ? 'var(--tx3)' : k.color }}
            >
              {loading && !kpis ? '…' : k.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MeasurementKpis;
