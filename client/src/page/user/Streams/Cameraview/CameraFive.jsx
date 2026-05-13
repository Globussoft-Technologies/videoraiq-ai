import React from 'react';
import CameraCanvas from '../CameraCanvas';
import CameraStream from '../CameraPlay/CameraStream';

const CameraFive = ({ cameraData = [],selectedVideo }) => {
  // Only use the first 5 cameras for this grid
  const cameras = cameraData.slice(0, 5);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 sm:grid-cols-2 gap-2 lg:h-[calc(100vh-102px)]">
      {cameras.map((camera, idx) => (
        <div
          key={idx}
          className="relative border rounded overflow-hidden shadow-md [@media(max-width:1023px)]:aspect-video"
          onClick={() => {
            selectedVideo(camera);
          }}
        >
          {/* <CameraCanvas src={camera.config?.src || "https://media.w3.org/2010/05/sintel/trailer_hd.mp4"} maxminBtnclass="absolute md:top-1 top-2 right-1   bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white  2xl:w-[24px] 2xl:h-[24px] xl:w-[18px] xl:h-[18px] md:w-[27px] md:h-[27px] w-[32px] h-[32px] rounded-full flex justify-center items-center" maxsize="2xl:text-[16px] xl:text-[12px] md:text-[18px] text-[20px]" minsize="2xl:text-[16px] xl:text-[12px]  md:text-[18px] text-[20px]"/> */}
          <CameraStream
            key={idx}
            config={camera.config}
            label={camera.label}
            maxminBtnclass="absolute md:top-1 top-2 right-1   bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white  2xl:w-[24px] 2xl:h-[24px] xl:w-[18px] xl:h-[18px] md:w-[27px] md:h-[27px] w-[32px] h-[32px] rounded-full flex justify-center items-center"
            maxsize="2xl:text-[16px] xl:text-[12px] md:text-[18px] text-[20px]"
            minsize="2xl:text-[16px] xl:text-[12px]  md:text-[18px] text-[20px]"
          />

          <div className="absolute md:top-[6px] md:right-[32px] top-[12px] right-[36px] text-white 2xl:text-[10px] text-[8px] font-[500] px-2 py-1 rounded">
            {camera.datetime}
          </div>

          {/* Camera Name bottom-left */}
          <div className="absolute md:bottom-1 bottom-2 md:left-1 left-1 text-white 2xl:text-[10px] text-[8px] font-[500] px-2 py-0.5 rounded">
            {camera.title}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CameraFive;
