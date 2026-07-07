import { Eye, EyeOff, ArrowRight } from "lucide-react";

/* Shared building blocks for the login / register auth screen.
   Kept in one place so UserForm (login) and RegisterForm stay in sync. */

/* ------- a single styled text input (icon + field) ------- */
export function Txt({ icon: Icon, rightSlot, ...props }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {Icon && (
        <Icon size={16} style={{ position: "absolute", left: 13, color: "#5d6883", pointerEvents: "none" }} />
      )}
      <input
        className="vqlogin-input"
        style={{
          width: "100%",
          height: 46,
          padding: `0 ${rightSlot ? 44 : 14}px 0 ${Icon ? 38 : 14}px`,
          borderRadius: 11,
          background: "#11151f",
          border: "1px solid rgba(255,255,255,.10)",
          color: "#e9edf7",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color .15s,box-shadow .15s",
        }}
        {...props}
      />
      {rightSlot}
    </div>
  );
}

export const labelStyle = { fontSize: 12, fontWeight: 500, color: "#b8c2db" };
export const fieldWrap = { display: "flex", flexDirection: "column", gap: 6 };
export const errStyle = { fontSize: 11.5, color: "#f87171", marginLeft: 2 };

/* password show/hide toggle — pass as a Txt `rightSlot` */
export function EyeToggle({ shown, onToggle }) {
  return (
    <div
      className="vqlogin-eye"
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
        color: "#7a86a4",
      }}
    >
      {shown ? <Eye size={17} /> : <EyeOff size={17} />}
    </div>
  );
}

/* primary gradient submit button with animated sheen */
export function CtaButton({ label, loading = false, disabled = false }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="vqlogin-cta"
      style={{
        position: "relative",
        overflow: "hidden",
        height: 48,
        marginTop: 6,
        border: 0,
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: "'Space Grotesk',sans-serif",
        fontWeight: 600,
        fontSize: 14.5,
        color: "#fff",
        background: "linear-gradient(135deg,#3b82f6,#7c5cff 55%,#a855f7)",
        boxShadow: "0 10px 26px rgba(74,108,247,.34)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "40%",
          height: "100%",
          background: "linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent)",
          animation: "vqsheen 3.4s ease-in-out infinite",
        }}
      />
      <span style={{ position: "relative" }}>{label}</span>
      {!loading && <ArrowRight size={17} style={{ position: "relative" }} />}
    </button>
  );
}
