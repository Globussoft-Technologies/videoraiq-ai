import React, { useEffect } from 'react';
// import { useState } from 'react';
// import UpgradeModal from './UpdateModal/UpgradeModal';
import { CheckCircle2Icon, CircleFadingArrowUp, Download } from 'lucide-react';
import { FaArrowUp, FaBell } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
const CURRENT_EXE_VERSION = import.meta.env.VITE_APP_CURRENT_EXE_VERSION;

const HeaderActions = ({installerStatus, setInstallerStatus, UpgradeReqiore}) => {
  const handleInstallClick = () => {
    const a = document.createElement('a');
    a.href = 'https://storage.googleapis.com/empmonitor-cctv-dev/CCTV-P/VideoraIQInstaller.exe';
    a.download = '';
    a.click();
  };


  return (
    <>
      <div className="flex items-center gap-3 md:gap-4">
        {/* <Button
          className="bg-gradient-to-l cursor-pointer from-[#07486a] to-[#1ca3dc] text-white px-2 md:px-4 py-5 text-xs md:text-sm font-medium rounded-lg flex items-center gap-2 hover:opacity-90 transition"
          onClick={handleInstallClick}
        >
          <Download className="w-4 h-4" />
          <span className="hidden md:inline">Install</span>
        </Button> */}


            {!UpgradeReqiore && <Button
            disabled={installerStatus}
            className="bg-gradient-to-l cursor-pointer from-[#07486a] to-[#1ca3dc] text-white px-2 md:px-4 py-5 text-xs md:text-sm font-medium rounded-lg flex items-center gap-2 hover:opacity-90 transition"
            onClick={() => {
              const a = document.createElement('a');
              a.href = 'https://storage.googleapis.com/empmonitor-cctv-dev/CCTV-P/VideoraIQInstaller.exe';
              a.download = '';
              a.click();

              // Optional: Set installerStatus to true if you want to simulate install immediately
              // setInstallerStatus(true); // <-- use if you're controlling state here
            }}
          >
            {installerStatus ? (
              <>
                <CheckCircle2Icon className="text-white 2xl:!w-5 2xl:!h-5 xl:w-3 xl:h-3" />
                <span className="2xl:mt-[3px] xl:mt-[1px] hidden md:inline">Installed</span>
              </>
            ) : (
              <>
                <Download className="2xl:!w-5 2xl:!h-5 xl:w-3 xl:h-3" />
                <span className="2xl:mt-[3px] xl:mt-[1px] hidden md:inline">Install</span>
              </>
            )}
          </Button>}

          {UpgradeReqiore && 
        <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={handleInstallClick}
          className="bg-gradient-to-r from-[#1ca3dc] to-[#07486a] text-white px-4 py-2 rounded-[14px] flex items-center gap-3 shadow-md hover:opacity-90 transition-all"
        >
          {/* Circular arrow icon */}
          <CircleFadingArrowUp className="w-6 h-6 shrink-0" />

          {/* Text block with version and label */}
          <div className="flex flex-col leading-tight text-left">
            <span className="text-[9px] font-[400] opacity-90">Version {CURRENT_EXE_VERSION}</span>
          <span className="text-sm md:text-base font-[400] -mt-[2px]">Upgrade</span>
          </div>
        </button>

        {/* Notification Bell */}
        <FaBell className="text-[#07486a] text-lg md:text-xl" />
      </div>

          }


        {/*
        <Button
          className="bg-gradient-to-r from-[#1ca3dc] to-[#07486a] text-white px-4 py-2 rounded-[14px] flex items-center gap-3 shadow-md hover:opacity-90 transition-all"
          onClick={() => setShowUpgrade(true)}
        >
          <CircleFadingArrowUp className="w-6 h-6 shrink-0" />
          <div className="flex flex-col leading-tight text-left">
            <span className="text-[9px] font-[400] opacity-90">Version 1.61.14</span>
            <span className="text-sm sm:text-base font-[400] -mt-[2px]">Upgrade</span>
          </div>
        </Button>
        {showUpgrade && (
          <UpgradeModal
            confirmLabel="Upgrade"
            onCancel={() => setShowUpgrade(false)}
            onConfirm={() => setShowUpgrade(false)}
          />
        )}
        */}
      </div>
    </>
  );
};

export default HeaderActions;


// BUTTON FOR UPGRADE CONDITIONALLY RENDER THIS HOWEVER YOU LIKE
//   <div className="flex items-center gap-2 sm:gap-3">
//   <button
//     onClick={handleInstallClick}
//     className="bg-gradient-to-r from-[#1ca3dc] to-[#07486a] text-white px-4 py-2 rounded-[14px] flex items-center gap-3 shadow-md hover:opacity-90 transition-all"
//   >
//     {/* Circular arrow icon */}
//     <CircleFadingArrowUp className="w-6 h-6 shrink-0" />

//     {/* Text block with version and label */}
//     <div className="flex flex-col leading-tight text-left">
//       <span className="text-[9px] font-[400] opacity-90">Version 1.61.14</span>
//       <span className="text-sm sm:text-base font-[400] -mt-[2px]">Upgrade</span>
//     </div>
//   </button>

//   {/* Notification Bell */}
//   <FaBell className="text-[#07486a] text-lg sm:text-xl" />
// </div>
