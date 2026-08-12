import { useMemo, useRef, useState } from 'react';
import { Loader, ArrowLeft, Camera, Upload, X, ChevronDown, ChevronUp } from 'lucide-react';
import Webcam from 'react-webcam';
import { toast } from 'sonner';
import { createAuthorizedUser, isEmailExist } from './Api';
import SelectField from './SelectField';
import { COMPACT_TOAST } from './toastOptions';

const orgId = import.meta.env.VITE_ORGANISATION_ID;
const requiredImageCount = orgId === 'dubai' ? 1 : 3;
const captureAngles = orgId === 'dubai' ? ['Front'] : ['Front', 'Right', 'Left'];
const angleIndexMap = { Front: 0, Right: 1, Left: 2 };

const GRADIENT = 'linear-gradient(90deg,var(--blue),var(--violet))';
const CAMERA_ACCESS_TOAST = {
  ...COMPACT_TOAST,
  id: 'camera-access-required',
  description: "We couldn't access your camera. Please connect a camera or allow camera access in your browser settings",
};

const fieldLabel = 'block text-xs font-medium text-[var(--tx2)] mb-1.5';
const Req = () => <span className="text-[var(--crit)]"> *</span>;
const fieldInput =
  'w-full h-11 px-3.5 rounded-lg bg-[var(--bg2)] border border-[var(--bd)] text-sm text-[var(--tx)] placeholder:text-[var(--tx3)] outline-none focus:border-[var(--blue)] transition-colors disabled:cursor-not-allowed';
// Reset the browser's default <fieldset> chrome so it lays out like a plain block.
const stepFieldset = 'space-y-5 border-0 p-0 m-0 min-w-0';


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
  const [activeAngle, setActiveAngle] = useState(null);
  const webcamRef = useRef(null);

  const uploadedCount = imagePaths.filter((img) => img instanceof File).length;

  const locationOptions = useMemo(() => locations.map((l) => ({ value: l, label: l })), [locations]);
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d._id, label: d.departmentName })),
    [departments]
  );

  /* ---- photo helpers ---- */
  const uploadFile = (file, index) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images', COMPACT_TOAST);
      return;
    }
    setImagePaths((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    setImageUrls((prev) => {
      const next = [...prev];
      next[index] = URL.createObjectURL(file);
      return next;
    });
  };

  const removeImage = (index) => {
    setImagePaths((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
    setImageUrls((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
  };

  const handleCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    const byteString = atob(imageSrc.split(',')[1]);
    const mimeString = imageSrc.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i += 1) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File(
      [blob], `${(firstName || 'user').replace(/\s+/g, '')}_${activeAngle}.jpg`, { type: mimeString }
    );
    uploadFile(file, angleIndexMap[activeAngle]);
    setIsCameraOpen(false);
    setActiveAngle(null);
  };

  const showCameraAccessError = () => {
    toast.error('Camera access required', CAMERA_ACCESS_TOAST);
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
    <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] p-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {captureAngles.map((angle, index) => (
              <div key={angle} className="flex flex-col items-center gap-3">
                <div className="w-full aspect-[4/5] max-h-[240px] bg-[var(--bg3)] rounded-2xl border border-[var(--bd)] flex items-center justify-center p-3 relative">
                  {imagePaths[index] ? (
                    <>
                      <img
                        src={imageUrls[index]}
                        alt={angle}
                        className="w-full h-full object-contain rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-[var(--crit)] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <label className="w-full cursor-pointer">
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
                          }}
                        />
                        <div className="flex items-center justify-center gap-2 w-full py-3 px-3 bg-[var(--blue)]/10 text-[var(--blue)] rounded-lg text-sm font-medium hover:bg-[var(--blue)]/20 transition-colors">
                          <Upload className="w-4 h-4" />
                          Upload
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveAngle(angle);
                          setIsCameraOpen(true);
                        }}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--bg2)] text-[var(--tx2)] rounded-lg text-sm font-medium hover:bg-[var(--bd2)] transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        Take photo
                      </button>
                    </div>
                  )}
                </div>
                <span className="font-medium text-[var(--tx)] text-sm">{angle}</span>
              </div>
            ))}
          </div>

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

      {/* camera modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-xl p-4 max-w-lg w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-[var(--tx)]">Take Photo - {activeAngle}</h3>
              <button
                type="button"
                onClick={() => setIsCameraOpen(false)}
                className="p-1 hover:bg-[var(--bg3)] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5 text-[var(--tx2)]" />
              </button>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4 border-4 border-[var(--bd)]">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                onUserMediaError={showCameraAccessError}
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-56 border-2 border-white/50 rounded-[40%] pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={handleCapture}
              className="w-full h-11 rounded-lg text-white font-medium cursor-pointer"
              style={{ background: GRADIENT }}
            >
              Capture
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterUserCard;
