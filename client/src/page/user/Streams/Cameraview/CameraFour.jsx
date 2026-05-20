import React from 'react';
import CameraCanvas from '../CameraCanvas';
import CameraStream from '../CameraPlay/CameraStream';

const CameraFour = ({ cameraData = [],selectedVideo }) => {
  // Only use the first 4 cameras for this grid
  const cameras = cameraData.slice(0, 4);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 h-[calc(100vh-102px)]">
      {cameras.map((camera, idx) => (
        <div
          key={idx}
          className="relative border rounded overflow-hidden shadow-md h-full"
          onClick={() => {
            selectedVideo(camera);
          }}
        >
          {/* <CameraCanvas src={camera.config?.src || "https://media.w3.org/2010/05/sintel/trailer_hd.mp4"} maxminBtnclass="absolute xl:top-[6px] xl:right-2 right-1 top-1 bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white xl:w-[29px] xl:h-[29px] w-[24px] h-[24px] rounded-full flex justify-center items-center" maxsize="xl:text-[18px] text-[14px]" minsize="xl:text-[18px] text-[14px]"/> */}
          <CameraStream
            key={idx}
            config={camera.config}
            label={camera.label}
            maxminBtnclass="absolute xl:top-[6px] xl:right-2 right-1 top-1 bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white xl:w-[29px] xl:h-[29px] w-[24px] h-[24px] rounded-full flex justify-center items-center"
            maxsize="xl:text-[18px] text-[14px]"
            minsize="xl:text-[18px] text-[14px]"
          />

          <div className="absolute xl:top-[6px] xl:right-[42px] top-1 right-[32px] text-white xl:text-[16px] sm:text-[14px] text-[12px] font-[500] px-2 py-1 rounded">
            {camera.datetime}
          </div>
          <div className="absolute xl:bottom-[6px] xl:left-[6px] bottom-1 left-1 text-white xl:text-[16px] text-[12px] sm:text-[14px] font-[500] px-2 py-0.5 rounded">
            {camera.title}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CameraFour;
