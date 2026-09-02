import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Info, Camera as CameraIcon, Upload, ScanFace } from "lucide-react";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/7.jpg";
import { PInput, PCombo, PButton } from "./PortalFields";
import { fetchDepartments, getEmployeeLocations, isEmailExist, createAuthorizedUser } from "@/pages/RegisterUser/Api";
import FaceCaptureWizard from "@/pages/RegisterUser/FaceCaptureWizard";
import getAccessToken from "@/utils/getAccessToken";
import { decrypt } from "@/helpers/decryptNvr";
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

/* The mobile browser can discard/reload a minimized tab, which would
   otherwise wipe the in-progress form. Draft state (details + step, and the
   photos as data URLs) is persisted to sessionStorage keyed by the token in
   the URL, so reopening the same link restores exactly where the user left
   off. sessionStorage (not localStorage) so the draft doesn't outlive the
   browsing session or leak across a shared/public device. */
const DRAFT_KEY_PREFIX = "vqp_employee_register_draft_";

// The guided wizard works in 'Front' | 'Left' | 'Right'; our slots are lowercase.
const WIZARD_ANGLES = ["Front", "Left", "Right"];
const SLOT_FOR_ANGLE = { Front: "front", Left: "left", Right: "right" };
const ANGLE_FOR_SLOT = { front: "Front", left: "Left", right: "Right" };

function draftKey() {
  const token = new URLSearchParams(window.location.search).get("token") || "default";
  return `${DRAFT_KEY_PREFIX}${token}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, name) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const byteString = atob(base64);
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) ia[i] = byteString.charCodeAt(i);
  return new File([ia], name, { type: mime });
}

export default function EmployeeRegister() {
  const navigate = useNavigate();

  /* The registration link carries an AES-encrypted admin token as ?token=.
     Falls back to the cookie token when the page is opened without one, so an
     already-logged-in admin can still use the page directly. */
  const [tokenExpired, setTokenExpired] = useState(false);
  const AUTH_TOKEN = useMemo(() => {
    const encrypted = new URLSearchParams(window.location.search).get("token");
    if (!encrypted) return getAccessToken();
    // decrypt() returns its input unchanged when it cannot decrypt.
    const decrypted = decrypt(encrypted);
    if (!decrypted || decrypted === encrypted) return null;

    // Check if JWT is expired by decoding the payload
    try {
      const parts = decrypted.split(".");
      if (parts.length !== 3) return decrypted; // Invalid JWT format, let backend handle it
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        setTokenExpired(true);
        return null;
      }
    } catch (e) {
      // If we can't decode, let the backend validate it
      console.warn("Failed to decode JWT payload:", e);
    }

    return decrypted;
  }, []);

  // Seed details + step synchronously from any saved draft so a restored tab
  // never flashes the blank form before repainting with the saved values.
  const savedDraft = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(draftKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [step, setStep] = useState(savedDraft?.step || 1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    designation: "",
    location: "",
    department: "",
    vehicleNumber: "",
    ...savedDraft?.form,
  });
  const [photos, setPhotos] = useState({});
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartAngle, setWizardStartAngle] = useState(null); // which pose the wizard opens on
  const [wizardMode, setWizardMode] = useState("camera"); // 'camera' | 'upload'
  const [draftRestored, setDraftRestored] = useState(!savedDraft?.photos);

  // Photos are stored as data URLs (Files/blob URLs can't survive
  // sessionStorage or a tab reload), so they're decoded back into real Files
  // once on mount. Gated behind draftRestored so the save-effect below doesn't
  // fire (and overwrite the draft with an empty photos object) before this runs.
  useEffect(() => {
    if (!savedDraft?.photos) return;
    (async () => {
      const entries = await Promise.all(
        Object.entries(savedDraft.photos).map(async ([key, p]) => {
          try {
            const file = dataUrlToFile(p.dataUrl, p.name);
            return [key, { file, name: p.name, url: URL.createObjectURL(file) }];
          } catch {
            return null;
          }
        })
      );
      const restored = {};
      entries.forEach((e) => {
        if (e) restored[e[0]] = e[1];
      });
      setPhotos(restored);
      setDraftRestored(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist details + step on every change, and photos (re-encoded to data
  // URLs) whenever the photo set changes. Skipped until any saved photos have
  // finished restoring above, and skipped entirely once submitted.
  useEffect(() => {
    if (!draftRestored || registered) return;
    (async () => {
      try {
        const photoEntries = await Promise.all(
          Object.entries(photos).map(async ([key, p]) => [key, { name: p.name, dataUrl: await fileToDataUrl(p.file) }])
        );
        const photosOut = {};
        photoEntries.forEach(([key, v]) => {
          photosOut[key] = v;
        });
        sessionStorage.setItem(draftKey(), JSON.stringify({ step, form, photos: photosOut }));
      } catch {
        /* sessionStorage full/unavailable — draft just won't persist this round */
      }
    })();
  }, [step, form, photos, draftRestored, registered]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const locationOptions = useMemo(() => locations.map((l) => ({ value: l, label: l })), [locations]);
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d._id, label: d.departmentName })),
    [departments]
  );

  /* Load the register-form metadata (departments + employee locations) from the
     same endpoints RegisterUser uses; the onboarding token is passed explicitly
     since this public page has no login session. */
  useEffect(() => {
    if (!AUTH_TOKEN) {
      toast.error("This registration link is invalid or has expired");
      return;
    }

    const loadDepartments = async () => {
      try {
        const res = await fetchDepartments(0, 100, "", AUTH_TOKEN);
        const body = res?.data?.body;
        if (body?.status === "success") {
          setDepartments(body.data?.data || []);
        } else {
          console.warn("loadDepartments: non-success response", body);
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
  }, [AUTH_TOKEN]);

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

  // Open the guided Front → Left → Right wizard, optionally starting on a
  // specific pose / tab (camera or upload).
  const openWizard = (slot = null, mode = "camera") => {
    setWizardStartAngle(slot ? ANGLE_FOR_SLOT[slot] : null);
    setWizardMode(mode);
    setWizardOpen(true);
  };

  // Wizard returns Files index-aligned to WIZARD_ANGLES; route each into its slot.
  const onWizardComplete = (files) => {
    setPhotos((prev) => {
      const next = { ...prev };
      WIZARD_ANGLES.forEach((angle, i) => {
        const entry = files?.[i];
        if (entry instanceof File) {
          const slot = SLOT_FOR_ANGLE[angle];
          next[slot] = { file: entry, name: entry.name, url: URL.createObjectURL(entry) };
        }
      });
      return next;
    });
    setWizardOpen(false);
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
    setForm({ firstName: "", lastName: "", email: "", designation: "", location: "", department: "", vehicleNumber: "" });
    setPhotos({});
    setErrors({});
    setStep(1);
    try {
      sessionStorage.removeItem(draftKey());
    } catch {
      /* ignore */
    }
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
    formData.append("vehicleNumber", form.vehicleNumber.trim());
    PHOTO_SLOTS.forEach((s) => {
      const pic = photos[s.key];
      if (pic?.file) formData.append("file", pic.file);
    });

    try {
      setIsSubmitting(true);
      const data = await createAuthorizedUser(formData, AUTH_TOKEN);
      if (data?.body?.status !== "success") {
        // `message` carries the specific reason (e.g. "no face detected" / "already
        // registered"); `error` is a generic fallback label like "Authorized user
        // creation failed." — prefer the specific one so the user knows what to fix.
        toast.error(data?.body?.message || data?.body?.error || "Failed to register");
        return;
      }
      toast.success("Registered successfully!");
      resetForm();
      setRegistered(true);
    } catch (err) {
      console.error("Registration failed:", err);
      const msg =
        err?.response?.data?.body?.message ||
        err?.response?.data?.body?.error ||
        err?.message ||
        "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (tokenExpired) {
    return (
      <div className="vqp flex items-center justify-center min-h-screen w-full p-6 bg-[linear-gradient(180deg,#fbfcff,#f5f7fc)] font-['IBM_Plex_Sans',sans-serif]">
        <div className="bg-white border border-[#eceff5] rounded-[18px] px-8 py-10 max-w-[420px] w-full text-center shadow-[0_18px_46px_rgba(24,39,75,0.08)]">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#ef4444,#f97316)] shadow-[0_10px_24px_rgba(239,68,68,0.32)]">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-[30px] tracking-[-0.02em] mt-0 mb-2 text-[#0f1729]">
            Registration Link Expired
          </h2>
          <p className="text-[14px] text-[#64748b] mt-0 mb-6">
            This registration link has expired.
            Please generate a new registration link or request a new one.
          </p>
        </div>
      </div>
    );
  }

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
    <div className="vqp flex min-h-screen w-full bg-white font-['IBM_Plex_Sans',sans-serif] text-[#0f1729]">
      {/* ============ LEFT: FORM ============ */}
      <div className="flex-[1.35] min-w-0 flex flex-col items-center px-4 sm:px-8 lg:px-10 py-6 sm:py-12 bg-[linear-gradient(180deg,#fbfcff,#f5f7fc)]">
        {/* Mobile-only brand bar — the hero (which carries the logo) is hidden below lg. */}
        <div className="lg:hidden w-full max-w-[470px] flex items-center gap-2.5 mb-5">
          <img src={logo} alt="VideoraIQ" className="h-[26px] w-auto" />
          <span className="font-['JetBrains_Mono',monospace] text-[10px] tracking-[0.16em] text-[#64748b]">
            EMPLOYEE PORTAL
          </span>
        </div>

        {/* my-auto (not justify-center) so a tall form scrolls instead of
            having its top clipped off on short screens. */}
        <div className="w-full max-w-[470px] my-auto animate-[vqpfade_0.7s_ease_both_0.1s]">
          {/* heading */}
          <div className="text-center mb-5 sm:mb-6">
            <span className="inline-flex items-center gap-2 font-['JetBrains_Mono',monospace] text-[9.5px] sm:text-[10.5px] tracking-[0.14em] text-[#3b82f6] border border-[#cfe0fb] bg-[#eef5ff] rounded-full px-[13px] py-[5px] mb-3 sm:mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
              EMPLOYEE ONBOARDING
            </span>
            <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-[24px] sm:text-[30px] tracking-[-0.02em] m-0 text-[#0f1729]">
              Employee Registration
            </h1>
            <p className="text-[12.5px] sm:text-[13.5px] text-[#64748b] mt-2 mb-0">
              {step === 1 ? "Fill in your details to get registered" : "Add face photos to enable recognition"}
            </p>
          </div>

          {/* step indicator */}
          <div className="flex items-center justify-center gap-0 mb-5 sm:mb-[26px]">
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
                    <span className={`w-10 sm:w-[74px] h-0.5 mx-2.5 sm:mx-4 rounded-[2px] ${step > s.n ? "bg-[#2a6fdb]" : "bg-[#e3e8f2]"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* card */}
          <div className="bg-white border border-[#eceff5] rounded-[18px] p-4 sm:p-[26px] shadow-[0_18px_46px_rgba(24,39,75,0.08)]">
            {step === 1 ? (
              <form onSubmit={onContinue} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Location</label>
                    <PCombo
                      name="location"
                      value={form.location}
                      onChange={set("location")}
                      placeholder="Select location"
                      options={locationOptions}
                      preferUp
                    />
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Department <span className="text-[#ef4444]">*</span></label>
                    <PCombo
                      name="department"
                      value={form.department}
                      onChange={set("department")}
                      placeholder="Select department"
                      options={departmentOptions}
                      preferUp
                    />
                    {errors.department && <div className="text-[11.5px] text-[#dc2626] mt-px">{errors.department}</div>}
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-[#334155]">Vehicle Number</label>
                    <PInput name="vehicleNumber" placeholder="e.g. KA01AB1234" value={form.vehicleNumber} onChange={set("vehicleNumber")} />
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
                    mask or sunglasses.
                  </p>
                </div>

                {PHOTO_SLOTS.every((s) => !photos[s.key]) ? (
                  /* Empty state — one guided-capture card (no per-pose grid yet). */
                  <div className="w-full rounded-[16px] border-2 border-dashed border-[#cfe0fb] bg-[#f7faff] py-10 px-6 flex flex-col items-center gap-3">
                    <span className="flex items-center justify-center w-14 h-14 rounded-[16px] bg-[#3b82f6]/12 text-[#3b82f6]">
                      <ScanFace size={26} />
                    </span>
                    <span className="text-[14px] font-semibold text-[#0f1729]">Start guided face capture</span>
                    <span className="text-[12px] text-[#64748b] text-center max-w-xs">
                      Add front, left and right views in one guided flow — take photos with your
                      camera or upload existing ones.
                    </span>
                    <div className="mt-2 flex flex-wrap justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => openWizard(null, "camera")}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-[12px] text-white text-[13px] font-semibold bg-[linear-gradient(135deg,#3b82f6,#2a6fdb)] hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CameraIcon size={16} /> Take photos
                      </button>
                      <button
                        type="button"
                        onClick={() => openWizard(null, "upload")}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 h-10 px-5 rounded-[12px] text-[#3b82f6] text-[13px] font-semibold bg-white border-[1.5px] border-[#cfe0fb] hover:bg-[#eef5ff] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Upload size={16} /> Upload photos
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* per-pose slots — click any to open the wizard on that pose */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {PHOTO_SLOTS.map((s) => {
                        const pic = photos[s.key];
                        return (
                          <div key={s.key} className="flex overflow-hidden rounded-[16px] border border-[#e3e8f0] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.04)] sm:block">
                            <div className="group relative flex aspect-[4/5] w-[104px] shrink-0 items-center justify-center overflow-hidden bg-[#f2f8ff] p-2 sm:w-full sm:max-h-[240px]">
                              {pic ? (
                                <>
                                  <img src={pic.url} alt={s.label} className="w-full h-full object-cover rounded-[12px]" />
                                  <button
                                    type="button"
                                    onClick={() => removePhoto(s.key)}
                                    disabled={isSubmitting}
                                    className="absolute top-2 right-2 bg-[#ef4444] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <X size={14} />
                                  </button>
                                  <div className="absolute inset-x-2 bottom-2 hidden items-center gap-1.5 opacity-0 transition-opacity duration-150 sm:flex sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => openWizard(s.key, "camera")}
                                      disabled={isSubmitting}
                                      className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#2563eb]/92 px-2 text-[11px] font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)] backdrop-blur-md transition-colors hover:bg-[#1d4ed8] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <CameraIcon size={12} /> Retake
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openWizard(s.key, "upload")}
                                      disabled={isSubmitting}
                                      title={`Re-upload ${s.label}`}
                                      aria-label={`Re-upload ${s.label}`}
                                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/70 bg-white/95 text-[#2563eb] shadow-[0_8px_20px_rgba(15,23,42,0.18)] backdrop-blur-md transition-colors hover:bg-[#eef4ff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Upload size={13} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openWizard(s.key, "camera")}
                                  disabled={isSubmitting}
                                  className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#3b82f6]/12 text-[#3b82f6]">
                                    <CameraIcon size={16} />
                                  </span>
                                  <span className="text-[11px] sm:text-[12px] font-semibold text-[#3b82f6]">Add {s.label.toLowerCase()}</span>
                                </button>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-center border-l border-[#edf2f7] px-3 py-2 sm:block sm:border-l-0 sm:border-t sm:px-2">
                              <div className="mb-2 text-left text-[12.5px] font-semibold text-[#0f1729] sm:text-center">{s.label}</div>
                              {pic ? (
                                <div className="flex items-center gap-2 sm:hidden">
                                  <button
                                    type="button"
                                    onClick={() => openWizard(s.key, "camera")}
                                    disabled={isSubmitting}
                                    className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-[#eef4ff] px-2 text-[11px] font-semibold text-[#315eea] transition-colors hover:bg-[#dfeaff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <CameraIcon size={12} /> Retake
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openWizard(s.key, "upload")}
                                    disabled={isSubmitting}
                                    className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-[#cfe0fb] bg-white px-2 text-[11px] font-semibold text-[#315eea] transition-colors hover:bg-[#f7faff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Upload size={12} /> Upload
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openWizard(s.key, "camera")}
                                  disabled={isSubmitting}
                                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] bg-[#eef4ff] px-2 text-[11px] font-semibold text-[#315eea] transition-colors hover:bg-[#dfeaff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <CameraIcon size={12} /> Add photo
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => openWizard(null, "camera")}
                        disabled={isSubmitting}
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 h-11 rounded-[12px] text-white text-[13px] font-semibold bg-[linear-gradient(135deg,#3b82f6,#2a6fdb)] hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CameraIcon size={16} /> Retake all
                      </button>
                      <button
                        type="button"
                        onClick={() => openWizard(null, "upload")}
                        disabled={isSubmitting}
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 h-11 rounded-[12px] text-[#3b82f6] text-[13px] font-semibold bg-white border-[1.5px] border-[#cfe0fb] hover:bg-[#eef5ff] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Upload size={16} /> Re-upload all
                      </button>
                    </div>
                  </>
                )}

                <div className="flex items-stretch gap-3 mt-1">
                  <button
                    type="button"
                    className={`vqp-ghost flex-[0_0_92px] sm:flex-[0_0_120px] h-12 rounded-[12px] font-['Space_Grotesk',sans-serif] font-semibold text-[14px] text-[#3b82f6] bg-white border-[1.5px] border-solid border-[#cfe0fb] flex items-center justify-center gap-2 ${
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
      <div className="vqp-hero hidden lg:flex w-[500px] flex-[0_0_500px] relative overflow-hidden flex-col justify-between px-[46px] py-[44px] text-[#f4f8ff]">
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

      <FaceCaptureWizard
        open={wizardOpen}
        angles={WIZARD_ANGLES}
        namePrefix={(form.firstName || "employee").replace(/\s+/g, "")}
        initial={
          wizardStartAngle
            ? WIZARD_ANGLES.map((a) => photos[SLOT_FOR_ANGLE[a]]?.file || null)
            : WIZARD_ANGLES.map(() => null)
        }
        startAngle={wizardStartAngle}
        initialMode={wizardMode}
        theme="light"
        onClose={() => setWizardOpen(false)}
        onComplete={onWizardComplete}
      />
    </div>
  );
}
