import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LifeBuoy, Loader2, Mail, Phone, ShieldAlert, VideoOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { toggleChannelDetection } from '../helpers/configure';
import { LICENSE_ERRORS } from '../helpers/license';
import { SUPPORT_CONTACT } from '../helpers/support';

/**
 * Shown when the backend refuses to enable a detection because the client is at
 * one of the superadmin-configured limits.
 *
 * The requirement is that the user is not left at a dead end: they see which
 * cameras are holding the slot and can deselect one right here, then continue
 * with the selection that was refused.
 *
 *   NO_CAMERA_LICENSE              the client has no camera licence at all.
 *                                  Nothing to free and nothing the user can do
 *                                  in the app, so this shows the support
 *                                  contact instead of a camera list.
 *   CAMERA_LICENSE_EXCEEDED        every listed camera holds a camera-licence
 *                                  slot. Freeing one switches OFF every
 *                                  detection running on it — the slot is per
 *                                  camera, not per detection.
 *   DETECTION_CAMERA_LIMIT_REACHED the listed cameras run this one detection.
 *                                  Freeing one switches off only that
 *                                  detection; the camera keeps its others.
 *   DETECTION_NOT_LICENSED         nothing to free — the detection is not part
 *                                  of the plan at all.
 *
 * Zones are irrelevant here: a camera counts once no matter how many zones it
 * has, so nothing in this dialog is per-zone.
 */
export default function DetectionLimitDialog({
  open,
  error,
  detectionType,
  detectionLabel,
  onClose,
  onRetry,
}) {
  const [freeingId, setFreeingId] = useState('');

  if (!open || !error) return null;

  const isNoLicense = error.code === LICENSE_ERRORS.NO_CAMERA_LICENSE;
  const isLicense = error.code === LICENSE_ERRORS.CAMERA_LICENSE_EXCEEDED;
  const isUnlicensed = error.code === LICENSE_ERRORS.DETECTION_NOT_LICENSED;
  // Nothing is deselectable in the two "you simply do not have this" cases.
  const cameras = isUnlicensed || isNoLicense ? [] : error.cameras || [];

  const supportEmail = SUPPORT_CONTACT.email?.trim() || '';
  const supportPhone = SUPPORT_CONTACT.phone?.trim() || '';

  const title = isNoLicense
    ? 'No camera license'
    : isLicense
      ? 'Camera licence limit reached'
      : isUnlicensed
        ? 'Detection not available'
        : `Camera limit reached for ${detectionLabel || 'this detection'}`;

  // Freeing a camera-licence slot means turning off everything running on that
  // camera; freeing a detection slot touches only the refused detection.
  const freeCamera = async (camera) => {
    const types = isLicense
      ? camera.detections || []
      : [camera.settingType || detectionType].filter(Boolean);

    if (types.length === 0) return;

    setFreeingId(camera.cameraId);
    try {
      for (const settingType of types) {
        await toggleChannelDetection({
          channelId: camera.cameraId,
          detectionType: settingType,
          enable: false,
        });
      }
      toast.success(`${camera.name} deselected.`);
      // Hand control back so the caller can retry the enable that was refused.
      await onRetry?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.body?.message || `Failed to deselect ${camera.name}.`,
      );
    } finally {
      setFreeingId('');
    }
  };

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="detection-limit-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(6,9,15,.68)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 470,
          background: 'var(--bg1solid)',
          border: '1px solid var(--bd2)',
          borderRadius: 16,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,.45)',
          color: 'var(--tx)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(245,158,11,.14)',
              color: '#f59e0b',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={18} />
          </span>
          <span
            id="detection-limit-title"
            style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15, flex: 1 }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--tx3)',
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* The backend's own message, shown verbatim. */}
        <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.55, margin: '0 0 6px' }}>
          {error.message}
        </p>

        {error.limit > 0 && (
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '0 0 14px' }}>
            {error.inUse} of {error.limit} camera{error.limit === 1 ? '' : 's'} in use.
          </p>
        )}

        {/* No licence at all: there is no camera to free and nothing the user
            can change here, so point them at support. The contact details are
            blank until they are decided — only the ones that are filled in
            render, so the panel reads correctly either way. */}
        {isNoLicense && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 12,
              padding: '11px 12px',
              borderRadius: 10,
              border: '1px solid var(--bd)',
              background: 'var(--bg2)',
            }}
          >
            <LifeBuoy size={15} style={{ color: 'var(--tx3)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Contact support</div>
              {supportEmail || supportPhone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {supportEmail && (
                    <a
                      href={`mailto:${supportEmail}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--blue)',
                        textDecoration: 'none',
                      }}
                    >
                      <Mail size={13} />
                      {supportEmail}
                    </a>
                  )}
                  {supportPhone && (
                    <a
                      href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--blue)',
                        textDecoration: 'none',
                      }}
                    >
                      <Phone size={13} />
                      {supportPhone}
                    </a>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                  Reach out to your VideorAIQ support contact to have cameras added to
                  your license.
                </div>
              )}
            </div>
          </div>
        )}

        {cameras.length > 0 && (
          <>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--tx3)',
                margin: '4px 0 8px',
              }}
            >
              Deselect a camera to continue
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {cameras.map((camera) => (
                <div
                  key={`${camera.cameraId}-${camera.settingType || 'all'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '9px 11px',
                    borderRadius: 9,
                    border: '1px solid var(--bd)',
                    background: 'var(--bg2)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {camera.name}
                    </div>
                    {isLicense && (camera.detections?.length || 0) > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                        Turns off {camera.detections.length} detection
                        {camera.detections.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => freeCamera(camera)}
                    disabled={Boolean(freeingId)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 30,
                      padding: '0 11px',
                      borderRadius: 8,
                      border: '1px solid var(--bd)',
                      background: 'var(--bg1solid)',
                      color: 'var(--tx)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: freeingId ? 'wait' : 'pointer',
                      opacity: freeingId && freeingId !== camera.cameraId ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {freeingId === camera.cameraId ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <VideoOff size={13} />
                    )}
                    Deselect
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 9,
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
