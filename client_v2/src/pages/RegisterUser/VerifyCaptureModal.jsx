import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Webcam from 'react-webcam';
import {
  X,
  Camera,
  RefreshCw,
  Loader,
  CameraOff,
  Sun,
  Glasses,
  ScanFace,
  Image as ImageIcon,
} from 'lucide-react';
import frontView from '@/assets/front_view.png';

const GRADIENT = 'linear-gradient(90deg,var(--blue),var(--violet))';

const TIPS = [
  { Icon: Sun, t: 'Good, even lighting on your face' },
  { Icon: Glasses, t: 'Remove hats, masks or sunglasses' },
  { Icon: ScanFace, t: 'Keep the whole face inside the oval' },
  { Icon: ImageIcon, t: 'Use a clean, plain background' },
];

/**
 * Full-screen "take an identity photo" capture for the Verify User flow.
 * Front view only. Portals to <body> so it is never clipped by the parent
 * dialog. Calls onCapture(File) with the JPEG, or onClose() to back out.
 */
const VerifyCaptureModal = ({ open, onClose, onCapture, namePrefix = 'verify' }) => {
  const webcamRef = useRef(null);
  const [camState, setCamState] = useState('checking'); // checking | ready | error
  const [flash, setFlash] = useState(false);
  const [burst, setBurst] = useState(false); // one-shot capture-confirmed animation
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setCamState('checking');
    setFlash(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    // If the camera hasn't reported ready or errored within 12s it's almost
    // certainly blocked/unavailable — surface the error state instead of
    // spinning "Starting camera…" forever.
    const watchdog = setTimeout(() => {
      setCamState((s) => (s === 'checking' ? 'error' : s));
    }, 12000);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(watchdog);
    };
  }, [open, onClose, retryKey]);

  const handleUserMedia = useCallback(() => setCamState('ready'), []);
  const handleUserMediaError = useCallback(() => setCamState('error'), []);

  const retry = () => {
    setCamState('checking');
    setRetryKey((k) => k + 1);
  };

  const dataUrlToFile = (dataUrl, name) => {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.split(':')[1].split(';')[0];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new File([new Blob([arr], { type: mime })], name, { type: mime });
  };

  // Downscale the screenshot to a face-recognition-friendly size before upload —
  // a full-res frame is several MB and makes both the upload and the server-side
  // model noticeably slower for no accuracy gain.
  const shrink = (src, maxSide = 720) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (scale === 1) return resolve(src);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });

  const capture = async () => {
    if (camState !== 'ready' || !webcamRef.current) return;
    const raw = webcamRef.current.getScreenshot();
    if (!raw) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
    setBurst(true);
    const src = await shrink(raw);
    // hold the confirm-burst on screen briefly before handing back the photo
    setTimeout(() => {
      setBurst(false);
      onCapture?.(dataUrlToFile(src, `${namePrefix}_front.jpg`), src);
    }, 650);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="vcm-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <style>{VCM_STYLES}</style>
      <div className="vcm-panel" role="dialog" aria-modal="true" aria-label="Capture identity photo">
        {/* header */}
        <div className="vcm-header">
          <span className="vcm-header-ic">
            <Camera className="w-4 h-4" />
          </span>
          <div className="vcm-header-text">
            <h3>Capture your identity photo</h3>
            <p>Look straight at the camera and keep your whole face inside the oval.</p>
          </div>
          <button type="button" onClick={onClose} className="vcm-close" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body */}
        <div className="vcm-body">
          <div className="vcm-stage">
            {camState === 'error' ? (
              <div className="vcm-error">
                <span className="vcm-error-ic">
                  <CameraOff className="w-6 h-6" />
                </span>
                <p className="vcm-error-title">No camera found</p>
                <p className="vcm-error-text">
                  Connect a camera and allow access for this site, then try again.
                </p>
                <button type="button" onClick={retry} className="vcm-retry">
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            ) : (
              <>
                <Webcam
                  key={retryKey}
                  audio={false}
                  ref={webcamRef}
                  mirrored
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.92}
                  videoConstraints={{ width: { ideal: 960 }, height: { ideal: 1280 }, facingMode: 'user' }}
                  onUserMedia={handleUserMedia}
                  onUserMediaError={handleUserMediaError}
                  className={`vcm-video ${camState === 'ready' ? 'is-live' : ''}`}
                />
                {camState !== 'ready' && (
                  <div className="vcm-loading">
                    <Loader className="w-6 h-6 animate-spin" />
                    Starting camera…
                  </div>
                )}
                {camState === 'ready' && (
                  <>
                    <div className="vcm-oval" />
                    <span className="vcm-live">
                      <span className="vcm-live-dot" /> LIVE
                    </span>
                  </>
                )}
                {flash && <div className="vcm-flash" />}
                {burst && (
                  <>
                    <span className="vcm-burst-ring" aria-hidden />
                    <span className="vcm-burst-ring vcm-burst-ring--2" aria-hidden />
                  </>
                )}
              </>
            )}
          </div>

          <div className="vcm-guide">
            <div className="vcm-guide-card">
              <h4>How to position your face</h4>
              <p>Center your face in the frame, keep your eyes level and hold still.</p>
            </div>

            <div className="vcm-ref" aria-hidden>
              <img src={frontView} alt="" draggable={false} />
              <span className="vcm-ref-tag">Front view — look straight</span>
            </div>

            <ul className="vcm-tips">
              {TIPS.map(({ Icon, t }) => (
                <li key={t}>
                  <span className="vcm-tip-ic">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* footer */}
        <div className="vcm-footer">
          <button type="button" onClick={onClose} className="vcm-btn vcm-btn--ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={camState === 'error' ? retry : capture}
            disabled={camState === 'checking'}
            className="vcm-btn vcm-btn--primary"
            style={{ background: GRADIENT }}
          >
            {camState === 'error' ? (
              <>
                <RefreshCw className="w-4 h-4" /> Retry camera
              </>
            ) : camState !== 'ready' ? (
              <>
                <Loader className="w-4 h-4 animate-spin" /> Waiting for camera…
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" /> Capture photo
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const VCM_STYLES = `
.vcm-overlay{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:16px;
  background:radial-gradient(120% 120% at 50% 0%,rgba(20,10,45,.72),rgba(4,6,12,.85));backdrop-filter:blur(8px);
  animation:vcm-in .18s ease-out}
.vcm-panel{position:relative;width:100%;max-width:900px;max-height:92vh;display:flex;flex-direction:column;
  background:var(--bg1solid);border:1px solid var(--bd);border-radius:20px;overflow:hidden;
  box-shadow:0 40px 100px -24px rgba(0,0,0,.6);animation:vcm-panel .3s cubic-bezier(.16,1,.3,1)}

.vcm-header{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--bd)}
.vcm-header-ic{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:11px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent)}
.vcm-header-text{min-width:0;flex:1}
.vcm-header-text h3{font-size:15px;font-weight:650;color:var(--tx)}
.vcm-header-text p{font-size:12px;color:var(--tx3);margin-top:2px;line-height:1.45}
.vcm-close{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;
  border:1px solid var(--bd);background:var(--bg2);color:var(--tx2);cursor:pointer;transition:.15s}
.vcm-close:hover{color:var(--tx);background:var(--bg3)}

.vcm-body{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 18px;align-items:stretch}
@media(max-width:640px){.vcm-body{grid-template-columns:1fr}}
.vcm-stage{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#05070d;border:1px solid var(--bd);
  display:flex;align-items:center;justify-content:center}
.vcm-video{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s}
.vcm-video.is-live{opacity:1}
.vcm-oval{position:absolute;width:62%;height:78%;border:2px dashed rgba(255,255,255,.7);border-radius:50% 50% 48% 48%;
  box-shadow:0 0 0 999px rgba(5,7,13,.3);pointer-events:none;animation:vcm-pulse 2.6s ease-in-out infinite}
.vcm-live{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:7px;
  font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;background:rgba(0,0,0,.5)}
.vcm-live-dot{width:6px;height:6px;border-radius:999px;background:#ff4d4f;animation:vcm-blink 1.2s ease-in-out infinite}
.vcm-loading{position:absolute;display:flex;flex-direction:column;align-items:center;gap:8px;color:#cfd3dc;font-size:12px}
.vcm-flash{position:absolute;inset:0;background:#fff;animation:vcm-flash .35s ease-out forwards}
.vcm-burst-ring{position:absolute;inset:0;border-radius:16px;pointer-events:none;z-index:6;
  border:4px solid var(--ok);animation:vcm-burst-ring .7s ease-out forwards}
.vcm-burst-ring--2{animation-delay:.13s;border-color:color-mix(in srgb,var(--ok) 60%,#fff)}

.vcm-error{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:20px;max-width:280px}
.vcm-error-ic{display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;
  color:#f87171;background:rgba(248,113,113,.14)}
.vcm-error-title{font-size:14px;font-weight:650;color:#fff}
.vcm-error-text{font-size:12px;color:#aeb3be;line-height:1.5}
.vcm-retry{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;background:#fff;color:#111;
  font-size:12px;font-weight:650;cursor:pointer;margin-top:2px}

.vcm-guide{display:flex;flex-direction:column;gap:12px;min-height:0;overflow:hidden}
.vcm-guide-card{flex:0 0 auto;padding:12px 14px;border-radius:14px;background:var(--bg2);border:1px solid var(--bd)}
.vcm-guide-card h4{font-size:13px;font-weight:650;color:var(--tx);margin-bottom:4px}
.vcm-guide-card p{font-size:12px;color:var(--tx3);line-height:1.5}
.vcm-ref{position:relative;flex:1 1 auto;min-height:120px;width:64%;align-self:center;border-radius:14px;overflow:hidden;
  border:1px solid var(--bd);background:#1a1830;pointer-events:none}
.vcm-ref img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top}
.vcm-ref-tag{position:absolute;top:0;left:0;right:0;text-align:center;font-size:11px;font-weight:650;color:#fff;
  padding:7px 4px 18px;background:linear-gradient(180deg,rgba(0,0,0,.75),transparent)}
.vcm-tips{flex:0 0 auto;display:flex;flex-direction:column;gap:9px;list-style:none;padding:0;margin:0}
.vcm-tips li{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--tx2)}
.vcm-tip-ic{display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;border-radius:8px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent)}

.vcm-footer{display:flex;gap:10px;padding:14px 18px 18px;border-top:1px solid var(--bd);margin-top:auto}
.vcm-btn{height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px;
  font-size:13.5px;font-weight:650;cursor:pointer;transition:.15s}
.vcm-btn--ghost{flex:0 0 auto;padding:0 20px;background:var(--bg2);border:1px solid var(--bd);color:var(--tx2);cursor:pointer}
.vcm-btn--ghost:hover{background:var(--bg3);color:var(--tx)}
.vcm-btn--primary{flex:1;color:#fff;cursor:pointer;box-shadow:0 12px 26px -12px color-mix(in srgb,var(--blue) 60%,transparent)}
.vcm-btn--primary:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.vcm-btn--primary:not(:disabled):hover{transform:translateY(-1px)}

@keyframes vcm-in{from{opacity:0}to{opacity:1}}
@keyframes vcm-panel{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
@keyframes vcm-pulse{0%,100%{opacity:.65}50%{opacity:1}}
@keyframes vcm-blink{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes vcm-flash{0%{opacity:.9}100%{opacity:0}}
@keyframes vcm-burst-ring{0%{opacity:.9;transform:scale(.85)}100%{opacity:0;transform:scale(1.3)}}
@media(prefers-reduced-motion:reduce){.vcm-overlay *{animation-duration:.001s!important}}
`;

export default VerifyCaptureModal;
