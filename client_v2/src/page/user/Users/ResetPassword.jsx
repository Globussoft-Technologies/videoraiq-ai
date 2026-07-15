import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.svg";
import AuthHero from "./AuthHero";
import { resetpassword } from "./api/post/Index";
import { Txt, labelStyle, fieldWrap, errStyle, EyeToggle, CtaButton } from "./AuthFields";
import "./login.css";

const PASSWORD_RULES = [
  { key: "len",  label: "At least 8 characters",              test: (p) => p.length >= 8 },
  { key: "up",   label: "One uppercase letter",                test: (p) => /[A-Z]/.test(p) },
  { key: "low",  label: "One lowercase letter",                test: (p) => /[a-z]/.test(p) },
  { key: "num",  label: "One number",                          test: (p) => /\d/.test(p) },
  { key: "spec", label: "One special character (@$!%*?&)",     test: (p) => /[@$!%*?&]/.test(p) },
];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset link is missing or invalid");
      return;
    }
    if (!PASSWORD_RULES.every((r) => r.test(password))) {
      setError("Password does not meet the requirements below");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await resetpassword({ token, newPassword: password, confirmPassword });
      const success = res?.data?.body?.status === "success";
      if (success) {
        setDone(true);
        toast.success(res?.data?.body?.message || "Password reset successfully");
      } else {
        const msg = res?.data?.body?.message || "Failed to reset password";
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      const msg = err?.response?.data?.body?.message || "Failed to reset password";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="vqlogin"
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(1200px 620px at 84% -14%,rgba(168,85,247,.13),transparent 60%),radial-gradient(1000px 560px at -6% 114%,rgba(59,130,246,.13),transparent 55%),#07090c",
        fontFamily: "'IBM Plex Sans',sans-serif",
        color: "#e9edf7",
        overflow: "hidden",
      }}
    >
      <AuthHero />

      <div
        className="vqlogin-auth"
        style={{
          width: 524,
          flex: "0 0 524px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 38,
          background: "rgba(8,11,17,.5)",
          borderLeft: "1px solid rgba(255,255,255,.07)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: 392, animation: "vqfade .7s ease both .1s" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
            <div
              style={{
                position: "relative",
                width: 66,
                height: 66,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -7,
                  borderRadius: "50%",
                  background: "radial-gradient(circle,rgba(99,102,241,.5),transparent 72%)",
                  animation: "vqglow 2.4s ease-in-out infinite",
                }}
              />
              <img
                src={logo}
                alt="VideoraIQ"
                style={{ position: "relative", width: 66, height: 66, objectFit: "contain", animation: "vqfloatY 3.4s ease-in-out infinite" }}
              />
            </div>
            <h2
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontWeight: 600,
                fontSize: 23,
                letterSpacing: "-.01em",
                margin: 0,
                color: "#f4f8ff",
              }}
            >
              {done ? "Password reset!" : "Reset password"}
            </h2>
            <p style={{ fontSize: 13, color: "#98a2bd", margin: "6px 0 0" }}>
              {done ? "You can now sign in with your new password" : "Create a strong new password for your account"}
            </p>
          </div>

          {!done ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>New Password</label>
                <Txt
                  icon={Lock}
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  rightSlot={<EyeToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                />
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Confirm Password</label>
                <Txt
                  icon={Lock}
                  name="confirmPassword"
                  type={showConfirmPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  rightSlot={<EyeToggle shown={showConfirmPw} onToggle={() => setShowConfirmPw((s) => !s)} />}
                />
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10, padding: "12px 14px",
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: "#b8c2db", margin: "0 0 8px" }}>Password must contain:</p>
                <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                  {PASSWORD_RULES.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#98a2bd" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "#22c55e" : "rgba(255,255,255,.2)", flexShrink: 0 }} />
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {error && <div style={errStyle}>{error}</div>}

              <CtaButton label={loading ? "Resetting…" : "Reset Password"} loading={loading} disabled={loading} />
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <CheckCircle2 size={28} color="#22c55e" />
              </div>
              <button
                type="button"
                onClick={() => navigate("/admin-login")}
                className="vqlogin-cta"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  width: "100%",
                  height: 48,
                  border: 0,
                  borderRadius: 12,
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  color: "#fff",
                  background: "linear-gradient(135deg,#3b82f6,#7c5cff 55%,#a855f7)",
                  boxShadow: "0 10px 26px rgba(74,108,247,.34)",
                }}
              >
                Continue to Login
              </button>
            </div>
          )}

          {!done && (
            <button
              type="button"
              onClick={() => navigate("/admin-login")}
              style={{
                marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", height: 42, borderRadius: 11,
                background: "transparent", border: "1px solid rgba(255,255,255,.10)",
                color: "#b8c2db", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              <ArrowLeft size={14} />
              Back to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
