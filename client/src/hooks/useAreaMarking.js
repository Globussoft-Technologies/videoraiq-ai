import { useState } from 'react';

export default function useAreaMarking(cameraStreamRef) {
  const [drawingMode, setDrawingMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);

  const handleToggleDrawing = (selectedType) => {
 if((selectedType == 'lineCrossingSettings' || selectedType == 'lineCrossing' )){
return;
 } else{
     if (drawingMode) {
      setDrawingMode(false);
      if (cameraStreamRef.current && cameraStreamRef.current.setDrawingMode) {
        cameraStreamRef.current.setDrawingMode(false);
      }
    } else {
      setDrawingMode(true);
      setMoveMode(false);
      if (cameraStreamRef.current && cameraStreamRef.current.setDrawingMode) {
        cameraStreamRef.current.setDrawingMode(true);
      }
      if (cameraStreamRef.current && cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(false);
      }
      // If there are no existing points, ensure the canvas and internal state are cleared
      // so the user can start drawing fresh points.
      try {
        if (cameraStreamRef.current) {
          const pts = cameraStreamRef.current.getPoints && cameraStreamRef.current.getPoints();
          if (!pts || pts.length === 0) {
            if (cameraStreamRef.current.clearPoints) {
              cameraStreamRef.current.clearPoints();
            } else if (cameraStreamRef.current.setPoints) {
              cameraStreamRef.current.setPoints([]);
            }
          }
        }
      } catch (err) {
        // swallow errors from optional methods
      }
    }
 }
  };

  const handleDeleteArea = () => {
    if (cameraStreamRef.current) {
      // If currently in drawing mode, clear and restart drawing to ensure
      // the child's internal handlers/reset are refreshed so the user can
      // continue drawing without manually toggling Stop/Start.
      if (cameraStreamRef.current.clearPoints) {
        cameraStreamRef.current.clearPoints();
        // Temporarily turn off drawing mode then turn it back on to force a re-render
        setDrawingMode(false);
        if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
        // Small timeout allows the child to process the cleared state before re-enabling
        setTimeout(() => {
          setDrawingMode(true);
          setMoveMode(false);
          if (cameraStreamRef.current) {
            if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(true);
            if (cameraStreamRef.current.setMoveMode) cameraStreamRef.current.setMoveMode(false);
          }
        }, 0);
        return;
      }

      // Always clear points for delete action (including prepopulated/closed rects)
      if (cameraStreamRef.current.clearPoints) {
        cameraStreamRef.current.clearPoints();
      } else if (cameraStreamRef.current.setPoints) {
        cameraStreamRef.current.setPoints([]);
      }

      // Ensure move/draw modes are reset
      setDrawingMode(false);
      setMoveMode(false);
      if (cameraStreamRef.current) {
        if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
        if (cameraStreamRef.current.setMoveMode) cameraStreamRef.current.setMoveMode(false);
      }
    }
  };

  const handleMinArea = () => {
    if (cameraStreamRef.current && cameraStreamRef.current.setPoints) {
      const minRect = [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 100, y: 300 },
        { x: 100, y: 100 },
      ];
      cameraStreamRef.current.setPoints(minRect);
      setMoveMode(true);
      if (cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(true);
      }
    }
  };

const handleMaxArea = () => {
  if (!cameraStreamRef.current) return;

  const resolution = cameraStreamRef.current.getResolution?.();

  if (!resolution || resolution.length !== 2) {
    console.warn("Invalid resolution", resolution);
    return;
  }

  const [width, height] = resolution; // ✅ FIX

  if (!width || !height) return;

  const fullScreenRect = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 },
  ];

  cameraStreamRef.current.setPoints(fullScreenRect);
  cameraStreamRef.current.setMoveMode(true);
  cameraStreamRef.current.setDrawingMode?.(false);

  setMoveMode(true);
};


  const handleSingleLinePlacement = () => {
    if (cameraStreamRef.current && cameraStreamRef.current.setPoints) {
      const singleLine = [
        { x: 100, y: 100 },
        { x: 300, y: 300 },
      ];
      cameraStreamRef.current.setPoints(singleLine);
      setMoveMode(true);
      if (cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(true);
      }
    }
  };

  const handleEnableEdit = () => {
    if (!cameraStreamRef.current) return;
    try {
      const pts = cameraStreamRef.current.getPoints && cameraStreamRef.current.getPoints();
      if (pts && pts.length > 0) {
        setMoveMode(true);
        setDrawingMode(false);
        if (cameraStreamRef.current.setMoveMode) cameraStreamRef.current.setMoveMode(true);
        if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
      }
    } catch (err) {
      // noop
    }
  };

  return {
    drawingMode,
    moveMode,
    handleToggleDrawing,
    handleDeleteArea,
    handleMinArea,
    handleMaxArea,
    handleSingleLinePlacement,
    handleEnableEdit,
    setMoveMode,
    setDrawingMode
  };
}
