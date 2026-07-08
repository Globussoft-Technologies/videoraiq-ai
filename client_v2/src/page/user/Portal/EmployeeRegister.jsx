import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Image as ImageIcon, Info } from "lucide-react";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/7.jpg";
import { PInput, PSelect, PButton, fieldWrap, labelStyle, errStyle } from "./PortalFields";
import { fetchDepartments, getEmployeeLocations, isEmailExist, createAuthorizedUser } from "@/pages/RegisterUser/Api";
import "./portal.css";

const STEPS = [
  { n: 1, label: "Details" },
  { n: 2, label: "Photos" },
];

/* Guided face-capture slots — the recognition backend expects a front shot
   plus both profiles, so each pose gets its own labelled slot. */
const PHOTO_SLOTS = [
  { key: "front", hint: "Front", label: "Front" },
  { key: "left", hint: "Left", label: "Left profile" },
  { key: "right", hint: "Right", label: "Right profile" },
];

/* Onboarding token for the public portal. This page runs without a login
   session/cookie, so the department & location lookups are authenticated with
   an explicit long-lived token (same approach as the `client` EmployeeRegister). */
 const AUTH_TOKEN =
    'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdGF0dXMiOnRydWUsInVzZXJfaWQiOjM3LCJsb2dpbiI6ImR1YmFpZ29sZiIsImFkbWluSWQiOiI2YTA0NDJiMmFkOGQzYjNkZjFhZDljZTciLCJvcmdJZCI6bnVsbCwidXNlcl9uYW1lIjoiRHViYWkgR29sZiIsInVzZXJfZW1haWwiOiJkdWJhaWdvbGZAZ21haWwuY29tIiwibmFtZV9mIjoiRHViYWkiLCJuYW1lX2wiOiJHb2xmIiwidXNlclN1YnNjcmlwdGlvblR5cGUiOnsiMyI6IjIwMzYtMDUtMzAifSwiY3JlYXRlZF9mcm9tIjoiRU1QIiwiY3JlYXRlZEF0IjoiMjAyNi0wNS0xM1QwOToyMTo1NC4wMjZaIiwiZW5hYmxlUGhvbmVSZWNpcGllbnRzIjpmYWxzZSwiaWF0IjoxNzc4ODI5MjQwLCJleHAiOjE4NzM0MzcyNDB9.7rjNka_6iuYd028HDdHO7mC-AN82L28hCAYdH11ZU0qWW4wunK2k6-Sn3NorzYdXaz8WM3vuYp8LaOwMDfD6-Q';

export default function EmployeeRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    designation: "",
    location: "",
    department: "",
  });
  const [photos, setPhotos] = useState({});
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /* Load the register-form metadata (departments + employee locations) from the
     same endpoints RegisterUser uses; the onboarding token is passed explicitly
     since this public page has no login session. */
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await fetchDepartments(0, 100, "", AUTH_TOKEN);
        if (res?.data?.body?.status === "success") {
          setDepartments(res.data.body.data.data || []);
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      }
    };

    const loadLocations = async () => {
      try {
        const res = await getEmployeeLocations(AUTH_TOKEN);
        const locs = res?.data?.body?.data?.locations || [];
        setLocations(locs.map((l) => l.locationName).filter(Boolean));
      } catch (err) {
        console.error("Failed to load locations:", err);
      }
    };

    loadDepartments();
    loadLocations();
  }, []);

  const validateDetails = () => {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required";
    if (!form.lastName.trim()) errs.lastName = "Last name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email format";
    if (!form.designation.trim()) errs.designation = "Designation is required";
    if (!form.department) errs.department = "Department is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onContinue = async (e) => {
    e.preventDefault();
    if (!validateDetails()) return;
    // Block advancing if the email is already registered (same as the client flow).
    try {
      const res = await isEmailExist(form.email, AUTH_TOKEN);
      if (res?.data?.body?.data?.exists === true) {
        toast.error("Email already exists");
        return;
      }
    } catch (err) {
      console.error("Failed to validate email:", err);
      toast.error("Failed to validate email");
      return;
    }
    setStep(2);
  };

  const onPickPhoto = (key) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Please upload only JPG or PNG images");
      e.target.value = "";
      return;
    }
    // Keep the actual File — it's what gets uploaded on submit.
    setPhotos((p) => ({ ...p, [key]: { file, name: file.name, url: URL.createObjectURL(file) } }));
    e.target.value = "";
  };

  const removePhoto = (key) => {
    if (isSubmitting) return;
    setPhotos((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  };

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", email: "", designation: "", location: "", department: "" });
    setPhotos({});
    setErrors({});
    setStep(1);
  };

  const onSubmit = async () => {
    const missing = PHOTO_SLOTS.filter((s) => !photos[s.key]);
    if (missing.length) {
      toast.error("Please add all 3 photos — front, left, and right profile.");
      return;
    }

    const formData = new FormData();
    formData.append("firstName", form.firstName);
    formData.append("lastName", form.lastName);
    formData.append("email", form.email);
    formData.append("designation", form.designation);
    formData.append("location", form.location);
    formData.append("departmentId", form.department);
    PHOTO_SLOTS.forEach((s) => {
      const pic = photos[s.key];
      if (pic?.file) formData.append("file", pic.file);
    });

    try {
      setIsSubmitting(true);
      const data = await createAuthorizedUser(formData, AUTH_TOKEN);
      if (data?.body?.status !== "success") {
        toast.error(data?.body?.error || data?.body?.message || "Failed to register");
        return;
      }
      toast.success("Registered successfully!");
      resetForm();
      setRegistered(true);
    } catch (err) {
      console.error("Registration failed:", err);
      const msg =
        err?.response?.data?.body?.error ||
        err?.response?.data?.body?.message ||
        err?.message ||
        "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div
        className="vqp"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100%",
          padding: 24,
          background: "linear-gradient(180deg,#fbfcff,#f5f7fc)",
          fontFamily: "'IBM Plex Sans',sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #eceff5",
            borderRadius: 18,
            padding: "40px 32px",
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 18px 46px rgba(24,39,75,.08)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 20px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg,#2a6fdb,#0891b2)",
              boxShadow: "0 10px 24px rgba(43,111,219,.32)",
            }}
          >
            <Check size={30} color="#fff" strokeWidth={2.5} />
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", margin: "0 0 8px", color: "#0f1729" }}>
            Thank you!
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>
            Your registration was submitted successfully.
          </p>
          <button
            type="button"
            onClick={() => setRegistered(false)}
            style={{
              height: 46,
              padding: "0 26px",
              border: 0,
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "'Space Grotesk',sans-serif",
              fontWeight: 600,
              fontSize: 14,
              color: "#fff",
              background: "#0f2744",
            }}
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

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
      {/* ============ LEFT: FORM ============ */}
      <div
        style={{
          flex: 1.35,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 40px",
          background: "linear-gradient(180deg,#fbfcff,#f5f7fc)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 470, animation: "vqpfade .7s ease both .1s" }}>
          {/* heading */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                position: "relative",
                width: 66,
                height: 66,
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
             
                
               
              }}
            >
              {/* <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "radial-gradient(circle,rgba(43,111,219,.24),transparent 72%)", animation: "vqpglow 2.4s ease-in-out infinite" }} />
               <img
                             src={logo}
                             alt="VideoraIQ"
                             style={{ position: "relative", width: 66, height: 66, objectFit: "contain", animation: "vqfloatY 3.4s ease-in-out infinite" }}
                           /> */}
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                letterSpacing: ".14em",
                color: "#3b82f6",
                border: "1px solid #cfe0fb",
                background: "#eef5ff",
                borderRadius: 999,
                padding: "5px 13px",
                marginBottom: 16,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6" }} />
              EMPLOYEE ONBOARDING
            </span>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", margin: 0, color: "#0f1729" }}>
              Employee Registration
            </h1>
            <p style={{ fontSize: 13.5, color: "#64748b", margin: "8px 0 0" }}>
              {step === 1 ? "Fill in your details to get registered" : "Add face photos to enable recognition"}
            </p>
          </div>

          {/* step indicator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 26 }}>
            {STEPS.map((s, i) => {
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: active || done ? "#fff" : "#94a3b8",
                        background: active || done ? "linear-gradient(135deg,#3b82f6,#2a6fdb)" : "#e9edf5",
                        boxShadow: active ? "0 6px 16px rgba(43,111,219,.3)" : "none",
                      }}
                    >
                      {done ? <Check size={15} /> : s.n}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: active || done ? "#0f1729" : "#94a3b8" }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <span style={{ width: 74, height: 2, margin: "0 16px", background: step > s.n ? "#2a6fdb" : "#e3e8f2", borderRadius: 2 }} />}
                </div>
              );
            })}
          </div>

          {/* card */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #eceff5",
              borderRadius: 18,
              padding: 26,
              boxShadow: "0 18px 46px rgba(24,39,75,.08)",
            }}
          >
            {step === 1 ? (
              <form onSubmit={onContinue} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>First Name <span style={{ color: "#ef4444" }}>*</span></label>
                    <PInput name="firstName" placeholder="Enter first name" value={form.firstName} onChange={set("firstName")} />
                    {errors.firstName && <div style={errStyle}>{errors.firstName}</div>}
                  </div>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Last Name <span style={{ color: "#ef4444" }}>*</span></label>
                    <PInput name="lastName" placeholder="Enter last name" value={form.lastName} onChange={set("lastName")} />
                    {errors.lastName && <div style={errStyle}>{errors.lastName}</div>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Email <span style={{ color: "#ef4444" }}>*</span></label>
                    <PInput name="email" type="email" placeholder="name@company.com" value={form.email} onChange={set("email")} />
                    {errors.email && <div style={errStyle}>{errors.email}</div>}
                  </div>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Designation <span style={{ color: "#ef4444" }}>*</span></label>
                    <PInput name="designation" placeholder="e.g. Security Officer" value={form.designation} onChange={set("designation")} />
                    {errors.designation && <div style={errStyle}>{errors.designation}</div>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Location</label>
                    <PSelect name="location" value={form.location} onChange={set("location")}>
                      <option value="">Select location</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </PSelect>
                  </div>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Department <span style={{ color: "#ef4444" }}>*</span></label>
                    <PSelect name="department" value={form.department} onChange={set("department")}>
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>{d.departmentName}</option>
                      ))}
                    </PSelect>
                    {errors.department && <div style={errStyle}>{errors.department}</div>}
                  </div>
                </div>

                <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
                  <PButton label="Continue" />
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* guidance banner */}
                <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#eef5ff", border: "1px solid #d6e4fb" }}>
                  <Info size={16} style={{ color: "#2a6fdb", marginTop: 1, flexShrink: 0 }} />
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#475569", margin: 0 }}>
                    Capture <strong style={{ color: "#0f1729" }}>3 clear photos</strong> — front, left, and right profile. Good lighting, no
                    mask or sunglasses. Used only for secure face recognition.
                  </p>
                </div>

                {/* per-pose capture slots */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {PHOTO_SLOTS.map((s) => {
                    const pic = photos[s.key];
                    return (
                      <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label
                          htmlFor={`vqp-photo-${s.key}`}
                          className="vqp-slot"
                          style={{
                            position: "relative",
                            height: 172,
                            borderRadius: 12,
                            border: pic ? "1.5px solid #cfe0fb" : "1.5px dashed #bcd4f7",
                            background: "#f2f8ff",
                            cursor: isSubmitting ? "not-allowed" : "pointer",
                            pointerEvents: isSubmitting ? "none" : "auto",
                            opacity: isSubmitting && !pic ? 0.6 : 1,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            color: "#94a3b8",
                          }}
                        >
                          {pic ? (
                            <>
                              <img src={pic.url} alt={s.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                              <span
                                role="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  removePhoto(s.key);
                                }}
                                style={{
                                  position: "absolute",
                                  top: 6,
                                  right: 6,
                                  width: 22,
                                  height: 22,
                                  borderRadius: "50%",
                                  background: "rgba(15,23,41,.72)",
                                  color: "#fff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  zIndex: 2,
                                  cursor: isSubmitting ? "not-allowed" : "pointer",
                                  opacity: isSubmitting ? 0.5 : 1,
                                  pointerEvents: isSubmitting ? "none" : "auto",
                                }}
                              >
                                <X size={12} />
                              </span>
                            </>
                          ) : (
                            <>
                              <ImageIcon size={26} strokeWidth={1.6} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748b" }}>{s.hint}</span>
                            </>
                          )}
                        </label>
                        <input id={`vqp-photo-${s.key}`} type="file" accept="image/*" disabled={isSubmitting} onChange={onPickPhoto(s.key)} style={{ display: "none" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155", textAlign: "center" }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "stretch", gap: 12, marginTop: 4 }}>
                  <button
                    type="button"
                    className="vqp-ghost"
                    onClick={() => setStep(1)}
                    disabled={isSubmitting}
                    style={{
                      flex: "0 0 120px",
                      height: 48,
                      borderRadius: 12,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.5 : 1,
                      pointerEvents: isSubmitting ? "none" : "auto",
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "#3b82f6",
                      background: "#fff",
                      border: "1.5px solid #cfe0fb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <PButton
                      label={isSubmitting ? "Registering..." : "Complete Registration"}
                      icon={Check}
                      type="button"
                      variant="success"
                      iconLeft
                      onClick={onSubmit}
                      loading={isSubmitting}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ RIGHT: HERO ============ */}
      <div
        className="vqp-hero"
        style={{
          width: 500,
          flex: "0 0 500px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "44px 46px",
          color: "#f4f8ff",
        }}
      >
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${heroShot})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,rgba(10,15,26,.82) 18%,rgba(15,22,42,.58) 62%,rgba(21,27,52,.6))" }} />
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

        {/* detection box */}
        <div
          style={{
            position: "absolute",
            right: 60,
            top: "30%",
            width: 116,
            height: 92,
            border: "1.6px solid rgba(34,197,94,.85)",
            borderRadius: 6,
            animation: "vqpbox 3.4s ease-in-out infinite",
            boxShadow: "0 0 18px rgba(34,197,94,.25)",
            zIndex: 1,
          }}
        >
          <span style={{ position: "absolute", top: -17, left: -1, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#0a1410", background: "#22c55e", padding: "1px 5px", borderRadius: 3 }}>
            FACE MATCH 99%
          </span>
        </div>

        {/* top brand */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 11 }}>
          <img src={logo} alt="VideoraIQ" style={{ height: 34, width: "auto", display: "block" }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: ".16em", color: "#cdd7ef" }}>EMPLOYEE PORTAL</span>
        </div>

        {/* headline */}
        <div style={{ position: "relative", zIndex: 2, maxWidth: 420, animation: "vqpfade .8s ease both .12s" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 13px",
              border: "1px solid rgba(120,160,230,.22)",
              borderRadius: 999,
              background: "rgba(12,16,26,.5)",
              marginBottom: 20,
            }}
          >
            <span style={{ position: "relative", width: 7, height: 7 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid #22c55e", animation: "vqpblip 2.4s ease-out infinite" }} />
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: ".12em", color: "#aeb9d4" }}>TRUSTED PLATFORM</span>
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 38, lineHeight: 1.08, letterSpacing: "-.02em", margin: 0 }}>
            AI Surveillance
            <br />
            Onboarding
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#c3ccdf", margin: "16px 0 0" }}>
            Register securely with our intelligent face-recognition workflow. Your details and photos are encrypted
            end-to-end.
          </p>
        </div>

        {/* stat cards */}
        <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, animation: "vqpfade .9s ease both .24s" }}>
          {[
            { l: "SECURE", v: "End-to-end" },
            { l: "FAST", v: "< 2 minutes" },
            { l: "ACCURATE", v: "99.9% match" },
          ].map((s) => (
            <div key={s.l} style={{ padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(120,160,230,.16)", background: "rgba(12,16,26,.42)" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, letterSpacing: ".1em", color: "#8e99b6" }}>{s.l}</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14.5, color: "#f4f8ff", marginTop: 4 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
