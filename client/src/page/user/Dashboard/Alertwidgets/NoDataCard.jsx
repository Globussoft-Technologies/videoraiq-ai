import React from 'react';
import { ShieldAlert } from 'lucide-react'; // Using a more descriptive icon
import bellIcon from '@/assets/Bell.svg';

const getNoDataTitle = (incidentName) => {
  switch (incidentName) {
    case 'lineCrossing':
      return 'No Person Crossing Alerts';
    case 'unauthorizedAccess':
      return 'No Unauthorized Access Alerts';
    case 'motionDetection':
      return 'No Motion Detection Alerts';
    case 'genericObjectDetection':
      return 'No Object Detection Alerts';
    case 'loiteringWithoutAuth':
      return 'No Unauthorized Loitering Alerts';
    case 'loiteringWithAuth':
      return 'No Authorized Loitering Alerts';
    case 'countPersons':
      return 'No Person Count Alerts';
    default:
      return 'No New Alerts'; // Refined default title
  }
};

const NoDataCard = ({ incidentName}) => (
  <div className="bg-[#fafafa] rounded-[10px] h-full p-4 w-full ">
    {/* Top Bar */}
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center p-0.5 sm:text-[10px] md:text-[12px] xl:text-[14px] 2xl:text-[23px] font-[500] gap-2 text-gray-500">
          <img
            src={bellIcon}
            alt={getNoDataTitle(incidentName)}
            className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 xl:w-4 xl:h-4 2xl:w-6 2xl:h-6 mr-1 xl:mr-0.5"
          />
          {getNoDataTitle(incidentName)}
        </span>
        <span className="bg-gray-200 text-gray-500 text-[8px] sm:text-[9px] md:text-[10px] xl:text-[10px] 2xl:text-[14px] px-2 py-1 xl:px-[10px] xl:py-[2px] 2xl:px-[20px] 2xl:py-[5px] rounded-md font-[500]">
          Inactive
        </span>
      </div>
    </div>
    {/* Content Section */}
    <div className="w-full h-[400px] bg-transparent rounded-[10px] flex flex-col justify-center items-center text-center">
      <div className="w-12 text-[#07486A]">
        <svg
          fill="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21"
            opacity="1"
          ></path>
          <path
            d="M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z"
            opacity="0.3"
          >
            <animate
              attributeName="opacity"
              dur="1.5s"
              values="0.3;1;0.3"
              repeatCount="indefinite"
              begin="0.5s"
            ></animate>
          </path>
          <path
            d="M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3"
            opacity="0.2"
          >
            <animate
              attributeName="opacity"
              dur="1.5s"
              values="0.2;1;0.2"
              repeatCount="indefinite"
              begin="1s"
            ></animate>
          </path>
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-600">No Data Available</h3>
      <p className="text-sm text-gray-500 mt-1">
        There are no alerts to display for this category.
      </p>
    </div>
    {/* Empty Metadata Grid to maintain structure */}
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-2 p-2 sm:p-3 md:p-4 xl:p-2 2xl:p-5 text-gray-700 h-[52px]">
      {/* This div preserves the space of the metadata grid */}
    </div>
  </div>
);

export default NoDataCard;