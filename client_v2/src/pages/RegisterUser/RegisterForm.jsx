import { useEffect, useMemo, useRef, useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { ArrowLeft, X, Loader } from 'lucide-react';
import Webcam from 'react-webcam';
import { toast } from 'sonner';
import { COMPACT_TOAST } from './toastOptions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import RegisterFormStep1 from './RegisterFormStep1';
import RegisterFormStep2 from './RegisterFormStep2';
import {
  fetchDepartments,
  getEmployeeLocations,
  isEmailExist,
  createAuthorizedUser,
  updateUserDetails,
} from './Api';

const orgId = import.meta.env.VITE_ORGANISATION_ID;
const requiredImageCount = orgId === 'dubai' ? 1 : 3;
const CAMERA_ACCESS_TOAST = {
  ...COMPACT_TOAST,
  id: 'camera-access-required',
  description: "We couldn't access your camera. Please connect a camera or allow camera access in your browser settings",
};

const angleIndexMap = { Front: 0, Right: 1, Left: 2 };

const validationSchemaStep1 = Yup.object().shape({
  firstName: Yup.string()
    .min(2, 'First name must be at least 2 characters')
    .max(30, 'First name cannot exceed 30 characters')
    .required('First name is required'),
  lastName: Yup.string()
    .required('Last name is required')
    .max(30, 'Last name cannot exceed 30 characters')
    .min(1, 'Last name must be at least 1 character'),
  email: Yup.string()
    .email('Invalid email')
    .matches(/^[^\s@]+@[^\s@]+\.(com|net|org|in|co|io|edu|gov)$/, 'Invalid email format')
    .required('Email is required'),
  designation: Yup.string().required('Designation is required'),
  location: Yup.string(),
  departmentId: Yup.string().required('Department is required'),
});

const validationSchemaStep2 = Yup.object().shape({});

const RegisterForm = ({ trigger, fetchUsers, editUser, setEditUser, locations: parentLocations = [] }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [fetchedLocations, setFetchedLocations] = useState([]);
  const [uploadedImagePaths, setUploadedImagePaths] = useState(['', '', '']);
  const [uploadedImageUrls, setUploadedImageUrls] = useState(['', '', '']);
  const [originalImages, setOriginalImages] = useState(['', '', '']);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCaptureAngle, setActiveCaptureAngle] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const webcamRef = useRef(null);

  const loadDepartments = async () => {
    try {
      const res = await fetchDepartments(0, 100, '');
      if (res?.data?.body?.status === 'success') {
        setDepartments(res.data.body.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const loadLocations = async () => {
    try {
      const res = await getEmployeeLocations();
      const locs = res?.data?.body?.data?.locations || [];
      setFetchedLocations(locs.map((l) => l.locationName).filter(Boolean));
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadLocations();
  }, []);

  // Open in edit mode when an editUser is provided by the parent.
  useEffect(() => {
    if (editUser) {
      const rawPics = editUser.profilePics || [];
      const pics = [rawPics[0] || '', rawPics[1] || '', rawPics[2] || ''];
      setUploadedImagePaths(pics);
      setOriginalImages(pics);
      setUploadedImageUrls(['', '', '']);
      setStep(1);
      Promise.all([loadDepartments(), loadLocations()]).then(() => setOpen(true));
    }
  }, [editUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = (file, _folderName, index) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please upload only JPG or PNG images', COMPACT_TOAST);
      return;
    }
    setUploadedImagePaths((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    const previewUrl = URL.createObjectURL(file);
    setUploadedImageUrls((prev) => {
      const next = [...prev];
      next[index] = previewUrl;
      return next;
    });
    toast.success('Image selected successfully', COMPACT_TOAST);
  };

  const handleCapture = (folderName) => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    const byteString = atob(imageSrc.split(',')[1]);
    const mimeString = imageSrc.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i += 1) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `${folderName}_${activeCaptureAngle}.jpg`, { type: mimeString });
    uploadFile(file, folderName, angleIndexMap[activeCaptureAngle]);
    setIsCameraOpen(false);
    setActiveCaptureAngle(null);
  };

  const showCameraAccessError = () => {
    toast.error('Camera access required', CAMERA_ACCESS_TOAST);
  };

  const handleRemoveImage = (index) => {
    setUploadedImagePaths((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
    setUploadedImageUrls((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
    toast.success('Image removed successfully', COMPACT_TOAST);
  };

  const handleOpenCamera = (angle) => {
    setActiveCaptureAngle(angle);
    setIsCameraOpen(true);
  };

  const checkEmail = async (email) => {
    try {
      const res = await isEmailExist(email);
      if (res?.data?.body?.data?.exists === true) {
        toast.error('Email already exists', COMPACT_TOAST);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to validate email', err);
      toast.error('Failed to validate email', COMPACT_TOAST);
      return false;
    }
  };

  const initialValues = useMemo(
    () =>
      editUser
        ? {
            firstName: editUser.firstName || '',
            lastName: editUser.lastName || '',
            email: editUser.email || '',
            designation: editUser.designation || '',
            location: editUser.location || '',
            departmentId: editUser?.departmentId?._id || '',
          }
        : {
            firstName: '',
            lastName: '',
            email: '',
            designation: '',
            location: '',
            departmentId: '',
          },
    [editUser]
  );

  const resetState = () => {
    setStep(1);
    setUploadedImagePaths(['', '', '']);
    setUploadedImageUrls(['', '', '']);
    setOriginalImages(['', '', '']);
  };

  const handleSubmit = async (values, { resetForm }) => {
    const uploadedCount = uploadedImagePaths.filter(
      (img) => (typeof img === 'string' && img.trim() !== '') || img instanceof File
    ).length;

    if (uploadedCount < requiredImageCount) {
      toast.error(`Please upload ${requiredImageCount} image${requiredImageCount > 1 ? 's' : ''}`, COMPACT_TOAST);
      return;
    }

    const formData = new FormData();
    Object.keys(values).forEach((key) => formData.append(key, values[key]));
    uploadedImagePaths.forEach((item) => {
      if (item instanceof File) {
        formData.append('file', item);
      } else if (typeof item === 'string' && item !== '') {
        formData.append('profilePics', item);
      }
    });

    try {
      setIsSubmitting(true);
      if (editUser) {
        const data = await updateUserDetails(editUser._id, formData);
        if (data?.body?.status !== 'success') {
          toast.error(data?.body?.message || data?.body?.error || 'Failed to update user', COMPACT_TOAST);
          return;
        }
        toast.success('User updated successfully!', COMPACT_TOAST);
      } else {
        const data = await createAuthorizedUser(formData);
        if (data?.body?.status !== 'success') {
          toast.error(data?.body?.message || data?.body?.error || 'Failed to register user', COMPACT_TOAST);
          return;
        }
        toast.success('User registered successfully!', COMPACT_TOAST);
      }
      setOpen(false);
      resetState();
      resetForm();
      if (fetchUsers) fetchUsers();
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
    <Dialog
      open={open}
      onOpenChange={(val) => {
        // Never let the dialog close mid-submit — the request would keep running
        // with no way to see its result.
        if (!val && isSubmitting) return;
        setOpen(val);
        if (!val) {
          resetState();
          if (setEditUser) setEditUser(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <div
          onClick={() => {
            resetState();
            if (setEditUser) setEditUser(null);
            setOpen(true);
          }}
        >
          {trigger}
        </div>
      </DialogTrigger>
      <DialogContent
        className="w-[95vw] max-w-[800px] max-h-[90vh] top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] p-0 overflow-hidden bg-[var(--bg1solid)] border border-[var(--bd)] rounded-2xl flex flex-col"
        closeBtn={`text-[var(--tx2)] hover:text-[var(--tx)] top-4 right-4 ${
          isSubmitting ? 'pointer-events-none opacity-40' : ''
        }`}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => isSubmitting && e.preventDefault()}
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
        onInteractOutside={(e) => isSubmitting && e.preventDefault()}
      >
        <Formik
          initialValues={initialValues}
          enableReinitialize
          validationSchema={step === 1 ? validationSchemaStep1 : validationSchemaStep2}
          onSubmit={handleSubmit}
        >
          {({ values, validateForm, setTouched }) => (
            <Form className="flex flex-col h-full w-full overflow-hidden">
              <DialogHeader className="p-6 border-b border-[var(--bd)]">
                <div className="flex items-center justify-center relative">
                  {step === 2 && (
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      disabled={isSubmitting}
                      className="absolute left-0 p-2 hover:bg-[var(--bg3)] rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <ArrowLeft className="w-5 h-5 text-[var(--tx2)]" />
                    </button>
                  )}
                  <DialogTitle className="text-xl font-semibold text-center text-[var(--tx)]">
                    {step === 1
                      ? editUser
                        ? 'Update User Details'
                        : 'User Registration'
                      : 'Photo Guideline'}
                  </DialogTitle>
                </div>
              </DialogHeader>

              {/* fieldset[disabled] natively blocks every control inside, so
                  images can't be swapped or removed while the update is in flight. */}
              <fieldset
                disabled={isSubmitting}
                className={`p-6 md:p-8 flex-1 overflow-y-auto min-h-0 vq-scroll border-0 m-0 min-w-0 ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
              >
                {step === 1 ? (
                  <RegisterFormStep1
                    departments={departments}
                    locations={Array.from(new Set([...parentLocations, ...fetchedLocations]))}
                  />
                ) : (
                  <RegisterFormStep2
                    uploadedImagePaths={uploadedImagePaths}
                    uploadedImageUrls={uploadedImageUrls}
                    onRemoveImage={handleRemoveImage}
                    onUploadFile={uploadFile}
                    onOpenCamera={handleOpenCamera}
                  />
                )}
              </fieldset>

              <div className="p-6 border-t border-[var(--bd)] flex justify-center">
                {step === 1 ? (
                  <Button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      const errors = await validateForm();
                      if (Object.keys(errors).length !== 0) {
                        // Mark every field touched so inline errors render below each input.
                        setTouched(
                          Object.keys(errors).reduce((acc, key) => {
                            acc[key] = true;
                            return acc;
                          }, {})
                        );
                        toast.error('Please fill all the required fields', COMPACT_TOAST);
                        return;
                      }
                      if (editUser && values.email === editUser.email) {
                        setStep(2);
                        return;
                      }
                      const isValid = await checkEmail(values.email);
                      if (isValid) setStep(2);
                    }}
                    className="w-full max-w-xs cursor-pointer bg-[var(--blue)] hover:opacity-95 text-white h-11 text-base"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full max-w-xs bg-[var(--blue)] hover:opacity-95 text-white h-11 text-base cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
                    {isSubmitting
                      ? editUser
                        ? 'Updating...'
                        : 'Registering...'
                      : editUser
                        ? 'Update'
                        : 'Register'}
                  </Button>
                )}
              </div>

              {isCameraOpen && (
                <div className="absolute inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 rounded-2xl">
                  <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-xl p-4 max-w-lg w-full shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-[var(--tx)]">
                        Take Photo - {activeCaptureAngle}
                      </h3>
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
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-56 border-2 border-white/50 rounded-[40%] pointer-events-none" />
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleCapture(values.firstName?.trim() || 'employee')}
                      className="w-full bg-[var(--blue)] hover:opacity-95 text-white"
                    >
                      Capture
                    </Button>
                  </div>
                </div>
              )}
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
};

export default RegisterForm;
