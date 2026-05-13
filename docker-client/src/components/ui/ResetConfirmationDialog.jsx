import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ResetConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  title = "Reset Confirmation",
  message = "This action cannot be undone. Are you sure you want to proceed?"
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[16px] animate-fade-in bg-white w-[92vw] sm:w-[420px] h-auto top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] p-0 gap-0 flex flex-col overflow-hidden border-2 border-[#07486A]/20">
        {/* Fixed Header */}
        <div className="flex-shrink-0 px-6 pt-4 pb-2 border-b animate-fade-up border-[#07486A]/20 bg-[#07486A]/5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#07486A]/10 flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-5 h-5 text-[#07486A]" strokeWidth={1.5} />
              </div>
              <DialogTitle className="2xl:text-xl text-lg font-semibold text-[#333333]">
                {title}
              </DialogTitle>
            </div>
            <div className="ml-4 flex-shrink-0">
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-shrink-0 px-6 pt-3 pb-4 bg-white">
          <p className="text-xs md:text-sm text-[#666666] font-[400] mt-1 mb-2">
            {message}
          </p>
        </div>

        {/* Fixed Footer */}
        <div className="flex-shrink-0 px-6 py-4  bg-white">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="default" onClick={onClose} className="rounded-[7px] cursor-pointer border border-[#D3D3D3] text-[#474242] font-[500] px-5 py-3">
                Cancel
              </Button>
              <Button onClick={onConfirm} className="rounded-[7px] cursor-pointer text-white px-5 font-[500] py-3 bg-[#07486A] hover:bg-[#05374F]">
                Reset Anyway
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResetConfirmationDialog;