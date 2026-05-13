// CameraStreamWithArea.jsx
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { Maximize, Minimize } from "lucide-react";
import UserContext from "@/context/UserContext/Context";
import useHlsPlayer from "@/hooks/useHlsPlayer";

const CameraStreamWithArea = forwardRef(
  (
    {
      config,
      maxminBtnclass,
      url,
      maxsize = "text-sm",
      minsize = "text-sm",
      hlsUrl,
      label,
      controlSocket,
      selectedVideo,
      setSelectedVideo,
      initialPoints = [],
      drawingMode = false,
      moveMode = false,
      hasError,
      setHasError,
      isLoading,
      setIsLoading
    },
    ref
  ) => {
    const videoRef = useRef(null);
    const drawCanvasRef = useRef(null);
    const containerRef = useRef(null);
        // points state (array of {x,y} or rectangle closed with repeated first point)
    const [points, setPoints] = useState(Array.isArray(initialPoints) ? initialPoints : []);
    const pointsRef = useRef(points);
    pointsRef.current = points;

    const [maxPoints, setMaxPoints] = useState(points.length > 0 ? points.length :   3); // default = 3
    const { streamModalShow, setStreamModalShow } = useContext(UserContext);
    useEffect(() => {
  if (drawingPoints.length > maxPoints) {
    const trimmed = drawingPoints.slice(0, maxPoints);
    setDrawingPoints(trimmed);
    setPoints(trimmed);
    draw(trimmed);
  }
}, [maxPoints]);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDrawingMode, setIsDrawingMode] = useState(drawingMode);
    const [isMoveMode, setIsMoveMode] = useState(moveMode);
    const [scale, setScale] = useState(1); // zoom level
    const [pos, setPos] = useState({ x: 0, y: 0 }); // pan position
    const [isDragging, setIsDragging] = useState(false);
    const panRef = useRef({ x: 0, y: 0 });
    const [showZoomHint, setShowZoomHint] = useState(true);


    // const [hasError, setHasError] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const streamBaseUrl = import.meta.env.VITE_STREAM_URL;
    const local_status = import.meta.env.VITE_LOCAL_SETUP;



    // drawingPoints is helper while drawing new rectangle (keeps intermediate points)
    const [drawingPoints, setDrawingPoints] = useState([]);
    const rafRef = useRef(null);

    // dragging state for move mode
    const dragState = useRef({
      dragging: false,
      startX: 0,
      startY: 0,
      origPoints: [],
      cornerIndex: null,
      offsetX: 0,
      offsetY: 0,
    });

    const CORNER_RADIUS = 12;

    // keep drawing/move modes in sync with props
    useEffect(() => setIsDrawingMode(drawingMode), [drawingMode]);
    useEffect(() => setIsMoveMode(moveMode), [moveMode]);

    // If initialPoints prop changes — apply once (do not continuously override)
    useEffect(() => {
      if (!initialPoints) return;
      // convert array-of-arrays ([ [x,y], ... ]) to array-of-objects for internal usage
      const parsed = initialPoints.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
      // only update if different
      const areSame =
        parsed.length === pointsRef.current.length &&
        JSON.stringify(parsed) === JSON.stringify(pointsRef.current);
      if (!areSame) {
        setPoints(parsed);
        // draw immediately
        requestAnimationFrame(() => draw(parsed));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPoints]);

    // expose imperative methods
    useImperativeHandle(
      ref,
      () => ({
        clearPoints: () => {
          setPoints([]);
          setDrawingPoints([]);
          const canvas = drawCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          // toggle drawing mode to force redraw state if required
          if (isDrawingMode) {
            setIsDrawingMode(false);
            setTimeout(() => setIsDrawingMode(true), 0);
          }
        },
        setPoints: (pts) => {
          // normalize input to array of objects
          const normalized = (Array.isArray(pts) ? pts : []).map((p) =>
            Array.isArray(p) ? { x: p[0], y: p[1] } : p
          );
          setPoints(normalized);
          requestAnimationFrame(() => draw(normalized));
        },
        setDrawingMode: (mode) => {
          setIsDrawingMode(mode);
        },
        setMoveMode: (mode) => {
          setIsMoveMode(mode);
        },
        captureScreenshot: async ({ base64Only = false, noOverlay = false } = {}) => {
          const video = videoRef.current;
          const drawingCanvas = drawCanvasRef.current;
          if (!video) return null;
          if (video.readyState < 2) {
            await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
          }

          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = 1280;
          tempCanvas.height = 720;
          const ctx = tempCanvas.getContext("2d");

          // scale video into fixed canvas
          const scale = Math.min(tempCanvas.width / video.videoWidth, tempCanvas.height / video.videoHeight);
          const x = (tempCanvas.width - video.videoWidth * scale) / 2;
          const y = (tempCanvas.height - video.videoHeight * scale) / 2;

          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, x, y, video.videoWidth * scale, video.videoHeight * scale);

          if (base64Only && noOverlay) return tempCanvas.toDataURL("image/jpeg", 0.95);

          if (!noOverlay && drawingCanvas) {
            const combinedCanvas = document.createElement("canvas");
            combinedCanvas.width = 1280;
            combinedCanvas.height = 720;
            const combinedCtx = combinedCanvas.getContext("2d");
            combinedCtx.drawImage(tempCanvas, 0, 0);

            // draw overlay scaled to tempCanvas
            const overlayScale = Math.min(combinedCanvas.width / drawingCanvas.width, combinedCanvas.height / drawingCanvas.height);
            const overlayX = (combinedCanvas.width - drawingCanvas.width * overlayScale) / 2;
            const overlayY = (combinedCanvas.height - drawingCanvas.height * overlayScale) / 2;
            combinedCtx.drawImage(
              drawingCanvas,
              0,
              0,
              drawingCanvas.width,
              drawingCanvas.height,
              overlayX,
              overlayY,
              drawingCanvas.width * overlayScale,
              drawingCanvas.height * overlayScale
            );

            return combinedCanvas.toDataURL("image/jpeg", 0.95);
          }

          return tempCanvas.toDataURL("image/jpeg", 0.95);
        },
        getPoints: () => pointsRef.current.map((p) => ({ ...p })), // return copy
        getResolution: () =>
          videoRef.current ? [videoRef.current.videoWidth || 1280, videoRef.current.videoHeight || 720] : [0, 0],
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [points, isDrawingMode, isMoveMode]
    );

    // Canvas resize & initial draw when video metadata loads
    useEffect(() => {
      const video = videoRef.current;
      const canvas = drawCanvasRef.current;
      if (!canvas || !video) return;

      const updateCanvasSize = () => {
        // Use video's native resolution as canvas pixel-size
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        // match CSS sizes for crisp rendering (if you use Tailwind/object-contain the canvas display size is controlled by CSS)
        // draw existing points after resize
        if (pointsRef.current && pointsRef.current.length > 0) {
          draw(pointsRef.current);
        }
      };

      video.addEventListener("loadedmetadata", updateCanvasSize);
      // Also attempt immediate update if metadata already available
      if (video.videoWidth && video.videoHeight) updateCanvasSize();

      // ResizeObserver kept simple (observe container for layout-change)
      const ro = new ResizeObserver(() => {
        if (video.videoWidth && video.videoHeight) updateCanvasSize();
      });
      ro.observe(canvas);

      return () => {
        video.removeEventListener("loadedmetadata", updateCanvasSize);
        ro.disconnect();
      };
    }, []);

    // create final stream url once
    const streamUrl = useMemo(() => {
      let url = Array.isArray(hlsUrl) ? hlsUrl[0] : hlsUrl;
      if (!url) return null;
      if (local_status === "true") {
        return url;
      } else {
        return streamBaseUrl + url;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hlsUrl]);

    // start HLS player once
    useHlsPlayer(videoRef, streamUrl, {
      onError: (msg) => {
        setErrorMsg(msg);
        setIsLoading(false);
        setHasError(true);
      },
    });

    // --- Drawing function (draws a given array of {x,y}) ---
    const draw = (pts = []) => {
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!pts || pts.length === 0) return;
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "red";
      ctx.beginPath();

      if (pts.length > 0) {
        // draw polyline / polygon
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }

        // close path if last equals first (closed polygon)
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (first.x === last.x && first.y === last.y) {
          ctx.closePath();
        }
      }

      ctx.stroke();

      // draw corners or points
      ctx.fillStyle = "orange";
      const rect = canvas.getBoundingClientRect();
      const cornerSize = Math.max(4, (CORNER_RADIUS / 2) * (canvas.width / Math.max(rect.width, 1)));

      // Draw every point as a draggable corner
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cornerSize, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.restore();
    };

    // Helpers used during drag/draw
    const isNearCorner = (x, y, pts) =>
      pts.findIndex((pt) => Math.abs(x - pt.x) < CORNER_RADIUS && Math.abs(y - pt.y) < CORNER_RADIUS);

    const isInsideRect = (x, y, pts) => {
      if (!pts || pts.length === 0) return false;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
    };

    // --- Canvas mouse/touch handlers ---
    const getCanvasCoords = (clientX, clientY) => {
      const canvas = drawCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(rect.width, 1);
      const scaleY = canvas.height / Math.max(rect.height, 1);
      const x = Math.round((clientX - rect.left) * scaleX);
      const y = Math.round((clientY - rect.top) * scaleY);
      return { x, y };
    };

    const handleCanvasMouseDown = (e) => {
      if (!isMoveMode || pointsRef.current.length < 2) return;
      const { x: currX, y: currY } = getCanvasCoords(e.clientX, e.clientY);
      dragState.current.origPoints = pointsRef.current.map((pt) => ({ ...pt }));

      // Line (2 points) specific logic
      if (pointsRef.current.length === 2) {
        const idx = isNearCorner(currX, currY, pointsRef.current);
        if (idx !== -1) {
          dragState.current.dragging = true;
          dragState.current.cornerIndex = idx;
          dragState.current.offsetX = currX - pointsRef.current[idx].x;
          dragState.current.offsetY = currY - pointsRef.current[idx].y;
          return;
        }
        // distance to line
        const [p1, p2] = pointsRef.current;
        const distanceToLine =
          Math.abs((p2.y - p1.y) * currX - (p2.x - p1.x) * currY + p2.x * p1.y - p2.y * p1.x) /
          Math.hypot(p2.y - p1.y, p2.x - p1.x);
        if (distanceToLine < CORNER_RADIUS) {
          dragState.current.dragging = true;
          dragState.current.startX = currX;
          dragState.current.startY = currY;
          dragState.current.cornerIndex = null;
          return;
        }
      }

      // Rectangle/corners
      const cornerIdx = isNearCorner(currX, currY, pointsRef.current);
      if (cornerIdx !== -1) {
        dragState.current.dragging = true;
        dragState.current.cornerIndex = cornerIdx;
        dragState.current.offsetX = currX - pointsRef.current[cornerIdx].x;
        dragState.current.offsetY = currY - pointsRef.current[cornerIdx].y;
      } else if (isInsideRect(currX, currY, pointsRef.current)) {
        dragState.current.dragging = true;
        dragState.current.cornerIndex = null;
        dragState.current.startX = currX;
        dragState.current.startY = currY;
      }
    };

    const handleCanvasMouseMove = (e) => {
      if (!isMoveMode || !dragState.current.dragging) return;
      const { x: currX, y: currY } = getCanvasCoords(e.clientX, e.clientY);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const newPoints = dragState.current.origPoints.map((pt) => ({ ...pt }));

      // If line (2 points)
      if (pointsRef.current.length === 2) {
        if (dragState.current.cornerIndex != null) {
          newPoints[dragState.current.cornerIndex] = {
            x: currX - dragState.current.offsetX,
            y: currY - dragState.current.offsetY,
          };
        } else {
          const dx = currX - dragState.current.startX;
          const dy = currY - dragState.current.startY;
          for (let i = 0; i < newPoints.length; i++) {
            newPoints[i] = { x: newPoints[i].x + dx, y: newPoints[i].y + dy };
          }
        }
      } else {
        // Generic polygon/corners behavior
        if (dragState.current.cornerIndex != null) {
          newPoints[dragState.current.cornerIndex] = {
            x: currX - dragState.current.offsetX,
            y: currY - dragState.current.offsetY,
          };
          // if polygon was closed (last equals first), keep closure by mirroring first->last
          if (newPoints.length > 1) {
            const first = newPoints[0];
            const last = newPoints[newPoints.length - 1];
            if (first.x === last.x && first.y === last.y) {
              newPoints[newPoints.length - 1] = { ...newPoints[0] };
            }
          }
        } else {
          const dx = currX - dragState.current.startX;
          const dy = currY - dragState.current.startY;
          for (let i = 0; i < newPoints.length; i++) {
            newPoints[i] = { x: newPoints[i].x + dx, y: newPoints[i].y + dy };
          }
        }
      }

      // Draw and update live points so external callers get current state
      rafRef.current = requestAnimationFrame(() => {
        draw(newPoints);
        setPoints(newPoints);
        pointsRef.current = newPoints;
      });
    };

    const handleCanvasMouseUp = () => {
      if (!isMoveMode) return;
      dragState.current.dragging = false;
      dragState.current.cornerIndex = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // commit already setPoints in mousemove; nothing else required
    };

  const handleCanvasClick = (e) => {
  if (isMoveMode || !isDrawingMode) return;
  if (!drawCanvasRef.current) return;

  const { x, y } = getCanvasCoords(e.clientX, e.clientY);

  // 🚫 Restrict max points
  if (drawingPoints.length >= maxPoints) {
    return;
  }

  // ✅ Close polygon if clicked near first point AND min 3 points
  if (drawingPoints.length >= 3) {
    const idx = isNearCorner(x, y, drawingPoints);
    if (idx === 0) {
      const closed = [...drawingPoints, { ...drawingPoints[0] }];
      setPoints(closed);
      setDrawingPoints([]);
      setIsDrawingMode(false);
      setIsMoveMode(true);
      draw(closed);
      return;
    }
  }

  const updatedPoints = [...drawingPoints, { x, y }];
  setDrawingPoints(updatedPoints);
  setPoints(updatedPoints);
  draw(updatedPoints);
};

    // attach handlers via props on canvas element directly (onClick/onMouseDown etc. in JSX)

    // Clean up RAF on unmount
    useEffect(() => {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    // Fullscreen handling
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      if (isFullscreen) {
        container.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
      const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [isFullscreen]);

    useEffect(() => {
      const timer = setTimeout(() => setShowZoomHint(false), 3000);
      return () => clearTimeout(timer);
    }, []);

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


    const handleMouseDownPan = (e) => {
      if (scale <= 1) return; // only pan if zoomed
      setIsDragging(true);
      panRef.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
    };


    const handleMouseMovePan = (e) => {
      if (!isDragging) return;

      const container = containerRef.current;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const scaledWidth = cw * scale;
      const scaledHeight = ch * scale;
      const maxX = (scaledWidth - cw) / 2;
      const maxY = (scaledHeight - ch) / 2;

      const newX = e.clientX - panRef.current.x;
      const newY = e.clientY - panRef.current.y;

      setPos({
        x: Math.min(Math.max(newX, -maxX), maxX),
        y: Math.min(Math.max(newY, -maxY), maxY),
      });
    };

    const handleMouseUpPan = () => setIsDragging(false);
    const handleMouseLeavePan = () => setIsDragging(false);



    // Render
    return (
      <>
        <div
          ref={containerRef}
          className={`relative w-full h-full bg-black rounded overflow-hidden
  `}
          // onWheel={minsize ? handleWheel : undefined}
          onMouseDown={handleMouseDownPan}
          onMouseMove={handleMouseMovePan}
          onMouseUp={handleMouseUpPan}
          onMouseLeave={handleMouseLeavePan}
        // style={{
        //   transform: `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`,
        //   transformOrigin: "center center",
        // }}
        >


          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
              <div className="loader border-4 border-gray-300 border-t-blue-500 rounded-full w-10 h-10 animate-spin" />
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20 text-center">
              <p>Unable to load stream</p>
              <p className="text-xs opacity-70 mt-1">{errorMsg || "Camera offline"}</p>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full rounded absolute top-0 left-0 object-contain"
            autoPlay
            playsInline
            muted
            controls={false}
            onCanPlay={() => {
              setIsLoading(false);
              setHasError(false);
            }}
            style={{
              width: "100%",
              height: "100%",
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.2s ease-out",
            }}
            onPlaying={() => {
              setIsLoading(false);
              setHasError(false);
            }}
          />

          {/* drawing overlay canvas (pixel-size matched to video width/height) */}
          {/* <canvas
            ref={drawCanvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            className="w-full h-full rounded absolute top-0 left-0 pointer-events-auto"
            style={{ touchAction: "none" }}
          /> */}
          <canvas
            ref={drawCanvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            className={`w-full h-full rounded absolute top-0 left-0 pointer-events-auto transition-opacity duration-300 ${isLoading || hasError ? "opacity-0" : "opacity-100"
              }`}
            style={{ touchAction: "none" }}
          />

          {/* Maximize/Minimize Button */}
          <div className="absolute top-3 left-3 flex gap-2 z-30">
  {/* Minus Button */}

</div>

          <div className="absolute top-3 right-3 flex items-center justify-center">
              <button
    onClick={() => setMaxPoints((prev) => Math.max(3, prev - 1))}
    className="w-7 h-7 bg-black/60 text-white rounded-full"
  >
    −
  </button>

  {/* Display Count */}
  <div className="px-2 py-1 bg-black/60 text-white text-xs rounded">
    {maxPoints}
  </div>

  {/* Plus Button */}
  <button
    onClick={() => setMaxPoints((prev) => prev + 1)}
    className="w-7 h-7 bg-black/60 text-white rounded-full"
  >
    +
  </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((s) => !s)}
              className="flex items-center cursor-pointer justify-center w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className={`${minsize} w-5 h-5 text-white`} />
              ) : (
                <Maximize className={`${maxsize} w-5 h-5 text-white`} />
              )}
            </button>
          </div>
        </div>
      </>
    );
  }
);

export default CameraStreamWithArea;
