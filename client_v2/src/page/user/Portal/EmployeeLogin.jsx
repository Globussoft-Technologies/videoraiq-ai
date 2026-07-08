import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Cookies from "js-cookie";
import { Mail, Lock, ShieldCheck, ArrowUpRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/21.jpg";
import { PInput, PEye, PButton, fieldWrap, labelStyle, errStyle } from "./PortalFields";
import { userLogin, forgotPassword } from "@/page/user/Users/api/post/Index";
import "./portal.css";

const url = import.meta.env.VITE_ENV;

/* cookie name matches getAccessToken() / the V1 login flow */
const accessCookieName = () =>
  url === "dev" ? "dev-access-token" : url === "prod" ? "prod-access-token" : "access-token";

const FEATURES = [
  { label: "AI Detection", c: "#3b82f6" },
  { label: "Cloud Storage", c: "#a855f7" },
  { label: "Real-time Alerts", c: "#f59e0b" },
  { label: "4K Streaming", c: "#06b6d4" },
];

const STATS = [
  { v: "99.9%", l: "UPTIME SLA", c: "#0f1729" },
  { v: "24/7", l: "SUPPORT", c: "#0f1729" },
  { v: "AES-256", l: "ENCRYPTION", c: "#22c55e" },
];

/**
 * Employee / user portal login (route: /employee-login). A light-themed page,
 * deliberately separate from the dark admin login at /user-login. The
 * "Login as admin" action bounces to that admin login.
 */
export default function EmployeeLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot-password modal state (mirrors the client folder's ForgotPassword flow).
  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpError, setFpError] = useState("");
  const [fpSubmitting, setFpSubmitting] = useState(false);
  const [fpSent, setFpSent] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openForgot = () => {
    setFpEmail("");
    setFpError("");
    setFpSent(false);
    setFpOpen(true);
  };

  const closeForgot = () => setFpOpen(false);

  const submitForgot = async (e) => {
    e.preventDefault();
    if (!fpEmail.trim()) {
      setFpError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fpEmail)) {
      setFpError("Enter a valid email address");
      return;
    }
    setFpError("");
    try {
      setFpSubmitting(true);
      const response = await forgotPassword({ email: fpEmail });
      setFpSent(true);
      toast.success(response?.data?.body?.message || "Password reset link sent successfully");
    } catch (error) {
      console.error("Forgot password failed:", error);
      toast.error(error?.response?.data?.body?.message || "Failed to send reset email");
    } finally {
      setFpSubmitting(false);
    }
  };

  // Prefill from the saved "remember-me" cookie (identical scheme to the client login).
  useEffect(() => {
    const saved = Cookies.get("remember-me");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm({ login: parsed.usernameOrEmail || "", password: parsed.password || "" });
        setRememberMe(true);
      } catch {
        console.error("Invalid saved credentials");
      }
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.login.trim()) errs.login = "Username or email is required";
    if (!form.password) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      setIsSubmitting(true);
      const response = await userLogin({
        usernameOrEmail: form.login,
        password: form.password,
      });
      if (response?.data?.body?.status === "success") {
        const token = response?.data?.body?.data?.token;
        Cookies.set(accessCookieName(), token, {
          expires: 1,
          secure: window.location.protocol === "https:",
          path: "/",
        });

        if (rememberMe) {
          Cookies.set(
            "remember-me",
            JSON.stringify({ usernameOrEmail: form.login, password: form.password })
          );
        } else {
          Cookies.remove("remember-me");
        }

        toast.success(response?.data?.body?.message || "Signed in");
        navigate("/dashboard");
      } else {
        toast.error(response?.data?.body?.message || "Failed to Login!");
      }
    } catch (error) {
      console.log("Login failed:", error.response?.data || error.message);
      toast.error(error?.response?.data?.body?.message || "Failed to Login!");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="vqp"
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        background: "#ffffff",
        fontFamily: "'IBM Plex Sans',sans-serif",
        color: "#0f1729",
        overflow: "hidden",
      }}
    >
      {/* ============ LEFT HERO ============ */}
      <div
        className="vqp-hero"
        style={{
          flex: 1.25,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "44px 54px",
          minWidth: 0,
          color: "#f4f8ff",
        }}
      >
        {/* photo + tint */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${heroShot})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(115deg,rgba(9,13,24,.93) 26%,rgba(12,18,36,.6) 58%,rgba(18,24,46,.52))",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(120,150,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,150,255,.05) 1px,transparent 1px)",
            backgroundSize: "44px 44px",
            animation: "vqpgrid 7s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 150,
            background: "linear-gradient(180deg,rgba(43,111,219,.18),transparent)",
            animation: "vqpscan 6.5s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        {/* top bar */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src={logo} alt="VideoraIQ" style={{ height: 38, width: "auto", display: "block" }} />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              border: "1px solid rgba(120,160,230,.24)",
              borderRadius: 999,
              background: "rgba(9,13,24,.5)",
              backdropFilter: "blur(6px)",
            }}
          >
            <span style={{ position: "relative", width: 7, height: 7 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid #22c55e", animation: "vqpblip 2.4s ease-out infinite" }} />
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".12em", color: "#cdd7ef" }}>
              SYSTEM ONLINE
            </span>
          </div>
        </div>

        {/* headline */}
        <div style={{ position: "relative", zIndex: 2, maxWidth: 540, animation: "vqpfade .8s ease both .1s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span style={{ width: 26, height: 2, background: "#3b82f6", borderRadius: 2 }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".18em", color: "#9db2f0" }}>
              TRUSTED PLATFORM
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1.08,
              letterSpacing: "-.02em",
              margin: 0,
            }}
          >
            Enterprise-Grade
            <br />
            Surveillance Platform
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#c3ccdf", margin: "18px 0 26px", maxWidth: 460 }}>
            Your secure gateway to live camera feeds, AI-powered detections, and real-time alerts — everything you need
            in one intelligent workspace.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {FEATURES.map((f) => (
              <span
                key={f.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "#dbe2f2",
                  border: "1px solid rgba(120,160,230,.2)",
                  background: "rgba(12,16,26,.42)",
                  borderRadius: 999,
                  padding: "7px 14px",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: f.c }} />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* stats */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 44, animation: "vqpfade .9s ease both .22s" }}>
          {STATS.map((s) => (
            <div key={s.l}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 26, color: s.c === "#0f1729" ? "#f4f8ff" : s.c }}>
                {s.v}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: ".08em", color: "#8e99b6", marginTop: 3 }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ RIGHT PANEL (white) ============ */}
      <div
        className="vqp-panel"
        style={{
          width: 480,
          flex: "0 0 480px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
          background: "#ffffff",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360, animation: "vqpfade .7s ease both .12s" }}>
          {fpOpen ? (
            <div>
              {/* back to login */}
              <button
                type="button"
                onClick={closeForgot}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 0,
                  marginBottom: 30,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "#475569",
                }}
              >
                <ArrowLeft size={16} />
                Back to login
              </button>

              {!fpSent ? (
                <>
                  <div style={{ textAlign: "center", marginBottom: 26 }}>
                    <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", margin: 0, color: "#0f1729" }}>
                      Forgot Password?
                    </h2>
                    <p style={{ fontSize: 13.5, color: "#64748b", margin: "8px 0 0" }}>
                      No worries, we&apos;ll send you reset instructions
                    </p>
                  </div>

                  <form onSubmit={submitForgot} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={fieldWrap}>
                      <label style={labelStyle}>Email Address</label>
                      <PInput
                        icon={Mail}
                        name="fpEmail"
                        type="email"
                        placeholder="you@company.com"
                        value={fpEmail}
                        onChange={(e) => setFpEmail(e.target.value)}
                      />
                      {fpError && <div style={errStyle}>{fpError}</div>}
                    </div>
                    <PButton
                      label={fpSubmitting ? "Sending..." : "Send Reset Instructions"}
                      loading={fpSubmitting}
                      disabled={fpSubmitting}
                    />
                  </form>
                </>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 62, height: 62, margin: "4px auto 18px", borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={32} color="#16a34a" />
                  </div>
                  <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 28, letterSpacing: "-.02em", margin: 0, color: "#0f1729" }}>
                    Check Your Email
                  </h2>
                  <p style={{ fontSize: 13.5, color: "#64748b", margin: "8px 0 20px" }}>
                    We&apos;ve sent password reset instructions to <strong style={{ color: "#0f1729" }}>{fpEmail}</strong>.
                  </p>
                  <div style={{ background: "#f6f8fc", border: "1px solid #e3e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: "#64748b", textAlign: "left", marginBottom: 18 }}>
                    <p style={{ margin: "0 0 3px", fontWeight: 600, color: "#334155" }}>Didn&apos;t receive the email?</p>
                    <p style={{ margin: 0 }}>Check your spam folder or try resending it.</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <PButton label="Resend Email" type="button" onClick={() => setFpSent(false)} />
                    <button
                      type="button"
                      onClick={closeForgot}
                      style={{ height: 46, width: "100%", borderRadius: 12, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14, color: "#475569", background: "#fff", border: "1.5px solid #e3e8f0" }}
                    >
                      Back to Login
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>
          {/* logo + heading */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                position: "relative",
                width: 66,
                height: 66,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                borderRadius: "50%",

              }}
            >
              <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "radial-gradient(circle,rgba(43,111,219,.24),transparent 72%)", animation: "vqpglow 2.4s ease-in-out infinite" }} />
              <img
                src={logo}
                alt="VideoraIQ"
                style={{ position: "relative", width: 66, height: 66, objectFit: "contain", animation: "vqfloatY 3.4s ease-in-out infinite" }}
              />
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                letterSpacing: ".14em",
                color: "#2a6fdb",
                border: "1px solid #cfe0fb",
                background: "#eef5ff",
                borderRadius: 999,
                padding: "4px 12px",
                marginBottom: 14,
              }}
            >
              USER PORTAL
            </span>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 25, letterSpacing: "-.01em", margin: 0, color: "#0f1729" }}>
              Welcome Back
            </h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: "7px 0 0" }}>Sign in to access your user dashboard</p>
          </div>

          {/* form */}
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Username or Email</label>
              <PInput icon={Mail} name="login" placeholder="you@company.com" value={form.login} onChange={set("login")} />
              {errors.login && <div style={errStyle}>{errors.login}</div>}
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Password</label>
              <PInput
                icon={Lock}
                name="password"
                type={showPw ? "text" : "password"}
                placeholder="Enter your password"
                value={form.password}
                onChange={set("password")}
                rightSlot={<PEye shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
              />
              {errors.password && <div style={errStyle}>{errors.password}</div>}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#475569", cursor: "pointer", userSelect: "none" }}
                onClick={() => setRememberMe((v) => !v)}
              >
                <span
                  className="vqp-check"
                  data-checked={rememberMe}
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 5,
                    border: "1px solid #cbd5e1",
                    background: "#f6f8fc",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                >
                  {rememberMe ? "✓" : ""}
                </span>
                Remember me
              </label>
              <span
                className="vqp-link"
                onClick={openForgot}
                style={{ fontSize: 12.5, fontWeight: 600, color: "#3b82f6", cursor: "pointer" }}
              >
                Forgot password?
              </span>
            </div>

            <PButton label={isSubmitting ? "Signing in..." : "Sign In"} loading={isSubmitting} disabled={isSubmitting} />
          </form>

          {/* login as admin */}
          <button
            type="button"
            className="vqp-ghost"
            onClick={() => navigate("/user-login")}
            style={{
              width: "100%",
              height: 44,
              marginTop: 14,
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 600,
              fontSize: 13.5,
              color: "#2a6fdb",
              background: "#eaf1fd",
              border: "1.5px solid #cfe0fb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background .15s,border-color .15s",
            }}
          >
            <ShieldCheck size={16} />
            Login as admin
            <ArrowUpRight size={15} />
          </button>

          <p style={{ textAlign: "center", marginTop: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".08em", color: "#9aa4b8" }}>
            © 2026 VIDEORAIQ · SECURE SESSION
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
