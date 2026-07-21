import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X, Loader } from 'lucide-react';
import Webcam from 'react-webcam';
import { toast } from 'sonner';
import RegisterFormStep1 from '@/helpers/Userregister/RegisterFormStep1';
import RegisterFormStep2 from '@/helpers/Userregister/RegisterFormStep2';
import getAccessToken from '@/utils/getAccessToken';
import { decrypt } from '@/helpers/decriptNvr';
import adminbg from '@/assets/adminbg2.webp';
import logo from '@/assets/logo2.svg';

const EmployeeRegister = () => {
  const org_id = import.meta.env.VITE_ORGANISATION_ID;
  const [step, setStep] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [fetchedLocations, setFetchedLocations] = useState([]);
  const [uploadedImagePaths, setUploadedImagePaths] = useState(['', '', '']);
  const [uploadedImageUrls, setUploadedImageUrls] = useState(['', '', '']);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCaptureAngle, setActiveCaptureAngle] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const webcamRef = useRef(null);
  const BACKEND = import.meta.env.VITE_BACKEND;
  const createUserAPI = BACKEND + '/api/v1/authorizedUsers/create';
  const departmentAPI = BACKEND + '/api/v1/departments/get';
  const isEmailExistAPI = BACKEND + '/api/v1/users/isEmailExist/';
  const employeeLocationsAPI = BACKEND + '/api/v1/locations/employee-location?skip=0&limit=100';
  // The registration link carries an AES-encrypted admin token as ?token=.
  // Falls back to the cookie token when the page is opened without one.
  const AUTH_TOKEN = useMemo(() => {
    const encrypted = new URLSearchParams(window.location.search).get('token');
    if (!encrypted) return getAccessToken();
    // decrypt() returns its input unchanged when it cannot decrypt.
    const decrypted = decrypt(encrypted);
    return decrypted && decrypted !== encrypted ? decrypted : null;
  }, []);

  const TAG = '[EmployeeRegister]';
  const log = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);
  const errorLog = (...args) => console.error(TAG, ...args);

  const fetchDepartments = async () => {
    log('fetchDepartments: requesting', departmentAPI);
    try {
      const res = await fetch(departmentAPI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': AUTH_TOKEN,
        },
        body: JSON.stringify({ skip: 0, limit: 100 }),
      });
      const data = await res.json();
      log('fetchDepartments: response status=', data?.body?.status, 'count=', data?.body?.data?.data?.length);
      if (data?.body?.status === 'success') {
        setDepartments(data.body.data.data);
      } else {
        warn('fetchDepartments: non-success response', data);
      }
    } catch (err) {
      errorLog('fetchDepartments failed:', err);
    }
  };

  const fetchLocations = async () => {
    log('fetchLocations: requesting', employeeLocationsAPI);
    try {
      const res = await fetch(employeeLocationsAPI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const locs = data?.body?.data?.locations || [];
      log('fetchLocations: received', locs.length, 'locations');
      setFetchedLocations(locs.map((l) => l.locationName));
    } catch (err) {
      errorLog('fetchLocations failed:', err);
    }
  };

  useEffect(() => {
    log('mounted — bootstrapping departments + locations');
    fetchDepartments();
    fetchLocations();
    return () => log('unmounted');
  }, []);

  useEffect(() => {
    log('step changed →', step);
  }, [step]);

  const uploadFile = (file, _folderName, index) => {
    log('uploadFile: index=', index, 'name=', file?.name, 'type=', file?.type, 'size=', file?.size);
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      warn('uploadFile: rejected — invalid type', file.type);
      toast.error('Please upload only JPG or PNG images');
      return;
    }
    setUploadedImagePaths((prev) => {
      const updated = [...prev];
      updated[index] = file;
      return updated;
    });
    const previewUrl = URL.createObjectURL(file);
    setUploadedImageUrls((prev) => {
      const updated = [...prev];
      updated[index] = previewUrl;
      return updated;
    });
    toast.success('Image selected successfully');
  };

  const handleCapture = (folderName) => {
    log('handleCapture: angle=', activeCaptureAngle, 'folderName=', folderName);
    const angleIndexMap = { Front: 0, Right: 1, Left: 2 };
    if (!webcamRef.current) {
      warn('handleCapture: webcamRef is null');
      return;
    }
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      warn('handleCapture: getScreenshot returned empty');
      return;
    }
    const byteString = atob(imageSrc.split(',')[1]);
    const mimeString = imageSrc.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `${folderName}_${activeCaptureAngle}.jpg`, { type: mimeString });
    const index = angleIndexMap[activeCaptureAngle];
    uploadFile(file, folderName, index);
    setIsCameraOpen(false);
    setActiveCaptureAngle(null);
  };

  const handleRemoveImage = (index) => {
    log('handleRemoveImage: index=', index);
    setUploadedImagePaths((prev) => {
      const updated = [...prev];
      updated[index] = '';
      return updated;
    });
    setUploadedImageUrls((prev) => {
      const updated = [...prev];
      updated[index] = '';
      return updated;
    });
    toast.success('Image removed successfully');
  };

  const handleOpenCamera = (angle) => {
    log('handleOpenCamera: angle=', angle);
    setActiveCaptureAngle(angle);
    setIsCameraOpen(true);
  };

  const validationSchemaStep1 = Yup.object().shape({
    firstName: Yup.string()
      .min(2, 'First Name must be at least 2 characters')
      .max(30, 'First name cannot exceed 30 characters')
      .required('First Name is required'),
    lastName: Yup.string()
      .required('Last Name is required')
      .max(30, 'Last name cannot exceed 30 characters')
      .min(1, 'Last Name must be at least 1 character'),
    email: Yup.string()
      .email('Invalid email')
      .required('Email is required'),
    designation: Yup.string().required('Designation is required'),
    location: Yup.string(),
    departmentId: Yup.string(),
  });

  const initialValues = useMemo(
    () => ({
      firstName: '',
      lastName: '',
      email: '',
      designation: '',
      location: '',
      departmentId: '',
    }),
    []
  );

  const checkEmail = async (email) => {
    log('checkEmail: checking', email);
    try {
      const url = `${isEmailExistAPI}?email=${encodeURIComponent(email)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': AUTH_TOKEN,
        },
      });
      const data = await res.json();
      const exists = data?.body?.data?.exists;
      log('checkEmail: exists=', exists);
      if (exists === true) {
        toast.error('Email already exists');
        return false;
      }
      return true;
    } catch (err) {
      errorLog('checkEmail failed:', err);
      toast.error('Failed to validate email');
      return false;
    }
  };

  const handleSubmit = async (values, { resetForm }) => {
    log('handleSubmit: values=', values);
    const uploadedCount = uploadedImagePaths.filter(
      (img) => (typeof img === 'string' && img.trim() !== '') || img instanceof File
    ).length;
    log('handleSubmit: uploadedCount=', uploadedCount, 'org_id=', org_id);

    if (org_id === 'dubai') {
      if (uploadedCount < 1) {
        warn('handleSubmit: insufficient images for dubai org');
        toast.error('Please upload 1 image');
        return;
      }
    } else if (uploadedCount < 3) {
      warn('handleSubmit: insufficient images (need 3, got', uploadedCount, ')');
      toast.error('Please upload all the 3 images');
      return;
    }

    const formData = new FormData();
    Object.keys(values).forEach((key) => formData.append(key, values[key]));
    let fileCount = 0;
    uploadedImagePaths.forEach((item) => {
      if (item instanceof File) {
        formData.append('file', item);
        fileCount += 1;
      }
    });
    log('handleSubmit: appended', fileCount, 'files to FormData');

    try {
      setIsSubmitting(true);
      log('handleSubmit: POST', createUserAPI);
      const res = await fetch(createUserAPI, {
        method: 'POST',
        headers: { 'x-access-token': AUTH_TOKEN },
        body: formData,
      });
      const data = await res.json();
      log('handleSubmit: response httpStatus=', res.status, 'body=', data?.body);
      if (data?.body?.status !== 'success') {
        warn('handleSubmit: server returned non-success', data?.body);
        // body.error is a generic wrapper ("Authorized user creation failed.") —
        // body.message carries the actionable reason, so never fall back to error.
        toast.error(data?.body?.message ||data?.body?.error || 'Failed to register');
        return;
      }
      log('handleSubmit: registration succeeded');
      toast.success(data?.body?.message || 'Registered successfully!');
      resetForm();
      setUploadedImagePaths(['', '', '']);
      setUploadedImageUrls(['', '', '']);
      setStep(1);
      setRegistered(true);
    } catch (err) {
      errorLog('handleSubmit failed:', err);
      toast.error(err?.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registered) {
    return (
      <section className="w-full min-h-screen flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
        <div className="w-full flex items-center justify-center p-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-[#07486A] to-cyan-500 flex items-center justify-center shadow-lg shadow-[#07486A]/30">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-br from-slate-900 via-[#07486A] to-slate-800 bg-clip-text text-transparent mb-2">
              Thank you!
            </h2>
            <p className="text-slate-600 mb-6">Your registration was submitted successfully.</p>
            <Button
              onClick={() => setRegistered(false)}
              className="bg-[#07486A] hover:bg-[#05365A] text-white h-11 px-6"
            >
              Register another
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 relative overflow-x-hidden">
      {/* Mobile-only branded header */}
      <div className="lg:hidden relative overflow-hidden">
        <img src={adminbg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#07486A]/90 via-[#07486A]/80 to-cyan-900/85"></div>
        <div className="relative z-10 flex items-center justify-between px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <img src={logo} alt="logo" className="h-7 w-auto" />
            <div className="h-5 w-px bg-white/30"></div>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-white/90">
              Employee Portal
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
            <span className="text-[9px] font-semibold uppercase tracking-wider">Secure</span>
          </div>
        </div>
      </div>

      {/* Left — Form */}
      <div className="w-full lg:w-[58%] relative overflow-x-hidden">
        {/* decorative blobs — desktop only to keep mobile clean */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-[#07486A]/8 via-cyan-400/8 to-transparent rounded-full blur-3xl animate-pulse -z-10"></div>
          <div className="absolute -bottom-20 -left-20 w-[450px] h-[450px] bg-gradient-to-tr from-blue-100/60 to-transparent rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="relative z-10 lg:min-h-screen lg:flex lg:items-center lg:justify-center px-3 sm:px-6 pt-2 pb-3 sm:py-10">
          <div className="w-full max-w-2xl mx-auto">
            {/* Floating badge */}
            <div className="hidden sm:flex mb-2 sm:mb-6 justify-center">
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-[#07486A]/10 to-cyan-400/10 backdrop-blur-sm rounded-full border border-[#07486A]/20 shadow-lg shadow-[#07486A]/5">
                <div className="w-2 h-2 bg-gradient-to-r from-[#07486A] to-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-[10px] sm:text-xs font-semibold text-[#07486A] uppercase tracking-wider">Employee Onboarding</span>
              </div>
            </div>

            {/* Header */}
            <div className="mb-3 sm:mb-8 text-center space-y-1 sm:space-y-2 px-2">
              <h2 className="text-xl sm:text-3xl md:text-4xl font-bold text-[#07486A] leading-tight py-1 lg:bg-gradient-to-br lg:from-slate-900 lg:via-[#07486A] lg:to-slate-800 lg:bg-clip-text lg:text-transparent">
                {step === 1 ? 'Employee Registration' : 'Photo Guideline'}
              </h2>
              <p className="hidden sm:block text-slate-600 text-xs sm:text-sm md:text-base">
                {step === 1
                  ? 'Fill in your details to get registered'
                  : 'Upload or capture your photos to complete registration'}
              </p>
            </div>

            {/* Step indicator */}
            <div className="mb-2 sm:mb-8 flex items-center justify-center gap-2 sm:gap-3">
              <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#07486A]' : 'text-slate-400'}`}>
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-all ${step >= 1 ? 'bg-[#07486A] text-white shadow-md shadow-[#07486A]/30' : 'bg-slate-200 text-slate-500'}`}>1</div>
                <span className="text-xs font-medium hidden sm:inline">Details</span>
              </div>
              <div className={`w-8 sm:w-12 h-0.5 transition-all ${step >= 2 ? 'bg-[#07486A]' : 'bg-slate-200'}`}></div>
              <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#07486A]' : 'text-slate-400'}`}>
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-all ${step >= 2 ? 'bg-[#07486A] text-white shadow-md shadow-[#07486A]/30' : 'bg-slate-200 text-slate-500'}`}>2</div>
                <span className="text-xs font-medium hidden sm:inline">Photos</span>
              </div>
            </div>

            {/* Card */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 overflow-hidden">
              <Formik
                initialValues={initialValues}
                enableReinitialize
                validationSchema={validationSchemaStep1}
                onSubmit={handleSubmit}
              >
                {({ values, validateForm }) => (
                  <Form className="flex flex-col">
                    {step === 2 && (
                      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-[#07486A] hover:text-[#05365A] font-medium cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back to details
                        </button>
                      </div>
                    )}

                    <div className="px-3 py-2 sm:p-6 md:p-8">
                      {step === 1 ? (
                        <RegisterFormStep1 departments={departments} locations={fetchedLocations} departmentRequired={false} />
                      ) : (
                        <RegisterFormStep2
                          uploadedImagePaths={uploadedImagePaths}
                          uploadedImageUrls={uploadedImageUrls}
                          onRemoveImage={handleRemoveImage}
                          onUploadFile={uploadFile}
                          onOpenCamera={handleOpenCamera}
                        />
                      )}
                    </div>

                    <div className="px-3 sm:px-6 md:px-8 pb-3 sm:pb-8 flex justify-center">
                      {step === 1 ? (
                        <Button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            log('Step1 → Continue clicked');
                            const errors = await validateForm();
                            if (Object.keys(errors).length !== 0) {
                              warn('Step1 validation errors:', errors);
                              toast.error('Please fill all the required fields');
                              return;
                            }
                            const isValid = await checkEmail(values.email);
                            log('Step1 → email valid?', isValid);
                            if (isValid) setStep(2);
                          }}
                          className="w-full max-w-sm cursor-pointer bg-gradient-to-r from-[#07486A] to-[#0a5a85] hover:from-[#05365A] hover:to-[#07486A] text-white h-11 sm:h-12 text-sm sm:text-base font-semibold shadow-lg shadow-[#07486A]/25 hover:shadow-xl hover:shadow-[#07486A]/30 transition-all"
                        >
                          Continue
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full max-w-sm bg-gradient-to-r from-[#07486A] to-[#0a5a85] hover:from-[#05365A] hover:to-[#07486A] text-white h-11 sm:h-12 text-sm sm:text-base font-semibold cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#07486A]/25 hover:shadow-xl hover:shadow-[#07486A]/30 transition-all"
                        >
                          {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
                          {isSubmitting ? 'Registering...' : 'Register'}
                        </Button>
                      )}
                    </div>

              {isCameraOpen && createPortal(
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-3 sm:p-4">
                  <div className="bg-white rounded-xl p-3 sm:p-4 max-w-lg w-full max-h-[95vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-3 sm:mb-4">
                      <h3 className="text-base sm:text-lg font-semibold">Take Photo - {activeCaptureAngle}</h3>
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(false)}
                        className="p-1 hover:bg-gray-100 rounded-full"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="rounded-lg overflow-hidden bg-black aspect-video mb-4">
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleCapture(values.firstName.trim())}
                      className="w-full bg-[#07486A] hover:bg-[#05365A]"
                    >
                      Capture
                    </Button>
                  </div>
                </div>,
                document.body
              )}
            </Form>
          )}
        </Formik>
            </div>
          </div>
        </div>
      </div>

      {/* Right — Branded Panel (sticky on desktop) */}
      <div className="hidden lg:block lg:w-[42%] relative overflow-hidden lg:sticky lg:top-0 lg:h-screen">
        <img
          src={adminbg}
          alt="AI Surveillance"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#07486A]/85 via-[#07486A]/70 to-cyan-900/80"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>

        <div className="relative z-10 h-full flex flex-col justify-between p-6 xl:p-10 text-white overflow-y-auto">
          <div className="flex items-center gap-3">
            <img src={logo} alt="logo" className="h-8 xl:h-9 w-auto" />
            <div className="h-6 w-px bg-white/30"></div>
            <span className="text-xs xl:text-sm font-semibold tracking-wider uppercase text-white/90">
              Employee Portal
            </span>
          </div>

          <div className="space-y-4 xl:space-y-5 my-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] xl:text-xs font-semibold uppercase tracking-wider">Trusted Platform</span>
            </div>
            <h1 className="text-3xl xl:text-5xl font-bold leading-tight bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">
              AI Surveillance<br />Onboarding
            </h1>
            <p className="text-white/80 text-sm xl:text-base max-w-md leading-relaxed">
              Register securely with our intelligent face-recognition workflow. Your details and photos
              are encrypted end-to-end.
            </p>
            <div className="grid grid-cols-3 gap-2 xl:gap-4 pt-2 xl:pt-4">
              {[
                { k: 'Secure', v: 'End-to-end' },
                { k: 'Fast', v: '< 2 minutes' },
                { k: 'Accurate', v: '99.9% match' },
              ].map((s) => (
                <div key={s.k} className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-2 xl:p-3">
                  <div className="text-[10px] xl:text-[11px] uppercase tracking-wider text-cyan-300 font-semibold">{s.k}</div>
                  <div className="text-xs xl:text-sm font-medium mt-0.5">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] xl:text-xs text-white/60">
            © {new Date().getFullYear()} VideoraIQ. All rights reserved.
          </div>
        </div>
      </div>
    </section>
  );
};

export default EmployeeRegister;
