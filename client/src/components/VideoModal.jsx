import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import CameraCanvas from '@/page/user/Streams/CameraCanvas';
import Suspicious from '@/assets/Hackersvg.svg';
import Flames from '@/assets/Flames.svg';
import PhoneImg from '@/assets/Phonesvg.svg';
import PeopleImg from '@/assets/Peoplesvg.svg';
import EmotionIcon from '@/assets/Facesvg.svg';
import Redflame from '@/assets/Redflame.svg';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import {
  AlertCircle,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Flag,
} from 'lucide-react';
import 'react-loading-skeleton/dist/skeleton.css';
import moment from 'moment';
import { object } from 'yup';
import { Loader2 } from 'lucide-react';

const StatCard = ({ icon, value, label }) => (
  <div className="flex items-center gap-1.5 md:gap-2 2xl:gap-3 min-w-[60px] md:min-w-[80px] 2xl:min-w-[120px]">
    <div className="bg-[#E9F1FF] p-1 md:p-1.5 2xl:p-3 rounded-full flex-shrink-0">
      <img
        src={icon}
        alt={label}
        className="w-3.5 h-3.5 md:w-4 md:h-4 2xl:w-6 2xl:h-6"
      />
    </div>
    <div className="min-w-0">
      <p className="truncate text-[11px] md:text-xs 2xl:text-base font-semibold text-[#333]">
        {value ?? '--'}
      </p>
      <p className="truncate text-[9px] md:text-[10px] 2xl:text-sm text-muted-foreground">
        {label}
      </p>
    </div>
  </div>
);

// Simpler AlertBadge component (no changes needed)
const AlertBadge = ({ isSmoke }) => (
  <div
    className={`flex items-center gap-1.5 md:gap-2 font-normal text-xs md:text-sm 2xl:text-base ${
      isSmoke ? 'text-[#EF8000]' : 'text-[#CE241C]'
    }`}
  >
    <img
      src={isSmoke ? Flames : Redflame}
      alt="Alert Icon"
      className="h-3.5 w-3.5 md:h-4 md:w-4 2xl:h-5 2xl:w-5"
    />
    <span className="whitespace-nowrap">
      {isSmoke ? 'Smoke Detected' : 'Fire Detected'}
    </span>
    <span
      className={`text-[9px] md:text-[10px] 2xl:text-xs font-medium px-2 py-0.5 md:px-2.5 md:py-1 2xl:px-3 2xl:py-1.5 rounded-md ${
        isSmoke ? 'bg-[#FFE4C5] text-[#EF8000]' : 'bg-[#FFDBD9] text-[#CE241C]'
      }`}
    >
      {isSmoke ? 'Mild' : 'Critical'}
    </span>
  </div>
);

// Main VideoModal component
const VideoModal = ({
  isOpen,
  onClose,
  videoData,
  resolved,
  onMarkResolved,
  totalIncidents,
  canEdit,
  allIncidents = [],
  onNavigate,
    currentPage,
  pageSize,
  onNavigateByIndex,
  onReport
}) => {
  let totalCounts = {};
  let totalDetected = 0;
const [isNavigating, setIsNavigating] = useState(false);
const [navDirection, setNavDirection] = useState(null);
const [isCollapsed, setIsCollapsed] = useState(false);
  if (videoData?.objectsDetected) {
    videoData.objectsDetected.forEach((obj) => {
      Object.entries(obj).forEach(([key, value]) => {
        totalCounts[key] = (totalCounts[key] || 0) + value;
      });
    });

    totalDetected = Object.values(totalCounts).reduce(
      (sum, count) => sum + count,
      0
    );
  }

  const scrollRef = useRef();

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

 

 const currentIndex = allIncidents.findIndex(
  (item) => item.id === videoData?.id
);

const globalIndex =
  (currentPage - 1) * pageSize + currentIndex;


  const handleNext = async() => {
  const nextGlobalIndex = globalIndex + 1;
  if (nextGlobalIndex < totalIncidents) {
      setIsNavigating(true);
       setNavDirection("next");
    await onNavigateByIndex(nextGlobalIndex);
      setIsNavigating(false);
       setNavDirection(null);
  }
};

const handlePrev = async() => {
  const prevGlobalIndex = globalIndex - 1;
  if (prevGlobalIndex >= 0) {
      setIsNavigating(true);
      setNavDirection("prev");
   await onNavigateByIndex(prevGlobalIndex);
      setIsNavigating(false);
        setNavDirection(null);
  }
};
useEffect(() => {
  if (!isOpen) return;

  const handleKeyDown = (e) => {
    if (isNavigating) return;

    switch (e.key) {
      case "ArrowLeft":
        handlePrev();
        break;
      case "ArrowRight":
        handleNext();
        break;
      case "Escape":
        onClose();
        break;
      default:
        break;
    }
    
  };

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [isOpen, isNavigating, globalIndex, totalIncidents]);


 if (!videoData) {
    return null;
  }
  const stats = [
    {
      // icon: PeopleImg,
      value: videoData.unknownCount ? videoData.unknownCount : undefined,
      label: 'Unknown People',
    },
    // Add other stats when needed
  ].filter(
    (stat) =>
      stat.value !== undefined && stat.value !== null && stat.value !== ''
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="!w-[100vw] !p-0 !top-0 !left-0 !h-[100vh] overflow-hidden"
        closeBtn="hidden"
        aria-describedby={undefined}
      >
        <div className="fixed inset-0 z-50 bg-black select-none">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 focus:outline-none cursor-pointer text-white border-none backdrop-blur-md w-7 h-7 2xl:w-9 2xl:h-9 rounded-full flex justify-center items-center bg-[#3f3f3f80] hover:bg-[#3f3f3f] transition-colors p-1 md:p-2 2xl:p-2.5"
          >
            <Minimize2 className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" />
          </button>

          <div className="bg-black overflow-hidden h-full relative">
            <div className="absolute inset-0">
                        {isNavigating && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                <Loader2 className="h-10 w-10 text-white animate-spin" />
              </div>
            )}
              <CameraCanvas
                src={videoData.videoSrc}
                thumbnailSrc={videoData.thumbnailSrc}
                maxminBtnclass="hidden"
                maxsize="text-base cursor-pointer"
                minsize="text-base w-4 h-4 cursor-pointer"
                isInModal={true}
              />
              {/* <div className="absolute top-5 right-14 font-medium text-white text-[10px] 2xl:text-xs 2xl:px-3 py-1.5">
                {totalIncidents
                  ? moment(videoData?.timeOfIncident)
                      .local()
                      .format('DD-MM-YYYY HH:mm:ss')
                  : moment(videoData?.timeOfIncident)
                      .local()
                      .format('DD-MM-YYYY HH:mm:ss')}
              </div> */}
            </div>

            {/* Incident switching arrows */}
            {allIncidents.length > 1 && (
              <>
                {globalIndex > 0 && (
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-[#3F3F3F]/50 text-white w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 hover:shadow-xl hover:scale-105 focus:outline-none cursor-pointer select-none"
                    onClick={handlePrev}
                  >
                   {isNavigating && navDirection === "prev" ? (
                        <Loader2 className="animate-spin h-5 w-5" />
                      ) : (
                        <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
                      )}
                  </button>
                )}
                {globalIndex < totalIncidents - 1 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-[#3F3F3F]/50 text-white w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 hover:shadow-xl hover:scale-105 focus:outline-none cursor-pointer select-none"
                    onClick={handleNext}
                  >
                                  {isNavigating && navDirection === "next" ? (
                    <Loader2 className="animate-spin h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
                  )}
                  </button>
                )}
              </>
            )}

            {/* {stats.length > 0 && ( */}
            <div className="absolute bottom-8 left-8 z-10 w-fit max-w-[1200px] flex items-stretch">

  {/* Geometric Container — always in DOM so bar height stays consistent */}
  <div className={`relative flex items-stretch`}>
    {/* Left blue accent bar — fixed height pill, always same size */}
    <div className="flex items-center mr-1" style={{ alignSelf: 'center' }}>
      <button
        onClick={() => setIsCollapsed(prev => !prev)}
        className="w-4 h-30 bg-sky-400 hover:bg-sky-300 transition-colors cursor-pointer flex items-center justify-center flex-shrink-0 rounded-sm z-10"
      >
        {isCollapsed
          ? <ChevronRight className="w-3 h-3 text-slate-900" />
          : <ChevronLeft className="w-3 h-3 text-slate-900" />}
      </button>
    </div>

    {/* Panel — always in DOM, hidden via width when collapsed */}
    <div
      className={`relative bg-slate-950/50 border border-white/20 shadow-2xl overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 border-0 pointer-events-none' : 'opacity-100'}`}
      style={!isCollapsed ? { clipPath: "polygon(0 0, 95% 0, 100% 20%, 100% 100%, 5% 100%, 0 80%)" } : {}}
    >
    <div className="absolute left-0 top-0 bottom-0 w-0" />

    <div className="relative px-10 py-7">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-10 mb-8">
        
        {/* TEXT SECTION */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.3em] text-sky-400 uppercase">
              Security Feed
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">
            {videoData.title}
          </h1>
          <p className="text-sm font-medium text-white/60">
            {videoData.alertText}
          </p>
        </div>

        {/* RESOLVE SECTION */}
        {canEdit && (
          <div
            className={`
              flex items-center gap-3 cursor-pointer px-5 py-2 transition-all border
              ${resolved 
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                : 'bg-white/5 border-white/30 text-white hover:bg-white/10'}
            `}
          >
            <Checkbox
              id={`resolved-${videoData.id}`}
              checked={resolved}
              onCheckedChange={onMarkResolved}
              className="border-white/50 cursor-pointer data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
            />
            <label htmlFor={`resolved-${videoData.id}`} className="cursor-pointer text-xs font-bold uppercase tracking-widest">
              {resolved ? "Resolved" : "Mark As Resolved"}
            </label>
          </div>
        )}

        {/* REPORT BUTTON */}
        <button
          onClick={onReport}
          className="flex items-center gap-2 cursor-pointer px-5 py-2 transition-all border bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30"
        >
          <Flag className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">
            Report Incident
          </span>
        </button>
      </div>

      {/* STATS SECTION */}
      {stats.length > 0 && (
        <div className="flex items-center gap-6 border-t border-white/10 pt-6">
          {stats.length > 3 && (
            <button onClick={scrollLeft} className="text-white/40 hover:text-sky-400 transition-colors">
              <FaChevronLeft className="w-4 h-4" />
            </button>
          )}

          <div ref={scrollRef} className="overflow-x-auto hide-scrollbar flex-1">
            <div className="flex gap-10 min-w-max px-2">
              {stats.map((stat, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                    {stat.label}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sky-400">{stat.icon}</span>
                    <span className="text-2xl font-mono font-black text-white uppercase">
                      {stat.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {stats.length > 3 && (
            <button onClick={scrollRight} className="text-white/40 hover:text-sky-400 transition-colors">
              <FaChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
    
    {/* Decorative corner accent */}
    <div className="absolute top-0 right-0 w-12 h-12 bg-white/5 -rotate-45 translate-x-6 -translate-y-6" />
    </div>{/* end panel */}
  </div>{/* end relative wrapper */}
</div>{/* end absolute container */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoModal;
