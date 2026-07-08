import { Eye, EyeOff, ChevronDown, ArrowRight } from "lucide-react";

/* Shared light-theme building blocks for the employee/user portal pages.
   Kept separate from the admin login's AuthFields so the two never collide. */

export const fieldWrap = { display: "flex", flexDirection: "column", gap: 7 };
export const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "#334155" };
export const errStyle = { fontSize: 11.5, color: "#dc2626", marginTop: 1 };

/* text input with optional leading icon + trailing slot (e.g. eye toggle) */
export function PInput({ icon: Icon, rightSlot, ...props }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {Icon && (
        <Icon size={16} style={{ position: "absolute", left: 13, color: "#94a3b8", pointerEvents: "none" }} />
      )}
      <input
        className="vqp-input"
        style={{
          width: "100%",
          height: 46,
          padding: `0 ${rightSlot ? 42 : 14}px 0 ${Icon ? 38 : 14}px`,
          borderRadius: 12,
          background: "#f6f8fc",
          border: "1px solid #e3e8f0",
          color: "#0f1729",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color .15s,box-shadow .15s,background .15s",
        }}
        {...props}
      />
      {rightSlot}
    </div>
  );
}

/* native select styled to match PInput */
export function PSelect({ children, ...props }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <select
        className="vqp-select"
        style={{
          width: "100%",
          height: 46,
          padding: "0 38px 0 14px",
          borderRadius: 12,
          background: "#f6f8fc",
          border: "1px solid #e3e8f0",
          color: props.value ? "#0f1729" : "#9aa4b8",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: "pointer",
          transition: "border-color .15s,box-shadow .15s,background .15s",
        }}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} style={{ position: "absolute", right: 13, color: "#94a3b8", pointerEvents: "none" }} />
    </div>
  );
}

export function PEye({ shown, onToggle }) {
  return (
    <div
      className="vqp-eye"
      onClick={onToggle}
      style={{
        position: "absolute",
        right: 8,
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        borderRadius: 7,
        color: "#94a3b8",
      }}
    >
      {shown ? <Eye size={17} /> : <EyeOff size={17} />}
    </div>
  );
}

/* submit button — `variant` picks the tone: "primary" (blue) or "success" (green).
   `iconLeft` renders the glyph before the label (e.g. ✓ Complete Registration). */
const CTA_TONES = {
  primary: { background: "#2a6fdb", boxShadow: "0 6px 16px rgba(43,111,219,.26)" },
  success: { background: "linear-gradient(135deg,#22c55e,#16a34a)", boxShadow: "0 8px 22px rgba(22,163,74,.34)" },
};

export function PButton({ label, loading = false, disabled = false, icon: Icon = ArrowRight, type = "submit", variant = "primary", iconLeft = false, onClick }) {
  const tone = CTA_TONES[variant] || CTA_TONES.primary;
  const glyph = Icon && !loading ? <Icon size={17} /> : null;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`vqp-cta vqp-cta-${variant}`}
      style={{
        width: "100%",
        height: 48,
        border: 0,
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: "'Space Grotesk',sans-serif",
        fontWeight: 600,
        fontSize: 14.5,
        color: "#fff",
        background: tone.background,
        boxShadow: tone.boxShadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        transition: "box-shadow .18s,transform .18s,background .18s",
      }}
    >
      {iconLeft && glyph}
      {label}
      {!iconLeft && glyph}
    </button>
  );
}
