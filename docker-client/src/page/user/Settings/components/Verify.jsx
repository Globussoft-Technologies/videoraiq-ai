import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { verifyOtp } from '../Api/post';
import { VerificationModal } from '../../NotificationRecipients/VerificationModal';

const Verify = () => {
  const [searchParams] = useSearchParams();
  const tokenData = searchParams.get("token");
  const value = searchParams.get("value");

  const [statusMessage, setStatusMessage] = useState("Verifying...");
  const [isLoading, setIsLoading] = useState(true);
  const [showOtpModel, setShowOtpModel] = useState(true);
  const [isSuccess, setIsSuccess] = useState(null);

  const navigate = useNavigate();
  const hasCalled = useRef(false);

  useEffect(() => {
    if (hasCalled.current) return;
    hasCalled.current = true;

    const type = value?.includes('@') ? 'email' : 'phone';
    const data = { tokenData, value, type };

    const handleVerification = async () => {
      try {
        const response = await verifyOtp(data);

        if (response.statusCode === 200) {
          setIsSuccess(true);
          setStatusMessage(`Your ${type} has been successfully verified!`);
          toast.success(response.body.message || 'Account verified successfully!');
        } else {
          setIsSuccess(false);
          toast.error(response.body.message || 'Account verification failed.');
          setStatusMessage('Verification failed. Please try again.');
        }
      } catch (error) {
        setIsSuccess(false);
        console.error("Verification error:", error);
        toast.error('A server error occurred during verification.');
        setStatusMessage('Verification failed due to a server error.');
      } finally {
        setIsLoading(false);
      }
    };

    if (tokenData && value) {
      handleVerification();
    } else {
      setIsSuccess(false);
      setStatusMessage('Invalid verification link. Missing token or value.');
      toast.error('Invalid verification link.');
      setIsLoading(false);
      // setShowOtpModel(false);
      // navigate('/');
    }
  }, [tokenData, value, navigate]);

  return (
    <>
      {showOtpModel && (
        <VerificationModal
          isSuccess={isSuccess}
          isLoading={isLoading}
          statusMessage={statusMessage}
        />
      )}
    </>
  );
};

export default Verify;
