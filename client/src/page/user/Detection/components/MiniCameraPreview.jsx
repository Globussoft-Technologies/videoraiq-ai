import React, { useState } from 'react';
import { LuMaximize } from 'react-icons/lu';
import DetectionPreviewModal from './DetectionPreviewModal';

const MiniCameraPreview = ({
  processedImage,
  loadingPreviewImg,
  maxminBtnclass = 'absolute top-3 right-5 bg-[#3F3F3F80] backdrop-blur-md text-white w-8 h-8 rounded-full flex justify-center items-center hover:bg-[#3f3f3f] transition focus:outline-none z-10',
  maxsize = 'w-5 h-5'
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const getImageSrc = () => {
    if (!processedImage) return null;
    if (processedImage.startsWith('data:image')) return processedImage;
    return `data:image/jpeg;base64,${processedImage}`;
  };

  return (
    <div className="relative w-full h-full">
      {/* Preview section */}
      {loadingPreviewImg ? (
        <div className="w-full h-full flex items-center justify-center bg-black text-white text-sm rounded">
          <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : processedImage ? (
        <img
          src={getImageSrc()}
          alt="Processed Preview"
          className="w-full h-full object-contain bg-black rounded"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-black text-white text-sm rounded">
          No preview image
        </div>
      )}
      {/* Modal */}
      <DetectionPreviewModal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="flex-1 flex items-center justify-center w-full h-full">
          {processedImage ? (
            <img
              src={getImageSrc()}
              alt="Processed Preview Fullscreen"
              className="w-full h-full object-contain bg-black rounded"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black text-white text-sm rounded">
              No preview image
            </div>
          )}
        </div>
      </DetectionPreviewModal>
    </div>
  );
};

export default MiniCameraPreview;
