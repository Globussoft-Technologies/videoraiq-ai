import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const SidebarSkeleton = () => {
  return (
    <div
      className="fixed hidden ml-3 2xl:ml-0 sm:flex bg-white transition-all duration-200 ease-in-out w-[90px] px-3 py-8 rounded-xl shadow-sm xl:px-3 xl:py-6 2xl:w-[100px] 2xl:px-4 2xl:py-8 h-[370px] min-w-[70px]"
    >
      <div className="flex flex-col gap-5 w-full items-center justify-center h-full py-4 px-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex justify-center w-full">
            <Skeleton borderRadius={10} width={44} height={44} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SidebarSkeleton;
