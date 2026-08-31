import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
  Loader,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DETECTION_CATEGORIES } from '@/page/user/Configure/Detections/detectionsData';
import {
  createAuthorizedUser,
  fetchDepartments,
  getEmployeeLocations,
  isEmailExist,
} from '../RegisterUser/Api';
import SelectField from '../RegisterUser/SelectField';
import { COMPACT_TOAST } from '../RegisterUser/toastOptions';
import howToTakeFacePhotos from './assets/howto.jpg';

const categories = [{ key: 'all', label: 'All', color: null }, ...DETECTION_CATEGORIES];

const detections = [
  { name: 'Count Person Detection', subtitle: 'Occupancy', category: 'people', color: '#4f7cff' },
  { name: 'Crowd Detection', subtitle: 'Density', category: 'people', color: '#6366f1' },
  { name: 'Face Recognition', subtitle: 'Biometric', category: 'people', color: '#2f80ed' },
  { name: 'Zone Intrusion Detection', subtitle: 'Perimeter', category: 'perimeter', color: '#f05252' },
  { name: 'Line Crossing Detection', subtitle: 'Tripwire', category: 'perimeter', color: '#ff5a5f' },
  { name: 'Loitering Detection', subtitle: 'Dwell time', category: 'perimeter', color: '#ef4444' },
  { name: 'Bag Detection', subtitle: 'Unattended object', category: 'perimeter', color: '#fb4d4d' },
  { name: 'Count Vehicles Detection', subtitle: 'Flow', category: 'vehicles', color: '#a855f7' },
  { name: 'Num Plate Detection (ANPR)', subtitle: 'ANPR', category: 'vehicles', color: '#b43df1' },
  { name: 'Vehicle Type Detection', subtitle: 'Classification', category: 'vehicles', color: '#9333ea' },
  { name: 'Vehicle Traffic Obstruction', subtitle: 'Blockage', category: 'vehicles', color: '#7c3aed' },
  { name: 'PPE Detection', subtitle: 'Hard hat / vest', category: 'safety', color: '#f59e0b' },
  { name: 'Food Service PPE Detection', subtitle: 'Hygiene', category: 'safety', color: '#f6a51a' },
  { name: 'Fire & Smoke Detection', subtitle: 'Hazard', category: 'safety', color: '#fb923c' },
  { name: 'Desk Absence Detection', subtitle: 'Workstation', category: 'workplace', color: '#38c5dd' },
  { name: 'Guard Absence Detection', subtitle: 'Post coverage', category: 'workplace', color: '#22c7d8' },
  { name: 'Restaurant Table Occupancy', subtitle: 'Seating', category: 'workplace', color: '#06b6d4' },
  { name: 'Door Detection', subtitle: 'Open / closed', category: 'workplace', color: '#14b8a6' },
  { name: 'Water Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', color: '#10b981' },
  { name: 'Oil Spillage Detection', subtitle: 'Floor hazard', category: 'industrial', color: '#0ea5a4' },
  { name: 'Conveyor Belt Status Detection', subtitle: 'Equipment', category: 'industrial', color: '#059669' },
  { name: 'Crusher Status Detection', subtitle: 'Equipment', category: 'industrial', color: '#0d9488' },
  { name: 'Light Detection', subtitle: 'Illumination', category: 'industrial', color: '#84cc16' },
];

const steps = [
  ['1', 'Detection'],
  ['2', 'Upload'],
  ['3', 'Configure'],
  ['4', 'Review'],
];

function colorWithAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const detectionConfigs = {
  'Count Person Detection': {
    description: 'Set the trigger for count person detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Max Occupancy (People)', value: '12', unit: 'people' }],
  },
  'Crowd Detection': {
    description: 'Set the trigger for crowd detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Density Threshold (%)', value: '70', unit: '%' }],
  },
  'Zone Intrusion Detection': {
    description:
      'Draw the restricted zone directly on your clip - click at least 3 points on the video. Anyone entering the polygon triggers an intrusion event.',
    geometry: {
      text: 'Click at least 3 points on your video to outline the restricted zone. Anyone entering it triggers an intrusion alert.',
      badge: '0 / 3 Points Placed',
    },
    fields: [{ label: 'Alert After Dwell Of (Sec)', value: '3', unit: 'sec' }],
  },
  'Line Crossing Detection': {
    description: 'Click 2 points on the video to place the tripwire. Every crossing is logged with its direction.',
    geometry: {
      text: 'Click 2 points on your video to place the tripwire. Every crossing in the clip is counted with its direction.',
      badge: '0 / 2 Points Placed',
    },
    fields: [{ label: 'Debounce Between Events (Sec)', value: '5', unit: 'sec' }],
  },
  'Loitering Detection': {
    description: 'Set the trigger for loitering detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Dwell Longer Than (Sec)', value: '120', unit: 'sec' }],
  },
  'Bag Detection': {
    description: 'Set the trigger for bag detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Unattended After (Sec)', value: '45', unit: 'sec' }],
  },
  'Count Vehicles Detection': {
    description: 'Set the trigger for count vehicles detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Flow Alert Threshold (Veh/Min)', value: '30', unit: 'veh/min' }],
  },
  'Num Plate Detection (ANPR)': {
    description:
      'Add the plates to watch for. Every plate read in the clip is logged; watchlist matches raise an alert with the captured frame.',
    anpr: true,
  },
  'Vehicle Type Detection': {
    description: 'Set the trigger for vehicle type detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Restricted Type', value: 'Truck' }],
  },
  'Vehicle Traffic Obstruction': {
    description:
      'Set the trigger for vehicle traffic obstruction and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Blocked Longer Than (Sec)', value: '20', unit: 'sec' }],
  },
  'PPE Detection': {
    description: 'Set the trigger for ppe detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Required Gear', value: 'Hard hat + Vest' }],
  },
  'Food Service PPE Detection': {
    description:
      'Set the trigger for food service ppe detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Required Gear', value: 'Hairnet + Gloves' }],
  },
  'Fire & Smoke Detection': {
    description: 'Set the trigger for fire & smoke detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '90', unit: '%' }],
  },
  'Desk Absence Detection': {
    description: 'Set the trigger for desk absence detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Absent Longer Than (Min)', value: '10', unit: 'min' }],
  },
  'Guard Absence Detection': {
    description: 'Set the trigger for guard absence detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Post Empty Longer Than (Min)', value: '5', unit: 'min' }],
  },
  'Restaurant Table Occupancy': {
    description:
      'Set the trigger for restaurant table occupancy and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Tables Monitored (Tables)', value: '8', unit: 'tables' }],
  },
  'Door Detection': {
    description: 'Set the trigger for door detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Held Open Longer Than (Sec)', value: '30', unit: 'sec' }],
  },
  'Water Spillage Detection': {
    description: 'Set the trigger for water spillage detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '80', unit: '%' }],
  },
  'Oil Spillage Detection': {
    description: 'Set the trigger for oil spillage detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Sensitivity (%)', value: '82', unit: '%' }],
  },
  'Conveyor Belt Status Detection': {
    description:
      'Set the trigger for conveyor belt status detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Stopped Longer Than (Sec)', value: '15', unit: 'sec' }],
  },
  'Crusher Status Detection': {
    description:
      'Set the trigger for crusher status detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Fault After (Sec)', value: '10', unit: 'sec' }],
  },
  'Light Detection': {
    description: 'Set the trigger for light detection and the minimum confidence - then process your clip to see matched events.',
    fields: [{ label: 'Lux Threshold (Lux)', value: '120', unit: 'lux' }],
  },
};

function FieldLabel({ children, required = false }) {
  return (
    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

function TextInput({ label, placeholder, value, unit, required = false, select = false, readOnly = false, onChange, type = 'text' }) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type={type}
            readOnly={readOnly}
            {...(value !== undefined ? { value } : {})}
            onChange={onChange}
            placeholder={placeholder}
            className="h-11 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 pr-9 text-sm text-[var(--tx)] outline-none"
          />
          {select && <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tx3)]" />}
        </div>
        {unit && <span className="min-w-[42px] text-xs font-semibold text-[var(--tx3)]">{unit}</span>}
      </div>
    </div>
  );
}

function ConfidenceControl({ confidence, setConfidence }) {
  return (
    <div className="mt-4 border-t border-[var(--bd)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Min Confidence
        </span>
        <span className="text-xs font-bold text-[var(--blue)]">{confidence}%</span>
      </div>
      <input
        type="range"
        min="40"
        max="99"
        value={confidence}
        onChange={(event) => setConfidence(event.target.value)}
        className="w-full cursor-pointer accent-[var(--violet)]"
      />
      <div className="mt-2 text-[11px] text-[var(--tx3)]">
        Matches below this score are ignored. Lower it if your clip is low-light or far from the camera.
      </div>
    </div>
  );
}

function GeometryHint({ geometry }) {
  if (!geometry) return null;

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50/60 px-4 py-3 text-xs leading-5 text-[var(--tx2)]">
        <span className="mr-3 inline-block h-3 w-3 border-b-2 border-l-2 border-fuchsia-500 align-middle" />
        {geometry.text}
      </div>
      <span className="mt-3 inline-flex rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-500">
        {geometry.badge}
      </span>
    </div>
  );
}

function AnprConfig() {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <FieldLabel>Watchlist Plates</FieldLabel>
        <div className="flex gap-2">
          <input
            readOnly
            placeholder="E.G. KA02 MP9657"
            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--tx3)] outline-none"
          />
          <button className="inline-flex h-11 cursor-pointer items-center gap-1 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-4 text-sm font-bold text-white">
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
      <div>
        <FieldLabel>Match Direction</FieldLabel>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-1 text-xs font-bold text-[var(--tx2)]">
          {['Entry only', 'Exit only', 'Both ways'].map((option) => (
            <button
              key={option}
              className={`h-8 cursor-pointer rounded-md ${option === 'Both ways' ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white' : ''}`}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetectionConfigPanel({ detectionName, config, confidence, setConfidence }) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <h2 className="text-[15px] font-bold text-[var(--tx)]">3. Configure {detectionName}</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--tx2)]">{config.description}</p>

      <GeometryHint geometry={config.geometry} />

      {config.anpr ? (
        <AnprConfig />
      ) : (
        <div className="mt-4 space-y-4">
          {config.fields.map((field) => (
            <TextInput key={field.label} label={field.label} placeholder={field.label} value={field.value} unit={field.unit} readOnly />
          ))}
        </div>
      )}

      <ConfidenceControl confidence={confidence} setConfidence={setConfidence} />
    </section>
  );
}

function FaceRecognitionConfig({ confidence, setConfidence }) {
  const frontInputRef = useRef(null);
  const rightInputRef = useRef(null);
  const leftInputRef = useRef(null);
  const [showGuide, setShowGuide] = useState(false);
  const [registeredFace, setRegisteredFace] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    designation: '',
    location: '',
    departmentId: '',
    vehicleNumber: '',
  });
  const [errors, setErrors] = useState({});
  const [imageFiles, setImageFiles] = useState([null, null, null]);
  const [imageUrls, setImageUrls] = useState(['', '', '']);
  const photoInputs = [
    { label: 'Front face', ref: frontInputRef, index: 0 },
    { label: 'Right profile', ref: rightInputRef, index: 1 },
    { label: 'Left profile', ref: leftInputRef, index: 2 },
  ];
  const locationOptions = useMemo(() => locations.map((location) => ({ value: location, label: location })), [locations]);
  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: department._id, label: department.departmentName })),
    [departments]
  );
  const uploadedCount = imageFiles.filter(Boolean).length;

  useEffect(() => {
    let active = true;

    const loadRegisterMeta = async () => {
      try {
        const [departmentRes, locationRes] = await Promise.all([
          fetchDepartments(0, 100, ''),
          getEmployeeLocations(),
        ]);

        if (!active) return;

        if (departmentRes?.data?.body?.status === 'success') {
          setDepartments(departmentRes.data.body.data.data || []);
        }

        const locs = locationRes?.data?.body?.data?.locations || [];
        setLocations(locs.map((location) => location.locationName).filter(Boolean));
      } catch (error) {
        console.error('Failed to load face registration metadata', error);
        toast.error('Failed to load locations or departments', COMPACT_TOAST);
      }
    };

    loadRegisterMeta();
    return () => {
      active = false;
    };
  }, []);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handlePhotoUpload = (file, index) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images', COMPACT_TOAST);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageFiles((current) => {
      const next = [...current];
      next[index] = file;
      return next;
    });
    setImageUrls((current) => {
      const next = [...current];
      next[index] = previewUrl;
      return next;
    });
    setErrors((current) => ({ ...current, photos: undefined }));
  };

  const removePhoto = (index) => {
    setImageFiles((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
    setImageUrls((current) => {
      const next = [...current];
      next[index] = '';
      return next;
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required';
    else if (form.firstName.trim().length < 2) nextErrors.firstName = 'First name must be at least 2 characters';
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.(com|net|org|in|co|io|edu|gov)$/.test(form.email.trim())) {
      nextErrors.email = 'Invalid email format';
    }
    if (!form.designation.trim()) nextErrors.designation = 'Designation is required';
    if (!form.departmentId) nextErrors.departmentId = 'Department is required';
    if (uploadedCount < 3) nextErrors.photos = 'Please upload 3 face images';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleRegisterFace = async () => {
    if (!validate()) {
      toast.error('Please fill all required fields', COMPACT_TOAST);
      return;
    }

    setIsSubmitting(true);
    try {
      const emailCheck = await isEmailExist(form.email.trim());
      if (emailCheck?.data?.body?.data?.exists === true) {
        setErrors((current) => ({ ...current, email: 'Email already exists' }));
        toast.error('Email already exists', COMPACT_TOAST);
        return;
      }

      const payload = new FormData();
      payload.append('firstName', form.firstName.trim());
      payload.append('lastName', form.lastName.trim());
      payload.append('email', form.email.trim());
      payload.append('vehicleNumber', form.vehicleNumber.trim());
      payload.append('designation', form.designation.trim());
      payload.append('departmentId', form.departmentId);
      if (form.location) payload.append('location', form.location);
      imageFiles.forEach((file) => {
        if (file instanceof File) payload.append('file', file);
      });

      const data = await createAuthorizedUser(payload);
      if (data?.body?.status !== 'success') {
        toast.error(data?.body?.message || data?.body?.error || 'Failed to register face', COMPACT_TOAST);
        return;
      }

      setRegisteredUser({ ...form, photo: imageUrls.find(Boolean) || howToTakeFacePhotos });
      setRegisteredFace(true);
      toast.success('Face registered successfully', COMPACT_TOAST);
    } catch (error) {
      console.error('Failed to register face', error);
      const message =
        error?.response?.data?.body?.message ||
        error?.response?.data?.body?.error ||
        error?.message ||
        'Failed to register face';
      toast.error(message, COMPACT_TOAST);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <h2 className="text-[15px] font-bold text-[var(--tx)]">3. Configure Face Recognition</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--tx2)]">
        Register the people to find in your clip. VideorAIQ matches every frame against the registered faces and builds an attendance log with check-in / check-out times.
      </p>

      <div className="mt-4 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <TextInput label="First Name" placeholder="Enter First Name" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} required />
            {errors.firstName && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.firstName}</div>}
          </div>
          <div>
            <TextInput label="Last Name" placeholder="Enter Last Name" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} required />
            {errors.lastName && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.lastName}</div>}
          </div>
          <div>
            <TextInput label="Email" placeholder="name@org.com" value={form.email} onChange={(event) => setField('email', event.target.value)} type="email" required />
            {errors.email && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.email}</div>}
          </div>
          <div>
            <TextInput label="Designation" placeholder="e.g. Security Supervisor" value={form.designation} onChange={(event) => setField('designation', event.target.value)} required />
            {errors.designation && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.designation}</div>}
          </div>
          <div>
            <FieldLabel>Location</FieldLabel>
            <SelectField
              value={form.location}
              options={locationOptions}
              onChange={(value) => setField('location', value)}
              placeholder="Select location"
            />
          </div>
          <div>
            <FieldLabel required>Department</FieldLabel>
            <SelectField
              value={form.departmentId}
              options={departmentOptions}
              onChange={(value) => setField('departmentId', value)}
              placeholder="Select department"
            />
            {errors.departmentId && <div className="mt-1 text-[11px] text-[var(--crit)]">{errors.departmentId}</div>}
          </div>
          <TextInput label="Vehicle Number" placeholder="e.g. KA01AB1234" value={form.vehicleNumber} onChange={(event) => setField('vehicleNumber', event.target.value)} />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg1solid)] p-3">
          <img
            src={howToTakeFacePhotos}
            alt="How to take front, right and left face photos"
            className="h-12 w-16 shrink-0 rounded-md border border-[var(--bd)] object-cover"
          />
          <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[var(--blue)]">How to take the 3 photos</div>
            <div className="mt-1 truncate text-[11px] text-[var(--tx3)]">See sample front, left & right shots with instructions</div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-[var(--bd)] text-[var(--tx3)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)]"
            aria-label="Open face photo guide"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {photoInputs.map(({ label, ref, index }) => (
            <div key={label} className="overflow-hidden rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg1solid)]">
              <div className="grid h-[144px] place-items-center">
                {imageUrls[index] ? (
                  <div className="relative h-full w-full">
                    <img src={imageUrls[index]} alt={label} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-black/55 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <User className="h-5 w-5 text-[var(--tx3)]" />
                )}
              </div>
              <div className="border-t border-[var(--bd)] px-3 py-2">
                <div className="mb-2 text-center text-[10px] font-semibold text-[var(--tx3)]">{label}</div>
                <input
                  ref={ref}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    handlePhotoUpload(event.target.files?.[0], index);
                    event.target.value = '';
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <button className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-bold text-[var(--blue)]">
                    <Camera className="h-3 w-3" />
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-bold text-[var(--tx2)]"
                  >
                    <ImagePlus className="h-3 w-3" />
                    Upload
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRegisterFace}
          disabled={isSubmitting}
          className="mt-3 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Registering...' : 'Register face'}
        </button>
        {errors.photos && <div className="mt-2 text-center text-[11px] text-[var(--crit)]">{errors.photos}</div>}

        {registeredFace && registeredUser && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--tx3)]">Registered Faces - 1</div>
              <div className="flex items-center gap-3 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-2.5">
                <img
                  src={registeredUser.photo}
                  alt="Registered face"
                  className="h-10 w-10 shrink-0 rounded-md border border-[var(--bd)] object-cover object-left"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[var(--tx)]">
                    {registeredUser.firstName} {registeredUser.lastName}
                  </div>
                  <div className="truncate text-[11px] text-[var(--tx3)]">{registeredUser.email}</div>
                </div>
                <span className="rounded-md border border-emerald-400 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-500">
                  {uploadedCount} Shots
                </span>
                <button type="button" onClick={() => setRegisteredFace(false)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[var(--tx3)] hover:bg-[var(--bg2)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-600">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
                <Check className="h-4 w-4" />
              </span>
              Face registered - ready to detect in your clip.
            </div>
          </div>
        )}
      </div>

      <ConfidenceControl confidence={confidence} setConfidence={setConfidence} />

      {showGuide && (
        <div
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
              <h3 className="text-sm font-bold text-[var(--tx)]">How to take your face photos</h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-[var(--bd)] text-[var(--tx2)] hover:border-[var(--blue)] hover:text-[var(--blue)]"
                aria-label="Close face photo guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-white p-3">
              <img
                src={howToTakeFacePhotos}
                alt="How to take front, right and left face photos"
                className="mx-auto max-h-[72vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function LiveDemo() {
  const [selectedDetection, setSelectedDetection] = useState('Face Recognition');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showList, setShowList] = useState(true);
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState(82);
  const clipInputRef = useRef(null);

  const selected = detections.find((item) => item.name === selectedDetection) || detections[0];
  const selectedConfig = detectionConfigs[selectedDetection];
  const configurationAvailable = selectedDetection === 'Face Recognition' || selectedConfig;
  const filteredDetections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return detections.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (query && !`${item.name} ${item.subtitle}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [activeCategory, search]);

  return (
    <div className="min-h-full bg-[var(--bg2)] p-3 sm:p-4 lg:p-[22px]">
      <div className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-[var(--tx)]">Live Demo</h1>
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 text-[10px] font-bold tracking-[0.18em] text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                LIVE
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--tx3)]">Upload a clip, pick a detection, and watch VideoraIQ work.</p>
          </div>

          <div className="flex items-center gap-4">
            {steps.map(([number, label], index) => {
              const active = index <= 1;
              return (
                <div key={label} className="flex items-center gap-2 text-xs font-semibold text-[var(--tx3)]">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                      active ? 'bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white' : 'border border-[var(--bd2)] text-[var(--tx3)]'
                    }`}
                  >
                    {number}
                  </span>
                  <span className={active ? 'text-[var(--tx)]' : ''}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <section className="min-w-0 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold text-[var(--tx)]">1. Detection</h2>
              <span
                className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--tx)]"
                style={{
                  borderColor: colorWithAlpha(selected.color, 0.45),
                  background: colorWithAlpha(selected.color, 0.1),
                  boxShadow: `0 0 14px ${colorWithAlpha(selected.color, 0.16)}`,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: selected.color }} />
                {selectedDetection}
                <span className="text-[10px] font-medium text-[var(--tx3)]">{selected.subtitle}</span>
              </span>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex h-9 w-[260px] max-w-full items-center gap-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-[var(--tx3)]">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xs text-[var(--tx)] outline-none"
                  placeholder="Search detections..."
                />
              </div>
              <button
                type="button"
                onClick={() => setShowList((value) => !value)}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-xs font-semibold text-[var(--blue)] hover:border-[var(--blue)]"
              >
                {showList ? 'Hide list' : 'Show list'}
                <ChevronUp className={`h-4 w-4 transition-transform ${showList ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>

          {showList && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--tx3)]">
                  23 Models
                </span>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => setActiveCategory(category.key)}
                      className={`h-8 cursor-pointer rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        activeCategory === category.key
                          ? 'border-transparent bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white'
                          : 'border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:border-[var(--bd2)]'
                      }`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid max-h-[258px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredDetections.map((item) => {
                  const selectedCard = selectedDetection === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setSelectedDetection(item.name)}
                      className="flex min-h-[58px] cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-[var(--bd2)]"
                      style={
                        selectedCard
                          ? {
                              borderColor: item.color,
                              background: colorWithAlpha(item.color, 0.1),
                              boxShadow: `inset 0 0 0 1px ${colorWithAlpha(item.color, 0.26)}, 0 0 12px ${colorWithAlpha(item.color, 0.12)}`,
                            }
                          : {
                              borderColor: 'var(--bd)',
                              background: 'var(--bg2)',
                            }
                      }
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-[var(--tx)]">{item.name}</span>
                        <span className="mt-1 block truncate text-[10px] text-[var(--tx3)]">{item.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <div className={`mt-4 grid gap-4 ${configurationAvailable ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,580px)]' : ''}`}>
        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-[var(--tx)]">2. Upload a test clip</h2>
            <span className="inline-flex h-7 items-center gap-2 rounded-lg border border-[var(--blue)]/35 bg-[var(--blue)]/10 px-3 text-[10px] font-semibold tracking-[0.08em] text-[var(--blue)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]" />
              {selectedDetection}
            </span>
          </div>
          <input ref={clipInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" />
          <button
            type="button"
            onClick={() => clipInputRef.current?.click()}
            className="grid min-h-[216px] w-full cursor-pointer place-items-center rounded-xl border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center transition-colors hover:border-[var(--blue)]"
          >
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--violet)]/25 bg-gradient-to-br from-[var(--blue)]/15 to-[var(--violet)]/20 text-[var(--blue)]">
                <Upload className="h-6 w-6" />
              </span>
              <div className="mt-4 text-base font-bold text-[var(--tx)]">Drop your clip here, or click to browse</div>
              <div className="mt-2 text-xs text-[var(--tx2)]">Use a short, clear clip from the camera angle you want to test.</div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {['MP4', 'MOV', 'WEBM', '10-60 SEC CLIP', 'MAX 30 MB'].map((tag) => (
                  <span key={tag} className="rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-2 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--tx3)]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </button>
        </section>

        {selectedDetection === 'Face Recognition' && <FaceRecognitionConfig confidence={confidence} setConfidence={setConfidence} />}
        {selectedDetection !== 'Face Recognition' && selectedConfig && (
          <DetectionConfigPanel detectionName={selectedDetection} config={selectedConfig} confidence={confidence} setConfidence={setConfidence} />
        )}
      </div>
    </div>
  );
}
