import ReactDOM from 'react-dom';
import longlogo from '@/assets/LongLogo.svg';
import { VscVerified } from 'react-icons/vsc';
import { ShieldAlert } from 'lucide-react';

const SuccessContent = ({ message }) => (
  <>
    <div className="flex justify-center mb-1">
      <VscVerified className="text-[#317718] w-10 h-10 lg:w-13 lg:h-13" />
    </div>
    <h2 className="text-[20px] lg:text-[26px] font-[500] text-[#317718] mb-2">
      Verified Successfully
    </h2>
    <p className="text-lg lg:text-xl text-[#333333] font-[600] mb-2">Thank you!</p>
    <p className="text-xs lg:text-[15px] text-[#5D5D5D] font-[400]">
      {"You're all set to continue."}
    </p>
  </>
);

const FailureContent = ({ message }) => (
  <>
    <div className="flex justify-center mb-2">
      <ShieldAlert className="text-[#DC2626] w-10 h-10 lg:w-13 lg:h-13" />
    </div>
    <h2 className="text-[20px] lg:text-[26px] font-[500] text-[#CA1010] mb-2">
      Verification Failed
    </h2>
    <p className="text-lg lg:text-xl text-[#333333] font-[600] mb-3">Couldn’t verify. Try again.</p>
    <p className="text-sm text-[#5D5D5D] font-normal max-w-xs mx-auto text-center">
      {message || "There seems to be an issue. Please check and try again."}
    </p>
  </>
);

const Loader = () => (
  <div className="flex justify-center my-6">
    <svg
      className="animate-spin h-10 w-10 text-[#0B1A6A]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  </div>
);

export const VerificationModal = ({ isSuccess, isLoading, statusMessage }) => {
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-[20px] w-full max-w-md text-center px-6 py-10 shadow-lg animate-fade-in-up">
        <div className="mb-10 mt-0 flex justify-center">
          <img src={longlogo} alt="VideoraIQ Logo" className="h-10 object-contain" />
        </div>

        {isLoading ? (
          <>
            <Loader />
            <p className="text-sm text-gray-500">{statusMessage}</p>
          </>
        ) : isSuccess ? (
          <SuccessContent message={statusMessage} />
        ) : (
          <FailureContent message={statusMessage} />
        )}
      </div>
    </div>,
    document.body
  );
};
