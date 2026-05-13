import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import AddNewConfiguration from './components/AddNewConfiguration';
import SavedConfiguration from './components/SavedConfiguration';
import { X } from 'lucide-react';

const DetectionSettingsModal = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] md:w-full  max-w-4xl p-0 max-h-[100vh] top-[50%] left-[50%] customscrollbar translate-x-[-50%] translate-y-[-50%] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (e.target.closest('#receivers-dropdown')) {
            e.preventDefault();
          }
        }}
        closeBtn="flex justify-center items-center bg-[#3f3f3f80] backdrop-blur-md text-white w-8 h-8 rounded-full hover:bg-[#3f3f3f] transition cursor-pointer right-6 top-6"
      >
        <div className="bg-white rounded-lg h-full overflow-y-auto relative">
          <button
            onClick={onClose}
            className="absolute right-6 top-6 flex justify-center items-center  text-[#333333] w-8 h-8 rounded-full transition cursor-pointer z-20"
          >
            <X className="w-5 h-5" />
          </button>{' '}
          <div className="sticky top-0 bg-white p-6 border-b border-gray-100 z-10">
            <div className="flex justify-center items-center">
              <h1 className="font-medium text-[#333333] xl:text-sm 2xl:text-xl">
                Detection Settings
              </h1>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <SavedConfiguration Action={"action"}/>
            <AddNewConfiguration />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DetectionSettingsModal;
