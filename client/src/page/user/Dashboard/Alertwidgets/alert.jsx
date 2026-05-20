import React, { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Circle, Maximize, Minimize, Minimize2 } from 'lucide-react';
import DynamicDateTime from '@/utils/DynamicDateTime';
import countPersons from '@/assets/lineCrossing.svg';
import countVehicles from '@/assets/unauthorizedAccess.svg';
import motionDetection from '@/assets/motionDetection.svg';
import genericObjectDetection from '@/assets/genericObjectDetection.svg';
import loiteringWithoutAuth from '@/assets/loiteringWithoutAuth.svg';
import loiteringWithAuth from '@/assets/loiteringWithAuth.svg';
import NoDataCard from './NoDataCard';

function getSeverity(metaData) {
  return metaData?.find((item) => item.label === 'Severity')?.value || '';
}

function AlertCard({
  heading,
  image,
  icon,
  statusBg,
  statusText,
  totalWidgets,
  date,
  metaData,
  videoLink,
}) {
  return (
    <BaseAlertCard
      heading={heading}
      image={image}
      icon={icon}
      status={getSeverity(metaData)}
      statusBg={statusBg}
      statusText={statusText}
      totalWidgets={totalWidgets}
      date={date}
      metaData={metaData}
      videoLink={videoLink}
    />
  );
}

const FireAlert = ({ switchOn = [] }) => {
  useEffect(() => {}, [switchOn]);

  const renderAlertCard = (incident, index) => {
    if (!incident || typeof incident !== 'object') return null;
    const key = incident.incidentType || 'Unknown Incident';
    const incidentType = incident.incidentTypeKey || 'Unknown Incident';
    switch (key) {
      case 'lineCrossing':
        return (
          <lineCrossingAlertCard
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
            metaData={incident?.metaData ?? []}
            videoLink={incident?.videoLink}
          />
        );
      case 'unauthorizedAccess':
        return (
          <VehicleCountAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      case 'motionDetection':
        return (
          <MotionDetectionAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      case 'genericObjectDetection':
        return (
          <ObjectDetectionAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      case 'loiteringWithoutAuth':
        return (
          <UnauthorizedLoiteringAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      case 'loiteringWithAuth':
        return (
          <AuthorizedLoiteringAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      case 'countPersons':
        return (
          <PersonCountAlertCard
            videoLink={incident?.videoLink}
            metaData={incident?.metaData ?? []}
            date={incident?.createdAt}
            key={`${key}-${index}`}
            totalWidgets={isSingleToggle}
            heading={incident?.incidentName ?? ''}
            image={incident?.Image}
          />
        );
      default:
        return <NoDataCard incidentName={incidentType} />;
    }
  };

  const isSingleToggle = Array.isArray(switchOn) && switchOn.length === 1;

  return (
    <div
      className={`grid ${
        isSingleToggle ? 'grid-cols-1 h-full' : 'md:grid-cols-1 lg:grid-cols-2'
      } gap-4 w-full`}
    >
      {(switchOn || []).map(
        (
          incident,
          index //safety check for switchOn
        ) => (
          <div
            key={index}
            className={isSingleToggle ? 'h-full flex flex-col' : ''}
          >
            {renderAlertCard(incident, index)}
          </div>
        )
      )}
    </div>
  );
};

const BaseAlertCard = ({
  heading,
  icon,
  status,
  statusBg,
  statusText,
  totalWidgets,
  date,
  metaData,
  videoLink,
  image,
}) => {
  const previewRef = useRef(null); // Ref for preview section only
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleMaximize = () => {
    if (!previewRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      previewRef.current.requestFullscreen();
      // Resume playback if video
      const video = previewRef.current.querySelector("video");
      if (video) {
        video.play();
      }
    }
  };

  const handleMinimize = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  return (
    <div className="bg-[#fafafa] rounded-[10px] p-4 w-full relative">
      {/* Top Bar */}
      <div className="flex justify-between items-center 2xl:mb-4 mb-2 w-[90%] mx-auto">
        <div className="flex items-center gap-1.5 md:gap-2">
          <span
            className={`flex items-center text-[9px] md:text-xs xl:text-sm 2xl:text-2xl font-[500] gap-1 md:gap-2 ${statusText}`}
          >
            {icon && (
              <img
                src={icon}
                alt=""
                className="w-3.5 h-3.5 md:w-5 md:h-5 xl:w-4 xl:h-4 2xl:w-7 2xl:h-7 mr-0.5 md:mr-1 xl:mr-0.5"
              />
            )}
            {heading}
          </span>
          {status && (
            <span
              className={`${statusBg} ${statusText} text-[8px] md:text-[10px] xl:text-[10px] 2xl:text-[14px] py-1 md:py-2 px-2 md:px-3 rounded-[4px] md:rounded-[6px] font-[500]`}
            >
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-3">
          {totalWidgets && (
            <button
              className="rounded-full cursor-pointer border border-[#C7C7C7] p-1.5 xl:p-1 2xl:p-2 hover:bg-gray-100"
              onClick={handleMaximize}
            >
              <Maximize
                size={14}
                color="#333333"
                className="w-3.5 h-3.5 2xl:w-4 2xl:h-4"
              />
            </button>
          )}
        </div>
      </div>

      {/* Image/Video Preview Section */}
      <div className="w-[90%] 2xl:h-[390px] md:h-[350px] bg-white rounded-[9px] border border-[#EEEEEE] p-3 mx-auto">
        <div
          ref={previewRef}
          className="relative w-full h-full rounded-[9px] overflow-hidden"
        >
          {videoLink && videoLink.trim() !== "" ? (
            <video
              controls
              src={videoLink}
              className="w-full h-full object-cover bg-white rounded-[9px]"
            />
          ) : image && image.includes('.webp')? (
            <img
              src={image}
              alt="placeholder"
              className="w-full h-full object-cover bg-white rounded-[9px]"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 rounded-[9px] flex items-center justify-center">
              No Image Available
            </div>
          )}

          {date && videoLink && videoLink.trim() !== "" && (
            <div className="absolute top-3 left-3 bg-[#3F3F3F] text-[9px] md:text-[10px] xl:text-[10px] 2xl:text-xs px-2.5 py-2 rounded-full">
              <DynamicDateTime className="!text-white" currentDateTime={date} />
            </div>
          )}
          {/* <div className="absolute bottom-2 right-2 bg-[#3F3F3F80] text-white text-[9px] md:text-[10px] xl:text-[10px] 2xl:text-xs px-2 py-1 rounded-[7px] flex items-center gap-1">
            <span>Live</span>
            <Circle fill="#39C90D" className="w-2.5 h-2.5 2xl:w-4 2xl:h-4" />
          </div> */}

          {totalWidgets && isFullscreen && (
            <button
              className="absolute top-2 cursor-pointer right-2 backdrop-blur-md w-8 h-8 rounded-full flex justify-center items-center bg-[#3f3f3f80] p-2"
              onClick={handleMinimize}
            >
              <Minimize2
                size={14}
                color='#FFFFFF'
                className="w-3.5 h-3.5 2xl:w-4 2xl:h-4"
              />
            </button>
          )}
        </div>
      </div>

      {/* Metadata Grid */}
      <div className="xl:flex xl:justify-evenly min-h-[150px] py-10 text-gray-700 grid grid-cols-2 md:grid-cols-5 md:px-6">
        {Array.isArray(metaData) && metaData.length > 0 ? (
          metaData.map(({ label, value }, i) => (
            <div className="flex flex-col py-2 md:col-span-2" key={i}>
              <strong className="text-[8px] md:text-[9px] xl:text-[10px] 2xl:text-xs font-[400] text-[#7a7a7a]">
                {label}
              </strong>
              <span className="text-[10px] md:text-[10px] xl:text-xs 2xl:text-sm font-[500] text-[#333333]">
                {value}
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-col py-2 md:col-span-2">
            <strong className="text-[8px] md:text-[9px] xl:text-[10px] 2xl:text-xs font-[400] text-[#7a7a7a]">
              Metadata
            </strong>
            <span className="text-[10px] md:text-[10px] xl:text-xs 2xl:text-sm font-[500] text-[#333333]">
              N/A
            </span>
          </div>
        )}
      </div>
    </div>
  );
};


// Person Count Alert
const PersonCountAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={countPersons}
    statusBg="bg-[#FFDBD9]"
    statusText="text-[#CE241C]"
  />
);

// Vehicle Count Alert
const VehicleCountAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={countVehicles}
    statusBg="bg-[#E9F1FF]"
    statusText="text-[#0B1A6A]"
  />
);

// Motion Detection Alert
const MotionDetectionAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={motionDetection}
    statusBg="bg-[#ffdbd9]"
    statusText="text-[#ce241c]"
  />
);

// Object Detection Alert
const ObjectDetectionAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={genericObjectDetection}
    statusBg="bg-[#FFE4C5]"
    statusText="text-[#EF8000]"
  />
);

// Unauthorized Loitering Alert
const UnauthorizedLoiteringAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={loiteringWithoutAuth}
    statusBg="bg-[#ffdbd9]"
    statusText="text-[#ce241c]"
  />
);

// Authorized Loitering Alert
const AuthorizedLoiteringAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={loiteringWithAuth}
    statusBg="bg-[#E9F1FF]"
    statusText="text-[#0B1A6A]"
  />
);

const LineCrossingAlertCard = (props) => (
  <AlertCard
    {...props}
    icon={lineCrossing}
    statusBg="bg-[#FFE4C5]"
    statusText="text-[#EF8000]"
  />
);
export default FireAlert;
