import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const CameraviewSkeleton = ({ selectedGrid, itemsPerPage }) => {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-3',
  };

  const gridClassName = gridClasses[selectedGrid] || 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3';

  const skeletonCard = (
    <div className="relative w-full aspect-[16/8] rounded-xl overflow-hidden">
      <Skeleton height="100%" width="100%" style={{ position: 'absolute', top: 0, left: 0, lineHeight: 'unset' }} />
      <div className="absolute bottom-5 left-5">
        <Skeleton width={150} height={24} />
      </div>
      <div className="absolute top-5 right-5">
        <Skeleton circle width={24} height={24}  />
      </div>
    </div>
  );

  return (
    <SkeletonTheme baseColor="#e0e0e0" highlightColor="#f5f5f5">
      <div className={`grid ${gridClassName} gap-4`}>
        {Array.from({ length: itemsPerPage }).map((_, i) => (
          <div key={i}>
            {skeletonCard}
          </div>
        ))}
      </div>
    </SkeletonTheme>
  );
};

export default CameraviewSkeleton;