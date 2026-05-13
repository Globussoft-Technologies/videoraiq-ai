import React, { useRef, useState,useEffect} from "react";
import { Minimize2 } from "lucide-react";
import CameraStreamWithDetection from "./CameraStreamWithDetection";
import useHlsPlayer from "@/hooks/useHlsPlayer";

const CameraCanvasModal = ({
  // config,
  selectedVideo,
  cameraId,
  src,
  minBtnClass = "",
  minIconSize = "",
  isInModal = false,
  controls = false,
  detections = [],
  onClose,
  isFullScreen = false,
}) => {
  
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const dragStart = useRef({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Hook usage
 useHlsPlayer(videoRef, src, {
    autoPlay: true,
    onError: (msg) => {
    setErrorMsg(msg);
    setIsLoading(false);
    setHasError(true);
  },
  });

  //  tooltip for zoom hide after 3s
   useEffect(() => {
   const timer = setTimeout(() => setShowZoomHint(false), 3000);
   return () => clearTimeout(timer);
   }, []);

   useEffect(() => {
    if (selectedVideo?.cameraId === cameraId && src) {
      setIsLoading(true);
      setHasError(false);
    }
   }, [src, selectedVideo, cameraId]);


  // Zoom Handling
  // ------------------------
  const handleWheel = (e) => {
    e.preventDefault();
    setShowZoomHint(false);
    const zoomIntensity = 0.15;

    let newScale = scale + (e.deltaY < 0 ? zoomIntensity : -zoomIntensity);
    newScale = Math.min(Math.max(1, newScale), 5);

    setScale(newScale);

    // Clamp position when zoom changes
    setPos((prev) => {
      const container = containerRef.current;
      if (!container) return prev;

      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const scaledWidth = cw * newScale;
      const scaledHeight = ch * newScale;

      const maxX = (scaledWidth - cw) / 2;
      const maxY = (scaledHeight - ch) / 2;

      return {
        x: Math.min(Math.max(prev.x, -maxX), maxX),
        y: Math.min(Math.max(prev.y, -maxY), maxY),
      };
    });
  };

  // ------------------------
  // Drag / Pan Handling
  // ------------------------
  const getRelativePos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    if (scale === 1) return; // No dragging when not zoomed

    setIsDragging(true);
    setShowZoomHint(false);

    const { x, y } = getRelativePos(e);

    dragStart.current = {
      x: x - pos.x,
      y: y - pos.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale === 1) return;
    if (!containerRef.current) return;

    const { x, y } = getRelativePos(e);
    setShowZoomHint(false);

    const container = containerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const scaledWidth = cw * scale;
    const scaledHeight = ch * scale;

    const maxX = (scaledWidth - cw) / 2;
    const maxY = (scaledHeight - ch) / 2;

    const newX = x - dragStart.current.x;
    const newY = y - dragStart.current.y;

    setPos({
      x: Math.min(Math.max(newX, -maxX), maxX),
      y: Math.min(Math.max(newY, -maxY), maxY),
    });
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  // Reset zoom + pan
  const resetZoom = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };


  const handleDoubleClick = (e) => {
  const rect = containerRef.current.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  if (scale > 1) {
    // Reset zoom if already zoomed in
    setScale(1);
    setPos({ x: 0, y: 0 });
    setShowZoomHint(false);
    return;
  }

  // Zoom in amount
  const newScale = 2;

  // Calculate zoom offset so clicked point moves to center
  const offsetX = (clickX - rect.width / 2) * (newScale - 1);
  const offsetY = (clickY - rect.height / 2) * (newScale - 1);

  setScale(newScale);
  setPos({
    x: -offsetX,
    y: -offsetY,
  });
};

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded overflow-hidden
    ${scale === 1 ? "cursor-zoom-in" : isDragging ? "cursor-grabbing" : "cursor-grab"}
  `}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      // onDoubleClick={handleDoubleClick}
      // style={{ cursor: scale > 1 ? "grab" : "default" }}
    >
      {/* Video */}
      {/* Loading Overlay */}
     {isLoading && (
       <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
         <div className="loader border-4 border-gray-300 border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div>
       </div>
     )}

  {/* Error Message */}
     {hasError && (
       <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20">
         <p>Unable to load stream</p>
         <p className="text-xs opacity-70 mt-1">{errorMsg || "Camera offline"}</p>
       </div>
     )}
       <video
        ref={videoRef}
        className="absolute inset-0 object-contain"
        style={{
          width: "100%",
          height: "100%",
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        autoPlay
        muted
        playsInline
        controls={controls}
       onCanPlay={() => {
        setIsLoading(false);
        setHasError(false);
      }}

      onPlaying={() => {
        setIsLoading(false);
        setHasError(false);
      }}
      />

      {/* Detection Overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
      >
       {showZoomHint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded z-30">
          🔍 You can zoom & drag
        </div>
      )}
        <CameraStreamWithDetection
          videoRef={videoRef}
          detections={detections}
          isFullScreen={isFullScreen}
        />
      </div>

      {/* Close Button */}
      {!isInModal && (
        <button
          onClick={onClose}
          className={
            minBtnClass ||
            "absolute top-3 left-3 bg-[#3f3f3f80] backdrop-blur-md text-white w-8 h-8 rounded-full flex justify-center items-center z-20"
          }
        >
          <Minimize2 className={minIconSize || "w-4 h-4"} />
        </button>
      )}

      {/* Reset Zoom */}
      {scale > 1 && (
        <button
          onClick={resetZoom}
          className="absolute top-3 right-3 bg-[#3f3f3f80] text-white px-2 py-1 mr-15 mt-3 rounded text-xs z-20 cursor-pointer"
        >
          Reset
        </button>
      )}
    </div>
  );
};

export default React.memo(CameraCanvasModal);
