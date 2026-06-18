import React from 'react';
import Skeleton from 'react-loading-skeleton';
import { ChevronLeftIcon, ChevronRightIcon, Circle } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';

import people from '@/assets/Peoplesvg.svg';
import Susspious from '@/assets/Hackersvg.svg';
import Nuetral from '@/assets/Facesvg.svg';
import PhoneNew from '@/assets/Phonesvg.svg';
import DynamicDateTime from '@/utils/DynamicDateTime';
import CameraStream from '../../Streams/CameraPlay/CameraStream';
import lineCrossingIcon from '@/assets/lineCrossing.svg';

const CameraViewSection = ({
  nvrList,
  selectedNvrId,
  handleNvrChange,
  cameraChannels,
  selectedCamera,
  handleCameraClick,
  selectedConfig,
  selectedVideo,
  setSelectedVideo,
  personCounts,
  lineCrossing,
  objectDetections,
  emotionDetected,
  nvrNameLoading,
  selectedNvrDetails,
  channelScrollRef,
  scrollChannels,
}) => {
  return (
    <div className="bg-[#fafafa] rounded-[10px] xl:p-2 2xl:p-4 w-full h-full xl:py-[10px] 2xl:py-[18px] xl:px-[5px] 2xl:px-[10px]">
      {/* Header */}
      <div className="flex justify-between items-start xl:mb-2 2xl:mb-3 xl:p-1 2xl:p-2">
        <div className="flex items-center xl:gap-2 2xl:gap-3">
          {nvrNameLoading ? (
            <Skeleton
              height={30}
              className="rounded-md w-full"
              containerClassName="block w-full"
            />
          ) : nvrList.length <= 1 ? (
            <input
              type="text"
              value={nvrList[0]?.nvrName || ''}
              disabled
              className="xl:text-xs 2xl:text-sm text-gray-700 border border-gray-300 rounded-md xl:px-2 xl:py-1.5 2xl:px-3 2xl:py-2 w-full bg-gray-100 cursor-not-allowed"
            />
          ) : (
            <Select value={selectedNvrId} onValueChange={handleNvrChange}>
              <SelectTrigger className="xl:text-xs 2xl:text-sm text-gray-700 border border-gray-300 rounded-md xl:px-2 xl:py-1.5 2xl:px-3 2xl:py-2 w-full">
                <SelectValue placeholder="Select an NVR" />
              </SelectTrigger>
              <SelectContent className="bg-[#C8C8C8]">
                {nvrList.map((nvr) => (
                  <SelectItem key={nvr._id} value={nvr._id}>
                    {nvr.nvrName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {/* Corrected: Wrap DynamicDateTime in a span for responsive sizing */}
        <span className="xl:text-xs 2xl:text-sm">
          <DynamicDateTime />
        </span>
      </div>

      {/* Camera Tabs */}
      {cameraChannels.length > 0 && selectedNvrDetails ? (
        <div className="flex items-center xl:mb-2 2xl:mb-3 xl:gap-1 2xl:gap-2 xl:p-1 2xl:p-2">
          <button
            type="button"
            className="bg-white border cursor-pointer border-gray-300 rounded-full xl:p-0.5 2xl:p-1 shadow hover:bg-gray-100 disabled:opacity-30 xl:mr-1 2xl:mr-2"
            onClick={() => scrollChannels('left')}
            tabIndex={-1}
          >
            <ChevronLeftIcon className="xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
          </button>

          <div
            ref={channelScrollRef}
            className="flex-1 min-w-0 flex space-x-2 customscrollbar overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent xl:px-1 2xl:px-2 xl:py-0.5 2xl:py-1"
          >
            {cameraChannels.map((channel) => {
              const rtspChannels = channel.rtspChannels || [];
              const streamToDisplay =
                rtspChannels.length === 2 ? rtspChannels[1] : rtspChannels[0];
              if (!streamToDisplay || !channel.name) return null;
              const isSelected = selectedCamera === channel._id;
              return (
                <button
                  key={channel._id}
                  onClick={() => handleCameraClick(channel)}
                  className={`xl:text-[10px] 2xl:text-xs xl:px-2 2xl:px-3 cursor-pointer xl:py-1 2xl:py-1.5 rounded-lg transition-colors duration-150 whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#0B1A6A] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {channel.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="bg-white border cursor-pointer border-gray-300 rounded-full xl:p-0.5 2xl:p-1 shadow hover:bg-gray-100 disabled:opacity-30 xl:ml-1 2xl:ml-2"
            onClick={() => scrollChannels('right')}
            tabIndex={-1}
          >
            <ChevronRightIcon className="xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center xl:mb-2 2xl:mb-3 xl:gap-1 2xl:gap-2 w-full">
          <div className="bg-white border border-gray-300 rounded-full xl:p-0.5 2xl:p-1 xl:mr-1 2xl:mr-2 opacity-50">
            <ChevronLeftIcon className="xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
          </div>
          <div className="flex-1 min-w-0 flex space-x-2 xl:px-1 2xl:px-2 xl:py-0.5 2xl:py-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="xl:h-6 xl:w-16 2xl:h-8 2xl:w-20 rounded-lg bg-gray-200 animate-pulse"
              />
            ))}
          </div>
          <div className="bg-white border border-gray-300 rounded-full xl:p-0.5 2xl:p-1 xl:ml-1 2xl:ml-2 opacity-50">
            <ChevronRightIcon className="xl:w-4 xl:h-4 2xl:w-5 2xl:h-5" />
          </div>
        </div>
      )}

      {/* Camera Stream */}
      <div className="relative rounded-lg overflow-hidden xl:mb-2 2xl:mb-4">
        {selectedConfig ? (
          <CameraStream
            key={selectedCamera}
            config={selectedConfig}
            maxminBtnclass="absolute xl:top-[8px] 2xl:top-[12px] right-2 bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white xl:w-[24px] xl:h-[24px] 2xl:w-[29px] 2xl:h-[29px] rounded-full flex justify-center items-center"
            maxsize="xl:text-[14px] 2xl:text-[18px]"
            minsize="xl:text-[14px] 2xl:text-[18px]"
            selectedVideo={selectedVideo}
            setSelectedVideo={setSelectedVideo}
          />
        ) : (
          <Skeleton height={250} className="w-full skeleton-pulse" />
        )}
        <div className="absolute bottom-2 right-2 bg-[#3F3F3F80] text-white xl:text-[10px] 2xl:text-xs xl:px-1.5 xl:py-1.5 2xl:px-2 2xl:py-2 rounded-[7px] flex items-center xl:gap-0.5 2xl:gap-1">
          <span>Live</span>
          <Circle fill="#39C90D" className="xl:w-3 xl:h-3 2xl:w-4 2xl:h-4" />
        </div>
      </div>

      {/* Detection Info */}
      <div className="grid grid-cols-2 xl:text-xs 2xl:text-sm xl:p-1 2xl:p-2 text-gray-700 xl:gap-[10px] 2xl:gap-[16px]">
        <DetectionInfo
          icon={people}
          count={personCounts?.count || 0}
          label="People Detected"
        />
        <DetectionInfo
          icon={Susspious}
          count={
            (() => {
              const firstObj = objectDetections.objectsDetected?.[0];
              return firstObj
                ? Object.entries(firstObj)
                    .map(([key, val]) => `${key}: ${val}`)
                    .join(', ')
                : '0';
            })() || 'None'
          }
          label="Suspicious Activity"
        />
        <DetectionInfo
          icon={Nuetral}
          count={emotionDetected}
          label="Emotion Detected"
        />
        <DetectionInfo
          icon={PhoneNew}
          count={objectDetections?.phoneUsage || 0}
          label="Phone Usage"
        />
        {lineCrossing && (lineCrossing.atoB >= 0 || lineCrossing.btoA >= 0) && (
          <DetectionInfo
            icon={lineCrossingIcon}
            count={`A → B: ${lineCrossing.atoB ?? '--'}, B → A: ${lineCrossing.btoA ?? '--'}`}
            label="Line Crossing Detected"
          />
        )}
      </div>
    </div>
  );
};

const DetectionInfo = ({ icon, count, label }) => (
  <div className="flex xl:gap-[8px] 2xl:gap-[12px] items-center">
    <div className="xl:h-[28px] xl:w-[28px] 2xl:h-[33px] 2xl:w-[33px] rounded-full flex justify-center items-center bg-[#e9f1ff]">
      <img
        src={icon}
        className="xl:w-[16px] xl:h-[16px] 2xl:w-[20px] 2xl:h-[20px]"
        alt={label}
      />
    </div>
    <div>
      <p className="font-[500] xl:text-[10px] 2xl:text-[12px] text-[#333333]">
        {count}
      </p>
      <p className="font-[400] xl:text-[8px] 2xl:text-[10px] text-[#7a7a7a]">
        {label}
      </p>
    </div>
  </div>
);

export default CameraViewSection;
