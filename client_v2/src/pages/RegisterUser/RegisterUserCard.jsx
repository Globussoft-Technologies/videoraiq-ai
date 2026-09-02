import { useMemo, useState } from 'react';
import {
  Loader,
  ArrowLeft,
  Camera,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  ScanFace,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { createAuthorizedUser, isEmailExist } from './Api';
import SelectField from './SelectField';
import FaceCaptureModal from './FaceCaptureModal';
import FaceCaptureWizard from './FaceCaptureWizard';
import { COMPACT_TOAST } from './toastOptions';

const orgId = import.meta.env.VITE_ORGANISATION_ID;
const requiredImageCount = orgId === 'dubai' ? 1 : 3;
const captureAngles = orgId === 'dubai' ? ['Front'] : ['Front', 'Right', 'Left'];
const displayAngles = orgId === 'dubai' ? ['Front'] : ['Left', 'Front', 'Right'];

const GRADIENT = 'linear-gradient(90deg,var(--blue),var(--violet))';

const fieldLabel = 'block text-xs font-medium text-[var(--tx2)] mb-1.5';
const Req = () => <span className="text-[var(--crit)]"> *</span>;
const fieldInput =
  'w-full h-11 px-3.5 rounded-lg bg-[var(--bg2)] border border-[var(--bd)] text-sm text-[var(--tx)] placeholder:text-[var(--tx3)] outline-none focus:border-[var(--blue)] transition-colors disabled:cursor-not-allowed';
// Reset the browser's default <fieldset> chrome so it lays out like a plain block.
const stepFieldset = 'space-y-5 border-0 p-0 m-0 min-w-0';

const ENROLL_STYLES = `
.enr-head{display:flex;align-items:center;gap:12px}
.enr-head-ic{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;
  color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent);border:1px solid color-mix(in srgb,var(--blue) 22%,transparent)}
.enr-progress{display:flex;gap:5px;margin-top:6px}
.enr-progress i{width:22px;height:4px;border-radius:999px;background:var(--bg3);transition:background .3s}
.enr-progress i.on{background:linear-gradient(90deg,var(--blue),var(--violet))}

.enr-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:560px){.enr-thumbs{grid-template-columns:1fr}}
.enr-thumb{position:relative;border-radius:16px;border:1px solid var(--bd);background:var(--bg2);
  overflow:hidden;transition:border-color .2s;animation:enr-in .35s ease-out both}
.enr-thumb.filled{border-color:color-mix(in srgb,var(--ok) 50%,transparent)}
.enr-thumb-media{position:relative;height:172px;overflow:hidden;
  background:radial-gradient(80% 70% at 50% 40%,color-mix(in srgb,var(--blue) 8%,transparent),transparent)}
.enr-thumb-media>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
/* pose-illustration preview (empty state): whole head, no crop */
.enr-thumb-pose{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center 42%;
  filter:grayscale(.15) opacity(.95)}
.enr-thumb-cap{display:block;text-align:center;font-size:11px;font-weight:700;color:var(--tx2);padding:7px 4px;
  border-top:1px solid var(--bd);background:var(--bg1)}
.enr-thumb.filled .enr-thumb-cap{color:var(--tx)}
.enr-thumb-check{position:absolute;top:7px;left:7px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;
  border-radius:999px;color:#fff;background:var(--ok);z-index:2}
.enr-thumb-x{position:absolute;top:7px;right:7px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:999px;color:#fff;background:var(--crit);cursor:pointer;transition:.15s;z-index:2}
.enr-thumb-x:hover{transform:scale(1.1)}

.enr-start-row{display:flex;gap:10px}
@media(max-width:480px){.enr-start-row{flex-direction:column}}
.enr-start{position:relative;overflow:hidden;flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:46px;
  border-radius:13px;font-size:13.5px;font-weight:650;color:var(--blue);cursor:pointer;transition:.16s;
  background:color-mix(in srgb,var(--blue) 10%,transparent);border:1px solid color-mix(in srgb,var(--blue) 30%,transparent)}
.enr-start:hover{background:color-mix(in srgb,var(--blue) 16%,transparent);transform:translateY(-1px)}
.enr-start:active{transform:scale(.98)}
.enr-start--cam{color:#fff;border:0;background:linear-gradient(90deg,var(--blue),var(--violet));
  box-shadow:0 12px 26px -12px color-mix(in srgb,var(--blue) 70%,transparent)}
.enr-start--cam:hover{transform:translateY(-1px);box-shadow:0 16px 30px -12px color-mix(in srgb,var(--blue) 80%,transparent)}
.enr-start--cam::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);animation:enr-shine 3s ease-in-out infinite}

@keyframes enr-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes enr-shine{0%{left:-60%}55%,100%{left:130%}}
@media(prefers-reduced-motion:reduce){.enr-thumb,.enr-start--cam::after{animation:none}}
`;


/**
 * Inline two-step "Register New User" card.
 * Step 1 — profile details (Next). Step 2 — face enrollment (Register & Send Invite).
 * Maps to the existing authorizedUsers/create endpoint; onCreated refreshes the list.
 */
const RegisterUserCard = ({ departments = [], locations = [], onCreated }) => {
  const [step, setStep] = useState(1);
  const [collapsed, setCollapsed] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [designation, setDesignation] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [location, setLocation] = useState('');
  const [errors, setErrors] = useState({});

  const [checkingEmail, setCheckingEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [imagePaths, setImagePaths] = useState(['', '', '']);
  const [imageUrls, setImageUrls] = useState(['', '', '']);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [enrollMode, setEnrollMode] = useState(null); // 'camera' | 'upload'
  const [activeAngle, setActiveAngle] = useState(null); // which card opened the camera

  const uploadedCount = imagePaths.filter((img) => img instanceof File).length;

  const locationOptions = useMemo(() => locations.map((l) => ({ value: l, label: l })), [locations]);
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d._id, label: d.departmentName })),
    [departments]
  );

  /* ---- photo helpers ---- */
  const setImageAt = (index, file) => {
    setImagePaths((prev) => {
      const next = [...prev];
      next[index] = file || '';
      return next;
    });
    setImageUrls((prev) => {
      const next = [...prev];
      next[index] = file ? URL.createObjectURL(file) : '';
      return next;
    });
  };

  const removeImage = (index) => setImageAt(index, null);

  // Per-card "Upload" — validate and store the file for that angle.
  const uploadFile = (file, index) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images.', COMPACT_TOAST);
      return;
    }
    setImageAt(index, file);
  };

  // Multi-angle orgs run the guided 3-step wizard; dubai keeps the single-Front modal.
  const useWizard = orgId !== 'dubai';

  // Open the guided capture flow on the clicked angle, starting on the chosen
  // tab ('camera' | 'upload').
  const openCameraFor = (angle, mode = 'camera') => {
    setActiveAngle(angle);
    setEnrollMode(mode);
    setIsCameraOpen(true);
  };

  // The wizard/modal returns one entry per angle it was given, index-aligned to
  // its `angles` prop (which we pass as `captureAngles` for the wizard).
  const handleEnrollComplete = (files) => {
    // Wizard always returns a full set aligned to `captureAngles`; the single-angle
    // modal returns one entry for `activeAngle`.
    const wizardAngles = !useWizard && activeAngle ? [activeAngle] : captureAngles;
    wizardAngles.forEach((angle, i) => {
      const idx = captureAngles.indexOf(angle);
      if (idx === -1) return;
      const entry = files[i];
      if (entry instanceof File) setImageAt(idx, entry);
      // string entry = existing image kept as-is; null = leave current slot alone
    });
    setIsCameraOpen(false);
    setActiveAngle(null);
  };

  /* ---- reset ---- */
  const reset = () => {
    setStep(1);
    setFirstName('');
    setLastName('');
    setEmail('');
    setVehicleNumber('');
    setDesignation('');
    setDepartmentId('');
    setLocation('');
    setErrors({});
    setImagePaths(['', '', '']);
    setImageUrls(['', '', '']);
  };

  /* ---- step 1 → step 2 ---- */
  const validateStep1 = () => {
    const errs = {};
    if (!firstName.trim()) errs.firstName = 'First name is required';
    else if (firstName.trim().length < 2) errs.firstName = 'First name must be at least 2 characters';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.(com|net|org|in|co|io|edu|gov)$/.test(email.trim()))
      errs.email = 'Invalid email format';
    if (!designation.trim()) errs.designation = 'Designation is required';
    if (!departmentId) errs.department = 'Department is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep1()) {
      toast.error('Please fill all required fields', COMPACT_TOAST);
      return;
    }
    setCheckingEmail(true);
    try { 
      const res = await isEmailExist(email.trim());
      if (res?.data?.body?.data?.exists === true) {
        setErrors((e) => ({ ...e, email: 'Email already exists' }));
        toast.error('Email already exists', COMPACT_TOAST);
        return;
      }
      setStep(2);
    } catch (err) {
      console.error('Failed to validate email', err);
      toast.error('Failed to validate email', COMPACT_TOAST);
    } finally {
      setCheckingEmail(false);
    }
  };

  /* ---- submit ---- */
  const handleRegister = async () => {
    if (uploadedCount < requiredImageCount) {
      toast.error(`Please add ${requiredImageCount} enrollment image${requiredImageCount > 1 ? 's' : ''}`, COMPACT_TOAST);
      return;
    }
    const formData = new FormData();
    formData.append('firstName', firstName.trim());
    formData.append('lastName', lastName.trim());
    formData.append('email', email.trim());
    formData.append('vehicleNumber', vehicleNumber.trim());
    formData.append('designation', designation.trim());
    if (departmentId) formData.append('departmentId', departmentId);
    if (location) formData.append('location', location);
    imagePaths.forEach((item) => {
      if (item instanceof File) formData.append('file', item);
    });

    try {
      setIsSubmitting(true);
      const data = await createAuthorizedUser(formData);
      if (data?.body?.status !== 'success') {
        toast.error(data?.body?.message || data?.body?.error || 'Failed to register user', COMPACT_TOAST);
        return;
      }
      toast.success('User registered successfully', COMPACT_TOAST);
      reset();
      if (onCreated) onCreated();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.body?.message ||
        err?.response?.data?.body?.error ||
        err?.message ||
        'An unexpected error occurred';
      toast.error(msg, COMPACT_TOAST);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div data-tour="reg-form" className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--tx)]">Register New User</h2>
          <p className="text-sm text-[var(--tx3)] mt-0.5">
            Invite a team member and capture face enrollment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          disabled={isSubmitting}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] transition-colors cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (step === 1 ? (
        <fieldset disabled={checkingEmail} className={`${stepFieldset} ${checkingEmail ? 'opacity-70' : ''}`}>
          {/* identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={fieldLabel}>First Name<Req /></label>
              <input
                className={fieldInput}
                placeholder="Enter First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              {errors.firstName && <p className="text-xs text-[var(--crit)] mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className={fieldLabel}>Last Name<Req /></label>
              <input
                className={fieldInput}
                placeholder="Enter Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              {errors.lastName && <p className="text-xs text-[var(--crit)] mt-1">{errors.lastName}</p>}
            </div>
            <div>
              <label className={fieldLabel}>Email<Req /></label>
              <input
                className={fieldInput}
                placeholder="name@org.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="text-xs text-[var(--crit)] mt-1">{errors.email}</p>}
            </div>
          </div>

          {/* designation + location + department */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={fieldLabel}>Designation<Req /></label>
              <input
                className={fieldInput}
                placeholder="e.g. Security Supervisor"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
              {errors.designation && (
                <p className="text-xs text-[var(--crit)] mt-1">{errors.designation}</p>
              )}
            </div>
            <div>
              <label className={fieldLabel}>Location</label>
              <SelectField
                value={location}
                options={locationOptions}
                onChange={setLocation}
                placeholder="Select location"
              />
            </div>
            <div>
              <label className={fieldLabel}>Department<Req /></label>
              <SelectField
                value={departmentId}
                options={departmentOptions}
                onChange={setDepartmentId}
                placeholder="Select department"
              />
              {errors.department && (
                <p className="text-xs text-[var(--crit)] mt-1">{errors.department}</p>
              )}
            </div>
            <div>
              <label className={fieldLabel}>Vehicle Number</label>
              <input
                className={fieldInput}
                placeholder="e.g. KA01AB1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            data-tour="reg-next"
            onClick={handleNext}
            disabled={checkingEmail}
            className="w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-70"
            style={{ background: GRADIENT }}
          >
            {checkingEmail && <Loader className="w-4 h-4 animate-spin" />}
            Next
          </button>
        </fieldset>
      ) : (
        <fieldset disabled={isSubmitting} className={`${stepFieldset} ${isSubmitting ? 'opacity-70' : ''}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="p-2 rounded-full hover:bg-[var(--bg3)] text-[var(--tx2)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-sm font-semibold text-[var(--tx)]">Face Enrollment</h3>
              <p className="text-xs text-[var(--tx3)]">
                Added {uploadedCount} / {requiredImageCount} image{requiredImageCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {useWizard && uploadedCount === 0 ? (
            <div className="w-full rounded-2xl border-2 border-dashed border-[var(--bd)] bg-[var(--bg2)] px-6 sm:px-8 py-8 sm:py-10 flex flex-col lg:flex-row items-center gap-7 lg:gap-12">
              {/* left: ghosted avatar in a scan frame */}
              <span className="relative flex items-center justify-center w-28 h-28 shrink-0">
                <span className="absolute inset-0 rounded-full bg-[var(--blue)]/8" />
                <span className="absolute inset-3 rounded-full bg-gradient-to-b from-[var(--blue)]/22 to-[var(--violet)]/18 flex items-end justify-center overflow-hidden">
                  <UserRound className="w-16 h-16 text-[var(--blue)]/55 translate-y-2" strokeWidth={1.5} />
                </span>
                {['-top-1 -left-1 border-t-2 border-l-2 rounded-tl-lg',
                  '-top-1 -right-1 border-t-2 border-r-2 rounded-tr-lg',
                  '-bottom-1 -left-1 border-b-2 border-l-2 rounded-bl-lg',
                  '-bottom-1 -right-1 border-b-2 border-r-2 rounded-br-lg'].map((c) => (
                  <span key={c} className={`absolute w-5 h-5 border-[var(--blue)] ${c}`} />
                ))}
                <span className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center w-7 h-7 rounded-full text-white shadow-md" style={{ background: GRADIENT }}>
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
              </span>

              {/* middle: copy + actions */}
              <div className="flex flex-col items-center lg:items-start gap-2 text-center lg:text-left flex-1 min-w-0">
                <span className="text-[17px] font-semibold text-[var(--tx)] leading-tight">Start guided face capture</span>
                <span className="text-xs text-[var(--tx3)] max-w-sm leading-relaxed">
                  Add front, left and right views in one guided flow — use your camera or upload photos.
                </span>
                <div className="mt-2.5 flex flex-wrap justify-center lg:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => openCameraFor(captureAngles[0], 'camera')}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer"
                    style={{ background: GRADIENT }}
                  >
                    <Camera className="w-4 h-4" /> Take Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => openCameraFor(captureAngles[0], 'upload')}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx2)] text-sm font-semibold hover:bg-[var(--bg3)] transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> Upload Photos
                  </button>
                </div>
              </div>

              {/* right: Front / Left / Right icon steps */}
              <div className="flex items-start gap-2 lg:gap-3 shrink-0">
                {[
                  { label: 'Front View', hint: 'Capture full face' },
                  { label: 'Left View', hint: 'Turn your face left' },
                  { label: 'Right View', hint: 'Turn your face right' },
                ].map((s, i) => (
                  <div key={s.label} className="flex items-start">
                    <div className="flex flex-col items-center gap-2 w-[96px]">
                      <span className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-[var(--blue)] bg-[var(--blue)]/12 text-[var(--blue)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--blue)_16%,transparent)]">
                        <UserRound className="w-5 h-5" strokeWidth={1.75} />
                      </span>
                      <span className="text-[12px] font-semibold text-[var(--tx)]">{s.label}</span>
                      <span className="text-[10px] text-[var(--tx3)] text-center leading-tight">{s.hint}</span>
                    </div>
                    {i < 2 && <span className="mt-6 w-7 border-t border-dashed border-[var(--blue)]/50" />}
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {captureAngles.map((angle, index) => {
              const filled = !!imagePaths[index];
              return (
                <div
                  key={angle}
                  className={`relative flex flex-col rounded-2xl border overflow-hidden bg-[var(--bg2)] transition-colors ${
                    filled ? 'border-[var(--ok)]/50' : 'border-[var(--bd)]'
                  }`}
                >
                  {/* preview area */}
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg3)] overflow-hidden">
                    {filled ? (
                      <>
                        <img src={imageUrls[index]} alt={angle} className="w-full h-full object-cover object-[center_25%]" />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 bg-[var(--crit)] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90"
                          aria-label={`Remove ${angle} photo`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[var(--tx3)]">
                        <ScanFace className="w-8 h-8" />
                      </div>
                    )}
                    {/* persistent angle label */}
                    <span
                      className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm ${
                        filled ? 'bg-[var(--ok)] text-white' : 'bg-black/45 text-white'
                      }`}
                    >
                      {filled && <Check className="w-3 h-3" strokeWidth={3} />}
                      {angle} view
                    </span>
                  </div>

                  {/* action bar */}
                  <div className="flex items-center gap-2 p-2.5 border-t border-[var(--bd)]">
                    <button
                      type="button"
                      onClick={() => openCameraFor(angle)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-[var(--blue)] text-white text-[13px] font-medium hover:opacity-95 transition-opacity cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" /> {filled ? 'Retake' : 'Take photo'}
                    </button>
                    <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] text-[13px] font-medium hover:bg-[var(--bg3)] transition-colors">
                      <input
                        type="file"
                        accept="image/jpeg, image/png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!['image/jpeg', 'image/png'].includes(file.type)) {
                            toast.error('Please upload only JPG or PNG images.', COMPACT_TOAST);
                            e.target.value = '';
                            return;
                          }
                          uploadFile(file, index);
                          e.target.value = '';
                        }}
                      />
                      <Upload className="w-3.5 h-3.5" /> Upload
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          )}

          <button
            type="button"
            onClick={handleRegister}
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-70"
            style={{ background: GRADIENT }}
          >
            {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Registering...' : 'Register '}
          </button>
        </fieldset>
      ))}

      {useWizard ? (
        <FaceCaptureWizard
          open={isCameraOpen}
          angles={captureAngles}
          namePrefix={(firstName || 'user').replace(/\s+/g, '')}
          initial={captureAngles.map((_, i) => imagePaths[i] || null)}
          startAngle={activeAngle}
          initialMode={enrollMode || 'camera'}
          onClose={() => {
            setIsCameraOpen(false);
            setActiveAngle(null);
          }}
          onComplete={handleEnrollComplete}
        />
      ) : (
        <FaceCaptureModal
          open={isCameraOpen}
          angles={activeAngle ? [activeAngle] : captureAngles}
          namePrefix={(firstName || 'user').replace(/\s+/g, '')}
          initial={activeAngle ? [imagePaths[captureAngles.indexOf(activeAngle)]] : imagePaths}
          initialMode={enrollMode}
          allowUpload={!activeAngle}
          onClose={() => {
            setIsCameraOpen(false);
            setActiveAngle(null);
          }}
          onComplete={handleEnrollComplete}
        />
      )}
    </div>
  );
};

export default RegisterUserCard;
