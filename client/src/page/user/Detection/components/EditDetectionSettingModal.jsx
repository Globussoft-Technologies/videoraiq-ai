import {React,useRef,useState} from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// import SavedConfiguration from './components/SavedConfiguration';
import { X } from 'lucide-react';
import DetectionSettingsForm from './ManageSettings';

const DetectionSettingsModal = ({ isOpen, onClose,data ,fetchData}) => {
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[100vw] md:max-w-4xl  p-0 max-h-[100vh] top-[50%] left-[50%] customscrollbar translate-x-[-50%] translate-y-[-50%] overflow-y-auto"
        closeBtn="flex justify-center items-center bg-[#3f3f3f80] backdrop-blur-md text-white w-8 h-8 rounded-full hover:bg-[#3f3f3f] transition cursor-pointer right-6 top-6"
      >
        <div className="bg-white h-full overflow-y-auto relative">
          <button
            onClick={onClose}
            className="absolute right-6 top-6 flex justify-center items-center  text-[#333333] w-8 h-8 rounded-full transition cursor-pointer z-20"
          >
            <X className="w-5 h-5" />
          </button>{' '}
          <div className="sticky top-0 bg-white p-6 border-b border-gray-100 z-10">
            <div className="flex justify-center items-center">
              <h1 className="font-medium text-[#333333] xl:text-sm 2xl:text-xl">
                Edit Configurations
              </h1>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="relative pt-12">
              <h2 className="absolute top-0 left-0 mt-2 ml-2 text-[#333333] text-lg font-[500]">
                Edit Configuration Settings
              </h2>
              <DetectionSettingsForm  hideAreaSettings  heading={data?.detectionSetting?.detectionName} editData={data}  onClose={onClose} fetchData={fetchData} isModal={true} selectedType={data?.detectionSetting?.settingType}/>
            </div>

            {/* <div className="flex justify-center gap-1 mt-8">
              <button
                onClick={onClose}
                className="px-6 py-2 cursor-pointer font-[400] rounded-[32px] bg-transparent text-[#333333] hover:bg-gray-300 transition"
              >
                Close
              </button>
              <button
                type="submit"
                 onClick={handleSave}
                className="px-6 cursor-pointer font-[400] py-3 rounded-[32px] bg-[#07486A] text-white  hover:bg-[#05344a] transition"
              >
                Save Changes
              </button>
            </div> */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DetectionSettingsModal;
