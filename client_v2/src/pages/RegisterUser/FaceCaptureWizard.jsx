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
  ChevronRight,
  Check,
  CheckCircle2,
  Upload,
  RotateCcw,
  Sun,
  Glasses,
  ScanFace,
  Image as ImageIcon,
} from 'lucide-react';
import { COMPACT_TOAST } from './toastOptions';
import frontView from '@/assets/front_view.png';
import leftView from '@/assets/left_view.png';
import rightView from '@/assets/right_view.png';

const GRADIENT = 'linear-gradient(90deg,var(--blue),var(--violet))';

const CAMERA_TIPS = [
  { Icon: Sun, t: 'Good, even lighting on your face' },
  { Icon: Glasses, t: 'Remove hats, masks or sunglasses' },
  { Icon: ScanFace, t: 'Keep the whole face inside the oval' },
  { Icon: ImageIcon, t: 'Use a clean, plain background' },
];

const UPLOAD_TIPS = [
  { Icon: ImageIcon, t: 'Use a clear JPG or PNG, at least 400×400px' },
  { Icon: ScanFace, t: 'One person only, face centred and unobstructed' },
  { Icon: Sun, t: 'Well-lit, in focus — no heavy filters or blur' },
  { Icon: Glasses, t: 'No hats, masks or sunglasses in the photo' },
];

/**
 * Three-step guided face-enrollment wizard: Front → Left → Right.
 * Each step can be completed with the webcam or a file upload.
 * On finish, onComplete receives the shots as File objects in the order
 * given by `angles` (defaults to ['Front', 'Right', 'Left']).
 */
const STEPS = [
  {
    key: 'Front',
    label: 'Front View of Your Face',
    hint: 'Look straight at the camera',
    sub: 'Center your face in the frame, keep your eyes level and hold still.',
    art: frontView,
  },
  {
    key: 'Left',
    label: 'Left View of Your Face',
    hint: 'Turn your face to the left',
    sub: 'Slowly rotate your head to your left until your right cheek faces the camera.',
    art: leftView,
  },
  {
    key: 'Right',
    label: 'Right View of Your Face',
    hint: 'Turn your face to the right',
    sub: 'Slowly rotate your head to your right until your left cheek faces the camera.',
    art: rightView,
  },
];

const FaceCaptureWizard = ({
  open,
  angles = ['Front', 'Right', 'Left'],
  namePrefix = 'user',
  initial = [], // existing images index-aligned to `angles` (File | url string | falsy)
  resolveUrl, // (path) => displayable URL for string entries
  startAngle, // 'Front' | 'Left' | 'Right' — open directly on this step
  initialMode = 'camera', // 'camera' | 'upload' — which tab the wizard opens on
  theme, // 'light' | 'dark' — force a token theme
  onClose,
  onComplete,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState([null, null, null]); // per STEPS index: { file, url }
  const [mode, setMode] = useState(initialMode === 'upload' ? 'upload' : 'camera'); // 'camera' | 'upload'
  const [camState, setCamState] = useState('checking'); // checking | ready | error
  const [errorKind, setErrorKind] = useState(null);
  const [flash, setFlash] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [review, setReview] = useState(false); // final "see clear photos" screen
  const [justCaptured, setJustCaptured] = useState(null); // STEPS index that just got a photo — plays a burst

  const webcamRef = useRef(null);
  const fileRef = useRef(null);

  const step = STEPS[stepIndex];
  const currentShot = shots[stepIndex];
  const doneCount = shots.filter(Boolean).length;
  const allDone = doneCount === STEPS.length;

  /* seed / reset when (re)opened — shots are indexed by STEPS order */
  useEffect(() => {
    if (!open) return;
    const requested = STEPS.findIndex((s) => s.key === startAngle);
    const seeded = STEPS.map((s) => {
      if (requested !== -1 && s.key === startAngle && ['camera', 'upload'].includes(initialMode)) {
        return null;
      }
      const v = initial[angles.indexOf(s.key)];
      if (v instanceof File) return { file: v, url: URL.createObjectURL(v) };
      if (typeof v === 'string' && v)
        return { file: null, url: resolveUrl ? resolveUrl(v) : v, existing: v };
      return null;
    });
    setShots(seeded);
    const firstEmpty = seeded.findIndex((s) => !s);
    setStepIndex(requested !== -1 ? requested : firstEmpty === -1 ? 0 : firstEmpty);
    setMode(initialMode === 'upload' ? 'upload' : 'camera');
    setCamState('checking');
    setErrorKind(null);
    setFlash(false);
    setReview(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* per-step camera state — the <Webcam> is kept mounted across steps (see the
     stage render), so its stream is acquired once. Only drop back to 'checking'
     if the camera isn't already live; otherwise onUserMedia would never fire
     again to clear it and the step would hang on "Starting camera…". */
  useEffect(() => {
    if (!open) return;
    setCamState((s) => (s === 'ready' ? 'ready' : 'checking'));
  }, [stepIndex, open]);

  /* Safety net: the webcam is mounted persistently, so onUserMedia fires only
     once. If camState is 'checking' but the underlying <video> is actually
     playing (e.g. we switched step mid-startup, or React kept the element),
     promote it to 'ready' so the capture button doesn't stay disabled. */
  useEffect(() => {
    if (!open || camState !== 'checking' || mode !== 'camera') return;
    const id = setInterval(() => {
      const v = webcamRef.current?.video;
      if (v && v.readyState >= 2 && v.videoWidth) setCamState('ready');
    }, 300);
    return () => clearInterval(id);
  }, [open, camState, mode, stepIndex, retryKey]);

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
    return new File([new Blob([arr], { type: mime })], `${namePrefix}_${step.key}.jpg`, {
      type: mime,
    });
  };

  // Fire the pose-card "capture burst" for one step, auto-clearing after the
  // animation so it can replay on the next capture.
  const playCaptureBurst = (i) => {
    setJustCaptured(i);
    setTimeout(() => setJustCaptured((cur) => (cur === i ? null : cur)), 900);
  };

  const capture = () => {
    const cam = webcamRef.current;
    if (!cam) return;
    const video = cam.video;
    // The webcam stays mounted across steps; if the stream is momentarily not
    // playing (just switched back to this step) getScreenshot() returns null.
    if (!video || video.readyState < 2 || !video.videoWidth) {
      toast.error('Camera is still starting — try again in a moment.', COMPACT_TOAST);
      return;
    }
    const src = cam.getScreenshot({ width: video.videoWidth, height: video.videoHeight }) || cam.getScreenshot();
    if (!src) {
      toast.error('Could not capture the photo. Please try again.', COMPACT_TOAST);
      return;
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 320);
    setShotAt(stepIndex, { file: dataUrlToFile(src), url: src });
    playCaptureBurst(stepIndex);
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
    playCaptureBurst(stepIndex);
  };

  const retake = () => {
    setShotAt(stepIndex, null);
    if (mode === 'camera') setCamState((s) => (s === 'ready' ? 'ready' : 'checking'));
    else setTimeout(() => fileRef.current?.click(), 60);
  };

  const retryCamera = () => {
    setErrorKind(null);
    setCamState('checking');
    setMode('camera');
    setRetryKey((k) => k + 1);
  };

  const goPrev = () => setStepIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1);
  };

  const finish = () => {
    const byKey = {};
    STEPS.forEach((s, i) => {
      byKey[s.key] = shots[i]?.file || shots[i]?.existing || null;
    });
    onComplete?.(angles.map((a) => byKey[a] ?? null));
  };

  const errorCopy = useMemo(
    () =>
      ({
        'not-found': {
          title: 'No camera found',
          text: 'Please ensure your camera is connected and you have granted permission to use it in your browser settings.',
        },
        denied: {
          title: 'Camera access blocked',
          text: 'Allow camera access for this site (check the address bar or your browser settings), then retry.',
        },
        generic: {
          title: 'Camera unavailable',
          text: 'We couldn’t start your camera. Close any other app that might be using it, then retry.',
        },
      })[errorKind || 'generic'],
    [errorKind]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fcw-overlay"
      {...(theme ? { 'data-vq-theme': theme } : {})}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <style>{FCW_STYLES}</style>
      <div className="fcw-panel" role="dialog" aria-modal="true" aria-label="Face enrollment">
        <span className="fcw-aurora" aria-hidden />

        {/* header */}
        <div className="fcw-header">
          <button
            type="button"
            onClick={review ? () => setReview(false) : stepIndex === 0 ? onClose : goPrev}
            className="fcw-icon-btn"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="fcw-title">
              {mode === 'upload'
                ? 'Upload your face photos'
                : 'Move your face from left to right'}
            </h2>
            <p className="fcw-subtitle">
              {mode === 'upload'
                ? 'Add three photos: front, left and right views'
                : 'Add three photos: left, center, and right for Avatar Generation'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fcw-icon-btn fcw-icon-btn--close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* stepper + progress */}
        <div className="fcw-steps">
          <div className="fcw-steps-row">
          {STEPS.map((s, i) => {
            const done = !!shots[i];
            const active = i === stepIndex;
            return (
              <div key={s.key} className="fcw-step-row">
                <button
                  type="button"
                  onClick={() => setStepIndex(i)}
                  className={`fcw-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
                >
                  <span className="fcw-step-num">
                    {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="fcw-step-text">
                    <span className="fcw-step-kicker">STEP 0{i + 1}</span>
                    <span className="fcw-step-label">{s.label}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && <span className="fcw-step-sep" />}
              </div>
            );
          })}
          </div>
          <div className="fcw-steps-bar">
            <span
              className="fcw-steps-bar-fill"
              style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {review ? (
          <div className="fcw-review">
            <h3 className="fcw-review-head">Preview your photos</h3>
            <p className="fcw-review-sub">
              Make sure each photo is clear and well lit. Retake any that look blurry.
            </p>
            <div className="fcw-review-grid">
              {STEPS.map((s, i) => (
                <div key={s.key} className="fcw-review-card">
                  <div className="fcw-review-media">
                    {shots[i]?.url ? <img src={shots[i].url} alt={`${s.key} view`} /> : <span />}
                    <button
                      type="button"
                      onClick={() => {
                        setShotAt(i, null);
                        setStepIndex(i);
                        setReview(false);
                        if (mode === 'camera') setCamState((s) => (s === 'ready' ? 'ready' : 'checking'));
                      }}
                      className="fcw-review-del"
                      aria-label={`Retake ${s.key}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="fcw-review-cap">{s.key} view</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="fcw-body">
          {/* left: capture stage */}
          <div className={`fcw-stage ${mode === 'camera' && camState === 'ready' && !currentShot ? 'is-live' : ''}`}>
            {/* Persistent webcam: mounted for the whole camera flow so the media
               stream is acquired once, not re-negotiated (a 1–3s getUserMedia
               hit, and a hang if onUserMedia never refires) every time you
               switch step / pose card or capture a shot. Overlays sit on top. */}
            {mode === 'camera' && camState !== 'error' && (
              <Webcam
                key={retryKey}
                audio={false}
                ref={webcamRef}
                mirrored
                screenshotFormat="image/jpeg"
                videoConstraints={{
                  facingMode: 'user',
                  width: { ideal: 640 },
                  height: { ideal: 640 },
                }}
                onUserMedia={handleUserMedia}
                onUserMediaError={handleUserMediaError}
                className={`fcw-video ${camState === 'ready' && !currentShot ? 'is-live' : ''}`}
                style={currentShot ? { visibility: 'hidden' } : undefined}
              />
            )}
            {currentShot ? (
              <div className={`fcw-shot-wrap ${justCaptured === stepIndex ? 'is-burst' : ''}`}>
                <img src={currentShot.url} alt={`${step.key} view`} className="fcw-shot" />
                {justCaptured === stepIndex && (
                  <>
                    <span className="fcw-burst-ring" aria-hidden />
                    <span className="fcw-burst-ring fcw-burst-ring--2" aria-hidden />
                    <span className="fcw-burst-check" aria-hidden>
                      <Check className="w-6 h-6" strokeWidth={3} />
                    </span>
                  </>
                )}
                <span className="fcw-shot-check">
                  <CheckCircle2 className="w-4 h-4" /> {step.key} captured
                </span>
                <button type="button" onClick={retake} className="fcw-shot-retake">
                  <RotateCcw className="w-3.5 h-3.5" /> Retake
                </button>
              </div>
            ) : mode === 'upload' ? (
              <div className="fcw-choose">
                <span className="fcw-choose-drop">
                  <Upload className="w-8 h-8" />
                </span>
                <p className="fcw-choose-title">Upload your {step.key.toLowerCase()} view</p>
                <p className="fcw-choose-sub">Choose a JPG or PNG photo from your device.</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="fcw-choose-cta"
                  style={{ background: GRADIENT }}
                >
                  <Upload className="w-4 h-4" /> Choose file
                </button>
              </div>
            ) : camState === 'error' ? (
              <div className="fcw-error">
                <span className="fcw-error-icon">
                  <CameraOff className="w-7 h-7" />
                </span>
                <p className="fcw-error-title">{errorCopy.title}</p>
                <p className="fcw-error-text">{errorCopy.text}</p>
                <button type="button" onClick={retryCamera} className="fcw-retry">
                  <RefreshCw className="w-4 h-4" /> Retry Connection
                </button>
              </div>
            ) : (
              <>
                {camState !== 'ready' && (
                  <div className="fcw-loading">
                    <span className="fcw-loading-orb">
                      <Loader className="w-6 h-6 animate-spin" />
                    </span>
                    Starting camera…
                  </div>
                )}
                {camState === 'ready' && (
                  <>
                    <div className="fcw-oval" />
                    <span className="fcw-live">
                      <span className="fcw-live-dot" /> LIVE
                    </span>
                  </>
                )}
                {flash && <div className="fcw-flash" />}
              </>
            )}
          </div>

          {/* right: guidance + pose preview cards */}
          <div className="fcw-guide">
            {!currentShot && (
              <div className="fcw-guide-card">
                <h3 className="fcw-guide-head">
                  {mode === 'upload' ? 'Choosing a good photo' : 'How to position your face'}
                </h3>
                <p className="fcw-guide-text">
                  {mode === 'upload'
                    ? `Pick a photo showing your ${step.key.toLowerCase()} view — clear, recent and taken straight on.`
                    : step.sub}
                </p>
              </div>
            )}

            <div className="fcw-poses">
              {allDone && (
                <button
                  type="button"
                  onClick={() => setReview(true)}
                  className="fcw-poses-next"
                  aria-label="See clear photos"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              {STEPS.map((s, i) => {
                const active = i === stepIndex;
                const shot = shots[i];
                return (
                  <button
                    type="button"
                    key={s.key}
                    onClick={() => setStepIndex(i)}
                    aria-current={active ? 'step' : undefined}
                    className={`fcw-pose fcw-pose--${s.key.toLowerCase()} ${active ? 'is-active' : ''} ${
                      shot ? 'is-done' : ''
                    } ${justCaptured === i ? 'is-burst' : ''}`}
                  >
                    {justCaptured === i && (
                      <>
                        <span className="fcw-burst-ring" aria-hidden />
                        <span className="fcw-burst-ring fcw-burst-ring--2" aria-hidden />
                        <span className="fcw-burst-check" aria-hidden>
                          <Check className="w-6 h-6" strokeWidth={3} />
                        </span>
                      </>
                    )}
                    <span className="fcw-pose-art">
                      <img
                        src={shot?.url || s.art}
                        alt={`${s.key} view`}
                        draggable={false}
                        onError={(e) => {
                          // A seeded/stored image URL that 404s leaves a broken-image
                          // icon — fall back once to the reference pose art.
                          if (!e.currentTarget.dataset.fallback) {
                            e.currentTarget.dataset.fallback = '1';
                            e.currentTarget.src = s.art;
                          }
                        }}
                      />
                    </span>
                    <span className={`fcw-pose-tag ${shot ? 'is-done' : ''}`}>
                      {shot && <Check className="w-3 h-3" strokeWidth={3} />}
                      {s.key}
                    </span>
                  </button>
                );
              })}
            </div>

            {!currentShot && (
              <ul className="fcw-tips">
                {(mode === 'upload' ? UPLOAD_TIPS : CAMERA_TIPS).map(({ Icon, t }) => (
                  <li key={t}>
                    <span className="fcw-tip-ic">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        )}

        {/* footer */}
        <div className="fcw-footer">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={onFile}
          />

          {!review && !currentShot && (
            <div className="fcw-mode" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'camera'}
                className={`fcw-mode-btn ${mode === 'camera' ? 'is-active' : ''}`}
                onClick={() => setMode('camera')}
              >
                <Camera className="w-4 h-4" /> Take photo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'upload'}
                className={`fcw-mode-btn ${mode === 'upload' ? 'is-active' : ''}`}
                onClick={() => setMode('upload')}
              >
                <Upload className="w-4 h-4" /> Upload
              </button>
            </div>
          )}

          <div className="fcw-footer-actions">
            {review ? (
              <>
                <button
                  type="button"
                  onClick={() => setReview(false)}
                  className="fcw-btn fcw-btn--ghost"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={finish}
                  className="fcw-btn fcw-btn--primary"
                  style={{ background: GRADIENT }}
                >
                  <Check className="w-4 h-4" strokeWidth={3} /> Looks good — use these photos
                </button>
              </>
            ) : (
            <>
            {stepIndex > 0 && (
              <button type="button" onClick={goPrev} className="fcw-btn fcw-btn--ghost">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}

            {currentShot ? (
              allDone ? (
                <button
                  type="button"
                  onClick={() => setReview(true)}
                  className="fcw-btn fcw-btn--primary"
                  style={{ background: GRADIENT }}
                >
                  Review photos <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const nextEmpty = shots.findIndex((s, i) => !s && i > stepIndex);
                    setStepIndex(
                      nextEmpty !== -1 ? nextEmpty : shots.findIndex((s) => !s)
                    );
                  }}
                  className="fcw-btn fcw-btn--primary"
                  style={{ background: GRADIENT }}
                >
                  Next step <ArrowRight className="w-4 h-4" />
                </button>
              )
            ) : mode === 'upload' ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="fcw-btn fcw-btn--primary"
                style={{ background: GRADIENT }}
              >
                <Upload className="w-4 h-4" /> Choose {step.key.toLowerCase()} photo
              </button>
            ) : (
              <button
                type="button"
                onClick={camState === 'error' ? retryCamera : capture}
                disabled={camState === 'checking'}
                className="fcw-btn fcw-btn--primary"
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
                    <Camera className="w-4 h-4" /> Capture {step.key} view
                  </>
                )}
              </button>
            )}
            </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const FCW_STYLES = `
.fcw-overlay{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;
  background:radial-gradient(120% 120% at 50% 0%,rgba(20,10,45,.72),rgba(4,6,12,.82));
  backdrop-filter:blur(8px);animation:fcw-in .2s ease-out}
.fcw-panel{position:relative;width:100%;max-width:1040px;max-height:94vh;overflow-y:auto;overflow-x:hidden;
  display:flex;flex-direction:column;background:var(--bg1solid);border:1px solid var(--bd);border-radius:24px;
  box-shadow:0 44px 110px -25px rgba(0,0,0,.62),0 0 0 1px color-mix(in srgb,var(--blue) 14%,transparent);
  animation:fcw-panel .32s cubic-bezier(.16,1,.3,1)}
.fcw-aurora{position:absolute;top:-45%;left:-12%;width:75%;height:85%;pointer-events:none;z-index:0;
  background:radial-gradient(circle at 30% 30%,color-mix(in srgb,var(--blue) 55%,transparent),transparent 60%),
    radial-gradient(circle at 70% 60%,color-mix(in srgb,var(--violet) 50%,transparent),transparent 60%);
  filter:blur(64px);opacity:.5}
.fcw-panel>*:not(.fcw-aurora){position:relative;z-index:1}

.fcw-header{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px}
.fcw-title{font-size:22px;font-weight:650;color:var(--tx);line-height:1.25}
.fcw-subtitle{font-size:12.5px;color:var(--tx3);margin-top:4px}
.fcw-icon-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:11px;
  border:1px solid var(--bd);background:var(--bg2);color:var(--tx2);cursor:pointer;transition:.16s}
.fcw-icon-btn:hover{color:var(--tx);background:var(--bg3);transform:translateY(-1px)}
.fcw-icon-btn--close{margin-left:auto}

.fcw-steps{display:flex;flex-direction:column;gap:10px;padding:6px 22px 16px}
.fcw-steps-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.fcw-steps-bar{height:5px;border-radius:999px;background:var(--bg3);overflow:hidden}
.fcw-steps-bar-fill{display:block;height:100%;border-radius:999px;background:${GRADIENT};transition:width .35s cubic-bezier(.16,1,.3,1)}
.fcw-step-row{display:flex;align-items:center;gap:6px;flex:1;min-width:200px}
.fcw-step{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;background:transparent;border:0;
  cursor:pointer;text-align:left;transition:.16s;flex:1}
.fcw-step:hover{background:var(--bg2)}
.fcw-step-num{display:flex;align-items:center;justify-content:center;width:26px;height:26px;flex-shrink:0;border-radius:999px;
  font-size:12px;font-weight:700;color:var(--tx3);background:var(--bg3);border:1px solid var(--bd);transition:.16s}
.fcw-step.is-active .fcw-step-num{color:#fff;background:var(--blue);border-color:var(--blue);
  box-shadow:0 0 0 4px color-mix(in srgb,var(--blue) 22%,transparent)}
.fcw-step.is-done .fcw-step-num{color:#fff;background:var(--ok);border-color:var(--ok)}
.fcw-step-kicker{display:block;font-size:9.5px;font-weight:700;letter-spacing:.08em;color:var(--tx3)}
.fcw-step-label{display:block;font-size:12.5px;font-weight:650;color:var(--tx3);margin-top:1px}
.fcw-step.is-active .fcw-step-kicker{color:var(--blue)}
.fcw-step.is-active .fcw-step-label,.fcw-step.is-done .fcw-step-label{color:var(--tx)}
.fcw-step-sep{flex:0 0 24px;height:1px;background:var(--bd)}

.fcw-body{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:4px 22px 8px}
@media(max-width:760px){.fcw-body{grid-template-columns:1fr}}

.fcw-stage{position:relative;aspect-ratio:1/1;border-radius:20px;overflow:hidden;
  background:#05070d;border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;transition:box-shadow .4s}
.fcw-stage.is-live{box-shadow:0 0 0 1px color-mix(in srgb,var(--blue) 40%,transparent),0 22px 48px -15px color-mix(in srgb,var(--blue) 45%,transparent)}
.fcw-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.06);transition:opacity .5s,transform .6s cubic-bezier(.16,1,.3,1)}
.fcw-video.is-live{opacity:1;transform:scale(1)}
.fcw-oval{position:absolute;width:58%;height:76%;border:2px dashed rgba(255,255,255,.6);border-radius:50% 50% 48% 48%;
  pointer-events:none;box-shadow:0 0 0 999px rgba(5,7,13,.32);animation:fcw-pulse 2.6s ease-in-out infinite}
.fcw-live{position:absolute;top:12px;left:12px;display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:8px;
  font-size:10px;font-weight:800;letter-spacing:.08em;color:#fff;background:rgba(0,0,0,.45);backdrop-filter:blur(4px)}
.fcw-live-dot{width:6px;height:6px;border-radius:999px;background:#ff4d4f;animation:fcw-blink 1.2s ease-in-out infinite}
.fcw-loading{position:absolute;display:flex;flex-direction:column;align-items:center;gap:10px;color:#cfd3dc;font-size:12.5px}
.fcw-loading-orb{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:999px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 14%,transparent)}
.fcw-flash{position:absolute;inset:0;background:#fff;animation:fcw-flashk .4s ease-out forwards}

.fcw-choose{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:24px 20px;max-width:340px}
.fcw-choose-title{font-size:15px;font-weight:650;color:#fff}
.fcw-choose-sub{font-size:12px;color:#aeb3be;line-height:1.5;margin-bottom:8px}
.fcw-choose-drop{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:18px;color:#fff;
  background:color-mix(in srgb,var(--blue) 22%,transparent);border:2px dashed color-mix(in srgb,var(--blue) 55%,transparent);margin-bottom:6px}
.fcw-choose-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 22px;border-radius:12px;
  font-size:13px;font-weight:650;color:#fff;cursor:pointer;transition:.16s;margin-top:6px}
.fcw-choose-cta:hover{transform:translateY(-1px)}

.fcw-error{display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;padding:24px;max-width:340px}
.fcw-error-icon{display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:999px;
  color:#f87171;background:rgba(248,113,113,.14);box-shadow:0 0 0 8px rgba(248,113,113,.06)}
.fcw-error-title{font-size:15px;font-weight:650;color:#fff}
.fcw-error-text{font-size:12.5px;color:#aeb3be;line-height:1.55}
.fcw-retry{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:11px;background:#fff;color:#111;
  font-size:12.5px;font-weight:650;cursor:pointer;transition:.16s;margin-top:4px}
.fcw-retry:hover{transform:translateY(-1px)}

/* Reserve the guide column's tallest state so stepping / switching mode /
   capturing a shot never changes the panel height (content just centres in it). */
.fcw-guide{display:flex;flex-direction:column;gap:12px;padding:4px 2px;justify-content:center;min-height:500px}
@media(max-width:760px){.fcw-guide{min-height:0}}
.fcw-guide-card{padding:12px 14px;border-radius:14px;background:var(--bg2);border:1px solid var(--bd)}
.fcw-guide-head{font-size:13px;font-weight:650;color:var(--tx);margin-bottom:4px}
.fcw-tips{display:flex;flex-direction:column;gap:9px;list-style:none;padding:0;margin:0}
.fcw-tips li{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--tx2)}
.fcw-tip-ic{display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;border-radius:8px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent)}
.fcw-poses{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:328px;padding:24px 6px 30px}
.fcw-poses-next{position:absolute;right:2px;bottom:2px;z-index:6;display:flex;align-items:center;justify-content:center;
  width:38px;height:38px;border-radius:999px;color:var(--tx2);cursor:pointer;border:1px solid var(--bd);
  background:var(--bg2);transition:.16s;animation:fcw-fade .3s ease-out}
.fcw-poses-next:hover{background:${GRADIENT};border-color:transparent;color:#fff;transform:translateY(-1px)}
.fcw-pose{position:relative;flex:0 0 auto;padding:0;border-radius:22px;overflow:visible;cursor:pointer;
  background:#15131f;border:2px solid rgba(255,255,255,.08);
  transition:filter .3s,opacity .3s,box-shadow .35s,border-color .3s;filter:brightness(.5) saturate(.75);opacity:.9}
.fcw-pose>.fcw-pose-art{position:absolute;inset:0;border-radius:20px;overflow:hidden;z-index:0}
.fcw-pose:hover{filter:brightness(.72)}
.fcw-pose:focus-visible{outline:none}

/* Fixed fanned layout — positions & sizes NEVER change. The centre card is the
   large reference; the side cards are smaller and tucked behind it. Selecting
   a step only changes brightness / z-index / glow, not geometry. */
.fcw-pose--front{order:2;z-index:2;width:148px;height:244px}
.fcw-pose--left{order:1;z-index:1;width:148px;height:244px;transform:translateX(26px) rotate(-9deg)}
.fcw-pose--right{order:3;z-index:1;width:148px;height:244px;transform:translateX(-26px) rotate(9deg)}

/* captured — steady green glowing border */
.fcw-pose.is-done{filter:none;opacity:1;border-color:var(--ok);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--ok) 60%,transparent),
             0 0 22px -2px color-mix(in srgb,var(--ok) 55%,transparent)}

/* one-shot "photo captured!" burst — pose card + large preview */
.fcw-pose.is-burst{border-color:var(--ok)}
.fcw-pose.is-burst .fcw-pose-art img,
.fcw-shot-wrap.is-burst .fcw-shot{animation:fcw-burst-bright .7s ease-out}
.fcw-burst-ring{position:absolute;inset:0;border-radius:22px;pointer-events:none;z-index:6;
  border:3px solid var(--ok);animation:fcw-burst-ring .7s ease-out forwards}
.fcw-shot-wrap .fcw-burst-ring{border-radius:20px;border-width:4px}
.fcw-burst-ring--2{animation-delay:.12s;border-color:color-mix(in srgb,var(--ok) 60%,#fff)}
.fcw-burst-check{position:absolute;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;
  color:#fff;pointer-events:none}
.fcw-burst-check svg{background:var(--ok);border-radius:999px;padding:8px;width:44px;height:44px;
  box-shadow:0 6px 20px -4px color-mix(in srgb,var(--ok) 70%,transparent);
  animation:fcw-burst-check .6s cubic-bezier(.16,1,.3,1)}
.fcw-shot-wrap .fcw-burst-check svg{width:64px;height:64px;padding:12px}

/* the active step's card is always on top, full colour, with a pulsing blue glow */
.fcw-pose.is-active{z-index:5;opacity:1;filter:none;border-color:var(--blue);
  animation:fcw-glow 2.2s ease-in-out infinite}
.fcw-pose.is-done.is-active{border-color:var(--blue)}
.fcw-pose.is-done.is-active::after{border-color:var(--blue)}
.fcw-pose-art{display:block;width:100%;height:100%}
.fcw-pose-art img{width:100%;height:100%;object-fit:cover;object-position:center 10%}
.fcw-pose-tag{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:3;display:inline-flex;align-items:center;gap:4px;
  padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(4px)}
.fcw-pose-tag.is-done{background:var(--ok)}
.fcw-guide-text{font-size:12px;color:var(--tx2);line-height:1.55}

.fcw-footer{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 22px 22px;margin-top:auto}
.fcw-mode{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--bg2);border:1px solid var(--bd);flex:0 0 auto}
.fcw-mode-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:9px;font-size:12.5px;font-weight:650;
  cursor:pointer;color:var(--tx2);background:transparent;border:0;transition:.16s}
.fcw-mode-btn:hover{color:var(--tx)}
.fcw-mode-btn.is-active{color:#fff;background:var(--blue)}
.fcw-footer-actions{display:flex;gap:10px;flex:1;min-width:220px}
.fcw-btn{flex:1;height:48px;border-radius:13px;display:flex;align-items:center;justify-content:center;gap:8px;
  font-size:13.5px;font-weight:650;cursor:pointer;transition:.16s}
.fcw-btn--primary{color:#fff;box-shadow:0 14px 30px -12px color-mix(in srgb,var(--blue) 60%,transparent)}
.fcw-btn--primary:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.fcw-btn--primary:not(:disabled):hover{transform:translateY(-1px)}
.fcw-btn--ghost{flex:0 0 auto;padding:0 18px;background:var(--bg2);border:1px solid var(--bd);color:var(--tx2)}
.fcw-btn--ghost:hover{background:var(--bg3);color:var(--tx)}

.fcw-shot-wrap{position:absolute;inset:0;animation:fcw-fade .3s ease-out}
.fcw-shot{width:100%;height:100%;object-fit:cover}
.fcw-shot-check{position:absolute;top:12px;left:12px;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;
  font-size:11px;font-weight:700;color:#fff;background:color-mix(in srgb,var(--ok) 85%,#000);backdrop-filter:blur(4px)}
.fcw-shot-retake{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;
  padding:7px 14px;border-radius:999px;font-size:12px;font-weight:650;color:#111;background:#fff;cursor:pointer;transition:.15s}
.fcw-shot-retake:hover{transform:translateX(-50%) translateY(-1px)}

.fcw-review{padding:8px 22px 6px;animation:fcw-fade .3s ease-out}
.fcw-review-head{font-size:15px;font-weight:650;color:var(--tx)}
.fcw-review-sub{font-size:12px;color:var(--tx3);margin-top:2px;margin-bottom:14px}
.fcw-review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:620px){.fcw-review-grid{grid-template-columns:1fr}}
.fcw-review-card{border-radius:14px;border:1.5px solid color-mix(in srgb,var(--ok) 40%,transparent);background:var(--bg2);overflow:hidden}
.fcw-review-media{position:relative;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;background:var(--bg3)}
.fcw-review-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.fcw-review-media>span{width:40px;height:40px;border-radius:999px;background:color-mix(in srgb,var(--tx) 12%,transparent)}
.fcw-review-del{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;
  border-radius:999px;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);cursor:pointer;transition:.15s;z-index:2}
.fcw-review-del:hover{transform:scale(1.1);background:var(--crit,#e5484d)}
.fcw-review-cap{display:block;text-align:center;font-size:12px;font-weight:650;color:var(--tx);padding:9px 4px;border-top:1px solid var(--bd)}

@keyframes fcw-in{from{opacity:0}to{opacity:1}}
@keyframes fcw-panel{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:none}}
@keyframes fcw-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes fcw-pulse{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.025);opacity:1}}
@keyframes fcw-flashk{0%{opacity:.9}100%{opacity:0}}
@keyframes fcw-blink{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes fcw-glow{
  0%,100%{box-shadow:0 0 0 1px color-mix(in srgb,var(--blue) 55%,transparent),
                     0 0 16px -2px color-mix(in srgb,var(--blue) 45%,transparent),
                     0 20px 44px -22px rgba(0,0,0,.6)}
  50%{box-shadow:0 0 0 2px color-mix(in srgb,var(--blue) 80%,transparent),
                 0 0 30px 2px color-mix(in srgb,var(--blue) 65%,transparent),
                 0 24px 52px -20px rgba(0,0,0,.6)}
}
@keyframes fcw-burst-ring{0%{opacity:.9;transform:scale(.85)}100%{opacity:0;transform:scale(1.35)}}
@keyframes fcw-burst-check{0%{opacity:0;transform:scale(.3)}55%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(1)}}
@keyframes fcw-burst-bright{0%{filter:brightness(1)}20%{filter:brightness(1.9) saturate(1.2)}100%{filter:brightness(1)}}
@media(max-width:640px){
  .fcw-overlay{align-items:stretch;padding:0}
  .fcw-panel{height:100dvh;max-height:100dvh;max-width:none;border-radius:0;border:0}
  .fcw-header{padding:16px 16px 10px;gap:10px}
  .fcw-title{font-size:22px;line-height:1.12}
  .fcw-subtitle{font-size:12px;line-height:1.45}
  .fcw-icon-btn{width:34px;height:34px;border-radius:12px}
  .fcw-steps{gap:8px;padding:4px 16px 10px}
  .fcw-steps-row{display:grid;grid-template-columns:1fr;gap:6px}
  .fcw-step-row{min-width:0;width:100%;gap:0}
  .fcw-step{padding:7px 8px}
  .fcw-step-sep{display:none}
  .fcw-body{display:block;padding:8px 16px 10px}
  .fcw-stage{height:min(38dvh,300px);min-height:230px;aspect-ratio:auto;border-radius:18px}
  .fcw-guide{display:flex;min-height:0;gap:10px;padding:10px 0 0;justify-content:flex-start}
  .fcw-guide-card{padding:10px 12px;border-radius:12px}
  .fcw-guide-head{font-size:12.5px;margin-bottom:3px}
  .fcw-guide-text{font-size:11.5px;line-height:1.45}
  .fcw-poses{display:none}
  .fcw-tips{display:grid;grid-template-columns:1fr;gap:7px}
  .fcw-tips li{gap:8px;font-size:11px;line-height:1.35}
  .fcw-tip-ic{width:22px;height:22px;border-radius:7px}
  .fcw-choose{max-width:100%;padding:18px 16px}
  .fcw-choose-drop{width:58px;height:58px;border-radius:16px}
  .fcw-choose-title{font-size:15px}
  .fcw-choose-sub{max-width:240px;font-size:12px}
  .fcw-choose-cta{height:42px;padding:0 18px}
  .fcw-footer{position:sticky;bottom:0;z-index:5;display:flex;flex-direction:column;gap:10px;padding:10px 16px 14px;margin-top:auto;
    background:linear-gradient(180deg,color-mix(in srgb,var(--bg1solid) 84%,transparent),var(--bg1solid) 34%);
    border-top:1px solid color-mix(in srgb,var(--bd) 70%,transparent)}
  .fcw-mode{width:100%;flex:0 0 auto}
  .fcw-mode-btn{flex:1;justify-content:center;padding:8px 10px}
  .fcw-footer-actions{width:100%;min-width:0;gap:8px}
  .fcw-btn{height:46px;min-width:0;padding:0 12px;font-size:12.5px}
  .fcw-btn--ghost{flex:0 0 92px;padding:0 12px}
  .fcw-review{padding:8px 16px 6px}
  .fcw-review-grid{grid-template-columns:1fr;gap:10px}
  .fcw-review-media{aspect-ratio:16/10}
}
@media(prefers-reduced-motion:reduce){.fcw-overlay *{animation-duration:.001s!important;animation-iteration-count:1!important}}
`;

export default FaceCaptureWizard;
