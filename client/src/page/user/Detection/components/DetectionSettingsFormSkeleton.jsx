import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const DetectionSettingsFormSkeleton = () => {
  return (
    <div className="bg-[#FAFAFA] p-4 sm:p-6 rounded-b-[8px] sm:rounded-b-[10px] space-y-4 sm:space-y-6 w-full text-[10px] sm:text-xs md:text-sm">

      {/* Section 1: Settings Section */}
      <div className="bg-[#F5F5F5] p-6 rounded-[10px] space-y-6 text-xs md:text-sm">
        {/* Switches */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Skeleton width={120} />
            <Skeleton width={40} height={20} borderRadius={20} />
          </div>
        </div>

        {/* Setting Name */}
        <div>
          <Skeleton width={100} height={16} className="mb-2 ml-2" />
          <Skeleton height={42} className="rounded-[10px]" />
        </div>

        {/* Video Duration */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          <div>
            <Skeleton width={180} height={16} className="mb-2 ml-2" />
            <Skeleton height={42} className="rounded-[10px]" />
          </div>
        </div>

        {/* Sensitivity */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          <div>
            <Skeleton width={140} height={16} className="mb-2 ml-2" />
            <Skeleton height={42} className="rounded-[10px]" />
          </div>
        </div>

        {/* Camera & NVR Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-1 md:col-span-2">
            <Skeleton width={160} height={16} className="mb-2 ml-2" />
          </div>
          {/* NVR Dropdown */}
          <div>
            <Skeleton height={42} className="rounded-[10px]" />
          </div>
          {/* Camera Dropdown */}
          <div>
            <Skeleton height={42} className="rounded-[10px]" />
          </div>
        </div>

        {/* Area Settings Preview */}
        <div>
          <Skeleton width={100} height={16} className="mb-2 ml-2" />
          <Skeleton height={200} className="rounded-[10px]" />
        </div>
      </div>

      {/* Section 2: Alert Receivers */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton width={120} height={16} />
          <Skeleton width={120} height={32} borderRadius={20} />
        </div>
        
        {/* Recipients List */}
        <div className="bg-[#F5F5F5] p-4 rounded-[10px]">
          <div className="flex justify-between items-center mb-3 px-2">
            <Skeleton width={80} height={16} />
            <div className="flex gap-2">
              <Skeleton width={80} height={16} />
              <Skeleton width={80} height={16} />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 px-2 border-b border-gray-200 last:border-0">
              <div className="flex items-center gap-2">
                <Skeleton width={16} height={16} circle />
                <Skeleton width={120} height={16} />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton width={24} height={24} circle />
                <Skeleton width={24} height={24} circle />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex justify-center gap-2 sm:gap-4 pt-3 sm:pt-4">
        <Skeleton width={100} height={48} borderRadius={32} />
        <Skeleton width={120} height={48} borderRadius={32} />
      </div>
    </div>
  );
};

export default DetectionSettingsFormSkeleton;