import { LIGHTING_INCIDENT_TYPE, lightingCategoryLabel } from '../../../helpers/lightingDetection';
import { hygieneCategoryLabel } from '../../../helpers/hygieneDetection';
import { severity } from '../../../lib/format';

export default function IncidentHygieneDetails({ item, variant = 'card', compact = false, showIssueCount = true, showViolationSeverity = true, showConfidence = true, showZone = true }) {
  const dark = variant === 'lightbox';
  const isLighting = item.incidentType === LIGHTING_INCIDENT_TYPE;
  const categoryLabel = isLighting ? lightingCategoryLabel : hygieneCategoryLabel;
  const violations = Array.isArray(item.violations) ? item.violations.filter(violation => violation && typeof violation === 'object') : [];
  const categories = Array.isArray(item.selectedCategories) ? item.selectedCategories : [];
  const count = Number.isInteger(item.violationCount) && item.violationCount >= 0
    ? item.violationCount : violations.length;
  return (
    <section aria-label={isLighting ? "Lighting and site condition violations" : "Hygiene and food safety violations"} style={{ color: dark ? '#e2e8f0' : 'var(--tx2)', fontSize: dark ? 12 : 11, minWidth: 0, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: showIssueCount ? 'space-between' : 'flex-start', flexWrap: 'wrap', gap: 6 }}>
        {showIssueCount && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: dark ? 'rgba(245,158,11,.14)' : 'var(--bg2)', fontWeight: 600 }}>
          Issues detected
          <strong style={{ minWidth: 18, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: dark ? '#fbbf24' : 'var(--tx)' }}>{count}</strong>
        </span>}
        {showZone && item.zone && <span style={{ overflowWrap: 'anywhere' }}>Zone: <strong>{item.zone}</strong></span>}
      </div>
      {compact && violations.length > 0 && (
        <div style={{ marginTop: 6, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
          {violations[0].categoryName || categoryLabel(violations[0].category) || 'Issue'}
          {count > 1 && <span style={{ marginLeft: 6, color: 'var(--tx3)' }}>+{count - 1} more</span>}
        </div>
      )}
      {!compact && (
        <>
          {dark && item.conceptGroup && <div style={{ marginTop: 5, color: '#94a3b8' }}>{item.conceptGroup}</div>}
          {categories.length > 0 && violations.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }} aria-label={isLighting ? "Selected lighting categories" : "Selected hygiene categories"}>
              {categories.map(category => <span key={category} style={{ padding: '3px 6px', borderRadius: 5, background: dark ? 'rgba(20,184,166,.15)' : 'var(--bg2)', fontSize: 10, overflowWrap: 'anywhere' }}>{categoryLabel(category)}</span>)}
            </div>
          )}
          <ul
            aria-label="Detected issues"
            tabIndex={!dark && violations.length > 0 ? 0 : undefined}
            style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 6, ...(!dark ? { maxHeight: 100, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable', overscrollBehaviorY: 'contain' } : {}) }}
          >
            {violations.map((violation, index) => {
              const level = severity(violation.severity);
              const confidence = typeof violation.confidence === 'number' && Number.isFinite(violation.confidence)
                ? `${Math.round(violation.confidence * 100)}% confidence`
                : null;
              return (
                <li key={`${violation.category}-${index}`} style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,.16)' : 'var(--bd)'}`, paddingTop: 6, overflowWrap: 'anywhere' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ flex: '1 1 160px', lineHeight: 1.4 }}>{index + 1}. {violation.categoryName || categoryLabel(violation.category) || 'Issue'}</strong>
                    {showViolationSeverity && violation.severity && <span style={{ color: level.color, fontSize: 10, fontWeight: 700, border: '1px solid currentColor', borderRadius: 4, padding: '2px 5px', alignSelf: 'flex-start' }}>{level.short}</span>}
                  </div>
                  {violation.description && <div style={{ marginTop: 3, lineHeight: 1.45 }}>{violation.description}</div>}
                  {showConfidence && confidence && <div style={{ marginTop: 3, color: dark ? '#94a3b8' : 'var(--tx3)' }}>{confidence}</div>}
                </li>
              );
            })}
          </ul>
          {violations.length === 0 && item.description && <div style={{ marginTop: 6, lineHeight: 1.45 }}>{item.description}</div>}
        </>
      )}
    </section>
  );
}
