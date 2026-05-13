import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

const DetectionPreviewModal = ({ isOpen, onClose, children }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-2xl p-0 border-0 shadow-xl bg-[#F9F9F9] min-w-[800px] min-h-[500px] w-[80vw] max-w-[1100px] h-[70vh] max-h-[70vh]"
        closeBtn="hidden"
        aria-describedby={undefined}
      >
        {/* Close button in top-right */}
        <button
          onClick={onClose}
          className="absolute z-10 cursor-pointer focus:ring-2 focus:ring-transparent focus:outline-none top-6 right-8 backdrop-blur-md text-black w-8 h-8 rounded-full flex justify-center items-center "
        >
          <X size={25} />
        </button>
        {/* Heading area at top center, visually connected */}
        <div className="px-3 py-2  flex flex-col items-center justify-center rounded-t-2xl">
          <span className="text-[#07486A] text-lg font-semibold">
            preview area settings
          </span>
        </div>
        {/* Modal content area, no extra rounding */}
        <div className="w-full h-full flex flex-col bg-[#F7F8F8] min-h-[400px] min-w-[600px]">
          <div className="flex-1 flex flex-col min-h-[350px] min-w-[550px]">{children}</div>
          {/* Footer: Centered blue close button, visually connected */}
          <div className="px-3 py-4 md:p-4 2xl:p-6 flex flex-col items-center justify-center border-t border-[#E0E0E0] rounded-b-2xl bg-[#F9F9F9]">
            <button
              onClick={onClose}
              className="bg-[#07486A] cursor-pointer text-white px-8 py-2 rounded-full text-base font-medium hover:bg-[#07486A]/90 transition"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DetectionPreviewModal;
