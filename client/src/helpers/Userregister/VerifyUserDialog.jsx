import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { verifyUser } from './Api/post';
import { toast } from 'sonner';
import Webcam from 'react-webcam';

const VerifyUserDialog = ({ trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); // 1: Select, 2: Preview, 3: Processing, 4: Result
  const [previewImage, setPreviewImage] = useState(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [apiMessage, setApiMessage] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const fileInputRef = useRef(null);
  const webcamRef = useRef(null);

  const resetDialog = () => {
    setStep(1);
    setPreviewImage(null);
    setSelectedFile(null);
    setApiMessage('');
  };

  const handleOpenChange = (open) => {
    setIsOpen(open);
    if (!open) resetDialog();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setStep(2);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTakePhoto = () => {
    setIsCameraOpen(true);
  };

  const handleCapture = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    // Convert base64 to File object
    const byteString = atob(imageSrc.split(',')[1]);
    const mimeString = imageSrc.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `captured_verify_${Date.now()}.jpg`, { type: mimeString });

    setSelectedFile(file);
    setPreviewImage(imageSrc);
    setStep(2);
    setIsCameraOpen(false);
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      toast.error('Please select or capture an image first');
      return;
    }

    setStep(3);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await verifyUser(formData);
      
      // Determine success based on various possible fields in the API response
      const bodyData = response?.body?.data;
      const body = response?.body;
      
      const isMatch = bodyData?.match === true || 
                      bodyData?.verified === true ||
                      body?.match === true || 
                      body?.verified === true ||
                      response?.match === true || 
                      response?.verified === true;
      
      const message = body?.message || 
                      response?.message || 
                      (isMatch ? 'Verification Success' : 'No match found');

      if (isMatch) {
        setIsSuccess(true);
        setApiMessage(message);
      } else {
        setIsSuccess(false);
        setApiMessage(message);
      }
    } catch (error) {
      console.error('Verification error:', error);
      setIsSuccess(false);
      setApiMessage(error.response?.data?.body?.message || 'Failed to verify identity. Please try again.');
    } finally {
      setStep(4);
    }
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] bg-white rounded-3xl p-0 border-none overflow-hidden">
          <DialogHeader className="p-6 sm:p-8 pb-4 border-b border-gray-100">
            <DialogTitle className="text-xl md:text-2xl font-bold text-[#07486A] text-center">
              {step === 1 && 'Verify Identity'}
              {step === 2 && 'Image Confirmation'}
              {step === 3 && 'Analyzing Image'}
              {step === 4 &&
                (isSuccess
                  ? 'Verification Success'
                  : 'Verification Unsuccessful')}
            </DialogTitle>
            <p className="text-gray-500 text-center text-sm mt-1">
              {step === 1 &&
                'Choose how you want to provide your identification image.'}
              {step === 2 &&
                'Please review the image clearly before proceeding.'}
              {step === 3 &&
                'Our system is securely analyzing your identification.'}
              {step === 4 &&
                (isSuccess
                  ? 'Your identity has been successfully verified.'
                  : 'We could not verify your identity this time.')}
            </p>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-6 sm:p-10 min-h-[300px]">
            {step === 1 && (
              <div className="flex flex-col gap-5 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-[#CFEFFF] rounded-2xl bg-[#F8FDFF] text-[#07486A] hover:bg-[#E3F5FF] hover:border-[#07486A] transition-all duration-300 cursor-pointer"
                >
                  <div className="p-4 bg-white rounded-full group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-8 h-8 text-[#07486A]" />
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-lg">
                      Upload from Files
                    </span>
                    <span className="text-sm text-[#07486A]/70">
                      Support JPG, PNG or PDF files
                    </span>
                  </div>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />

                <button
                  onClick={handleTakePhoto}
                  className="flex items-center justify-between px-6 py-5 bg-[#F2F2F2] text-[#595959] rounded-2xl hover:bg-gray-200 transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl">
                      <Camera className="w-6 h-6 text-[#595959]" />
                    </div>
                    <span className="font-semibold text-sm md:text-base">Take Instant Photo</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col items-center gap-6 w-full">
                <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center relative">
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                </div>
                <div className="flex gap-4 w-full mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1 py-6 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50 gap-2 font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Reset
                  </Button>
                  <Button
                    onClick={handleProcess}
                    className="flex-1 py-6 rounded-xl bg-[#07486A] text-white hover:bg-[#063a55] font-semibold text-lg"
                  >
                    Confirm Image
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center gap-8 py-6">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-[#E3F5FF] border-t-[#07486A] rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[#07486A] opacity-20" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-xl font-bold text-[#07486A]">
                    Verification in Progress
                  </p>
                  <p className="text-sm text-gray-400 animate-pulse">
                    Running advanced algorithms...
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col items-center gap-8 text-center animate-in zoom-in duration-300">
                {isSuccess ? (
                  <>
                    <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center relative">
                      <CheckCircle2 className="w-14 h-14 text-green-500 relative z-10" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-gray-900">
                        {apiMessage || 'Successfully Verified'}
                      </h3>
                    
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center">
                      <XCircle className="w-14 h-14 text-red-500" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-gray-900">
                        {apiMessage || 'Validation Error'}
                      </h3>
                      
                    </div>
                  </>
                )}
                <div className="w-full flex gap-4">
                  <Button
                    onClick={resetDialog}
                    className={`flex-1 py-7 rounded-2xl font-bold text-lg transition-all duration-300 ${
                      isSuccess
                        ? 'bg-[#07486A] text-white hover:bg-[#063a55]'
                        : 'bg-white border-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600'
                    }`}
                  >
                    {isSuccess ? 'Finish & Continue' : 'Try Again'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Camera UI Overlay */}
          {isCameraOpen && (
            <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-4 max-w-lg w-full shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-4 px-2">
                  <h3 className="text-xl font-bold text-[#07486A]">Capture Identity</h3>
                  <button 
                    onClick={() => setIsCameraOpen(false)} 
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>
                </div>
                
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-6 border-4 border-gray-100 shadow-inner">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{
                      width: 1280,
                      height: 720,
                      facingMode: "user"
                    }}
                  />
                  <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-2 border-white/50 rounded-[40%] pointer-events-none"></div>
                </div>

                <div className="flex gap-4">
                  <Button 
                    variant="outline"
                    onClick={() => setIsCameraOpen(false)}
                    className="flex-1 py-6 rounded-xl border-gray-200 text-gray-600 font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCapture}
                    className="flex-1 py-6 rounded-xl bg-[#07486A] text-white hover:bg-[#063a55] font-semibold text-lg"
                  >
                    Capture Photo
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="hidden">
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VerifyUserDialog;
