import { useState } from 'react';
import { ChevronRight, Loader2, TriangleAlert, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAttendanceSocket } from '../context/AttendanceSocketContext';
import { getNvrs } from '../helpers/configure';
import { ManageCamerasModal } from '../page/user/Configure/NVRCameras';

export default function CameraLimitLock() {
  const { cameraLimit } = useAttendanceSocket() || {};
  const [nvrs, setNvrs] = useState([]);
  const [pickingNvr, setPickingNvr] = useState(false);
  const [loadingNvrs, setLoadingNvrs] = useState(false);
  const [activeNvr, setActiveNvr] = useState(null);

  const purchasedCameras = Number(cameraLimit?.purchasedCameras) || 0;
  const added = Number(cameraLimit?.added) || 0;
  const overLimit = purchasedCameras > 0 && added > purchasedCameras;

  if (!overLimit) return null;

  const excess = added - purchasedCameras;

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
            Camera Limit Exceeded
          </h2>

          <p style={{ margin: '0 0 4px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
            You have added <strong style={{ color: 'var(--tx)' }}>{added}</strong> cameras, but your plan allows only{' '}
            <strong style={{ color: 'var(--tx)' }}>{purchasedCameras}</strong>.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx2)' }}>
            Remove <strong style={{ color: 'var(--crit)' }}>{excess} camera{excess === 1 ? '' : 's'}</strong> to continue.
          </p>

          {pickingNvr ? (
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
