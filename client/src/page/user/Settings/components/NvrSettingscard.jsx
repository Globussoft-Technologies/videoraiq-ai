import React from 'react';

const NVRSettingsCard = ({ settings }) => {
  return (
    <div className="bg-[#F5F5F5] p-6 rounded-[10px] relative">
      {/* Container for scrollable content */}
      <div className="overflow-x-auto">
        {/* Inner container to ensure content takes up space for scrolling */}
        <div className="min-w-max md:min-w-0">
          {/* Block 1 */}
          <div className="grid grid-cols-3 gap-4 mb-4 text-nowrap">
            {/* text-nowrap prevents wrapping inside grid cells */}
            <span>
              <span className="text-[#7A7A7A] text-[14px] font-medium mb-1 block">
                Name
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.name}
              </span>
            </span>
            <span>
              <span className="text-[#7A7A7A] text-[14px] font-medium mb-1 block">
                Username
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.username}
              </span>
            </span>
            <span>
              <span className="text-[#7A7A7A] text-[14px] font-medium mb-1 block">
                Password
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.password}
              </span>
            </span>
          </div>
          {/* Block 2 */}
          <div className="grid grid-cols-3 gap-4 text-nowrap">
            {/* text-nowrap prevents wrapping inside grid cells */}
            <span>
              <span className="text-gray-500 text-xs mb-1 block">
                IP Address
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.ipAddress}
              </span>
            </span>
            <span>
              <span className="text-gray-500 text-xs mb-1 block">
                RTSP Port
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.rtspPort}
              </span>
            </span>
            <span>
              <span className="text-gray-500 text-xs mb-1 block">
                Total Channels
              </span>
              <span className="text-[#333333] text-[16px] font-medium block">
                {settings.totalChannels}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NVRSettingsCard;
