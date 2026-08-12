import { useCallback, useEffect, useState } from "react";
import { useFormik } from "formik";
import { useLocation, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { Mail, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLoginSchema } from "./Schema/UserLoginSchema";
import { userLoginByPass } from "./api/post/Index";
import logo from "@/assets/logo.svg";
import AuthLoader from "./AuthLoader";
import AuthHero from "./AuthHero";
import RegisterForm from "./RegisterForm";
import { Txt, labelStyle, fieldWrap, errStyle, EyeToggle, CtaButton } from "./AuthFields";
import "./login.css";

const url = import.meta.env.VITE_ENV;

/* cookie name matches getAccessToken() / the V1 login flow */
const accessCookieName = () =>
  url === "dev" ? "dev-access-token" : url === "prod" ? "prod-access-token" : "access-token";

const REMEMBER_COOKIE = "admin_remember_me";

const LoginForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState({ usernameOrEmail: "", password: "" });
  const [authenticating, setAuthenticating] = useState(false);

  const isLogin = mode === "login";
  // "/" resolves through routes.jsx's index route (HomeRedirect), which sends
  // the user to the first sidebar item their role can actually view instead
  // of a hardcoded /dashboard some roles don't have access to.
  const redirectTo = location.state?.from?.pathname || "/";

  // Prefill from the saved "admin_remember_me" cookie. Namespaced separately
  // from the user login's cookie so "remember me" on one portal never
  // prefills credentials on the other.
  useEffect(() => {
    const saved = Cookies.get(REMEMBER_COOKIE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.rememberMe === true) {
          setSavedCredentials({
            usernameOrEmail: parsed.usernameOrEmail || "",
            password: parsed.password || "",
          });
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

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      usernameOrEmail: savedCredentials.usernameOrEmail || "",
      password: savedCredentials.password || "",
    },
    validationSchema: userLoginSchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        // aMember login flow (POST /auth/by-login-pass).
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
            Cookies.set(
              REMEMBER_COOKIE,
              JSON.stringify({
                usernameOrEmail: values.usernameOrEmail,
                password: values.password,
                rememberMe: true,
              }),
              {
                expires: 30,
                secure: window.location.protocol === "https:",
                path: "/",
              }
            );
          } else {
            Cookies.remove(REMEMBER_COOKIE);
          }

          setUser?.(result.user); // hydrate user context
          toast.success(result.msg || "Signed in");
          setAuthenticating(true);
        } else {
          toast.error(result?.msg || "Failed to Login!");
          setSubmitting(false);
        }
      } catch (error) {
        console.log("Login failed:", error.response?.data || error.message);
        toast.error(error?.response?.data?.msg || "Invalid email/username or password");
        setSubmitting(false);
      }
    },
  });

  const loading = formik.isSubmitting || authenticating;

  const switchTo = (m) => () => setMode(m);

  // Stable across re-renders so AuthLoader's completion timer (see its effect
  // deps) never restarts mid-animation.
  const handleAuthComplete = useCallback(() => {
    navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo]);

  if (authenticating) {
    return <AuthLoader onComplete={handleAuthComplete} />;
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
      {/* ============ LEFT HERO ============ */}
      <AuthHero />

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
              <div
                style={{
                  position: "relative",
                  width: 66,
                  height: 66,
                  borderRadius: "50%",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 18px rgba(0,0,0,.4)",
                  animation: "vqfloatY 3.4s ease-in-out infinite",
                }}
              >
                <img
                  src={logo}
                  alt="VideoraIQ"
                  style={{ width: 42, height: 42, objectFit: "contain", filter: "grayscale(1)" }}
                />
              </div>
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
          {/* {isLogin ? "Welcome back" : "Create your unt"} */}
              Welcome back 
            </h2>
            <p style={{ fontSize: 13, color: "#98a2bd", margin: "6px 0 0" }}>
              {isLogin ? "Sign in to your VideoraIQ command center" : "Set up your VideoraIQ surveillance workspace"}
            </p>
          </div>

          {/* Sign In / Create Account tab toggle */}
       {/* <div
            style={{
              display: "flex",
              gap: 5,
              padding: 5,
              borderRadius: 12,
              background: "#0e121b",
              border: "1px solid rgba(255,255,255,.07)",
              marginBottom: 20,
            }}
          >
            {[
              { key: "login", label: "Sign In" },
              { key: "register", label: "Create Account" },
            ].map((t) => {
              const active = mode === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={switchTo(t.key)}
                  style={{
                    flex: 1,
                    height: 40,
                    border: 0,
                    borderRadius: 9,
                    cursor: "pointer",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontWeight: 600,
                    fontSize: 13.5,
                    color: active ? "#fff" : "#98a2bd",
                    background: active
                      ? "linear-gradient(135deg,#3b82f6,#7c5cff 55%,#a855f7)"
                      : "transparent",
                    boxShadow: active ? "0 6px 18px rgba(124,92,255,.32)" : "none",
                    transition: "color .15s",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
        /div> */}

          {/* form */}
          {isLogin ? (
            <form
              onSubmit={formik.handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={fieldWrap}>
                <label style={labelStyle}>Username or Email</label>
                <Txt
                  icon={Mail}
                  name="usernameOrEmail"
                  type="text"
                  placeholder="you@company.com"
                  value={formik.values.usernameOrEmail}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.usernameOrEmail && formik.errors.usernameOrEmail && (
                  <div style={errStyle}>{formik.errors.usernameOrEmail}</div>
                )}
              </div>

              <div style={fieldWrap}>
                <label style={labelStyle}>Password</label>
                <Txt
                  icon={Lock}
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  rightSlot={<EyeToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
                />
                {formik.touched.password && formik.errors.password && (
                  <div style={errStyle}>{formik.errors.password}</div>
                )}
              </div>

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
                {/* <span
                  className="vqlogin-link"
                  onClick={() => navigate("/forgot-password")}
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#6ea0ff", cursor: "pointer" }}
                >
                  Forgot password?
                </span> */}
              </div>

              <CtaButton
                label={loading ? "Signing in…" : "Sign In to Dashboard"}
                loading={loading}
                disabled={loading}
              />
            </form>
          ) : (
            <RegisterForm />
          )}

          {/* cross-portal: jump to the employee / user portal login */}
          <div style={{ textAlign: "center", marginTop: 18, fontSize: 12.5, color: "#98a2bd" }}>
            Not an admin?{" "}
            <span
              className="vqlogin-link"
              onClick={() => navigate("/employee-login")}
              style={{ color: "#6ea0ff", cursor: "pointer", fontWeight: 600 }}
            >
              Login as user
            </span>
          </div>

          {/* switch-mode footer */}
      {/* <div style={{ textAlign: "center", marginTop: 18, fontSize: 12.5, color: "#98a2bd" }}>
            {isLogin ? (
              <>
                Don&apos;t have an account?{" "}
                <span
                  className="vqlogin-link"
                  onClick={switchTo("register")}
                  style={{ color: "#6ea0ff", cursor: "pointer", fontWeight: 600 }}
                >
                  Create one
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span
                  className="vqlogin-link"
                  onClick={switchTo("login")}
                  style={{ color: "#6ea0ff", cursor: "pointer", fontWeight: 600 }}
                >
                  Sign in
                </span>
              </>
            )}
       /div> */}
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
              <div
                style={{
                  position: "absolute",
                  inset: 6,
                  borderRadius: "50%",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 14px rgba(0,0,0,.35)",
                }}
              >
                <img
                  src={logo}
                  alt=""
                  style={{ width: 28, height: 28, objectFit: "contain", filter: "grayscale(1) drop-shadow(0 0 8px rgba(59,130,246,.5))" }}
                />
              </div>
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
