import React from 'react';
import CameraStreamDisplay from './CameraStreamDisplay';

const CameraTwo = ({
  cameraData,
  selectedVideo,
  setSelectedVideo,
  selectedGrid,
  cameraChannels,
}) => {
  const getGridClasses = (gridId, itemCount) => {
    const isSpecialCase = itemCount <= 3;
    // For single camera, use full width/height without grid
    if (itemCount === 1) {
      return `w-full ${isSpecialCase ? 'h-[calc(100vh-280px)]' : 'h-[calc(100vh-10px)]'}`;
    }

    const baseClass = `grid gap-2 w-full ${isSpecialCase ? 'h-[calc(100vh-280px)]' : 'h-[calc(100vh-10px)]'}`;
    const gridColsMap = {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    };
    const gridRowsMap = {
      1: 'grid-rows-1',
      2: 'grid-rows-2',
      3: 'grid-rows-3',
      4: 'grid-rows-4',
    };

    // Layout logic for 1-4 cameras
    let effectiveCols;
    let gridRows;

    if (itemCount === 1) {
      effectiveCols = 1;
      gridRows = 1;
    } else if (itemCount === 2) {
      effectiveCols = 2;
      gridRows = 1;
    } else if (itemCount === 3) {
      effectiveCols = 3;
      gridRows = 1;
    } else if (itemCount === 4) {
      effectiveCols = 2; // 2x2
      gridRows = 2;
    } else {
      // Standard grid behavior for 4+ cameras
      effectiveCols = Math.min(itemCount, gridId);
      gridRows = gridId;
    }

    const colsClass = gridColsMap[effectiveCols] || 'grid-cols-1';
    const rowsClass = gridRowsMap[gridRows] || 'grid-rows-1';

    return `${baseClass} ${colsClass} ${rowsClass}`;
  };

  const getItemClasses = (itemCount) => {
    return 'relative rounded overflow-hidden w-full h-full';
  };

  const renderCameraStreams = (gridClasses, itemClasses) => (
    <div className={gridClasses}>
      {cameraData.map((camera, idx) => (
        <div key={camera.value} className={itemClasses}>
          <CameraStreamDisplay
            camera={camera}
            selectedVideo={selectedVideo}
            setSelectedVideo={setSelectedVideo}
            cameraChannels={cameraChannels}
            streamIndex={idx}
          />
        </div>
      ))}
    </div>
  );

  const itemCount = cameraData.length;

  return (
    <>
      {selectedGrid === 1 &&
        renderCameraStreams(
          getGridClasses(1, itemCount),
          getItemClasses(itemCount)
        )}

      {selectedGrid === 2 &&
        renderCameraStreams(
          getGridClasses(2, itemCount),
          getItemClasses(itemCount)
        )}

      {selectedGrid === 3 &&
        renderCameraStreams(
          getGridClasses(3, itemCount),
          getItemClasses(itemCount)
        )}

      {selectedGrid === 4 &&
        renderCameraStreams(
          getGridClasses(4, itemCount),
          getItemClasses(itemCount)
        )}
    </>
  );
};

export default CameraTwo;
