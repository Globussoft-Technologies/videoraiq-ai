import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Info, Camera as CameraIcon, Upload } from "lucide-react";
import Webcam from "react-webcam";
import logo from "@/assets/logo.svg";
import heroShot from "@/assets/7.jpg";
import { PInput, PCombo, PButton } from "./PortalFields";
import { fetchDepartments, getEmployeeLocations, isEmailExist, createAuthorizedUser } from "@/pages/RegisterUser/Api";
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
  const AUTH_TOKEN = useMemo(() => {
    const encrypted = new URLSearchParams(window.location.search).get("token");
    if (!encrypted) return getAccessToken();
    // decrypt() returns its input unchanged when it cannot decrypt.
    const decrypted = decrypt(encrypted);


    return decrypted && decrypted !== encrypted ? decrypted : null;
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
    ...savedDraft?.form,
  });
  const [photos, setPhotos] = useState({});
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [captureSlot, setCaptureSlot] = useState(null); // key of the slot currently using the webcam
  const [draftRestored, setDraftRestored] = useState(!savedDraft?.photos);
  const webcamRef = useRef(null);

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

  const openCamera = (key) => () => setCaptureSlot(key);

  const capturePhoto = () => {
    if (!webcamRef.current || !captureSlot) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    const byteString = atob(imageSrc.split(",")[1]);
    const mimeString = imageSrc.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i += 1) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `${captureSlot}.jpg`, { type: mimeString });
    setPhotos((p) => ({ ...p, [captureSlot]: { file, name: file.name, url: URL.createObjectURL(file) } }));
    setCaptureSlot(null);
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
                      <div key={s.key} className="flex flex-col items-center gap-2">
                        <div className="w-full aspect-[4/5] max-h-[240px] bg-[#f2f8ff] rounded-[16px] border border-[#e3e8f0] flex items-center justify-center p-2 relative">
                          {pic ? (
                            <>
                              <img src={pic.url} alt={s.label} className="w-full h-full object-contain rounded-[12px]" />
                              <button
                                type="button"
                                onClick={() => removePhoto(s.key)}
                                disabled={isSubmitting}
                                className="absolute top-2 right-2 bg-[#ef4444] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2 w-full">
                              <label
                                htmlFor={`vqp-photo-${s.key}`}
                                className={`flex items-center justify-center gap-1 w-full min-h-[42px] py-2 px-1 overflow-hidden bg-[#3b82f6]/10 text-[#3b82f6] rounded-[10px] text-[10px] sm:text-[12.5px] font-semibold leading-tight text-center transition-colors ${
                                  isSubmitting ? "cursor-not-allowed opacity-50 pointer-events-none" : "cursor-pointer hover:bg-[#3b82f6]/20 active:bg-[#3b82f6]/25"
                                }`}
                              >
                                <Upload size={12} className="shrink-0" />
                                <span className="whitespace-nowrap">Browse</span>
                              </label>
                              <button
                                type="button"
                                onClick={openCamera(s.key)}
                                disabled={isSubmitting}
                                className="flex items-center justify-center gap-1 w-full min-h-[42px] py-2 px-1 overflow-hidden bg-[#eef1f7] text-[#475569] rounded-[10px] text-[10px] sm:text-[12.5px] font-semibold leading-tight hover:bg-[#e3e8f0] active:bg-[#e3e8f0] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <CameraIcon size={12} className="shrink-0" />
                                <span className="whitespace-nowrap">Take Photo</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <input id={`vqp-photo-${s.key}`} type="file" accept="image/*" disabled={isSubmitting} onChange={onPickPhoto(s.key)} className="hidden" />
                        <span className="font-semibold text-[#0f1729] text-[13px]">{s.label}</span>
                      </div>
                    );
                  })}
                </div>

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

                {captureSlot && (
                  <div className="fixed inset-0 z-[100] bg-black/85 flex items-end sm:items-center justify-center sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:w-full rounded-t-[20px] sm:rounded-[16px] p-4 sm:p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl max-h-[92vh] overflow-y-auto">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-[14.5px] sm:text-[15px] font-semibold text-[#0f1729] truncate pr-2">
                          Take Photo — {PHOTO_SLOTS.find((s) => s.key === captureSlot)?.label}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setCaptureSlot(null)}
                          className="p-2 -mr-2 hover:bg-[#f2f8ff] rounded-full cursor-pointer shrink-0"
                          aria-label="Close camera"
                        >
                          <X size={20} className="text-[#64748b]" />
                        </button>
                      </div>
                      {/* Portrait framing suits a face better than 16:9 landscape, and matches
                          how a phone's front camera is actually held during capture. */}
                      <div className="relative rounded-[10px] overflow-hidden bg-black aspect-[3/4] sm:aspect-video mb-3 border-4 border-[#eceff5]">
                        <Webcam
                          audio={false}
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.95}
                          // Without an explicit resolution the browser picks its own default,
                          // which on some webcams is low enough (e.g. 320x240) that the face
                          // recognition service can't detect a face and registration fails
                          // with "Authorized user creation failed". Ask for a real resolution.
                          videoConstraints={{ width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42%] aspect-[3/4] max-w-[180px] border-2 border-white/50 rounded-[40%] pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="w-full h-12 rounded-[10px] font-['Space_Grotesk',sans-serif] font-semibold text-[14px] text-white bg-[#0f2744] cursor-pointer active:opacity-90"
                      >
                        Capture
                      </button>
                    </div>
                  </div>
                )}
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
    </div>
  );
}
