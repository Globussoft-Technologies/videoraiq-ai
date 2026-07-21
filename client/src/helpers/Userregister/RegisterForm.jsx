import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X,Loader } from 'lucide-react';
import Webcam from 'react-webcam';
import { toast } from 'sonner';
import getAccessToken from '@/utils/getAccessToken';
import RegisterFormStep1 from './RegisterFormStep1';
import RegisterFormStep2 from './RegisterFormStep2';
// import { remove_image, remove_image_edit } from './Api/delete';
import { updateUserDetails } from './Api/put';
import { isEmailExist } from './Api/get';
import { displayEmail } from '@/utils/displayEmail';
import { getEmployeeLocations } from '@/page/user/UserDetails/Api/Post';
const RegisterForm = ({ trigger, fetchUsers,editUser,setEditUser, locations: parentLocations = [] }) => {
  const org_id=import.meta.env.VITE_ORGANISATION_ID;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [fetchedLocations, setFetchedLocations] = useState([]);
  const [uploadedImagePaths, setUploadedImagePaths] = useState(["", "", ""]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCaptureAngle, setActiveCaptureAngle] = useState(null); // 'Front', 'Right', 'Left'
const [originalImages, setOriginalImages] = useState(["", "", ""]);
const [removedImages, setRemovedImages] = useState([]);
const [isSubmitting, setIsSubmitting] = useState(false);
const [uploadedImageUrls, setUploadedImageUrls] = useState(["", "", ""]); // New state for previews

  const webcamRef = useRef(null);
  const token = getAccessToken();
  const uploadDomain = import.meta.env.VITE_BACKEND + '/api/v1/uploads';
  const createUserAPI = import.meta.env.VITE_BACKEND + '/api/v1/authorizedUsers/create';
  const departmentAPI = import.meta.env.VITE_BACKEND + '/api/v1/departments/get';
  const fetchDepartments = async () => {
    try {
      const res = await fetch(departmentAPI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-token': token },
        body: JSON.stringify({
          skip: 0,
        limit: 100,
        }),
      });
      const data = await res.json();
      if (data.body.status === 'success') {
        const deps = data.body.data.data;
        setDepartments(deps);
        return deps;
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
    return [];
  };

  const fetchLocations = async () => {
    try {
      const res = await getEmployeeLocations();
      const locs = res?.data?.body?.data?.locations || [];
      const locationNames = locs.map((l) => l.locationName);
      setFetchedLocations(locationNames);
      return locationNames;
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
    return [];
  };

  useEffect(() => {
    // Fetch initial data on mount
    fetchDepartments();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (editUser) {
      const rawPics = editUser.profilePics || [];
      const pics = [
        rawPics[0] || "",
        rawPics[1] || "",
        rawPics[2] || ""
      ];
      setUploadedImagePaths(pics); 
      setOriginalImages(pics);
      setStep(1);
     
      // Wait for both to be ready before opening to ensure prepopulation works
      Promise.all([fetchDepartments(), fetchLocations()]).then(() => {
        setOpen(true);
      });
    }
  }, [editUser]);

  // Handle open for "New Registration" too
  useEffect(() => {
    if (open && !editUser) {
      fetchDepartments();
      fetchLocations();
    }
  }, [open, editUser]);
  const uploadFile = (file, folderName, index) => {
    const validTypes = ['image/jpeg', 'image/png'];

    if (!validTypes.includes(file.type)) {
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
    const angleIndexMap = {
  Front: 0,
  Right: 1,
  Left: 2,
};
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

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
    setUploadedImagePaths((prev) => {
      const updated = [...prev];
      updated[index] = "";
      return updated;
    });
    setUploadedImageUrls((prev) => {
      const updated = [...prev];
      updated[index] = "";
      return updated;
    });
    toast.success("Image removed successfully")
  };
  const handleRemoveImageInEdit = (index) => {
    const mediaPath = uploadedImagePaths[index];

    if (!mediaPath) return;

    if (typeof mediaPath === "string" && mediaPath !== "") {
      setRemovedImages((prev) => [...prev, mediaPath]);
    }

    setUploadedImagePaths((prev) => {
      const updated = [...prev];
      updated[index] = "";
      return updated;
    });
    setUploadedImageUrls((prev) => {
      const updated = [...prev];
      updated[index] = "";
      return updated;
    });
    toast.success("Image removed successfully")
  };
  const handleOpenCamera = (angle) => {
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
    designation: Yup.string()
    .required('Designation is required'),
    location: Yup.string(),
    departmentId: Yup.string(),
  });

  const validationSchemaStep2 = Yup.object().shape({});

 const initialValues = useMemo(() => (
  editUser
    ? {
        firstName: editUser.firstName || '',
        lastName: editUser.lastName || '',
        email: displayEmail(editUser.email),
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
      }
), [editUser]);

  const handleSubmit = async (values, { resetForm }) => {
//    const hasAllImages = uploadedImagePaths.every(
//   (img) => typeof img === "string" && img.trim() !== ""
// );
    const uploadedCount = uploadedImagePaths.filter(img => 
      (typeof img === "string" && img.trim() !== "") || (img instanceof File)
    ).length;
   

    if (org_id=='dubai'){   
      if (uploadedCount < 1) {
      toast.error("Please upload 1 image");
      return;
    }
  }
    else{
      if (uploadedCount < 3) {
      toast.error("Please upload all the 3 images");
      return;
    }
    } 
  

    const formData = new FormData();
    Object.keys(values).forEach((key) => {
      formData.append(key, values[key]);
    });

    uploadedImagePaths.forEach((item) => {
      if (item instanceof File) {
        formData.append('file', item);
      } else if (typeof item === 'string' && item !== "") {
        formData.append('profilePics', item);
      }
    });

    try {
      setIsSubmitting(true)
      if(editUser){
        const res = await updateUserDetails(
        editUser._id,
        formData,
      );
      
      if (res?.body?.status !== "success") {
        toast.error(res?.body?.message || "Failed to update user");
        return;
      }

      toast.success(res?.body?.message || "User updated successfully!");
      }else{
        const res = await fetch(createUserAPI, {
        method: 'POST',
        headers: {
          'x-access-token': token,
        },
        body: formData,
      });
      const data = await res.json();
      if (data?.body?.status !== 'success') {
        // body.error is a generic wrapper — body.message has the actionable reason.
        toast.error(data?.body?.message || data?.body?.error || "Failed to register user");
        return;
      }
      toast.success(data?.body?.message || 'User registered successfully!');
      }
      
      setOpen(false);
      setStep(1);
      setUploadedImagePaths(["", "", ""]);
      resetForm();
      if (fetchUsers) fetchUsers();
    } catch (err) {
      console.error(err);
      const errorMessage = err?.response?.data?.body?.message ||err?.response?.data?.body?.error || err?.message || "An unexpected error occurred";
      toast.error(errorMessage);
      if (fetchUsers) fetchUsers();
    }finally {
    setIsSubmitting(false); 
  }
  };
const checkEmail=async(email)=>{
    try{
  const res = await isEmailExist(email);
    if (res.data.body.data.exists==true) {
      toast.error('Email already exists');
      return false
    }
    return true
  } catch (err) {
    console.error("Failed to validate email in register users",err)
    toast.error('Failed to validate email');
    return false
  }
    }
  
  

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setStep(1);
       setUploadedImagePaths(originalImages); 
       setUploadedImageUrls(["", "", ""]);
      setRemovedImages([]);
        setEditUser(null); 
      }
    }}>
      <DialogTrigger asChild><div
    onClick={() => {
      setUploadedImagePaths(["", "", ""]);
       setUploadedImageUrls(["", "", ""]);
      setStep(1);
      setEditUser(null);
      setOpen(true); 
    }}
  >
    {trigger}
  </div></DialogTrigger>
      <DialogContent className="w-[95vw] md:w-full max-w-[800px] max-h-[90vh] top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] p-0 overflow-hidden bg-white rounded-xl !flex !flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Formik
          initialValues={initialValues}
           enableReinitialize={true}
          validationSchema={step === 1 ? validationSchemaStep1 : validationSchemaStep2}
          onSubmit={handleSubmit}
        >
          {({ values, validateForm }) => (
            <Form className="flex flex-col h-full w-full overflow-hidden">
              <DialogHeader className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-center relative">
                  {step === 2 && (
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="absolute left-0 p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                  )}
                  <DialogTitle className="text-xl font-semibold text-center">
                    {
                          step === 1
                        ? (editUser ? "Update User Details" : "User Registration")
                           : "Photo Guideline"
                    }

                  </DialogTitle>
                </div>
              </DialogHeader>

              <div className="p-8 flex-1 overflow-y-auto min-h-0">
                {step === 1 ? (
                  <RegisterFormStep1
                    departments={departments}
                    locations={Array.from(new Set([...parentLocations, ...fetchedLocations]))}
                  />
                ) : (
                  <RegisterFormStep2 
                    uploadedImagePaths={uploadedImagePaths}
                    uploadedImageUrls={uploadedImageUrls}
                   onRemoveImage={editUser ? handleRemoveImageInEdit : handleRemoveImage}
                    onUploadFile={uploadFile}
                    onOpenCamera={handleOpenCamera}
                  />
                )}
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-center">
                {step === 1 ? (
                  <Button
                    type="button"
                    onClick={async (e) => {
                       e.preventDefault();
                      const errors = await validateForm();
                       if (Object.keys(errors).length !== 0) {
                        toast.error("Please fill all the required fields");
                        return;
                      }

                      // EDIT MODE
                      if (editUser) {
                        // If email NOT changed → skip API check
                        if (values.email === editUser.email) {
                          setStep(2);
                          return;
                        }

                        // If email changed → check existence
                        const isValid = await checkEmail(values.email);
                        if (isValid) {
                          setStep(2);
                        }
                        return;
                      }

                      // CREATE MODE → always check email
                      const isValid = await checkEmail(values.email);
                      if (isValid) {
                        setStep(2);
                      }
                    }}
                    className="w-full max-w-xs cursor-pointer bg-[#07486A] hover:bg-[#05365A] text-white h-11 text-base"
                  >
                    Click to Continue
                  </Button>
                ) : (
                 <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full max-w-xs bg-[#07486A] hover:bg-[#05365A] text-white h-11 text-base cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
                      {isSubmitting
                        ? (editUser ? "Updating..." : "Registering...")
                        : (editUser ? "Click to Update" : "Click to Register")}
                    </Button>

                )}
              </div>

              {/* Camera Modal Overlay */}
              {isCameraOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl p-4 max-w-lg w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">Take Photo - {activeCaptureAngle}</h3>
                      <button onClick={() => setIsCameraOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
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
                      onClick={() => handleCapture(values.firstName.trim())}
                      className="w-full bg-[#07486A] hover:bg-[#05365A]"
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
