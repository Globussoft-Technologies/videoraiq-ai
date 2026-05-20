import React from 'react';
import { useInnerSettings } from './InnerSettingsContext';

const DeviceDetail = () => {
  const { channelData } = useInnerSettings();
  const camera = channelData?.linkedCameras?.[0] || {};
  const nvr = camera?.nvrId || {};

  return (
    <div className="bg-white border border-[#E6E6E6] rounded-[10px] p-4 md:p-3 2xl:p-4">
      <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333] mb-4 md:mb-3 2xl:mb-4">Device Detail</h3>
      <div className="grid grid-cols-4 md:grid-cols-2 2xl:grid-cols-4 gap-x-4 md:gap-x-3 2xl:gap-x-4 gap-y-3 md:gap-y-2 2xl:gap-y-3 text-xs md:text-[11px] 2xl:text-xs">
        {/* <div>
          <p className="text-[#878787] mb-1">Status</p>
          <span className="px-2 py-1 md:px-1.5 md:py-0.5 2xl:px-2 2xl:py-1 bg-[#E8FFDB] text-[#338904] rounded-[5px] text-xs md:text-[11px] 2xl:text-xs">Online</span>
        </div> */}
        <div>
          <p className="text-[#878787] mb-1">Model</p>
          <p className="text-[#333333] font-medium">{nvr.model || 'N/A'}</p>
        </div>
        <div>
          <p className="text-[#878787] mb-1">NVR</p>
          <p className="text-[#333333] font-medium">{nvr.nvrName || 'N/A'}</p>
        </div>
        <div>
          <p className="text-[#878787] mb-1">IP Address</p>
          <p className="text-[#333333] font-medium">{nvr.ip || 'N/A'}</p>
        </div>
      </div>
    </div>
  );
};

export default DeviceDetail;
