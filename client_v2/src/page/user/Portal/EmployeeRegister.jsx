import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Image as ImageIcon, Info } from "lucide-react";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/7.jpg";
import { PInput, PSelect, PButton } from "./PortalFields";
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
   an explicit long-lived token (same approach as the `client` EmployeeRegister).
   Sourced from VITE_EMPLOYEE_REGISTER_TOKEN in the environment. */
const AUTH_TOKEN = import.meta.env.VITE_EMPLOYEE_REGISTER_TOKEN;

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
      <div className="vqp flex items-center justify-center min-h-screen w-full p-6 bg-[linear-gradient(180deg,#fbfcff,#f5f7fc)] font-['IBM_Plex_Sans',sans-serif]">
        <div className="bg-white border border-[#eceff5] rounded-[18px] px-8 py-10 max-w-[420px] w-full text-center shadow-[0_18px_46px_rgba(24,39,75,0.08)]">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#2a6fdb,#0891b2)] shadow-[0_10px_24px_rgba(43,111,219,0.32)]">
            <Check size={30} color="#fff" strokeWidth={2.5} />
          </div>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[30px] tracking-[-0.02em] mt-0 mb-2 text-[#0f1729]">
            Thank you!
          </h2>
          <p className="text-[14px] text-[#64748b] mt-0 mb-6">
            Your registration was submitted successfully.
          </p>
          <button
            type="button"
            onClick={() => setRegistered(false)}
            className="h-[46px] px-[26px] border-0 rounded-[12px] cursor-pointer font-['Space_Grotesk',sans-serif] font-semibold text-[14px] text-white bg-[#0f2744]"
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vqp flex min-h-screen w-full bg-white font-['IBM_Plex_Sans',sans-serif] text-[#0f1729] overflow-hidden">
      {/* ============ LEFT: FORM ============ */}
      <div className="flex-[1.35] min-w-0 flex flex-col items-center justify-center px-10 py-12 bg-[linear-gradient(180deg,#fbfcff,#f5f7fc)]">
        <div className="w-full max-w-[470px] animate-[vqpfade_0.7s_ease_both_0.1s]">
          {/* heading */}
          <div className="text-center mb-6">
            <div className="relative w-[66px] h-[66px] mx-auto mb-4 flex items-center justify-center rounded-full">
              {/* <div className="absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgba(43,111,219,0.24),transparent_72%)] animate-[vqpglow_2.4s_ease-in-out_infinite]" />
              <img src={logo} alt="VideoraIQ" className="relative w-[66px] h-[66px] object-contain animate-[vqfloatY_3.4s_ease-in-out_infinite]" /> */}
            </div>
            <span className="inline-flex items-center gap-2 font-['JetBrains_Mono',monospace] text-[10.5px] tracking-[0.14em] text-[#3b82f6] border border-[#cfe0fb] bg-[#eef5ff] rounded-full px-[13px] py-[5px] mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
              EMPLOYEE ONBOARDING
            </span>
            <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-[30px] tracking-[-0.02em] m-0 text-[#0f1729]">
              Employee Registration
            </h1>
            <p className="text-[13.5px] text-[#64748b] mt-2 mb-0">
              {step === 1 ? "Fill in your details to get registered" : "Add face photos to enable recognition"}
            </p>
          </div>

          {/* step indicator */}
          <div className="flex items-center justify-center gap-0 mb-[26px]">
            {STEPS.map((s, i) => {
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] font-bold ${
                        active || done
                          ? "text-white bg-[linear-gradient(135deg,#3b82f6,#2a6fdb)]"
                          : "text-[#94a3b8] bg-[#e9edf5]"
                      } ${active ? "shadow-[0_6px_16px_rgba(43,111,219,0.3)]" : ""}`}
                    >
                      {done ? <Check size={15} /> : s.n}
                    </span>
                    <span className={`text-[13.5px] font-semibold ${active || done ? "text-[#0f1729]" : "text-[#94a3b8]"}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className={`w-[74px] h-0.5 mx-4 rounded-[2px] ${step > s.n ? "bg-[#2a6fdb]" : "bg-[#e3e8f2]"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* card */}
          <div className="bg-white border border-[#eceff5] rounded-[18px] p-[26px] shadow-[0_18px_46px_rgba(24,39,75,0.08)]">
            {step === 1 ? (
              <form onSubmit={onContinue} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">First Name <span className="text-[#ef4444]">*</span></label>
                    <PInput name="firstName" placeholder="Enter first name" value={form.firstName} onChange={set("firstName")} />
                    {errors.firstName && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.firstName}</div>}
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Last Name <span className="text-[#ef4444]">*</span></label>
                    <PInput name="lastName" placeholder="Enter last name" value={form.lastName} onChange={set("lastName")} />
                    {errors.lastName && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.lastName}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Email <span className="text-[#ef4444]">*</span></label>
                    <PInput name="email" type="email" placeholder="name@company.com" value={form.email} onChange={set("email")} />
                    {errors.email && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.email}</div>}
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Designation <span className="text-[#ef4444]">*</span></label>
                    <PInput name="designation" placeholder="e.g. Security Officer" value={form.designation} onChange={set("designation")} />
                    {errors.designation && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.designation}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Location</label>
                    <PSelect name="location" value={form.location} onChange={set("location")}>
                      <option value="">Select location</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </PSelect>
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Department <span className="text-[#ef4444]">*</span></label>
                    <PSelect name="department" value={form.department} onChange={set("department")}>
                      <option value="">Select department</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>{d.departmentName}</option>
                      ))}
                    </PSelect>
                    {errors.department && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.department}</div>}
                  </div>
                </div>

                <div className="mt-1.5 flex flex-col">
                  <PButton label="Continue" />
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-[18px]">
                {/* guidance banner */}
                <div className="flex gap-2.5 px-[14px] py-3 rounded-[12px] bg-[#eef5ff] border border-[#d6e4fb]">
                  <Info size={16} className="text-[#2a6fdb] mt-px shrink-0" />
                  <p className="text-[12.5px] leading-[1.5] text-[#475569] m-0">
                    Capture <strong className="text-[#0f1729]">3 clear photos</strong> — front, left, and right profile. Good lighting, no
                    mask or sunglasses. Used only for secure face recognition.
                  </p>
                </div>

                {/* per-pose capture slots */}
                <div className="grid grid-cols-3 gap-3">
                  {PHOTO_SLOTS.map((s) => {
                    const pic = photos[s.key];
                    return (
                      <div key={s.key} className="flex flex-col gap-2">
                        <label
                          htmlFor={`vqp-photo-${s.key}`}
                          className={`vqp-slot relative h-[172px] rounded-[12px] bg-[#f2f8ff] overflow-hidden flex flex-col items-center justify-center gap-2 text-[#94a3b8] ${
                            pic ? "border-[1.5px] border-solid border-[#cfe0fb]" : "border-[1.5px] border-dashed border-[#bcd4f7]"
                          } ${isSubmitting ? "cursor-not-allowed pointer-events-none" : "cursor-pointer"} ${
                            isSubmitting && !pic ? "opacity-60" : "opacity-100"
                          }`}
                        >
                          {pic ? (
                            <>
                              <img src={pic.url} alt={s.label} className="absolute inset-0 w-full h-full object-cover" />
                              <span
                                role="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  removePhoto(s.key);
                                }}
                                className={`absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full bg-[rgba(15,23,41,0.72)] text-white flex items-center justify-center z-[2] ${
                                  isSubmitting ? "cursor-not-allowed opacity-50 pointer-events-none" : "cursor-pointer opacity-100"
                                }`}
                              >
                                <X size={12} />
                              </span>
                            </>
                          ) : (
                            <>
                              <ImageIcon size={26} strokeWidth={1.6} />
                              <span className="text-[12.5px] font-semibold text-[#64748b]">{s.hint}</span>
                            </>
                          )}
                        </label>
                        <input id={`vqp-photo-${s.key}`} type="file" accept="image/*" disabled={isSubmitting} onChange={onPickPhoto(s.key)} className="hidden" />
                        <span className="text-[12px] font-semibold text-[#334155] text-center">{s.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-stretch gap-3 mt-1">
                  <button
                    type="button"
                    className={`vqp-ghost flex-[0_0_120px] h-12 rounded-[12px] font-['Space_Grotesk',sans-serif] font-semibold text-[14px] text-[#3b82f6] bg-white border-[1.5px] border-solid border-[#cfe0fb] flex items-center justify-center gap-2 ${
                      isSubmitting ? "cursor-not-allowed opacity-50 pointer-events-none" : "cursor-pointer opacity-100"
                    }`}
                    onClick={() => setStep(1)}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <div className="flex-1 min-w-0">
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
      <div className="vqp-hero w-[500px] flex-[0_0_500px] relative overflow-hidden flex flex-col justify-between px-[46px] py-[44px] text-[#f4f8ff]">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroShot})` }} />
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(10,15,26,0.82)_18%,rgba(15,22,42,0.58)_62%,rgba(21,27,52,0.6))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(120,150,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(120,150,255,0.05)_1px,transparent_1px)] bg-[length:44px_44px] animate-[vqpgrid_7s_linear_infinite]" />

        {/* detection box */}
        <div className="absolute right-[60px] top-[30%] w-[116px] h-[92px] border-[1.6px] border-solid border-[rgba(34,197,94,0.85)] rounded-md animate-[vqpbox_3.4s_ease-in-out_infinite] shadow-[0_0_18px_rgba(34,197,94,0.25)] z-[1]">
          <span className="absolute -top-[17px] -left-px font-['JetBrains_Mono',monospace] text-[8.5px] text-[#0a1410] bg-[#22c55e] px-[5px] py-px rounded-[3px]">
            FACE MATCH 99%
          </span>
        </div>

        {/* top brand */}
        <div className="relative z-[2] flex items-center gap-[11px]">
          <img src={logo} alt="VideoraIQ" className="h-[34px] w-auto block" />
          <span className="font-['JetBrains_Mono',monospace] text-[11px] tracking-[0.16em] text-[#cdd7ef]">EMPLOYEE PORTAL</span>
        </div>

        {/* headline */}
        <div className="relative z-[2] max-w-[420px] animate-[vqpfade_0.8s_ease_both_0.12s]">
          <div className="inline-flex items-center gap-2 px-[13px] py-1.5 border border-[rgba(120,160,230,0.22)] rounded-full bg-[rgba(12,16,26,0.5)] mb-5">
            <span className="relative w-[7px] h-[7px]">
              <span className="absolute inset-0 rounded-full bg-[#22c55e]" />
              <span className="absolute inset-0 rounded-full border-[1.5px] border-solid border-[#22c55e] animate-[vqpblip_2.4s_ease-out_infinite]" />
            </span>
            <span className="font-['JetBrains_Mono',monospace] text-[10.5px] tracking-[0.12em] text-[#aeb9d4]">TRUSTED PLATFORM</span>
          </div>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[38px] leading-[1.08] tracking-[-0.02em] m-0">
            AI Surveillance
            <br />
            Onboarding
          </h2>
          <p className="text-[14.5px] leading-[1.6] text-[#c3ccdf] mt-4 mb-0">
            Register securely with our intelligent face-recognition workflow. Your details and photos are encrypted
            end-to-end.
          </p>
        </div>

        {/* stat cards */}
        <div className="relative z-[2] grid grid-cols-3 gap-3 animate-[vqpfade_0.9s_ease_both_0.24s]">
          {[
            { l: "SECURE", v: "End-to-end" },
            { l: "FAST", v: "< 2 minutes" },
            { l: "ACCURATE", v: "99.9% match" },
          ].map((s) => (
            <div key={s.l} className="px-[14px] py-[13px] rounded-[12px] border border-[rgba(120,160,230,0.16)] bg-[rgba(12,16,26,0.42)]">
              <div className="font-['JetBrains_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#8e99b6]">{s.l}</div>
              <div className="font-['Space_Grotesk',sans-serif] font-semibold text-[14.5px] text-[#f4f8ff] mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
