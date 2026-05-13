import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';


const HeaderSkeleton = () => {
  return (
    <header className="bg-white px-2 sm:px-4 py-2 flex items-center justify-between border-b border-gray-100 rounded-2xl h-16 sm:h-20">
      <div className="flex items-center gap-4">
        {/* Logo Skeleton */}
        <div className="flex items-center">
          <Skeleton height={40} width={40} borderRadius={8} className="h-8 sm:h-10 w-8 sm:w-10" />
        </div>
        {/* Desktop Nav Skeletons */}
        <nav className="min-[907px]:flex hidden items-center lg:gap-1 md:gap-0.5">
          <Skeleton width={140} height={35} borderRadius={9999} /> {/* Dashboard */}
          <Skeleton width={140} height={35} borderRadius={9999} /> {/* Incidents */}
          <Skeleton width={140} height={35} borderRadius={9999} />  {/* NVR */}
          <Skeleton width={140} height={35} borderRadius={9999} />  {/* Live */}
          <Skeleton width={140} height={35} borderRadius={9999} /> {/* Playback */}
          <Skeleton width={140} height={35} borderRadius={9999} /> {/* Alert Recipients */}
          <Skeleton width={140} height={35} borderRadius={9999} /> {/* Detection Settings */}
        </nav>
      </div>

      <div className="flex-1 flex justify-end">
        <div className="flex items-center gap-1 lg:w-auto lg:justify-end lg:gap-4">
            <div className="flex items-center gap-0.5 sm:gap-4">
              {/* HeaderActions Skeletons */}
              {/* <Skeleton width={80} height={35} borderRadius={10} /> */}
              <Skeleton borderRadius={6} width={60} height={28} className='mx-1 md:mx-0' />
              {/* Welcome Text Skeleton */}
              <Skeleton width={100} height={20} className="hidden md:flex mx-1 md:mx-0" />
              {/* Profile Avatar Skeleton */}
              <Skeleton circle width={40} height={40} className="h-8 sm:h-10 w-8 sm:w-10" />
            </div>
          </div>
      </div>
    </header>
  );
};

export default HeaderSkeleton;