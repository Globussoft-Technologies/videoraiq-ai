import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Upload,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import Webcam from 'react-webcam';
import { toast } from 'sonner';
import { verifyUser } from './Api';

const VerifyUserDialog = ({ trigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); // 1 select, 2 preview, 3 processing, 4 result
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
    const file = new File([blob], `captured_verify_${previewImage ? 1 : 0}.jpg`, { type: mimeString });
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
      const bodyData = response?.body?.data;
      const body = response?.body;
      const isMatch =
        bodyData?.match === true ||
        bodyData?.verified === true ||
        body?.match === true ||
        body?.verified === true ||
        response?.match === true ||
        response?.verified === true;
      const message =
        body?.message || response?.message || (isMatch ? 'Verification Success' : 'No match found');
      setIsSuccess(isMatch);
      setApiMessage(message);
    } catch (error) {
      console.error('Verification error:', error);
      setIsSuccess(false);
      setApiMessage(
        error.response?.data?.body?.message || 'Failed to verify identity. Please try again.'
      );
    } finally {
      setStep(4);
    }
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[92vw] sm:max-w-[520px] max-h-[92vh] overflow-y-auto top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] bg-[var(--bg1solid)] border border-[var(--bd)] rounded-3xl p-0"
          closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] top-4 right-4"
        >
          <DialogHeader className="p-4 sm:p-8 pb-3 sm:pb-4 border-b border-[var(--bd)]">
            <DialogTitle className="text-lg sm:text-xl md:text-2xl font-bold text-[var(--tx)] text-center">
              {step === 1 && 'Verify Identity'}
              {step === 2 && 'Image Confirmation'}
              {step === 3 && 'Analyzing Image'}
              {step === 4 && (isSuccess ? 'Verification Success' : 'Verification Unsuccessful')}
            </DialogTitle>
            <p className="text-[var(--tx3)] text-center text-xs sm:text-sm mt-1">
              {step === 1 && 'Choose how you want to provide your identification image.'}
              {step === 2 && 'Please review the image clearly before proceeding.'}
              {step === 3 && 'Our system is securely analyzing your identification.'}
              {step === 4 &&
                (isSuccess
                  ? 'Your identity has been successfully verified.'
                  : 'We could not verify your identity this time.')}
            </p>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center p-4 sm:p-10 min-h-[220px] sm:min-h-[300px]">
            {step === 1 && (
              <div className="flex flex-col gap-3 sm:gap-5 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center gap-2 sm:gap-3 py-6 sm:py-10 border-2 border-dashed border-[var(--bd2)] rounded-2xl bg-[var(--bg2)] text-[var(--blue)] hover:bg-[var(--bg3)] hover:border-[var(--blue)] transition-all cursor-pointer"
                >
                  <div className="p-3 sm:p-4 bg-[var(--bg1solid)] rounded-full group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--blue)]" />
                  </div>
                  <div className="text-center">
                    <span className="block font-semibold text-base sm:text-lg text-[var(--tx)]">Upload from Files</span>
                    <span className="text-xs sm:text-sm text-[var(--tx3)]">Support JPG, PNG files</span>
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
                  onClick={() => setIsCameraOpen(true)}
                  className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-5 bg-[var(--bg2)] text-[var(--tx2)] rounded-2xl hover:bg-[var(--bg3)] transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2.5 sm:p-3 bg-[var(--bg1solid)] rounded-xl">
                      <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--tx2)]" />
                    </div>
                    <span className="font-semibold text-sm md:text-base text-[var(--tx)]">
                      Take Instant Photo
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--tx3)] group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col items-center gap-4 sm:gap-6 w-full">
                <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--bd)] bg-[var(--bg2)] flex items-center justify-center">
                  <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-3 sm:gap-4 w-full mt-1 sm:mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 sm:py-6 rounded-xl border-[var(--bd)] text-[var(--tx2)] hover:bg-[var(--bg3)] bg-transparent gap-2 font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Reset
                  </Button>
                  <Button
                    onClick={handleProcess}
                    className="flex-1 py-4 sm:py-6 rounded-xl bg-[var(--blue)] text-white hover:opacity-95 font-semibold text-base sm:text-lg"
                  >
                    Confirm Image
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col items-center gap-5 sm:gap-8 py-4 sm:py-6">
                <div className="w-16 h-16 sm:w-24 sm:h-24 border-4 border-[var(--bg3)] border-t-[var(--blue)] rounded-full animate-spin" />
                <div className="text-center space-y-2">
                  <p className="text-lg sm:text-xl font-bold text-[var(--tx)]">Verification in Progress</p>
                  <p className="text-sm text-[var(--tx3)] animate-pulse">Running advanced algorithms...</p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col items-center gap-5 sm:gap-8 text-center">
                {isSuccess ? (
                  <div className="w-16 h-16 sm:w-24 sm:h-24 bg-[var(--ok)]/10 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 sm:w-14 sm:h-14 text-[var(--ok)]" />
                  </div>
                ) : (
                  <div className="w-16 h-16 sm:w-24 sm:h-24 bg-[var(--crit)]/10 rounded-full flex items-center justify-center">
                    <XCircle className="w-10 h-10 sm:w-14 sm:h-14 text-[var(--crit)]" />
                  </div>
                )}
                <h3 className="text-lg sm:text-2xl font-bold text-[var(--tx)]">
                  {apiMessage || (isSuccess ? 'Successfully Verified' : 'Validation Error')}
                </h3>
                <div className="w-full flex gap-4">
                  <Button
                    onClick={resetDialog}
                    className={`flex-1 py-4 sm:py-7 rounded-2xl font-bold text-base sm:text-lg transition-all ${
                      isSuccess
                        ? 'bg-[var(--blue)] text-white hover:opacity-95'
                        : 'bg-transparent border-2 border-[var(--crit)] text-[var(--crit)] hover:bg-[var(--crit)]/10'
                    }`}
                  >
                    {isSuccess ? 'Finish & Continue' : 'Try Again'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {isCameraOpen && (
            <div className="absolute inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 rounded-3xl">
              <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-2xl p-4 max-w-lg w-full shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-4 px-2">
                  <h3 className="text-xl font-bold text-[var(--tx)]">Capture Identity</h3>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(false)}
                    className="p-2 hover:bg-[var(--bg3)] rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6 text-[var(--tx2)]" />
                  </button>
                </div>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-6 border-4 border-[var(--bd)] shadow-inner">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
                  />
                  {/* Vignette frame */}
                  <div className="absolute inset-0 border-[20px] border-black/20 pointer-events-none" />
                  {/* Face-alignment guide */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-2 border-white/50 rounded-[40%] pointer-events-none" />
                </div>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCameraOpen(false)}
                    className="flex-1 py-6 rounded-xl border-[var(--bd)] text-[var(--tx2)] hover:bg-[var(--bg3)] bg-transparent font-semibold cursor-pointer  "
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCapture}
                    className="flex-1 py-6 rounded-xl bg-[var(--blue)] text-white hover:opacity-95 font-semibold text-lg cursor-pointer"
                  >
                    Capture Photo
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VerifyUserDialog;
