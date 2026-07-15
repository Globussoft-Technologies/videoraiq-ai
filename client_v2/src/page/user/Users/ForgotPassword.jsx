import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.svg";
import AuthHero from "./AuthHero";
import { forgotPassword } from "./api/post/Index";
import { Txt, labelStyle, fieldWrap, errStyle, CtaButton } from "./AuthFields";
import "./login.css";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPassword({ email: email.trim() });
      toast.success(res?.data?.body?.message || "Reset link sent to your email");
      setSent(true);
    } catch (err) {
      const msg = err?.response?.data?.body?.message || "Failed to send reset email";
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
              {sent ? "Check your email" : "Forgot password?"}
            </h2>
            <p style={{ fontSize: 13, color: "#98a2bd", margin: "6px 0 0" }}>
              {sent
                ? "We've sent password reset instructions to your email address"
                : "Enter your email and we'll send you a link to reset your password"}
            </p>
          </div>

          {!sent ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={fieldWrap}>
                <label style={labelStyle}>Email</label>
                <Txt
                  icon={Mail}
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error && <div style={errStyle}>{error}</div>}
              </div>

              <CtaButton label={loading ? "Sending…" : "Send Reset Link"} loading={loading} disabled={loading} />
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
              <div
                style={{
                  fontSize: 12.5, color: "#98a2bd", lineHeight: 1.6,
                  background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                  borderRadius: 10, padding: "12px 14px",
                }}
              >
                Didn't receive the email? Check your spam folder, or try again.
              </div>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="vqlogin-link"
                style={{ background: "none", border: 0, color: "#6ea0ff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
              >
                Resend email
              </button>
            </div>
          )}

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
        </div>
      </div>
    </div>
  );
}
