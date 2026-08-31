import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  X,
  Camera,
  CameraOff,
  RefreshCw,
  Loader,
  ArrowLeft,
  ArrowRight,
  ScanFace,
  Check,
  CheckCircle2,
  Sun,
  Glasses,
  Upload,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import { COMPACT_TOAST } from './toastOptions';
import poseLeft from '@/assets/left img.png';
import poseFront from '@/assets/front img.png';
import poseRight from '@/assets/right image.png';

const GRADIENT = 'linear-gradient(90deg,var(--blue),var(--violet))';

const POSE_IMG = { left: poseLeft, center: poseFront, right: poseRight };

const ANGLE_GUIDE = {
  Front: {
    title: 'Look straight at the camera',
    text: 'Center your face in the frame, keep your eyes level and hold still.',
    pose: 'center',
  },
  Left: {
    title: 'Turn your face to the left',
    text: 'Slowly rotate your head to your left until your right cheek faces the camera.',
    pose: 'left',
  },
  Right: {
    title: 'Turn your face to the right',
    text: 'Slowly rotate your head to your right until your left cheek faces the camera.',
    pose: 'right',
  },
};

const TIPS = [
  { Icon: Sun, t: 'Good, even lighting on your face' },
  { Icon: Glasses, t: 'Remove hats, masks or sunglasses' },
  { Icon: ScanFace, t: 'Keep the whole face inside the oval' },
  { Icon: ImageIcon, t: 'Use a clean, plain background' },
];


/** Illustrated pose head — uses the reference artwork from src/assets. */
const PoseHead = ({ pose }) => (
  <span className="few-head" aria-hidden>
    <img src={POSE_IMG[pose] || POSE_IMG.center} alt="" draggable={false} />
  </span>
);

/**
 * Guided face-enrollment wizard. Walks through each angle in `angles`,
 * capturing via webcam or file upload, then returns all shots as File objects
 * via onComplete. Existing shots can be seeded with `initial` (index-aligned).
 */
// Natural left-to-right sweep for the wizard UI. The parent still receives
// results in its own `angles` order (see finish()).
const DISPLAY_SEQUENCE = ['Left', 'Front', 'Right'];

const FaceCaptureModal = ({
  open,
  angles = ['Front', 'Right', 'Left'],
  namePrefix = 'user',
  initial = [],
  initialMode = null, // 'camera' | 'upload' — skip the in-wizard chooser for the first empty step
  allowUpload = true, // when false, the wizard is camera-only (no upload option / chooser)
  theme, // 'light' | 'dark' — force a token theme (for pages outside the V2 shell)
  resolveUrl, // (path) => displayable URL for seeded string entries (e.g. stored profilePics)
  verify = false, // identity-check mode: single generic photo, no per-angle "Front view" wording
  onClose,
  onComplete,
}) => {
  // Order angles as Left → Front → Right for display; anything unlisted trails.
  const order = useMemo(
    () => [
      ...DISPLAY_SEQUENCE.filter((a) => angles.includes(a)),
      ...angles.filter((a) => !DISPLAY_SEQUENCE.includes(a)),
    ],
    [angles]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState([]); // [{ file, url } | null]
  const [mode, setMode] = useState(null); // null (choose) | 'camera'
  // Sticky method for the whole run: once chosen (via the card buttons or the
  // in-wizard chooser) every subsequent step uses it without asking again.
  const flowRef = useRef(null); // 'camera' | 'upload' | null
  const [camState, setCamState] = useState('checking'); // checking | ready | error
  const [errorKind, setErrorKind] = useState(null);
  const [flash, setFlash] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [faceOk, setFaceOk] = useState(null);
  const webcamRef = useRef(null);
  const fileRef = useRef(null);

  const [flow, setFlow] = useState(null); // mirror of flowRef for rendering
  const [review, setReview] = useState(false); // final preview & confirm screen
  const angle = order[stepIndex];
  const guide = ANGLE_GUIDE[angle] || ANGLE_GUIDE.Front;
  const currentShot = shots[stepIndex] || null;

  const chooseFlow = (f) => {
    flowRef.current = f;
    setFlow(f);
  };
  const doneCount = shots.filter(Boolean).length;
  const allDone = doneCount === order.length;

  /* seed / reset when opened — shots are indexed by display `order` */
  useEffect(() => {
    if (!open) return;
    const seeded = order.map((a) => {
      const v = initial[angles.indexOf(a)];
      if (v instanceof File) return { file: v, url: URL.createObjectURL(v) };
      if (typeof v === 'string' && v)
        return { file: null, url: resolveUrl ? resolveUrl(v) : v, existing: v };
      return null;
    });
    setShots(seeded);
    const firstEmpty = seeded.findIndex((s) => !s);
    setStepIndex(firstEmpty === -1 ? 0 : firstEmpty);
    const startMode = !allowUpload ? 'camera' : initialMode;
    flowRef.current = startMode || null;
    setFlow(startMode || null);
    setReview(false);
    setMode(startMode === 'camera' ? 'camera' : null);
    setCamState('checking');
    setErrorKind(null);
    setFaceOk(null);
    setFlash(false);
    // 'upload' first-step picker is triggered by the step-change effect below.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // On each step change, honour the sticky flow: jump straight to camera or the
  // file picker instead of showing the chooser again.
  useEffect(() => {
    if (!open) return;
    setFaceOk(null);
    setCamState('checking');
    if (currentShot) {
      setMode(null);
    } else if (flowRef.current === 'camera') {
      setMode('camera');
    } else {
      setMode(null);
    }
    // For the upload flow the picker is opened once on wizard open; later steps
    // show the upload prompt with an explicit "Choose file" button.
  }, [stepIndex, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open the file dialog once when the wizard starts in upload mode.
  useEffect(() => {
    if (open && initialMode === 'upload' && !shots[stepIndex]) {
      const t = setTimeout(() => fileRef.current?.click(), 80);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* body scroll lock + escape */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  /* native face presence check (Chromium only; silent elsewhere) */
  useEffect(() => {
    if (!open || mode !== 'camera' || camState !== 'ready' || currentShot) return;
    const FD = typeof window !== 'undefined' ? window.FaceDetector : undefined;
    if (!FD) return;
    let detector;
    try {
      detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      return;
    }
    let stopped = false;
    let misses = 0;
    let timer;
    const tick = async () => {
      if (stopped) return;
      const video = webcamRef.current?.video;
      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          const faces = await detector.detect(video);
          if (faces?.length) {
            misses = 0;
            setFaceOk(true);
          } else if (++misses >= 3) {
            setFaceOk(false);
          }
        } catch {
          /* ignore transient decode errors */
        }
      }
      if (!stopped) timer = setTimeout(tick, 600);
    };
    timer = setTimeout(tick, 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, mode, camState, currentShot, stepIndex, retryKey]);

  const handleUserMedia = useCallback(() => {
    setCamState('ready');
    setErrorKind(null);
  }, []);

  const handleUserMediaError = useCallback((err) => {
    const name = typeof err === 'object' && err ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') setErrorKind('denied');
    else if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name))
      setErrorKind('not-found');
    else setErrorKind('generic');
    setCamState('error');
  }, []);

  const setShotAt = (i, shot) =>
    setShots((prev) => {
      const next = [...prev];
      next[i] = shot;
      return next;
    });

  const dataUrlToFile = (dataUrl) => {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.split(':')[1].split(';')[0];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return new File([new Blob([arr], { type: mime })], `${namePrefix}_${angle}.jpg`, { type: mime });
  };

  const capture = () => {
    if (camState !== 'ready' || !webcamRef.current) return;
    const src = webcamRef.current.getScreenshot();
    if (!src) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 320);
    const file = dataUrlToFile(src);
    setShotAt(stepIndex, { file, url: src });
    chooseFlow('camera');
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images.', COMPACT_TOAST);
      return;
    }
    setShotAt(stepIndex, { file, url: URL.createObjectURL(file) });
    chooseFlow('upload');
  };

  const retake = () => {
    setShotAt(stepIndex, null);
    if (flowRef.current === 'camera') {
      setMode('camera');
      setCamState('checking');
    } else if (flowRef.current === 'upload') {
      setTimeout(() => fileRef.current?.click(), 60);
    } else {
      setMode(null);
    }
  };
  const goPrev = () => setStepIndex((i) => Math.max(0, i - 1));

  // From the review screen: drop one photo and jump back to capture it.
  const editShot = (i) => {
    setShotAt(i, null);
    setStepIndex(i);
    setReview(false);
    if (flowRef.current === 'camera') {
      setMode('camera');
      setCamState('checking');
    } else if (flowRef.current === 'upload') {
      setMode(null);
      setTimeout(() => fileRef.current?.click(), 60);
    }
  };

  // Re-request the camera: reset state and remount <Webcam>.
  const retryCamera = () => {
    setErrorKind(null);
    setCamState('checking');
    setFaceOk(null);
    setMode('camera');
    setRetryKey((k) => k + 1);
  };

  const retakeAll = () => {
    setShots(order.map(() => null));
    setStepIndex(0);
    setReview(false);
    if (flowRef.current === 'camera') {
      setMode('camera');
      setCamState('checking');
    } else if (flowRef.current === 'upload') {
      setMode(null);
      setTimeout(() => fileRef.current?.click(), 60);
    }
  };

  const finish = () => {
    // Remap from display `order` back to the parent's `angles` order.
    const byAngle = {};
    order.forEach((a, i) => {
      byAngle[a] = shots[i]?.file || shots[i]?.existing || null;
    });
    onComplete?.(angles.map((a) => byAngle[a] ?? null));
  };

  const errorCopy = useMemo(
    () =>
      ({
        'not-found': {
          title: 'No camera found',
          text: 'We couldn’t detect a camera. Connect one, then tap Try again or allow camera access for this site (check the address bar or from your browser settings).',
        },
        denied: {
          title: 'Camera access blocked',
          text: 'Allow camera access for this site (check the address bar or your browser settings), then tap Try again.',
        },
        generic: {
          title: 'Camera unavailable',
          text: 'We couldn’t start your camera. Close any other app that might be using it, then tap Try again.',
        },
      })[errorKind || 'generic'],
    [errorKind]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="few-overlay"
      {...(theme ? { 'data-vq-theme': theme } : {})}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <style>{FEW_STYLES}</style>
      <div className="few-panel" role="dialog" aria-modal="true" aria-label="Face enrollment">
        <span className="few-aurora" aria-hidden />

        {/* header */}
        <div className="few-header">
          <button
            type="button"
            onClick={review ? () => setReview(false) : stepIndex === 0 ? onClose : goPrev}
            className="few-icon-btn"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <span className="few-badge">
              <ScanFace className="w-3.5 h-3.5" /> {verify ? 'Identity check' : 'Face enrollment'}
            </span>
            <h2 className="few-title">
              {review ? 'Preview & confirm your photos' : 'Prepare your face for a clear photo'}
            </h2>
            <p className="few-subtitle" key={review ? 'r' : angle}>
              {review
                ? 'Review your captured photos and make sure they are clear.'
                : verify
                  ? 'Center your face in the frame — follow the tips to capture the best photo.'
                  : `${guide.title} — follow the tips to capture the best photo.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="few-icon-btn few-icon-btn--close" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {review ? (
          <>
            <div className="few-review">
              <h3 className="few-review-head">Review your photos</h3>
              <p className="few-review-sub">All photos look good — if any is unclear, retake it.</p>
              <div className="few-review-grid">
                {order.map((a, i) => (
                  <div key={a} className="few-review-card">
                    <div className="few-review-media">
                      {shots[i]?.url ? <img src={shots[i].url} alt={`${a} view`} /> : <span />}
                      <span className="few-review-check">
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                      <button type="button" onClick={() => editShot(i)} className="few-review-del" aria-label={`Retake ${a}`}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="few-review-cap">{a} view</span>
                  </div>
                ))}
              </div>
              <div className="few-review-actions">
                <button type="button" onClick={retakeAll} className="few-btn few-btn--soft">
                  {flow === 'upload' ? <Upload className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  {flow === 'upload' ? 'Re-upload all' : 'Retake all photos'}
                </button>
              </div>
            </div>
          </>
        ) : (
        <div className="few-body">
          {/* stage: chooser / camera / captured shot / error */}
          <div className={`few-stage ${mode === 'camera' && camState === 'ready' && !currentShot ? 'is-live' : ''}`}>
            {currentShot ? (
              <div className="few-shot-wrap">
                <img src={currentShot.url} alt={verify ? 'captured photo' : `${angle} view`} className="few-shot" />
                <span className="few-shot-check">
                  <CheckCircle2 className="w-4 h-4" /> {verify ? 'Photo captured' : `${angle} captured`}
                </span>
                <button type="button" onClick={retake} className="few-shot-retake">
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
              </div>
            ) : flow === 'upload' ? (
              <div className="few-choose">
                <span className="few-choose-drop">
                  <Upload className="w-8 h-8" />
                </span>
                <p className="few-choose-title">Upload your {angle.toLowerCase()} view</p>
                <p className="few-choose-sub">Choose a JPG or PNG photo from your device.</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="few-choose-cta"
                  style={{ background: GRADIENT }}
                >
                  <Upload className="w-4 h-4" /> Choose file
                </button>
              </div>
            ) : !mode && allowUpload ? (
              <div className="few-choose">
                <p className="few-choose-title">Add your {angle.toLowerCase()} view</p>
                <p className="few-choose-sub">Choose how you want to add this photo.</p>
                <div className="few-choose-tiles">
                  <button
                    type="button"
                    onClick={() => {
                      chooseFlow('camera');
                      setMode('camera');
                    }}
                    className="few-tile"
                  >
                    <span className="few-tile-ic">
                      <Camera className="w-6 h-6" />
                    </span>
                    <span className="few-tile-t">Take a photo</span>
                    <span className="few-tile-s">Use your webcam</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      chooseFlow('upload');
                      fileRef.current?.click();
                    }}
                    className="few-tile"
                  >
                    <span className="few-tile-ic">
                      <Upload className="w-6 h-6" />
                    </span>
                    <span className="few-tile-t">Upload a photo</span>
                    <span className="few-tile-s">Pick from device</span>
                  </button>
                </div>
              </div>
            ) : camState === 'error' ? (
              <div className="few-error">
                <span className="few-error-icon">
                  <CameraOff className="w-7 h-7" />
                </span>
                <p className="few-error-title">{errorCopy.title}</p>
                <p className="few-error-text">{errorCopy.text}</p>
                <div className="few-error-actions">
                  <button type="button" onClick={retryCamera} className="few-retry">
                    <RefreshCw className="w-4 h-4" /> Try again
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Webcam
                  key={retryKey}
                  audio={false}
                  ref={webcamRef}
                  mirrored
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user' }}
                  onUserMedia={handleUserMedia}
                  onUserMediaError={handleUserMediaError}
                  className={`few-video ${camState === 'ready' ? 'is-live' : ''}`}
                />
                {camState !== 'ready' && (
                  <div className="few-loading">
                    <span className="few-loading-orb">
                      <Loader className="w-6 h-6 animate-spin" />
                    </span>
                    Starting camera…
                  </div>
                )}
                {camState === 'ready' && (
                  <>
                    <div className={`few-oval ${faceOk === false ? 'is-warn' : faceOk ? 'is-ok' : ''}`} />
                    <span className="few-corner few-corner--tl" />
                    <span className="few-corner few-corner--tr" />
                    <span className="few-corner few-corner--bl" />
                    <span className="few-corner few-corner--br" />
                    <span className="few-scan" />
                    <span className="few-live">
                      <span className="few-live-dot" /> LIVE
                    </span>
                    {faceOk !== null && (
                      <span className={`few-facetag ${faceOk ? 'is-ok' : 'is-warn'}`}>
                        {faceOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ScanFace className="w-3.5 h-3.5" />}
                        {faceOk ? 'Face detected' : 'Face not detected'}
                      </span>
                    )}
                  </>
                )}
                {flash && <div className="few-flash" />}
              </>
            )}
          </div>

          {/* guidance: 3 pose cards */}
          <div className="few-guide">
            <h3 className="few-guide-head">How to position your face</h3>
            <p className="few-guide-text" key={angle}>
              {guide.text}
            </p>

            <div className="few-poses" data-count={order.length}>
              {order.map((a, ci) => {
                const g = ANGLE_GUIDE[a] || ANGLE_GUIDE.Front;
                const active = a === angle;
                const shot = shots[ci];
                const done = !!shot && !active;
                return (
                  <div key={a} className={`few-pose ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
                    {(active || done) && (
                      <span className="few-pose-badge">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                    {shot?.url && order.length > 1 ? (
                      <span className="few-pose-shot">
                        <img src={shot.url} alt={`${a} view`} />
                      </span>
                    ) : (
                      <PoseHead pose={g.pose} />
                    )}
                    {!verify && <span className="few-pose-cap">{a}</span>}
                  </div>
                );
              })}
            </div>

            <ul className="few-tips">
              {TIPS.map(({ Icon, t }, i) => (
                <li key={t} style={{ animationDelay: `${100 + i * 70}ms` }}>
                  <span className="few-tip-ic">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        )}

        {/* footer */}
        <div className="few-footer">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={onFile} />

          {review ? (
            <button type="button" onClick={finish} className="few-btn few-btn--primary" style={{ background: GRADIENT }}>
              <Check className="w-4 h-4" strokeWidth={3} /> Looks good — continue
            </button>
          ) : currentShot ? (
            <>
              {stepIndex > 0 && (
                <button type="button" onClick={goPrev} className="few-btn few-btn--ghost">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              {allDone ? (
                order.length === 1 ? (
                  <button type="button" onClick={finish} className="few-btn few-btn--primary" style={{ background: GRADIENT }}>
                    <Check className="w-4 h-4" strokeWidth={3} /> Use this photo
                  </button>
                ) : (
                  <button type="button" onClick={() => setReview(true)} className="few-btn few-btn--primary" style={{ background: GRADIENT }}>
                    Review photos <ArrowRight className="w-4 h-4" />
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const next = shots.findIndex((s, i) => !s && i > stepIndex);
                    const firstEmpty = next !== -1 ? next : shots.findIndex((s) => !s);
                    setStepIndex(firstEmpty === -1 ? Math.min(stepIndex + 1, order.length - 1) : firstEmpty);
                  }}
                  className="few-btn few-btn--primary"
                  style={{ background: GRADIENT }}
                >
                  Next step <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          ) : flow === 'upload' ? (
            <>
              {stepIndex > 0 && (
                <button type="button" onClick={goPrev} className="few-btn few-btn--ghost">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="few-btn few-btn--primary"
                style={{ background: GRADIENT }}
              >
                <Upload className="w-4 h-4" /> Choose {angle.toLowerCase()} photo
              </button>
            </>
          ) : !mode && !flow ? (
            <p className="few-foot-hint">Choose how to add this photo above.</p>
          ) : (
            <>
              {stepIndex > 0 && (
                <button type="button" onClick={goPrev} className="few-btn few-btn--ghost">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button
                type="button"
                onClick={camState === 'error' ? retryCamera : capture}
                disabled={camState === 'checking'}
                className="few-btn few-btn--primary"
                style={{ background: GRADIENT }}
              >
                <span className="few-btn-shine" aria-hidden />
                {camState === 'error' ? (
                  <>
                    <RefreshCw className="w-4 h-4" /> Retry camera
                  </>
                ) : camState !== 'ready' ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Waiting for camera…
                  </>
                ) : faceOk === false ? (
                  <>
                    <ScanFace className="w-4 h-4" /> Position your face in the oval
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" /> {verify ? 'Capture photo' : `Capture ${angle} view`}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const FEW_STYLES = `
.few-overlay{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;
  background:radial-gradient(120% 120% at 50% 0%,rgba(20,10,45,.72),rgba(4,6,12,.82));
  backdrop-filter:blur(8px);animation:few-in .2s ease-out}
.few-panel{position:relative;width:100%;max-width:920px;max-height:94vh;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;background:var(--bg1solid);border:1px solid var(--bd);border-radius:24px;
  box-shadow:0 44px 110px -25px rgba(0,0,0,.62),0 0 0 1px color-mix(in srgb,var(--blue) 14%,transparent);
  animation:few-panel .32s cubic-bezier(.16,1,.3,1)}
.few-aurora{position:absolute;top:-45%;left:-12%;width:75%;height:85%;pointer-events:none;z-index:0;
  background:radial-gradient(circle at 30% 30%,color-mix(in srgb,var(--blue) 55%,transparent),transparent 60%),
    radial-gradient(circle at 70% 60%,color-mix(in srgb,var(--violet) 50%,transparent),transparent 60%);
  filter:blur(64px);opacity:.5;animation:few-drift 13s ease-in-out infinite alternate}
.few-panel>*:not(.few-aurora){position:relative;z-index:1}

.few-header{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 16px;border-bottom:1px solid color-mix(in srgb,var(--bd) 70%,transparent)}
.few-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;margin-bottom:8px;border-radius:999px;
  font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--blue);
  background:color-mix(in srgb,var(--blue) 12%,transparent);border:1px solid color-mix(in srgb,var(--blue) 25%,transparent)}
.few-title{font-size:20px;font-weight:650;color:var(--tx);line-height:1.3;animation:few-swap .3s ease-out}
.few-subtitle{font-size:12.5px;color:var(--tx3);margin-top:3px}
.few-icon-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:11px;
  border:1px solid var(--bd);background:var(--bg2);color:var(--tx2);cursor:pointer;transition:.16s}
.few-icon-btn:hover{color:var(--tx);background:var(--bg3);transform:translateY(-1px)}
.few-icon-btn:active{transform:scale(.94)}
.few-icon-btn--close{margin-left:auto}

.few-body{display:grid;grid-template-columns:1.05fr .95fr;gap:20px;padding:16px 22px 8px}
@media(max-width:720px){.few-body{grid-template-columns:1fr}}

.few-stage{position:relative;aspect-ratio:1/1;border-radius:20px;overflow:hidden;background:#05070d;border:1px solid var(--bd);
  display:flex;align-items:center;justify-content:center;transition:box-shadow .4s}
.few-stage.is-live{box-shadow:0 0 0 1px color-mix(in srgb,var(--blue) 40%,transparent),0 22px 48px -15px color-mix(in srgb,var(--blue) 45%,transparent)}
.few-video{width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.06);transition:opacity .5s,transform .6s cubic-bezier(.16,1,.3,1)}
.few-video.is-live{opacity:1;transform:scale(1)}
.few-oval{position:absolute;width:58%;height:76%;border:2px dashed rgba(255,255,255,.65);border-radius:50% 50% 48% 48%;
  pointer-events:none;box-shadow:0 0 0 999px rgba(5,7,13,.34);animation:few-pulse 2.6s ease-in-out infinite;transition:border-color .3s}
.few-oval.is-ok{border-color:var(--ok);border-style:solid}
.few-oval.is-warn{border-color:var(--warn,#f5a623);animation:few-pulsew 1.2s ease-in-out infinite}
.few-corner{position:absolute;width:22px;height:22px;border:2px solid color-mix(in srgb,var(--blue) 90%,#fff);pointer-events:none;animation:few-fade .4s ease-out both}
.few-corner--tl{top:14px;left:14px;border-right:0;border-bottom:0;border-radius:6px 0 0 0}
.few-corner--tr{top:14px;right:14px;border-left:0;border-bottom:0;border-radius:0 6px 0 0;animation-delay:.05s}
.few-corner--bl{bottom:14px;left:14px;border-right:0;border-top:0;border-radius:0 0 0 6px;animation-delay:.1s}
.few-corner--br{bottom:14px;right:14px;border-left:0;border-top:0;border-radius:0 0 6px 0;animation-delay:.15s}
.few-scan{position:absolute;left:6%;right:6%;height:2px;border-radius:2px;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--blue) 90%,#fff),transparent);
  box-shadow:0 0 14px 2px color-mix(in srgb,var(--blue) 70%,transparent);animation:few-scanmove 3s ease-in-out infinite}
.few-live{position:absolute;top:12px;left:12px;display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:8px;
  font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;background:rgba(0,0,0,.45);backdrop-filter:blur(4px)}
.few-live-dot{width:6px;height:6px;border-radius:999px;background:#ff4d4f;animation:few-blink 1.2s ease-in-out infinite}
.few-facetag{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;
  padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);
  backdrop-filter:blur(6px);white-space:nowrap;animation:few-fade .25s ease-out}
.few-facetag.is-ok{color:var(--ok)}
.few-facetag.is-warn{color:var(--warn,#f5a623);animation:few-fade .25s ease-out,few-blink 1.6s ease-in-out infinite .3s}
.few-loading{position:absolute;display:flex;flex-direction:column;align-items:center;gap:10px;color:#cfd3dc;font-size:12.5px}
.few-loading-orb{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:999px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 14%,transparent);animation:few-breathe 2s ease-in-out infinite}
.few-flash{position:absolute;inset:0;background:#fff;animation:few-flashk .4s ease-out forwards}

.few-choose{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:24px 20px;max-width:340px;animation:few-fade .3s ease-out}
.few-choose-title{font-size:15px;font-weight:650;color:#fff}
.few-choose-sub{font-size:12px;color:#aeb3be;line-height:1.5;margin-bottom:8px}
.few-choose-drop{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:18px;color:#fff;
  background:color-mix(in srgb,var(--blue) 22%,transparent);border:2px dashed color-mix(in srgb,var(--blue) 55%,transparent);
  margin-bottom:6px;animation:few-breathe 2.4s ease-in-out infinite}
.few-choose-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 22px;border-radius:12px;
  font-size:13px;font-weight:650;color:#fff;cursor:pointer;transition:.16s;margin-top:6px;
  box-shadow:0 14px 30px -12px color-mix(in srgb,var(--blue) 60%,transparent)}
.few-choose-cta:hover{transform:translateY(-1px)}
.few-choose-cta:active{transform:scale(.97)}
.few-choose-tiles{display:flex;gap:12px;width:100%}
.few-tile{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 10px;border-radius:16px;cursor:pointer;
  color:#e9edf7;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);transition:.18s}
.few-tile:hover{background:rgba(255,255,255,.12);border-color:color-mix(in srgb,var(--blue) 55%,transparent);transform:translateY(-2px);
  box-shadow:0 16px 34px -16px color-mix(in srgb,var(--blue) 60%,transparent)}
.few-tile:active{transform:scale(.97)}
.few-tile-ic{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:14px;color:#fff;
  background:linear-gradient(135deg,var(--blue),var(--violet))}
.few-tile-t{font-size:13px;font-weight:650}
.few-tile-s{font-size:10.5px;color:#98a2bd}
.few-foot-hint{flex:1;text-align:center;font-size:12.5px;color:var(--tx3);align-self:center}

.few-shot-wrap{position:absolute;inset:0;animation:few-fade .3s ease-out}
.few-shot{width:100%;height:100%;object-fit:cover}
.few-shot-check{position:absolute;top:12px;left:12px;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;
  font-size:11px;font-weight:700;color:#fff;background:color-mix(in srgb,var(--ok) 85%,#000);backdrop-filter:blur(4px)}
.few-shot-retake{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;
  padding:7px 14px;border-radius:999px;font-size:12px;font-weight:650;color:#111;background:#fff;cursor:pointer;transition:.15s}
.few-shot-retake:hover{transform:translateX(-50%) translateY(-1px)}

.few-error{display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;padding:24px;max-width:340px}
.few-error-icon{display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:999px;
  color:#f87171;background:rgba(248,113,113,.14);box-shadow:0 0 0 8px rgba(248,113,113,.06);animation:few-shake .55s ease}
.few-error-title{font-size:15px;font-weight:650;color:#fff}
.few-error-text{font-size:12.5px;color:#aeb3be;line-height:1.55}
.few-error-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px}
.few-retry{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:11px;background:#fff;color:#111;
  font-size:12.5px;font-weight:650;cursor:pointer;transition:.16s}
.few-retry:hover{transform:translateY(-1px)}
.few-retry--ghost{background:rgba(255,255,255,.12);color:#fff}

.few-guide{display:flex;flex-direction:column;gap:12px;padding:4px 2px}
.few-guide-head{font-size:14px;font-weight:650;color:var(--tx)}
.few-poses{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
/* single-angle capture — one big pose card */
.few-poses[data-count="1"]{grid-template-columns:1fr}
.few-poses[data-count="1"] .few-pose{padding:16px;gap:12px}
.few-poses[data-count="1"] .few-pose-shot,
.few-poses[data-count="1"] .few-head{width:150px;height:150px}
.few-poses[data-count="1"] .few-pose-cap{font-size:13px}
.few-pose{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px;border-radius:14px;
  background:var(--bg2);border:1.5px solid var(--bd);overflow:hidden;transition:.25s cubic-bezier(.16,1,.3,1)}
.few-pose.is-done{border-color:color-mix(in srgb,var(--ok) 40%,transparent)}
.few-pose.is-active{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 8%,var(--bg2));
  box-shadow:0 14px 32px -14px color-mix(in srgb,var(--blue) 55%,transparent);transform:translateY(-2px)}
.few-pose-badge{position:absolute;z-index:3;top:6px;right:6px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:999px;color:#fff;background:var(--blue);box-shadow:0 2px 6px rgba(0,0,0,.25)}
.few-pose.is-done .few-pose-badge{background:var(--ok)}
.few-pose-cap{font-size:11px;font-weight:700;color:var(--tx3)}
.few-pose.is-active .few-pose-cap{color:var(--blue)}
.few-pose.is-done .few-pose-cap{color:var(--tx2)}

/* circular photo/illustration in each pose card */
.few-pose-shot,
.few-head{display:block;width:92px;height:92px;border-radius:999px;overflow:hidden;
  border:2px solid color-mix(in srgb,var(--tx) 12%,transparent);background:color-mix(in srgb,var(--tx) 5%,transparent)}
.few-pose.is-done .few-pose-shot,.few-pose.is-done .few-head{border-color:color-mix(in srgb,var(--ok) 50%,transparent)}
.few-pose.is-active .few-pose-shot,.few-pose.is-active .few-head{border-color:var(--blue)}
.few-pose-shot img{width:100%;height:100%;object-fit:cover}
/* source art has a baked-in label at the bottom — anchor to top so the head centres in the circle */
.few-head img{width:100%;height:128%;object-fit:cover;object-position:top center;
  transition:transform .4s cubic-bezier(.16,1,.3,1)}
.few-pose:not(.is-active) .few-head img{filter:grayscale(.35) opacity(.72)}
.few-pose.is-active .few-head img{animation:few-headbob 3s ease-in-out infinite}
@keyframes few-headbob{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@media(prefers-reduced-motion:reduce){.few-head img{animation:none!important}}

.few-guide-text{font-size:12.5px;color:var(--tx2);line-height:1.6;animation:few-swap .3s ease-out}
.few-tips{display:flex;flex-direction:column;gap:8px;list-style:none;padding:0;margin:0}
.few-tips li{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--tx2);animation:few-slide .4s ease-out both}
.few-tip-ic{display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;border-radius:8px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent)}

.few-footer{display:flex;gap:10px;padding:16px 22px 22px;margin-top:auto}
.few-btn{position:relative;overflow:hidden;flex:1;height:48px;border-radius:13px;display:flex;align-items:center;justify-content:center;
  gap:8px;font-size:13.5px;font-weight:650;cursor:pointer;transition:.16s}
.few-btn--primary{color:#fff;box-shadow:0 14px 30px -12px color-mix(in srgb,var(--blue) 60%,transparent)}
.few-btn--primary:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.few-btn--primary:not(:disabled):hover{transform:translateY(-1px)}
.few-btn--primary:not(:disabled):active{transform:scale(.98)}
.few-btn--ghost{flex:0 0 auto;padding:0 18px;background:var(--bg2);border:1px solid var(--bd);color:var(--tx2)}
.few-btn--ghost:hover{background:var(--bg3);color:var(--tx)}
.few-btn--soft{background:color-mix(in srgb,var(--blue) 10%,transparent);border:1px solid color-mix(in srgb,var(--blue) 28%,transparent);color:var(--blue)}
.few-btn--soft:hover{background:color-mix(in srgb,var(--blue) 16%,transparent);transform:translateY(-1px)}

.few-review{padding:14px 22px 6px;animation:few-fade .3s ease-out}
.few-review-head{font-size:14px;font-weight:650;color:var(--tx)}
.few-review-sub{font-size:12px;color:var(--tx3);margin-top:2px;margin-bottom:14px}
.few-review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:620px){.few-review-grid{grid-template-columns:1fr}}
.few-review-card{border-radius:14px;border:1.5px solid color-mix(in srgb,var(--ok) 40%,transparent);background:var(--bg2);overflow:hidden;
  animation:few-fade .35s ease-out both}
.few-review-media{position:relative;height:150px;display:flex;align-items:center;justify-content:center;background:var(--bg3)}
.few-review-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.few-review-media>span{width:40px;height:40px;border-radius:999px;background:color-mix(in srgb,var(--tx) 12%,transparent)}
.few-review-check{position:absolute;top:8px;left:8px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:999px;color:#fff;background:var(--ok);z-index:2}
.few-review-del{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:26px;height:26px;
  border-radius:999px;color:var(--crit);background:color-mix(in srgb,var(--bg1solid) 90%,transparent);backdrop-filter:blur(4px);
  cursor:pointer;transition:.15s;z-index:2}
.few-review-del:hover{transform:scale(1.1);color:#fff;background:var(--crit)}
.few-review-cap{display:block;text-align:center;font-size:12px;font-weight:650;color:var(--tx);padding:9px 4px;border-top:1px solid var(--bd);background:var(--bg1)}
.few-review-actions{display:flex;justify-content:center;margin-top:14px}
.few-review-actions .few-btn{flex:0 1 320px}
.few-btn-shine{position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);animation:few-shine 2.6s ease-in-out infinite}
.few-btn:disabled .few-btn-shine{display:none}

@keyframes few-in{from{opacity:0}to{opacity:1}}
@keyframes few-panel{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}
@keyframes few-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes few-swap{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
@keyframes few-slide{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes few-pulse{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.025);opacity:1}}
@keyframes few-pulsew{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes few-flashk{0%{opacity:.9}100%{opacity:0}}
@keyframes few-scanmove{0%,100%{top:16%}50%{top:82%}}
@keyframes few-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes few-blink{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes few-pop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes few-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes few-shine{0%{left:-60%}60%,100%{left:130%}}
@keyframes few-drift{from{transform:translate(0,0)}to{transform:translate(32px,20px)}}
@media(prefers-reduced-motion:reduce){.few-overlay *{animation-duration:.001s!important;animation-iteration-count:1!important}}
`;

export default FaceCaptureModal;
