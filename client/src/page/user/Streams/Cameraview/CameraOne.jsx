import React from 'react';
import CounterImg1 from '../../../../assets/CounterImg1.png';
import CounterImg2 from '../../../../assets/CounterImg2.png';

import CounterImg3 from '../../../../assets/CounterImg3.png';

import CounterImg4 from '../../../../assets/CounterImg4.png';
import CameraCanvas from '../CameraCanvas';
import CameraStream from '../CameraPlay/CameraStream';

const CameraOne = ({ cameraData,selectedVideo }) => {

  return (
    <div className="grid grid-cols-1  gap-4 h-[calc(100vh-102px)]"
    >
      {cameraData.map((camera, idx) => (
        <div
          key={idx}
          className="relative border rounded overflow-hidden shadow-md w-full h-full"
          onClick={() => {
            selectedVideo(camera);
          }} 
        >
          {/* <img
            src={camera.image}
            alt={camera.title}
            className="w-full sm:h-[24vw] h-[47vw]"
          /> */}
          {/* <CameraCanvas
            src="https://media.w3.org/2010/05/sintel/trailer_hd.mp4"
            maxminBtnclass="absolute top-[12px] right-2   bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white  w-[29px] h-[29px] rounded-full flex justify-center items-center"
            maxsize="text-[18px]"
            minsize="text-[18px]"
          /> */}

          <CameraStream
            key={idx}
            config={camera.config}
            label={camera.label}
            maxminBtnclass="absolute top-[12px] right-2   bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white  w-[29px] h-[29px] rounded-full flex justify-center items-center"
            maxsize="text-[18px]"
            minsize="text-[18px]"
          />

          {/* Date top-right */}
          <div className="absolute top-[12px] right-[42px]  text-white text-[16px] font-[500] px-2 py-1 rounded">
            {camera.datetime}
          </div>

          {/* Camera Name bottom-left */}
          <div className="absolute bottom-[24px] left-[24px] text-white text-[16px] font-[500] px-2 py-0.5 rounded">
            {camera.title}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CameraOne;
