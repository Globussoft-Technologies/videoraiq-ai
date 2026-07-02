import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import { useLocation, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLoginSchema } from "./Schema/UserLoginSchema";
import { userLoginByPass } from "./api/post";
import logo from "@/assets/logo.svg";
import "./login.css";

const url = import.meta.env.VITE_ENV;

/* cookie name matches getAccessToken() / the V1 login flow */
const accessCookieName = () =>
  url === "dev" ? "dev-access-token" : url === "prod" ? "prod-access-token" : "access-token";

/* ------- left hero: animated CCTV-style montage (no external images) ------- */
const CAM_TINTS = [
  "linear-gradient(135deg,#0f1b2e,#142235)",
  "linear-gradient(135deg,#1a1430,#241a3a)",
  "linear-gradient(135deg,#0e2430,#13303a)",
  "linear-gradient(135deg,#231526,#301a2c)",
];
function CctvColumn({ nums, anim, dotColor }) {
  const tiles = nums.concat(nums); // duplicate for a seamless loop
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: anim }}>
        {tiles.map((n, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              aspectRatio: "16 / 10",
              borderRadius: 11,
              overflow: "hidden",
              border: "1px solid rgba(120,160,230,.16)",
              background: CAM_TINTS[n % CAM_TINTS.length],
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 7,
                left: 8,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 8.5,
                color: "#dbe6fb",
                background: "rgba(6,9,14,.6)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              CAM-{String(n).padStart(3, "0")}
            </span>
            {dotColor && (
              <span
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: dotColor,
                  boxShadow: `0 0 7px ${dotColor}`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------- a single styled text input (icon + field) ------- */
function Txt({ icon: Icon, rightSlot, ...props }) {
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

const labelStyle = { fontSize: 12, fontWeight: 500, color: "#b8c2db" };
const fieldWrap = { display: "flex", flexDirection: "column", gap: 6 };

const LoginForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState({ usernameOrEmail: "", password: "" });

  const isLogin = mode === "login";
  const redirectTo = location.state?.from?.pathname || "/v2";

  // Prefill from the saved "remember-me" cookie (identical scheme to V1).
  useEffect(() => {
    const saved = Cookies.get("remember-me");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedCredentials(parsed);
        setRememberMe(true);
      } catch {
        console.error("Invalid saved credentials");
      }
    }
  }, []);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      usernameOrEmail: savedCredentials.usernameOrEmail || "",
      password: savedCredentials.password || "",
    },
    validationSchema: userLoginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // aMember login flow (POST /auth/by-login-pass) — the endpoint that
        // actually authenticates these users. Returns { ok, msg, token, user }.
        const response = await userLoginByPass({
          login: values.usernameOrEmail,
          pass: values.password,
        });
        const result = response?.data;

        if (result?.ok && result?.token) {
          // V1 hardcodes secure:true; we only require it over HTTPS so the
          // standalone app also works on http://localhost during dev.
          Cookies.set(accessCookieName(), result.token, {
            expires: 1,
            secure: window.location.protocol === "https:",
            path: "/",
          });

          if (rememberMe) {
            Cookies.set("remember-me", JSON.stringify(values));
          } else {
            Cookies.remove("remember-me");
          }

          setUser?.(result.user); // hydrate user context
          toast.success(result.msg || "Signed in");
          navigate(redirectTo, { replace: true });
        } else {
          toast.error(result?.msg || "Failed to Login!");
        }
      } catch (error) {
        console.log("Login failed:", error.response?.data || error.message);
        toast.error(error?.response?.data?.msg || "Invalid email/username or password");
      } finally {
        setSubmitting(false);
      }
    },
  });

  const loading = formik.isSubmitting;

  const tabBase = {
    flex: 1,
    textAlign: "center",
    padding: "9px 0",
    borderRadius: 9,
    fontFamily: "'Space Grotesk',sans-serif",
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    transition: "all .18s",
  };
  const tabOn = {
    ...tabBase,
    color: "#fff",
    background: "linear-gradient(135deg,rgba(59,130,246,.9),rgba(168,85,247,.9))",
    boxShadow: "0 6px 16px rgba(74,108,247,.3)",
  };
  const tabOff = { ...tabBase, color: "#8e99b6", background: "transparent" };

  const colA = useMemo(() => [1, 4, 7, 10, 13, 16, 19, 22], []);
  const colB = useMemo(() => [2, 5, 8, 11, 14, 17, 20, 23], []);
  const colC = useMemo(() => [3, 6, 9, 12, 15, 18, 21, 24], []);

  const onRegister = (e) => {
    e.preventDefault();
    toast.message("Account creation is managed by your administrator.");
  };

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
      {/* ============ LEFT HERO ============ */}
      <div
        className="vqlogin-hero"
        style={{
          flex: 1.18,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "46px 50px",
          minWidth: 0,
        }}
      >
        {/* CCTV montage */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 12,
            padding: 10,
            opacity: 0.34,
          }}
        >
          <CctvColumn nums={colA} anim="vqmUp 34s linear infinite" dotColor="#ff4d4d" />
          <CctvColumn nums={colB} anim="vqmDn 40s linear infinite" />
          <CctvColumn nums={colC} anim="vqmUp 46s linear infinite" dotColor="#22c55e" />
        </div>

        {/* scrim + grid + scan + glows */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(115deg,rgba(7,9,13,.93) 30%,rgba(7,9,13,.55) 62%,rgba(7,9,13,.86))",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(120,150,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,150,255,.05) 1px,transparent 1px)",
            backgroundSize: "46px 46px",
            animation: "vqgridpan 7s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 160,
            top: 0,
            background: "linear-gradient(180deg,rgba(59,130,246,.16),transparent)",
            animation: "vqscan 6.5s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(168,85,247,.20),transparent 70%)",
            filter: "blur(8px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -150,
            left: -90,
            width: 440,
            height: 440,
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(59,130,246,.18),transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        {/* detection boxes */}
        <div
          style={{
            position: "absolute",
            left: "20%",
            top: "34%",
            width: 120,
            height: 92,
            border: "1.6px solid rgba(34,197,94,.85)",
            borderRadius: 4,
            animation: "vqbox 3.4s ease-in-out infinite",
            boxShadow: "0 0 18px rgba(34,197,94,.25)",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -17,
              left: -1,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 8.5,
              color: "#0a1410",
              background: "#22c55e",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            PERSON 98%
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: "58%",
            top: "54%",
            width: 96,
            height: 74,
            border: "1.6px solid rgba(59,130,246,.85)",
            borderRadius: 4,
            animation: "vqbox 3.4s ease-in-out infinite .9s",
            boxShadow: "0 0 18px rgba(59,130,246,.25)",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -17,
              left: -1,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 8.5,
              color: "#06101e",
              background: "#3b82f6",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            VEHICLE 94%
          </span>
        </div>

        {/* brand */}
        <div
          style={{
            position: "relative",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: 13,
            animation: "vqfade .7s ease both",
          }}
        >
          <img src={logo} alt="VideoraIQ" style={{ height: 40, width: "auto", display: "block" }} />
        </div>

        {/* headline */}
        <div style={{ position: "relative", zIndex: 3, maxWidth: 520, animation: "vqfade .8s ease both .12s" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 13px",
              border: "1px solid rgba(120,160,230,.22)",
              borderRadius: 999,
              background: "rgba(12,16,26,.5)",
              backdropFilter: "blur(6px)",
              marginBottom: 22,
            }}
          >
            <span style={{ position: "relative", width: 7, height: 7 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e" }} />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1.5px solid #22c55e",
                  animation: "vqblip 2.4s ease-out infinite",
                }}
              />
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                letterSpacing: ".12em",
                color: "#aeb9d4",
              }}
            >
              AI VISION ENGINE · ONLINE
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 700,
              fontSize: 46,
              lineHeight: 1.06,
              letterSpacing: "-.02em",
              margin: 0,
              color: "#f4f8ff",
            }}
          >
            See everything.
            <br />
            Miss nothing.
          </h1>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#aab4cf", margin: "18px 0 0", maxWidth: 430 }}>
            Unified command for real-time AI surveillance — multi-site video, face &amp; ANPR recognition, and
            threat detection in a single intelligent console.
          </p>
        </div>

        {/* stats */}
        <div style={{ position: "relative", zIndex: 3, animation: "vqfade .9s ease both .24s" }}>
          <div style={{ display: "flex", gap: 30, marginBottom: 20 }}>
            {[
              { v: "1,310", l: "Cameras online", c: "#f4f8ff" },
              { v: "42", l: "AI detection models", c: "#f4f8ff" },
              { v: "99.98%", l: "Platform uptime", c: "#22c55e" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 30 }}>
                {i > 0 && <div style={{ width: 1, background: "rgba(255,255,255,.09)" }} />}
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 25, color: s.c }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#8e99b6", marginTop: 1 }}>{s.l}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Real-time AI detection", "ANPR & Vehicle", "Face & Watchlist", "Multi-site command"].map((f) => (
              <span
                key={f}
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10,
                  letterSpacing: ".04em",
                  color: "#9fa9c6",
                  border: "1px solid rgba(120,160,230,.18)",
                  background: "rgba(12,16,26,.45)",
                  borderRadius: 7,
                  padding: "5px 10px",
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ RIGHT AUTH ============ */}
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
        <div
          style={{
            position: "absolute",
            top: -90,
            right: -60,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(168,85,247,.16),transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", width: "100%", maxWidth: 392, animation: "vqfade .7s ease both .1s" }}>
          {/* logo + heading */}
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
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p style={{ fontSize: 13, color: "#98a2bd", margin: "6px 0 0" }}>
              {isLogin ? "Sign in to your VideoraIQ command center" : "Set up your VideoraIQ surveillance workspace"}
            </p>
          </div>

          {/* tab toggle */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: 4,
              background: "#11151f",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 12,
              marginBottom: 22,
            }}
          >
            <div onClick={() => !loading && setMode("login")} style={isLogin ? tabOn : tabOff}>
              Sign In
            </div>
            <div onClick={() => !loading && setMode("register")} style={!isLogin ? tabOn : tabOff}>
              Create Account
            </div>
          </div>

          {/* form */}
          <form
            onSubmit={isLogin ? formik.handleSubmit : onRegister}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            {!isLogin && (
              <>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Full name</label>
                  <Txt name="name" placeholder="Aarav Sharma" />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Organization</label>
                  <Txt name="org" placeholder="Acme Security Pvt Ltd" />
                </div>
              </>
            )}

            <div style={fieldWrap}>
              <label style={labelStyle}>{isLogin ? "Username or Email" : "Work email"}</label>
              <Txt
                icon={Mail}
                name={isLogin ? "usernameOrEmail" : "email"}
                type={isLogin ? "text" : "email"}
                placeholder="you@company.com"
                value={isLogin ? formik.values.usernameOrEmail : undefined}
                onChange={isLogin ? formik.handleChange : undefined}
                onBlur={isLogin ? formik.handleBlur : undefined}
              />
              {isLogin && formik.touched.usernameOrEmail && formik.errors.usernameOrEmail && (
                <div style={{ fontSize: 11.5, color: "#f87171", marginLeft: 2 }}>{formik.errors.usernameOrEmail}</div>
              )}
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Password</label>
              <Txt
                icon={Lock}
                name="password"
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={isLogin ? formik.values.password : undefined}
                onChange={isLogin ? formik.handleChange : undefined}
                onBlur={isLogin ? formik.handleBlur : undefined}
                rightSlot={
                  <div
                    className="vqlogin-eye"
                    onClick={() => setShowPw((s) => !s)}
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
                    {showPw ? <Eye size={17} /> : <EyeOff size={17} />}
                  </div>
                }
              />
              {isLogin && formik.touched.password && formik.errors.password && (
                <div style={{ fontSize: 11.5, color: "#f87171", marginLeft: 2 }}>{formik.errors.password}</div>
              )}
            </div>

            {isLogin && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12.5,
                    color: "#aab4cf",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick={() => setRememberMe((v) => !v)}
                >
                  <span
                    className="vqlogin-check"
                    data-checked={rememberMe}
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 5,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "#11151f",
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
                  className="vqlogin-link"
                  onClick={() => toast.message("Use the forgot-password flow on the main app.")}
                  style={{ fontSize: 12.5, fontWeight: 500, color: "#6ea0ff", cursor: "pointer" }}
                >
                  Forgot password?
                </span>
              </div>
            )}

            {!isLogin && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 9,
                  fontSize: 12,
                  color: "#aab4cf",
                  cursor: "pointer",
                  lineHeight: 1.5,
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    width: 17,
                    height: 17,
                    borderRadius: 5,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "#11151f",
                    display: "inline-block",
                    flex: "0 0 auto",
                    marginTop: 1,
                  }}
                />
                <span>
                  I agree to the <span style={{ color: "#6ea0ff" }}>Terms of Service</span> and{" "}
                  <span style={{ color: "#6ea0ff" }}>Privacy Policy</span>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
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
              <span style={{ position: "relative" }}>
                {loading ? "Signing in…" : isLogin ? "Sign In to Dashboard" : "Create Account"}
              </span>
              {!loading && <ArrowRight size={17} style={{ position: "relative" }} />}
            </button>
          </form>

          {/* switch */}
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#98a2bd" }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <span
              className="vqlogin-link"
              onClick={() => !loading && setMode(isLogin ? "register" : "login")}
              style={{ color: "#6ea0ff", fontWeight: 600, cursor: "pointer" }}
            >
              {isLogin ? "Create one" : "Sign in"}
            </span>
          </div>
        </div>

        {/* loading overlay */}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              background: "rgba(8,11,17,.86)",
              backdropFilter: "blur(7px)",
            }}
          >
            <div style={{ position: "relative", width: 60, height: 60 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(255,255,255,.10)" }} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "3px solid transparent",
                  borderTopColor: "#7c5cff",
                  borderRightColor: "#3b82f6",
                  animation: "vqspin .8s linear infinite",
                }}
              />
              <img src={logo} alt="" style={{ position: "absolute", inset: 14, width: 32, height: 32, objectFit: "contain" }} />
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "#cbd4ea", letterSpacing: ".02em" }}>
              Authenticating…
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#6a7491" }}>
              Establishing secure session
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginForm;
