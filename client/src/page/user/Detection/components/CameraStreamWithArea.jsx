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
import { getStreamBaseUrl } from "@/utils/resolveStreamUrl";

// Convert a single point ([x,y] or {x,y}) to {x,y}
const toPointObj = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);

// Normalize an incoming reference-points value into an array of zones,
// where each zone is an array of {x,y} points.
// Accepts:
//   - flat single polygon:  [[x,y], ...]  or  [{x,y}, ...]
//   - nested multi-zone:    [[[x,y], ...], [[x,y], ...]]
const normalizeToZones = (input) => {
  if (!Array.isArray(input) || input.length === 0) return [];
  const first = input[0];
  const isNested = Array.isArray(first) && Array.isArray(first[0]);
  if (isNested) {
    return input
      .filter((poly) => Array.isArray(poly) && poly.length > 0)
      .map((poly) => poly.map(toPointObj));
  }
  // single flat polygon
  return [input.map(toPointObj)];
};

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
      setIsLoading,
      // Optional per-zone names (index-aligned to zones) drawn on each polygon.
      zoneNames = []
    },
    ref
  ) => {
    const videoRef = useRef(null);
    const drawCanvasRef = useRef(null);
    const containerRef = useRef(null);

    // Keep latest zone names in a ref so draw() (called from listeners) sees them.
    const zoneNamesRef = useRef(zoneNames);
    zoneNamesRef.current = zoneNames;

    // zones: array of committed polygons. Each polygon is an array of {x,y}
    // (closed polygons keep the first point repeated as the last point).
    const [zones, setZones] = useState(() => normalizeToZones(initialPoints));
    const zonesRef = useRef(zones);
    zonesRef.current = zones;

    // drawingPoints: the in-progress polygon currently being drawn.
    const [drawingPoints, setDrawingPoints] = useState([]);
    const drawingPointsRef = useRef(drawingPoints);
    drawingPointsRef.current = drawingPoints;

    // max points allowed for the polygon currently being drawn
    const [maxPoints, setMaxPoints] = useState(3); // default = 3
    const { streamModalShow, setStreamModalShow } = useContext(UserContext);

    // Trim in-progress polygon if the user lowers the max-points limit
    useEffect(() => {
      if (drawingPointsRef.current.length > maxPoints) {
        setDrawingPoints((prev) => prev.slice(0, maxPoints));
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

    const streamBaseUrl = getStreamBaseUrl();
    const local_status = import.meta.env.VITE_LOCAL_SETUP;

    const rafRef = useRef(null);

    // dragging state for move mode (tracks which zone/corner is being moved)
    const dragState = useRef({
      dragging: false,
      zoneIndex: null,
      cornerIndex: null,
      startX: 0,
      startY: 0,
      origZone: [],
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
      const parsed = normalizeToZones(initialPoints);
      const areSame =
        JSON.stringify(parsed) === JSON.stringify(zonesRef.current);
      if (!areSame) {
        setZones(parsed);
        setDrawingPoints([]);
        requestAnimationFrame(() => draw(parsed, []));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPoints]);

    // expose imperative methods
    useImperativeHandle(
      ref,
      () => ({
        clearPoints: () => {
          setZones([]);
          setDrawingPoints([]);
          const canvas = drawCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          // Do NOT toggle drawing mode here — clearing must not silently
          // re-enable drawing. The caller controls the drawing/move modes.
        },
        // Accepts a flat single polygon or a nested multi-zone array.
        setPoints: (pts) => {
          const normalized = normalizeToZones(pts);
          setZones(normalized);
          setDrawingPoints([]);
          requestAnimationFrame(() => draw(normalized, []));
        },
        // Explicit multi-zone setter (same normalization as setPoints).
        setZones: (z) => {
          const normalized = normalizeToZones(z);
          setZones(normalized);
          setDrawingPoints([]);
          requestAnimationFrame(() => draw(normalized, []));
        },
        // Undo the last placed point (and the line leading to it).
        // - If a polygon is in progress, drop its last point.
        // - Otherwise reopen the most recently committed zone and drop its last
        //   point, so undo flows continuously across the close-polygon step.
        undoLastPoint: () => {
          const active = drawingPointsRef.current || [];
          if (active.length > 0) {
            const next = active.slice(0, -1);
            setDrawingPoints(next);
            requestAnimationFrame(() => draw(zonesRef.current, next));
            return;
          }
          const zs = zonesRef.current || [];
          if (zs.length > 0) {
            const last = zs[zs.length - 1];
            // Strip the duplicated closing point, then remove the last vertex.
            let reopened = last.slice();
            if (
              reopened.length > 1 &&
              reopened[0].x === reopened[reopened.length - 1].x &&
              reopened[0].y === reopened[reopened.length - 1].y
            ) {
              reopened = reopened.slice(0, -1);
            }
            reopened = reopened.slice(0, -1);
            const remainingZones = zs.slice(0, -1);
            setZones(remainingZones);
            setDrawingPoints(reopened);
            requestAnimationFrame(() => draw(remainingZones, reopened));
          }
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
        // Backward-compatible: flat list of all points (used for emptiness checks)
        getPoints: () => zonesRef.current.flat().map((p) => ({ ...p })),
        // Multi-zone output as nested [[ [x,y], ... ], ...]
        getZones: () => zonesRef.current.map((z) => z.map((p) => [p.x, p.y])),
        getResolution: () =>
          videoRef.current ? [videoRef.current.videoWidth || 1280, videoRef.current.videoHeight || 720] : [0, 0],
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [zones, drawingPoints, isDrawingMode, isMoveMode]
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
        // draw existing zones after resize
        draw(zonesRef.current, drawingPointsRef.current);
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

    // Redraw whenever zones, the in-progress polygon, or zone names change
    useEffect(() => {
      draw(zones, drawingPoints);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zones, drawingPoints, zoneNames]);

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

    // --- Draw a single polygon (closed or open) ---
    const drawPolygon = (ctx, pts, { closed, cornerSize }) => {
      if (!pts || pts.length === 0) return;
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (closed) {
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (first.x === last.x && first.y === last.y) {
          ctx.closePath();
        }
      }
      ctx.stroke();

      // draggable corners
      ctx.fillStyle = "orange";
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cornerSize, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    };

    // --- Draw a zone's name label near its top edge ---
    const drawZoneLabel = (ctx, pts, name, scaleFactor) => {
      if (!name || !pts || pts.length === 0) return;
      // Anchor at the polygon's top-left-most point.
      let anchor = pts[0];
      for (const p of pts) {
        if (p.y < anchor.y || (p.y === anchor.y && p.x < anchor.x)) anchor = p;
      }
      const fontPx = Math.max(10, Math.round(14 * scaleFactor));
      ctx.save();
      ctx.font = `600 ${fontPx}px sans-serif`;
      ctx.textBaseline = "top";
      const padX = fontPx * 0.4;
      const padY = fontPx * 0.25;
      const textW = ctx.measureText(name).width;
      const boxX = anchor.x;
      const boxY = Math.max(0, anchor.y - (fontPx + padY * 2) - 4);
      const boxW = textW + padX * 2;
      const boxH = fontPx + padY * 2;
      const radius = Math.min(boxH / 2, fontPx * 0.45);
      // Rounded red pill background for readability over the video.
      ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(boxX, boxY, boxW, boxH, radius);
      } else {
        // Fallback rounded-rect path for older canvas implementations.
        ctx.moveTo(boxX + radius, boxY);
        ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, radius);
        ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, radius);
        ctx.arcTo(boxX, boxY + boxH, boxX, boxY, radius);
        ctx.arcTo(boxX, boxY, boxX + boxW, boxY, radius);
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(name, boxX + padX, boxY + padY);
      ctx.restore();
    };

    // --- Draw all committed zones plus the in-progress polygon ---
    const draw = (zonesArr = zonesRef.current, active = drawingPointsRef.current) => {
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const rect = canvas.getBoundingClientRect();
      const cornerSize = Math.max(4, (CORNER_RADIUS / 2) * (canvas.width / Math.max(rect.width, 1)));
      // Scale label size to the canvas/display ratio so text stays legible.
      const scaleFactor = canvas.width / Math.max(rect.width, 1);
      const names = zoneNamesRef.current || [];

      (zonesArr || []).forEach((z, i) => {
        drawPolygon(ctx, z, { closed: true, cornerSize });
        drawZoneLabel(ctx, z, names[i], scaleFactor);
      });
      drawPolygon(ctx, active, { closed: false, cornerSize });
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
      if (!isMoveMode) return;
      const { x: currX, y: currY } = getCanvasCoords(e.clientX, e.clientY);
      const zs = zonesRef.current;

      // 1) Try to grab a corner of any zone
      for (let zi = 0; zi < zs.length; zi++) {
        const idx = isNearCorner(currX, currY, zs[zi]);
        if (idx !== -1) {
          dragState.current = {
            dragging: true,
            zoneIndex: zi,
            cornerIndex: idx,
            origZone: zs[zi].map((pt) => ({ ...pt })),
            offsetX: currX - zs[zi][idx].x,
            offsetY: currY - zs[zi][idx].y,
            startX: currX,
            startY: currY,
          };
          return;
        }
      }

      // 2) Otherwise try to grab a whole zone (drag inside its bounds)
      for (let zi = 0; zi < zs.length; zi++) {
        if (isInsideRect(currX, currY, zs[zi])) {
          dragState.current = {
            dragging: true,
            zoneIndex: zi,
            cornerIndex: null,
            origZone: zs[zi].map((pt) => ({ ...pt })),
            startX: currX,
            startY: currY,
            offsetX: 0,
            offsetY: 0,
          };
          return;
        }
      }
    };

    const handleCanvasMouseMove = (e) => {
      if (!isMoveMode || !dragState.current.dragging) return;
      const { x: currX, y: currY } = getCanvasCoords(e.clientX, e.clientY);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const { zoneIndex, cornerIndex, origZone } = dragState.current;
      let newZone = origZone.map((pt) => ({ ...pt }));

      if (cornerIndex != null) {
        newZone[cornerIndex] = {
          x: currX - dragState.current.offsetX,
          y: currY - dragState.current.offsetY,
        };
        // keep polygon closed if first/last coincide
        const lastIdx = newZone.length - 1;
        if (newZone.length > 1) {
          const f = origZone[0];
          const l = origZone[lastIdx];
          if (f.x === l.x && f.y === l.y) {
            if (cornerIndex === 0) newZone[lastIdx] = { ...newZone[0] };
            else if (cornerIndex === lastIdx) newZone[0] = { ...newZone[lastIdx] };
          }
        }
      } else {
        const dx = currX - dragState.current.startX;
        const dy = currY - dragState.current.startY;
        newZone = origZone.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
      }

      const updatedZones = zonesRef.current.map((z, i) => (i === zoneIndex ? newZone : z));

      rafRef.current = requestAnimationFrame(() => {
        setZones(updatedZones);
        zonesRef.current = updatedZones;
        draw(updatedZones, drawingPointsRef.current);
      });
    };

    const handleCanvasMouseUp = () => {
      if (!isMoveMode) return;
      dragState.current.dragging = false;
      dragState.current.zoneIndex = null;
      dragState.current.cornerIndex = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    // Commit the in-progress polygon as a closed zone (first point repeated as
    // the last) and reset so the next zone can be drawn immediately.
    const commitZone = (pts) => {
      if (!pts || pts.length < 3) return;
      const closed = [...pts, { ...pts[0] }];
      setZones((prev) => [...prev, closed]);
      setDrawingPoints([]);
    };

    const handleCanvasClick = (e) => {
      if (isMoveMode || !isDrawingMode) return;
      if (!drawCanvasRef.current) return;

      const { x, y } = getCanvasCoords(e.clientX, e.clientY);

      // 🚫 Restrict max points — the count from the +/- control is just how
      // many points the user wants to place (same behaviour as before).
      if (drawingPoints.length >= maxPoints) {
        return;
      }

      // ✅ Close polygon if clicked near first point AND min 3 points.
      // Commit it as a zone and stay in drawing mode so the user can
      // immediately start drawing the next zone.
      if (drawingPoints.length >= 3) {
        const idx = isNearCorner(x, y, drawingPoints);
        if (idx === 0) {
          commitZone(drawingPoints);
          return;
        }
      }

      setDrawingPoints((prev) => [...prev, { x, y }]);
    };

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
