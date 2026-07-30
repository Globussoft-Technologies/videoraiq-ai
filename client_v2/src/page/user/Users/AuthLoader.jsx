import { useEffect, useRef, useState } from "react";
import logo from "@/assets/logo.svg";
import logoWhite from "@/assets/videoraiq-logo-white.png";
import logoColor from "@/assets/videoraiq-logo-color.png";
import "./authLoader.css";

// Matches the HTML prototype's boot sequence exactly (VideoraIQ Command.dc.html,
// this._boot) — message rotates on its own 520ms clock, independent of the
// 2.6s progress fill, so the two aren't artificially tied to the same step count.
const STEPS = [
  "Initializing AI engines",
  "Connecting to NVR clusters",
  "Syncing camera streams",
  "Calibrating detection models",
  "Securing command center",
];

const MESSAGE_MS = 520;
const FILL_MS = 2600;

export default function AuthLoader({ onComplete }) {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const startRef = useRef(null);
  const firedRef = useRef(false);

  const theme =
    (typeof window !== "undefined" && localStorage.getItem("vq-theme")) || "dark";
  const isLight = theme === "light";

  useEffect(() => {
    const messageIv = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, MESSAGE_MS);

    startRef.current = Date.now();
    const fillIv = setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - startRef.current) / FILL_MS) * 100));
      setPct(p);
      // Fire once, exactly when the bar visually reaches 100% — never before,
      // so the caller's redirect can't race ahead of what the user sees.
      if (p >= 100 && !firedRef.current) {
        firedRef.current = true;
        onComplete?.();
      }
    }, 40);

    return () => {
      clearInterval(messageIv);
      clearInterval(fillIv);
    };
  }, [onComplete]);

  return (
    <div className="vqauth-loader" data-theme={theme}>
      <div className="vqauth-grid" />
      <div className="vqauth-glow" />
      <div className="vqauth-glow vqauth-glow--2" />

      <div className="vqauth-radar">
        <span className="vqauth-corner vqauth-corner--tl" />
        <span className="vqauth-corner vqauth-corner--tr" />
        <span className="vqauth-corner vqauth-corner--br" />
        <span className="vqauth-corner vqauth-corner--bl" />

        <div className="vqauth-ring vqauth-ring--outer" />
        <div className="vqauth-ring vqauth-ring--inner" />
        <div className="vqauth-crosshair-h" />
        <div className="vqauth-crosshair-v" />

        <svg width="268" height="268" viewBox="0 0 268 268" className="vqauth-dashring--r">
          <circle cx="134" cy="134" r="128" fill="none" stroke="rgba(59,130,246,.45)" strokeWidth="1.4" strokeDasharray="3 11" strokeLinecap="round" />
        </svg>
        <svg width="200" height="200" viewBox="0 0 200 200" className="vqauth-dashring--l">
          <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(168,85,247,.5)" strokeWidth="1.4" strokeDasharray="2 16" strokeLinecap="round" />
        </svg>

        <svg width="240" height="240" viewBox="0 0 240 240" className="vqauth-arcring">
          <circle cx="120" cy="120" r="114" fill="none" stroke="url(#vqauth-arc)" strokeWidth="2.4" strokeDasharray="120 600" strokeLinecap="round" />
          <defs>
            <linearGradient id="vqauth-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>

        <div className="vqauth-sweep" />

        <div className="vqauth-pulsering" />
        <div className="vqauth-pulsering vqauth-pulsering--2" />

        <div className="vqauth-orbit vqauth-orbit--1"><span className="vqauth-orbit-dot" /></div>
        <div className="vqauth-orbit vqauth-orbit--2"><span className="vqauth-orbit-dot" /></div>
        <div className="vqauth-orbit vqauth-orbit--3"><span className="vqauth-orbit-dot" /></div>

        <span className="vqauth-blip vqauth-blip--1" />
        <span className="vqauth-blip vqauth-blip--2" />
        <span className="vqauth-blip vqauth-blip--3" />

        <div className="vqauth-core-wrap">
          <div className="vqauth-core-glow" />
          <div className="vqauth-core-float">
            <div className="vqauth-core">
              <img src={logo} alt="VideoraIQ" />
            </div>
          </div>
        </div>
      </div>

      <div className="vqauth-brand">
        <img src={isLight ? logoColor : logoWhite} alt="VideoraIQ" className="vqauth-brand-logo" />
      </div>

      <div className="vqauth-progress">
        <div className="vqauth-bar">
          <div className="vqauth-bar-fill" style={{ width: `${pct}%` }} />
          <div className="vqauth-bar-shimmer" />
        </div>
        <div className="vqauth-label">
          <span className="vqauth-label-left">
            <span className="vqauth-label-dot" />
            <span>{STEPS[step]}</span>
          </span>
          <span className="vqauth-label-pct">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
