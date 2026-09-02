import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Cookies from "js-cookie";
import { Mail, Lock, ShieldCheck, ArrowUpRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/21.jpg";
import { PInput, PEye, PButton } from "./PortalFields";
import { userLogin, forgotPassword } from "@/page/user/Users/api/post/Index";
import AuthLoader from "@/page/user/Users/AuthLoader";
import { setSessionId } from "@/utils/sessionIdentity";
import "./portal.css";

const url = import.meta.env.VITE_ENV;

/* cookie name matches getAccessToken() / the V1 login flow */
const accessCookieName = () =>
  url === "dev" ? "dev-access-token" : url === "prod" ? "prod-access-token" : "access-token";

const envValue = (key) => String(import.meta.env[key] || "").trim();
const isLocalSetup = () => envValue("VITE_LOCAL_SETUP").toLowerCase() === "true";

const adminLoginUrl = () => {
  const frontendUrl = envValue("VITE_FRONTEND").replace(/\/+$/, "");

  if (!isLocalSetup() && frontendUrl === "https://pridehonda.videoraiq.com") {
    return `${frontendUrl}/admin-login`;
  }

  if (!isLocalSetup()) {
    const loginUrl = envValue("VITE_AMEMBER_LOGIN_URL");
    if (loginUrl) return loginUrl;

    const memberUrl = envValue("VITE_AMEMBER_MEMBER_URL");
    if (memberUrl) return memberUrl.replace(/\/member\/?$/, "/login");
  }

  return "/admin-login";
};

const REMEMBER_COOKIE = "user_remember_me";

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
 * deliberately separate from the dark admin login at /admin-login.
 */
export default function EmployeeLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  // Forgot-password state (mirrors the client folder's ForgotPassword flow).
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

  // Prefill from the saved "user_remember_me" cookie. Namespaced separately
  // from the admin login's cookie so "remember me" on one portal never
  // prefills credentials on the other.
  useEffect(() => {
    const saved = Cookies.get(REMEMBER_COOKIE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.rememberMe === true) {
          setForm({ login: parsed.usernameOrEmail || "", password: parsed.password || "" });
          setRememberMe(true);
        } else {
          Cookies.remove(REMEMBER_COOKIE);
        }
      } catch {
        Cookies.remove(REMEMBER_COOKIE);
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
        setSessionId(response?.data?.body?.data?.sessionId);
        Cookies.set(accessCookieName(), token, {
          expires: 1,
          secure: window.location.protocol === "https:",
          path: "/",
        });

        if (rememberMe) {
          Cookies.set(
            REMEMBER_COOKIE,
            JSON.stringify({ usernameOrEmail: form.login, password: form.password, rememberMe: true }),
            {
              expires: 30,
              secure: window.location.protocol === "https:",
              path: "/",
            }
          );
        } else {
          Cookies.remove(REMEMBER_COOKIE);
        }

        toast.success(response?.data?.body?.message || "Signed in");
        setAuthenticating(true);
      } else {
        toast.error(response?.data?.body?.message || "Failed to Login!");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.log("Login failed:", error.response?.data || error.message);
      toast.error(error?.response?.data?.body?.message || "Failed to Login!");
      setIsSubmitting(false);
    }
  };

  // Stable across re-renders so AuthLoader's completion timer (see its effect
  // deps) never restarts mid-animation — same fix applied to the admin login.
  const handleAuthComplete = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  if (authenticating) {
    return <AuthLoader onComplete={handleAuthComplete} />;
  }

  return (
    <div className="vqp flex min-h-screen w-full bg-white font-['IBM_Plex_Sans',sans-serif] text-[#0f1729] overflow-hidden">
      {/* ============ LEFT HERO ============ */}
      <div className="vqp-hero flex-[1.25] relative overflow-hidden flex flex-col justify-between py-[44px] px-[54px] min-w-0 text-[#f4f8ff]">
        {/* photo + tint */}
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroShot})` }} />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(9,13,24,0.93)_26%,rgba(12,18,36,0.6)_58%,rgba(18,24,46,0.52))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(120,150,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(120,150,255,0.05)_1px,transparent_1px)] bg-[length:44px_44px] animate-[vqpgrid_7s_linear_infinite]" />
        <div className="absolute left-0 right-0 top-0 h-[150px] bg-[linear-gradient(180deg,rgba(43,111,219,0.18),transparent)] animate-[vqpscan_6.5s_ease-in-out_infinite] pointer-events-none" />

        {/* top bar */}
        <div className="relative z-[2] flex items-center justify-between">
          <img src={logo} alt="VideoraIQ" className="h-[38px] w-auto block" />
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-[rgba(120,160,230,0.24)] rounded-full bg-[rgba(9,13,24,0.5)] backdrop-blur-[6px]">
            <span className="relative w-[7px] h-[7px]">
              <span className="absolute inset-0 rounded-full bg-[#22c55e]" />
              <span className="absolute inset-0 rounded-full border-[1.5px] border-solid border-[#22c55e] animate-[vqpblip_2.4s_ease-out_infinite]" />
            </span>
            <span className="font-['JetBrains_Mono',monospace] text-[10.5px] tracking-[0.12em] text-[#cdd7ef]">
              SYSTEM ONLINE
            </span>
          </div>
        </div>

        {/* headline */}
        <div className="relative z-[2] max-w-[540px] animate-[vqpfade_0.8s_ease_both_0.1s]">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-[26px] h-0.5 bg-[#3b82f6] rounded-[2px]" />
            <span className="font-['JetBrains_Mono',monospace] text-[11px] tracking-[0.18em] text-[#9db2f0]">
              TRUSTED PLATFORM
            </span>
          </div>
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-[44px] leading-[1.08] tracking-[-0.02em] m-0">
            Enterprise-Grade
            <br />
            Surveillance Platform
          </h1>
          <p className="text-[15px] leading-[1.6] text-[#c3ccdf] mt-[18px] mb-[26px] max-w-[460px]">
            Your secure gateway to live camera feeds, AI-powered detections, and real-time alerts — everything you need
            in one intelligent workspace.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {FEATURES.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#dbe2f2] border border-[rgba(120,160,230,0.2)] bg-[rgba(12,16,26,0.42)] rounded-full px-[14px] py-[7px]"
              >
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: f.c }} />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* stats */}
        <div className="relative z-[2] flex gap-11 animate-[vqpfade_0.9s_ease_both_0.22s]">
          {STATS.map((s) => (
            <div key={s.l}>
              <div
                className="font-['Space_Grotesk',sans-serif] font-bold text-[26px]"
                style={{ color: s.c === "#0f1729" ? "#f4f8ff" : s.c }}
              >
                {s.v}
              </div>
              <div className="font-['JetBrains_Mono',monospace] text-[10px] tracking-[0.08em] text-[#8e99b6] mt-[3px]">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ RIGHT PANEL (white) ============ */}
      <div className="vqp-panel w-[480px] flex-[0_0_480px] relative flex items-center justify-center p-10 bg-white">
        <div className="w-full max-w-[360px] animate-[vqpfade_0.7s_ease_both_0.12s]">
          {fpOpen ? (
            <div>
              {/* back to login */}
              <button
                type="button"
                onClick={closeForgot}
                className="inline-flex items-center gap-2 p-0 mb-[30px] bg-transparent border-0 cursor-pointer text-[13.5px] font-semibold text-[#475569]"
              >
                <ArrowLeft size={16} />
                Back to login
              </button>

              {!fpSent ? (
                <>
                  <div className="text-center mb-[26px]">
                    <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[30px] tracking-[-0.02em] m-0 text-[#0f1729]">
                      Forgot Password?
                    </h2>
                    <p className="text-[13.5px] text-[#64748b] mt-2 mb-0">
                      No worries, we&apos;ll send you reset instructions
                    </p>
                  </div>

                  <form onSubmit={submitForgot} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-[7px]">
                      <label className="text-[12.5px] font-semibold text-[#334155]">Email Address</label>
                      <PInput
                        icon={Mail}
                        name="fpEmail"
                        type="email"
                        placeholder="you@company.com"
                        value={fpEmail}
                        onChange={(e) => setFpEmail(e.target.value)}
                      />
                      {fpError && <div className="text-[11.5px] text-[#dc2626] mt-px">{fpError}</div>}
                    </div>
                    <PButton
                      label={fpSubmitting ? "Sending..." : "Send Reset Instructions"}
                      loading={fpSubmitting}
                      disabled={fpSubmitting}
                    />
                  </form>
                </>
              ) : (
                <div className="text-center">
                  <div className="w-[62px] h-[62px] mx-auto mt-1 mb-[18px] rounded-full bg-[#dcfce7] flex items-center justify-center">
                    <CheckCircle2 size={32} color="#16a34a" />
                  </div>
                  <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[28px] tracking-[-0.02em] m-0 text-[#0f1729]">
                    Check Your Email
                  </h2>
                  <p className="text-[13.5px] text-[#64748b] mt-2 mb-5">
                    We&apos;ve sent password reset instructions to <strong className="text-[#0f1729]">{fpEmail}</strong>.
                  </p>
                  <div className="bg-[#f6f8fc] border border-[#e3e8f0] rounded-[12px] px-[14px] py-3 text-[12.5px] text-[#64748b] text-left mb-[18px]">
                    <p className="mt-0 mb-[3px] font-semibold text-[#334155]">Didn&apos;t receive the email?</p>
                    <p className="m-0">Check your spam folder or try resending it.</p>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <PButton label="Resend Email" type="button" onClick={() => setFpSent(false)} />
                    <button
                      type="button"
                      onClick={closeForgot}
                      className="h-[46px] w-full rounded-[12px] cursor-pointer font-['Space_Grotesk',sans-serif] font-semibold text-[14px] text-[#475569] bg-white border-[1.5px] border-solid border-[#e3e8f0]"
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
              <div className="flex flex-col items-center text-center mb-6">
                <div className="relative w-[66px] h-[66px] flex items-center justify-center mb-4 rounded-full">
                  <div className="absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgba(43,111,219,0.24),transparent_72%)] animate-[vqpglow_2.4s_ease-in-out_infinite]" />
                  <img
                    src={logo}
                    alt="VideoraIQ"
                    className="relative w-[66px] h-[66px] object-contain animate-[vqfloatY_3.4s_ease-in-out_infinite]"
                  />
                </div>
                <span className="font-['JetBrains_Mono',monospace] text-[10.5px] tracking-[0.14em] text-[#2a6fdb] border border-[#cfe0fb] bg-[#eef5ff] rounded-full px-3 py-1 mb-[14px]">
                  USER PORTAL
                </span>
                <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[25px] tracking-[-0.01em] m-0 text-[#0f1729]">
                  Welcome Back
                </h2>
                <p className="text-[13px] text-[#64748b] mt-[7px] mb-0">Sign in to access your user dashboard</p>
              </div>

              {/* form */}
              <form onSubmit={onSubmit} className="flex flex-col gap-[15px]">
                <div className="flex flex-col gap-[7px]">
                  <label className="text-[12.5px] font-semibold text-[#334155]">Username or Email</label>
                  <PInput icon={Mail} name="login" placeholder="you@company.com" value={form.login} onChange={set("login")} />
                  {errors.login && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.login}</div>}
                </div>

                <div className="flex flex-col gap-[7px]">
                  <label className="text-[12.5px] font-semibold text-[#334155]">Password</label>
                  <PInput
                    icon={Lock}
                    name="password"
                    type={showPw ? "text" : "password"}
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={set("password")}
                    rightSlot={<PEye shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                  />
                  {errors.password && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.password}</div>}
                </div>

                <div className="flex items-center justify-between">
                  <label
                    className="flex items-center gap-2 text-[12.5px] text-[#475569] cursor-pointer select-none"
                    onClick={() => setRememberMe((v) => !v)}
                  >
                    <span
                      className="vqp-check w-[17px] h-[17px] rounded-[5px] border border-[#cbd5e1] bg-[#f6f8fc] inline-flex items-center justify-center text-white text-[11px] leading-none"
                      data-checked={rememberMe}
                    >
                      {rememberMe ? "✓" : ""}
                    </span>
                    Remember me
                  </label>
                  {/* <span
                    className="vqp-link text-[12.5px] font-semibold text-[#3b82f6] cursor-pointer"
                    onClick={openForgot}
                  >
                    Forgot password?
                  </span> */}
                </div>

                <PButton label={isSubmitting ? "Signing in..." : "Sign In"} loading={isSubmitting} disabled={isSubmitting} />
              </form>

              {/* login as admin */}
              <button
                type="button"
                className="vqp-ghost w-full h-11 mt-[14px] rounded-[12px] cursor-pointer font-['Space_Grotesk',sans-serif] font-semibold text-[13.5px] text-[#2a6fdb] bg-[#eaf1fd] border-[1.5px] border-solid border-[#cfe0fb] flex items-center justify-center gap-2 transition-[background,border-color] duration-150"
                onClick={() => {
                  const target = adminLoginUrl();
                  if (/^https?:\/\//i.test(target)) window.location.assign(target);
                  else navigate(target);
                }}
              >
                <ShieldCheck size={16} />
                Login as admin
                <ArrowUpRight size={15} />
              </button>

              <p className="text-center mt-[14px] font-['JetBrains_Mono',monospace] text-[10.5px] tracking-[0.08em] text-[#9aa4b8]">
                © 2026 VIDEORAIQ · SECURE SESSION
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
