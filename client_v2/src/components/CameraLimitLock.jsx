import { useState } from 'react';
import { ChevronRight, LifeBuoy, Loader2, Mail, Phone, TriangleAlert, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAttendanceSocket } from '../context/AttendanceSocketContext';
import { getNvrs } from '../helpers/configure';
import { SUPPORT_CONTACT } from '../helpers/support';
import { IS_LICENSING_ENABLED } from '../helpers/license';
import { ManageCamerasModal } from '../page/user/Configure/NVRCameras';

/**
 * App-wide blocking overlay, driven entirely by the `purchasedCameras_<adminId>`
 * socket snapshot. Two distinct states:
 *
 *   NO LICENCE   `licensed === false` (the superadmin has bought this client
 *                zero cameras). Nothing the user can do in the app fixes it —
 *                removing cameras does not grant a licence — so this state
 *                offers the support contact and no Manage Cameras action.
 *
 *   OVER LIMIT   more cameras added than purchased. Recoverable in-app by
 *                removing the excess, so Manage Cameras is offered.
 *
 * The lock freezes the UI only. Detections already running on the server keep
 * running; this never stops anything.
 */
export default function CameraLimitLock() {
  const { cameraLimit } = useAttendanceSocket() || {};
  const [nvrs, setNvrs] = useState([]);
  const [pickingNvr, setPickingNvr] = useState(false);
  const [loadingNvrs, setLoadingNvrs] = useState(false);
  const [activeNvr, setActiveNvr] = useState(null);

  // Licensing off (on-premise): there is no camera licence to exceed, so
  // neither lock applies.
  if (!IS_LICENSING_ENABLED) return null;

  const purchasedCameras = Number(cameraLimit?.purchasedCameras) || 0;
  const added = Number(cameraLimit?.added) || 0;
  // Only an explicit false locks: an absent flag (older server, or no snapshot
  // delivered yet) must never freeze the app.
  const unlicensed = cameraLimit?.licensed === false;
  const overLimit = purchasedCameras > 0 && added > purchasedCameras;

  if (!unlicensed && !overLimit) return null;

  const excess = added - purchasedCameras;
  const supportEmail = SUPPORT_CONTACT.email?.trim() || '';
  const supportPhone = SUPPORT_CONTACT.phone?.trim() || '';

  const handleManageClick = async () => {
    setLoadingNvrs(true);
    try {
      const result = await getNvrs(0, 100);
      const list = Array.isArray(result) ? result : result?.nvrs;
      const nextNvrs = Array.isArray(list) ? list : [];

      if (nextNvrs.length === 0) {
        toast.error('No NVR found to manage cameras.');
        return;
      }

      setNvrs(nextNvrs);
      if (nextNvrs.length === 1) {
        setActiveNvr(nextNvrs[0]);
      } else {
        setPickingNvr(true);
      }
    } catch {
      toast.error('Failed to load NVRs. Please try again.');
    } finally {
      setLoadingNvrs(false);
    }
  };

  const handleSaved = () => {
    setActiveNvr(null);
    window.dispatchEvent(new Event('nvr-cameras-changed'));
  };

  return (
    <>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="camera-limit-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18,
          background: 'rgba(2,6,23,.76)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            width: 430,
            maxWidth: '100%',
            borderRadius: 16,
            border: '1px solid var(--bd2)',
            background: 'var(--bg1solid)',
            boxShadow: '0 30px 90px rgba(0,0,0,.55)',
            padding: 26,
            textAlign: 'center',
            color: 'var(--tx)',
          }}
        >
          <span
            style={{
              width: 54,
              height: 54,
              margin: '0 auto 14px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(239,68,68,.12)',
              color: 'var(--crit)',
            }}
          >
            <TriangleAlert size={27} strokeWidth={2} />
          </span>

          <h2 id="camera-limit-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            {unlicensed ? 'No Camera License' : 'Camera Limit Exceeded'}
          </h2>

          {unlicensed ? (
            <>
              <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
                You do not have any camera license. Please contact support to enable cameras.
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  textAlign: 'left',
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
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}
                        >
                          <Mail size={13} />
                          {supportEmail}
                        </a>
                      )}
                      {supportPhone && (
                        <a
                          href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}
                        >
                          <Phone size={13} />
                          {supportPhone}
                        </a>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                      Reach out to your VideorAIQ support contact to have cameras added to your license.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 4px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
                You have added <strong style={{ color: 'var(--tx)' }}>{added}</strong> cameras, but your plan allows only{' '}
                <strong style={{ color: 'var(--tx)' }}>{purchasedCameras}</strong>.
              </p>
              <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
                Remove <strong style={{ color: 'var(--crit)' }}>{excess} camera{excess === 1 ? '' : 's'}</strong> to continue.
              </p>
            </>
          )}

          {unlicensed ? null : pickingNvr ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--tx3)' }}>
                Select an NVR to manage its cameras
              </div>
              {nvrs.map((nvr) => (
                <button
                  key={nvr._id || nvr.id}
                  type="button"
                  onClick={() => {
                    setPickingNvr(false);
                    setActiveNvr(nvr);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 9,
                    border: '1px solid var(--bd)',
                    background: 'var(--bg2)',
                    color: 'var(--tx)',
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nvr.name || nvr.nvrName || 'NVR'}
                  </span>
                  <ChevronRight size={15} style={{ color: 'var(--tx3)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleManageClick}
              disabled={loadingNvrs}
              style={{
                width: '100%',
                height: 38,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                border: 'none',
                borderRadius: 10,
                background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: loadingNvrs ? 'wait' : 'pointer',
                opacity: loadingNvrs ? 0.72 : 1,
              }}
            >
              {loadingNvrs ? <Loader2 size={15} className="animate-spin" /> : <VideoOff size={15} />}
              Manage Cameras
            </button>
          )}
        </div>
      </div>

      {activeNvr && (
        <ManageCamerasModal
          nvr={activeNvr}
          onClose={() => setActiveNvr(null)}
          onSaved={handleSaved}
          zIndex={1100}
        />
      )}
    </>
  );
}
