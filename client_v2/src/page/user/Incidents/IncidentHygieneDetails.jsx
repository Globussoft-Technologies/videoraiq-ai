import { hygieneCategoryLabel } from '../../../helpers/hygieneDetection';
import { severity } from '../../../lib/format';

export default function IncidentHygieneDetails({ item, variant = 'card', compact = false }) {
  const dark = variant === 'lightbox';
  const violations = Array.isArray(item.violations) ? item.violations.filter(violation => violation && typeof violation === 'object') : [];
  const categories = Array.isArray(item.selectedCategories) ? item.selectedCategories : [];
  const count = item.violationCount ?? violations.length;
  return (
    <section aria-label="Hygiene and food safety violations" style={{ color: dark ? '#e2e8f0' : 'var(--tx2)', fontSize: dark ? 12 : 11, minWidth: 0, maxWidth: '100%' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>{count} violation{count === 1 ? '' : 's'}</strong>
        {item.zone && <span>Zone: {item.zone}</span>}
      </div>
      {!compact && (
        <>
          {dark && item.conceptGroup && <div style={{ marginTop: 5, color: '#94a3b8' }}>{item.conceptGroup}</div>}
          {categories.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }} aria-label="Selected hygiene categories">
              {categories.map(category => <span key={category} style={{ padding: '3px 6px', borderRadius: 5, background: dark ? 'rgba(20,184,166,.15)' : 'var(--bg2)', fontSize: 10, overflowWrap: 'anywhere' }}>{hygieneCategoryLabel(category)}</span>)}
            </div>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 6 }}>
            {(dark ? violations : violations.slice(0, 2)).map((violation, index) => {
              const level = severity(violation.severity);
              const confidence = typeof violation.confidence === 'number' && Number.isFinite(violation.confidence)
                ? `${Math.round(violation.confidence * 100)}% confidence`
                : null;
              return (
                <li key={`${violation.category}-${index}`} style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,.16)' : 'var(--bd)'}`, paddingTop: 6, overflowWrap: 'anywhere' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{violation.categoryName || hygieneCategoryLabel(violation.category) || 'Violation'}</strong>
                    {violation.severity && <span style={{ color: level.color, fontSize: 10, fontWeight: 700 }}>{level.short}</span>}
                  </div>
                  {violation.description && <div style={{ marginTop: 3, lineHeight: 1.45 }}>{violation.description}</div>}
                  {confidence && <div style={{ marginTop: 3, color: dark ? '#94a3b8' : 'var(--tx3)' }}>{confidence}</div>}
                </li>
              );
            })}
          </ul>
          {!dark && violations.length > 2 && <div style={{ marginTop: 5 }}>+{violations.length - 2} more in snapshot details</div>}
        </>
      )}
    </section>
  );
}
