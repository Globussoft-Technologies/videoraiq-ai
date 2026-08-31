import { LifeBuoy, Mail, Phone, ShieldAlert } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';
import { SUPPORT_CONTACT } from '../helpers/support';
import { IS_LICENSING_ENABLED } from '../helpers/license';

/**
 * Empty state for any surface that lists detections.
 *
 * A detection list can come back empty for two very different reasons, and an
 * unexplained blank panel reads as a broken screen either way:
 *
 *   - the superadmin has licensed no detections for this client — nothing the
 *     user can do in the app changes that, so point them at support;
 *   - the list is empty for an ordinary reason (a filter, a camera with nothing
 *     configured) — show the caller's own wording.
 *
 * Which one applies is decided here from the shared licence, so callers just
 * drop this in where they used to render nothing.
 *
 * `compact` is for popovers and dropdown panels, where the full padded block
 * would overflow.
 */
export default function NoDetectionLicense({ fallback = 'No detections found.', compact = false }) {
  const { allowedDetections, loading } = useLicense();

  // Say nothing until the licence is known — a "contact support" message that
  // then vanishes is worse than a brief blank.
  if (loading) return null;

  // With licensing off nothing is licensed OR unlicensed, so an empty list is
  // always an ordinary empty list — never a licensing problem.
  const unlicensed = IS_LICENSING_ENABLED && allowedDetections.size === 0;
  const supportEmail = SUPPORT_CONTACT.email?.trim() || '';
  const supportPhone = SUPPORT_CONTACT.phone?.trim() || '';

  if (!unlicensed) {
    return (
      <div
        style={{
          padding: compact ? '10px 6px' : '26px 16px',
          textAlign: 'center',
          fontSize: compact ? 11.5 : 12.5,
          color: 'var(--tx3)',
        }}
      >
        {fallback}
      </div>
    );
  }

  if (compact) {
    return (
      <div style={{ padding: '8px 6px 4px', textAlign: 'left' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginBottom: 3 }}>
          No detection license
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx3)' }}>
          No detections are enabled for your account. Please contact support to enable them.
        </div>
        {(supportEmail || supportPhone) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {supportEmail && (
              <a href={`mailto:${supportEmail}`} style={{ fontSize: 11.5, color: 'var(--blue)', textDecoration: 'none' }}>
                {supportEmail}
              </a>
            )}
            {supportPhone && (
              <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} style={{ fontSize: 11.5, color: 'var(--blue)', textDecoration: 'none' }}>
                {supportPhone}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        maxWidth: 520,
        margin: '0 auto',
        padding: '56px 32px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(245,158,11,.12)',
          border: '1px solid rgba(245,158,11,.24)',
          color: '#f59e0b',
        }}
      >
        <ShieldAlert size={30} strokeWidth={1.8} />
      </span>

      <div>
        <div
          style={{
            fontFamily: 'var(--disp)',
            fontSize: 19,
            fontWeight: 700,
            color: 'var(--tx)',
            marginBottom: 8,
          }}
        >
          No detection license
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--tx2)' }}>
          There are no detections enabled for your account. Detections are assigned by your
          provider — please contact support to have them added to your license.
        </p>
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 4,
          padding: '16px 18px',
          borderRadius: 12,
          border: '1px solid var(--bd)',
          background: 'var(--bg2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--tx)',
          }}
        >
          <LifeBuoy size={15} style={{ color: 'var(--tx3)' }} />
          Contact support
        </div>

        {supportEmail || supportPhone ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {supportEmail && (
              <a
                href={`mailto:${supportEmail}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}
              >
                <Mail size={14} />
                {supportEmail}
              </a>
            )}
            {supportPhone && (
              <a
                href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--blue)', textDecoration: 'none' }}
              >
                <Phone size={14} />
                {supportPhone}
              </a>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--tx3)' }}>
            Reach out to your VideorAIQ support contact to have detections enabled for this
            account.
          </div>
        )}
      </div>
    </div>
  );
}
