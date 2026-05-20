import React from 'react';
import CameraStream from '../CameraPlay/CameraStream';

const CameraThree = ({ cameraData = [], selectedVideo, setSelectedVideo }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
      {cameraData.map((camera, idx) => (
        <div
          key={idx}
          className="relative  rounded-lg overflow-hidden  bg-black aspect-video"
        >
          <CameraStream
            config={camera.config}
            label={camera.label}
            maxminBtnclass="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white w-7 h-7 rounded-full flex justify-center items-center hover:bg-black/80 transition"
            maxsize="text-[16px]"
            minsize="text-[16px]"
            selectedVideo={selectedVideo}
            setSelectedVideo={setSelectedVideo}
          />

          <div className="absolute top-2 right-11 text-white text-sm sm:text-base font-semibold bg-black/50 px-2 py-0.5 rounded-md shadow">
            {camera.datetime}
          </div>

          <div className="absolute bottom-2 left-2 text-white text-sm sm:text-base font-medium bg-black/50 px-2 py-0.5 rounded-md shadow">
            {camera.title}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CameraThree;
