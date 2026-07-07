import { useState } from "react";
import { toast } from "sonner";
import { Mail, Lock, User } from "lucide-react";
import { Txt, labelStyle, fieldWrap, errStyle, EyeToggle, CtaButton } from "./AuthFields";

/**
 * Self-service registration form — the right-panel body when the auth screen is
 * in "Create Account" mode. Split out of UserForm to keep that file focused on
 * the login flow + shared shell.
 *
 * There is no public signup endpoint (accounts are provisioned by an admin), so
 * a valid submit just surfaces an informational toast.
 */
export default function RegisterForm() {
  const [reg, setReg] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (key) => (e) => setReg((r) => ({ ...r, [key]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();
    // Validation mirrors the original `client` app (ResetPassword password
    // policy + the aMember signup's 6-char username rule).
    const errs = {};
    if (reg.username.trim().length < 6)
      errs.username = "Please enter valid Username. It must contain at least 6 characters";
    if (!reg.firstName.trim()) errs.firstName = "First name is required";
    if (!reg.lastName.trim()) errs.lastName = "Last name is required";
    if (!reg.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reg.email)) errs.email = "Invalid email format";
    if (!reg.password) errs.password = "Password is required";
    else if (reg.password.length < 8) errs.password = "Password must be at least 8 characters";
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(reg.password))
      errs.password = "Password must contain uppercase, lowercase, number and special character";
    if (!reg.confirmPassword) errs.confirmPassword = "Confirm password is required";
    else if (reg.confirmPassword !== reg.password) errs.confirmPassword = "Passwords must match";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // No public self-service signup endpoint exists — accounts are provisioned
    // by an administrator. Surface that instead of hitting a non-existent API.
    toast.message("Account creation is managed by your administrator.", {
      description: "Please contact your admin to provision a VideoraIQ account.",
    });
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={fieldWrap}>
        <label style={labelStyle}>Choose a Username</label>
        <Txt icon={User} name="username" placeholder="Enter a Username" value={reg.username} onChange={set("username")} />
        {errors.username && <div style={errStyle}>{errors.username}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>First Name</label>
        <Txt name="firstName" placeholder="Enter First Name" value={reg.firstName} onChange={set("firstName")} />
        {errors.firstName && <div style={errStyle}>{errors.firstName}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Last Name</label>
        <Txt name="lastName" placeholder="Enter Last Name" value={reg.lastName} onChange={set("lastName")} />
        {errors.lastName && <div style={errStyle}>{errors.lastName}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Your E-Mail Address</label>
        <Txt icon={Mail} name="email" type="email" placeholder="Enter E-Mail Address" value={reg.email} onChange={set("email")} />
        {errors.email && <div style={errStyle}>{errors.email}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Choose a Password</label>
        <Txt
          icon={Lock}
          name="password"
          type={showPw ? "text" : "password"}
          placeholder="Enter a Password"
          value={reg.password}
          onChange={set("password")}
          rightSlot={<EyeToggle shown={showPw} onToggle={() => setShowPw((s) => !s)} />}
        />
        {errors.password && <div style={errStyle}>{errors.password}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Confirm Your Password</label>
        <Txt
          icon={Lock}
          name="confirmPassword"
          type={showConfirmPw ? "text" : "password"}
          placeholder="Confirm Password"
          value={reg.confirmPassword}
          onChange={set("confirmPassword")}
          rightSlot={<EyeToggle shown={showConfirmPw} onToggle={() => setShowConfirmPw((s) => !s)} />}
        />
        {errors.confirmPassword && <div style={errStyle}>{errors.confirmPassword}</div>}
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: "#98a2bd", lineHeight: 1.5, margin: "6px 0 0" }}>
        By creating an account, you agree to our{" "}
        <span style={{ color: "#6ea0ff", fontWeight: 600 }}>Terms of Use</span> and{" "}
        <span style={{ color: "#6ea0ff", fontWeight: 600 }}>Privacy Policy</span>.
      </p>

      <CtaButton label="Create Account" />
    </form>
  );
}
