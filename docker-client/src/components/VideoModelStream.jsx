import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import CameraCanvas from '@/page/user/Streams/CameraCanvas';
import Suspicious from '@/assets/Hackersvg.svg';
import Flames from '@/assets/Flames.svg';
import PhoneImg from '@/assets/Phonesvg.svg';
import PeopleImg from '@/assets/Peoplesvg.svg';
import EmotionIcon from '@/assets/Facesvg.svg';
import Redflame from '@/assets/Redflame.svg';
import CameraStream from '@/page/user/Streams/CameraPlay/CameraStream';

// Simpler StatCard component
const StatCard = (({ icon, value, label }) => (
  <div className="flex items-center gap-2 sm:gap-3">
    <div className="bg-[#E9F1FF] p-2 sm:p-2.5 md:p-3 rounded-full">
      <img
        src={icon}
        alt={label}
        className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6"
      />
    </div>
    <div className="min-w-0">
      <p className="truncate text-xs sm:text-sm font-medium text-[#333]">
        {value}
      </p>
      <p className="truncate text-[10px] sm:text-xs text-muted-foreground">
        {label}
      </p>
    </div>
  </div>
));

// Simpler AlertBadge component
const AlertBadge = (({ isSmoke }) => (
  <div
    className={`flex items-center gap-2 font-normal text-sm sm:text-base md:text-lg ${
      isSmoke ? 'text-[#EF8000]' : 'text-[#CE241C]'
    }`}
  >
    <img
      src={isSmoke ? Flames : Redflame}
      alt="Alert Icon"
      className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 "
    />
    <span className="max-[364px]:text-[8px] mt-1">
      {isSmoke ? 'Smoke Detected' : 'Fire Detected'}
    </span>
    <span
      className={`text-[10px] sm:text-xs md:text-sm font-medium px-3 py-1 sm:px-5 sm:py-2 rounded-[6.53px] ${
        isSmoke ? 'bg-[#FFE4C5] text-[#EF8000]' : 'bg-[#FFDBD9] text-[#CE241C]'
      }`}
    >
      {isSmoke ? 'Mild' : 'Critical'}
    </span>
  </div>
));

// Main VideoModal component
const VideoModalStream = ({ isOpen, onClose, videoData }) => {
  if (!videoData) return null;

  const isSmoke = videoData.id === 0;
  const isFire = videoData.id === 1;

  const stats = [
    {
      icon: PeopleImg,
      value: videoData.peopleDetected ?? 20,
      label: 'People Detected',
    },
    {
      icon: Suspicious,
      value: videoData.suspiciousActivity ?? 'None',
      label: 'Suspicious Activity',
    },
    { icon: PhoneImg, value: videoData.phoneUsage ?? 3, label: 'Phone Usage' },
    {
      icon: EmotionIcon,
      value: videoData.emotion ?? 'Concerned',
      label: 'Emotion Detected',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-full max-w-md sm:max-w-lg md:max-w-5xl p-0 overflow-hidden [&>button:last-child]:hidden"
        aria-describedby={undefined}
      >
        <div className="bg-[#F7F8F8] rounded-lg overflow-hidden">
          {/* Video Section */}
          <div className="relative aspect-video">
            {/* <CameraCanvas
              src={videoData.videoSrc}
              thumbnailSrc={videoData.thumbnailSrc}
              maxminBtnclass="absolute focus:ring-2 focus:ring-transparent focus:outline-none top-4 right-4 bg-[#3f3f3f80] backdrop-blur-md text-white w-8 h-8 rounded-full flex justify-center items-center"
              maxsize="text-base"
              minsize="text-base w-4 h-4"
              isInModal={true}
            /> */}
            <CameraStream
            config={videoData?.config}
            label={videoData?.label}
            maxminBtnclass="absolute top-[12px] right-2  bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white  w-[29px] h-[29px] rounded-full flex justify-center items-center"
            maxsize="text-[18px]"
            minsize="text-[18px]"
          />

            <div className="absolute top-4 left-4 bg-[#3F3F3F80] text-white text-[10px] font-normal px-3 py-[6px] rounded-full">
              ▶ Live
            </div>
            <div className="absolute top-4 right-16 font-medium text-white text-[10px] sm:text-xs md:text-sm px-3 py-[6px] rounded-full">
              {videoData.timestamp}
            </div>
            <div className="absolute bottom-4 left-4 text-[#FFFFFF] font-medium text-xs sm:text-sm md:text-base px-2 py-1 rounded bg-black/40">
              {videoData.title}
            </div>
          </div>

          {/* Footer Section */}
          <div className="bg-[#F9F9F9] px-3 py-4 sm:px-6 sm:py-6">
            {/* Conditionally Render Smoke/Fire Alert */}
            {(isSmoke || isFire) && (
              <div className="flex items-center justify-between mb-6 md:mb-8 gap-3">
                <AlertBadge isSmoke={isSmoke} />
                <div className="flex items-center bg-[#E9F1FF] rounded-[5px] py-1 px-2 space-x-2">
                  <Checkbox id={`resolved-${videoData.id}`} className="border border-[#8D8D8D]" />
                  {/* Corrected Label structure */}
                  <label
                    htmlFor={`resolved-${videoData.id}`}
                    className="text-[#7A7A7A] text-xs max-[364px]:text-[8px] sm:text-sm text-muted-foreground"
                  >
                    Mark as resolved
                  </label>
                </div>
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {stats.map((stat, index) => (
                <StatCard
                  key={index}
                  icon={stat.icon}
                  value={stat.value}
                  label={stat.label}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoModalStream;