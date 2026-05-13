import React from 'react';
import ReactDOM from 'react-dom';
import { Loader2, VideoOff, Download, CircleFadingArrowUp } from 'lucide-react';
import { FaBell } from 'react-icons/fa';


const UpgradeModal = ({ confirmLabel = "Install" }) => {
  const [open, setOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  // All other content is hardcoded
  const handleClose = () => setOpen(false);
  const handleConfirm = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setOpen(false);
    }, 1500);
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center bg-black/40 transition-opacity duration-300 animate-fade-in">
      <div className="bg-white rounded-xl shadow-lg p-8 w-[90vw] max-w-sm flex flex-col items-center transition-all duration-300 animate-fade-in-up">
        <div className="mb-4 flex items-center bg-[#F5F5F5] rounded-full p-4 justify-center">
          {/* Placeholder for icon - you can replace this with an actual SVG or image if needed */}
         <VideoOff size={35} className='text-[#595959]'/>
        </div>
        <div className="text-center 2xl:text-[20px] xl:text-base font-[500] mb-3">Video not available</div>
        <div className="text-center font-[400] text-sm text-[#333333] mb-7">
         Install or update the app to view this feed.
        </div>
        <div className="flex gap-1 justify-center w-full">
          <button
            className="px-2 md:text-base cursor-pointer py-2 font-[400] rounded-full text-[#333333] hover:underline transition"
            onClick={handleClose}
            type="button"
          >
            Dismiss
          </button>
          {confirmLabel === 'Upgrade' ? (
            <button
              onClick={handleConfirm}
              disabled={loading}
              type="button"
              className="bg-[#07486A] text-white px-4 py-2 rounded-[32px] cursor-pointer flex items-center gap-3 shadow-md hover:opacity-90 transition-all min-w-[100px]"
            >
              {loading ? (
                <Loader2 className="animate-spin w-5 h-5 mx-auto" />
              ) : (
                <>
                  <CircleFadingArrowUp className="w-6 h-6 shrink-0" />
                  <div className="flex flex-col leading-tight text-left">
                    <span className="text-[9px] font-[400] opacity-90">Version 1.61.14</span>
                    <span className="text-sm sm:text-base font-[400] -mt-[2px]">Upgrade</span>
                  </div>
                </>
              )}
            </button>
          ) : (
            <button
              className="px-6 py-2  cursor-pointer font-[400] rounded-full transition flex items-center justify-center gap-2 min-w-[100px] bg-[#07486A] text-white hover:bg-[#07486A]/90"
              onClick={handleConfirm}
              disabled={loading}
              type="button"
            >
              <span className="inline-flex items-center justify-center w-full gap-2">
                {loading ? (
                  <Loader2 className="animate-spin w-5 h-5 mx-auto" />
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span className="font-[400] text-base">{confirmLabel}</span>
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpgradeModal;