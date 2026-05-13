import React, { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocation ,useNavigate} from 'react-router-dom';
import { toast } from 'sonner';
import { verifyOtp } from '../Api/post';
import { X } from 'lucide-react';
import { ClipboardCheck } from 'lucide-react';

const OtpVerification = () => {
  const [otp, setOtp] = useState(Array(6).fill(''));
  const inputsRef = useRef([]);
  const location = useLocation();
  const { type, value } = location.state || {};
  const [showOtpModel, setShowOtpModel] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e, index) => {
    const value = e.target.value.replace(/\D/, ''); 
    if (value) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      if (index < 5) {
        inputsRef.current[index + 1]?.focus();
      }
    }
  };

  const handleBackspace = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleClose = () => {
    setShowOtpModel(false);
    navigate('/notification-recipients');
  };

  const handleSubmit = async () => {
    const enteredOtp = otp.join('');
    if (enteredOtp.length < 6) {
      toast.error("Please enter a valid 6-digit OTP.");
      return;
    }

    const data = {
      type,
      value,
      otp: enteredOtp,
    };

    setIsLoading(true);
    try {
      const response = await verifyOtp(data);
      if (response.statusCode === 200) {
        toast.success(response.body.message || 'OTP verified successfully');
        setShowOtpModel(false);
        navigate('/notification-recipients'); 
      
      } else {
        toast.error(response.body.message || 'OTP verification failed');
      }
    } catch (error) {
        console.log("Verification failed. Please try again.", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {showOtpModel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity  ease-out opacity-100">
          <div className="relative max-w-md w-full mx-4 bg-white p-8 rounded-xl shadow-lg border border-gray-100 transform transition-all  ease-in-out scale-100 opacity-100">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 rounded-full p-1.5 cursor-pointer transition-all  ease-out hover:bg-gray-100 hover:text-gray-700 hover:scale-110"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Verify OTP</h2>
              <p className="text-gray-600 mt-2">
                Enter the 6-digit code sent to <br />
                <span className="font-medium text-blue-600 break-all">{value}</span>
              </p>
            </div>

            <div className="flex justify-center gap-3 mb-8">
              {otp.map((digit, idx) => (
                <Input
                  key={idx}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(e, idx)}
                  onKeyDown={(e) => handleBackspace(e, idx)}
                  ref={(el) => (inputsRef.current[idx] = el)}
                  className="w-14 h-14 text-center text-xl font-semibold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300 ease-in-out"
                  disabled={isLoading}
                />
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full py-6 text-base font-medium transition-all ease-in-out bg-[#0B1A6A] hover:bg-[#0B1A6A]/90 text-white border-[#0B1A6A] border-2 rounded-full cursor-pointer flex justify-center items-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin -ml-1 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Verifying...
                </span>
              ) : (
                <>
                  <ClipboardCheck className='!w-5 !h-5'/>
                  Verify Account
                </>
              )}
            </Button>

            <p className="text-center text-sm text-gray-500 mt-6">
              Didn't receive code?
              <button className="ml-1.5 text-[#0B1A6A] font-medium hover:underline cursor-pointer transition-colorsease-in-out">
                Resend
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default OtpVerification;
