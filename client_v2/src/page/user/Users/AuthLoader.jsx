import { useEffect, useState } from "react";
import logo from "@/assets/logo.svg";
import "./authLoader.css";

const STEPS = [
  "Verifying credentials",
  "Initializing AI engines",
  "Calibrating detection models",
];

const STEP_MS = 700;

export default function AuthLoader() {
  const [step, setStep] = useState(0);

  const theme =
    (typeof window !== "undefined" && localStorage.getItem("vq-theme")) || "dark";

  useEffect(() => {
    if (step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step]);

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="vqauth-loader" data-theme={theme}>
      <div className="vqauth-grid" />
      <div className="vqauth-glow" />

      <div className="vqauth-radar">
        <span className="vqauth-corner vqauth-corner--tl" />
        <span className="vqauth-corner vqauth-corner--tr" />
        <span className="vqauth-corner vqauth-corner--bl" />
        <span className="vqauth-corner vqauth-corner--br" />

        <div className="vqauth-ring vqauth-ring--outer" />
        <div className="vqauth-ring vqauth-ring--mid" />
        <div className="vqauth-ring vqauth-ring--inner" />
        <div className="vqauth-sweep" />

        <span className="vqauth-dot vqauth-dot--cyan" />
        <span className="vqauth-dot vqauth-dot--blue" />
        <span className="vqauth-dot vqauth-dot--magenta" />

        <div className="vqauth-core">
          <img src={logo} alt="" />
        </div>
      </div>

      <div className="vqauth-brand">
        <img src={logo} alt="" className="vqauth-brand-mark" />
        <span className="vqauth-brand-name">VideoraIQ</span>
      </div>

      <div className="vqauth-progress">
        <div className="vqauth-bar">
          <div className="vqauth-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="vqauth-label">
          <span className="vqauth-label-dot" />
          <span className="vqauth-label-text">{STEPS[step].toUpperCase()}</span>
          <span className="vqauth-label-pct">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
