import React, { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';
import AutoHideWrapper from './AutoHideWrapper';
let onChangeActive = false
let intialLoad = true
import { toast } from 'sonner';

const TimePicker24Hour = ({selectedDate, selectedCamera, onTimeRangeSelect,videoRef, position, setPosition, targetRef}) => {
    const totalDuration = 24 * 60 * 60; // 86400s in a day
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [vCurrent, setVCurrent] = useState(0);

  // 🆕 selected date (current day by default)

  // 🆕 session ID for tracking
  const [sessionId] = useState(uuidv4());

  // 🆕 date range object 
 

  // 🟦 Function to format ISO-style timestamps (20251104T114607Z)
  const formatToApiTime = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };
  
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);


  const [dateRange, setDateRange] = useState({
    startTime: formatToApiTime(startOfDay),
    endTime: formatToApiTime(endOfDay),
    sessionId: sessionId,
  });

  // 🧮 Update start & end time whenever date or position changes
  useEffect(() => {
    if (!selectedDate) return;
  
    const handler = setTimeout(() => {
      const dateAtSelectedTime = new Date(selectedDate);
      const hrs = Math.floor(position / 3600);
      const mins = Math.floor((position % 3600) / 60);
      const secs = position % 60;
      dateAtSelectedTime.setHours(hrs, mins, secs, 0);
  
      const startTime = formatToApiTime(dateAtSelectedTime);
  
      // End time = same day at 23:59:59
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);
      const endTime = formatToApiTime(endDate);
      onChangeActive = false
      setDateRange({
        startTime,
        endTime,
        sessionId,
      });
    }, 900); // debounce delay
  
    return () => clearTimeout(handler);
  }, [selectedDate, position, sessionId]);

  // 🟨 Debug: Log all states
//   useEffect(() => {
//     console.log("------ State Values ------");
//     console.log("totalDuration:", totalDuration);
//     console.log("position:", position);
//     console.log("containerWidth:", containerWidth);
//     console.log("hoveredDetection:", hoveredDetection);
//     console.log("expandedImage:", expandedImage);
//     console.log("detections:", detections);
//     console.log("loading:", loading);
//     console.log("containerRef:", containerRef.current);
//     console.log("selectedDate:", selectedDate);
//     console.log("dateRange:", dateRange);
//     console.log("--------------------------");
//   }, [
//     totalDuration,
//     position,
//     containerWidth,
//     hoveredDetection,
//     expandedImage,
//     detections,
//     loading,
//     selectedDate,
//     dateRange,
//   ]);



  // Color scheme based on mathematical/technical theme (blue/purple tones)
  const colorScheme = {
    primary: "#07486a",     // Royal blue
    secondary: "#2563eb",   // Purple
    accent: "#06b6d4",      // Cyan
    background: "#f8fafc",  // Light slate
    track: "#e2e8f0",       // Light gray
    text: "#1e293b",        // Dark slate
    lightText: "#64748b",   // Medium slate
  };

  // Base URL for images
  const BASE_URL = import.meta.env.VITE_INCIDENT_URL;

  // Map incident types to detection types
  const incidentTypeMapping = {
    unauthorizedAccess: "person",
    motion: "motion",
    vehicle: "vehicle",
    sound: "sound",
    object: "object",
    animal: "animal"
  };

  // Map severity to confidence
  const severityToConfidence = {
    low: 0.6,
    moderate: 0.8,
    high: 0.95,
    critical: 0.99
  };

  // Enhanced detection colors matching the theme
//   const detectionConfig = {
//     motion: { color: "#f59e0b", icon: "🔍", label: "Motion" },
//     person: { color: "#ef4444", icon: "👤", label: "Person" },
//     vehicle: { color: colorScheme.primary, icon: "🚗", label: "Vehicle" },
//     animal: { color: "#10b981", icon: "🐾", label: "Animal" },
//     sound: { color: colorScheme.secondary, icon: "🔊", label: "Sound" },
//     object: { color: "#f59e0b", icon: "📦", label: "Object" },
//     unauthorizedAccess: { color: "#ef4444", icon: "🚫", label: "Unauthorized" },
//     gauge: { color: "#8b5cf6", icon: "📊", label: "Gauge" }
//   };

const detectionConfig = {
 
  };


  // Fetch incidents from API
  const fetchIncidents = async (startDate, endDate) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND}/api/v1/incidents?skip=0&limit=50&startDate=${startDate}&endDate=${endDate}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        const formattedDetections = data.data.map(incident => {
          // Convert timeOfIncident to seconds since start of day
          const incidentTime = new Date(incident.timeOfIncident);
          const hours = incidentTime.getHours();
          const minutes = incidentTime.getMinutes();
          const seconds = incidentTime.getSeconds();
          const timeInSeconds = hours * 3600 + minutes * 60 + seconds;

          // Determine detection type
          let detectionType = incident.incidentType || incident.type || "motion";
          detectionType = incidentTypeMapping[detectionType] || detectionType;

          // Get confidence from severity
          const confidence = severityToConfidence[incident.severity] || 0.7;

          // Build image URL
          const imageUrl = incident.Image ? `${BASE_URL}${incident.Image}` : null;

          return {
            time: timeInSeconds,
            type: detectionType,
            confidence: confidence,
            image: imageUrl,
            description: incident.description || incident.incidentName || "Incident detected",
            incidentId: incident._id,
            severity: incident.severity,
            resolved: incident.resolved,
            zone: incident.zone,
            originalTime: incident.timeOfIncident
          };
        });

        setDetections(formattedDetections);
      }
    } catch (error) {
      console.error("Error fetching incidents:", error);
      // Fallback to sample data if API fails
      setDetections(getSampleDetections());
    } finally {
      setLoading(false);
    }
  };

  // Sample data fallback
  const getSampleDetections = () => {
    return [
      { time: 1800, type: "motion", confidence: 0.7, description: "General motion detected" },
      { time: 3600, type: "person", confidence: 0.9, image: "https://images.pexels.com/photos/1181364/pexels-photo-1181364.jpeg", description: "Person at front door" },
      { time: 4000, type: "vehicle", confidence: 0.85, image: "https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg", description: "Vehicle in driveway" },
    ];
  };

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Poll videoRef.current.currentTime so the bar advances even when the
  // currentTime prop drops updates across HLS stream reloads.
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef?.current;
      if (v && Number.isFinite(v.currentTime)) setVCurrent(v.currentTime);
    }, 250);
    return () => clearInterval(id);
  }, [videoRef]);

  // Fetch data when dateRange changes
  useEffect(() => {
      if (dateRange && dateRange?.startTime && dateRange?.endTime) {
          fetchIncidents(dateRange.endTime, dateRange?.endTime);
      onTimeRangeSelect(dateRange.startTime, dateRange?.endTime, selectedCamera)
    }
  }, [dateRange,selectedCamera]);

  const handleSeek = (e) => {
    const newPos = Number(e.target.value);
    onChangeActive = true;
  
    // Calculate the new time based on the seek position
    const dateAtSelectedTime = new Date(selectedDate);
    const hrs = Math.floor(newPos / 3600);
    const mins = Math.floor((newPos % 3600) / 60);
    const secs = newPos % 60;
    dateAtSelectedTime.setHours(hrs, mins, secs, 0);
  
    // Convert to UTC ISO (same as your startDate logic)
    const startDate = new Date(dateAtSelectedTime.toISOString());
    // ✅ Same "no future" logic reused
    if (startDate > new Date(Date.now())) {
      toast.warning('Cannot seek into future time.');
      return;
    } else{
      console.log(startDate > new Date(Date.now() ), "startDate > new Date(Date.now() + (5.5 * 60 * 60 * 1000) - (5 * 60 * 1000))")
      setPosition(newPos);
    }
  };
  
  

  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(x / rect.width, 1));
      const timeInSeconds = Math.floor(percentage * totalDuration);
      setHoverPosition(timeInSeconds);
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };
  
  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const jumpSeconds = (sec) => {
    setPosition((prev) => Math.min(Math.max(prev + sec, 0), totalDuration));
  };
  const formatTime = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = (sec % 60).toFixed(1); // Round to 1 decimal place
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${secs.padStart(4, "0")}`;
  };
  

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const markers = Array.from({ length: 97 }, (_, i) => i * 900); // every 15 mins

  return (
    <AutoHideWrapper className="w-full" hideDelay={2000} targetRef={targetRef}>
      <div
        ref={containerRef}
        className="w-full text-center font-sans shadow-lg"
        style={{ 
          backgroundColor: colorScheme.background
        }}
      >
      {/* Loading State */}
      {/* {loading && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-white/90 p-5 rounded-lg shadow-lg">
          Loading incidents...
        </div>
      )} */}

      {/* Date Range Display */}
      {/* {dateRange && (
        <div style={{
          marginBottom: "15px",
          color: colorScheme.text,
          fontSize: "14px",
          fontWeight: "500"
        }}>
          Showing incidents from {formatDate(dateRange.startTime)} to {formatDate(dateRange.endTime)}
          <div style={{ fontSize: "12px", color: colorScheme.lightText }}>
            {detections.length} incidents found
          </div>
        </div>
      )} */}

      {/* Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 w-full h-full bg-black/90 flex justify-center items-center z-[1000] cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded detection"
            className="max-w-[90%] max-h-[90%] rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Jump buttons */}
      {/* <div style={{ marginBottom: "15px" }}>
        <button 
          onClick={() => jumpSeconds(-60)}
          style={{
            margin: "0 5px",
            padding: "8px 12px",
            backgroundColor: colorScheme.primary,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500"
          }}
        >
          ⏪ -1m
        </button>
        <button 
          onClick={() => jumpSeconds(-10)}
          style={{
            margin: "0 5px",
            padding: "8px 12px",
            backgroundColor: colorScheme.primary,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500"
          }}
        >
          ⏪ -10s
        </button>
        <button 
          onClick={() => jumpSeconds(10)}
          style={{
            margin: "0 5px",
            padding: "8px 12px",
            backgroundColor: colorScheme.primary,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500"
          }}
        >
          +10s ⏩
        </button>
        <button 
          onClick={() => jumpSeconds(60)}
          style={{
            margin: "0 5px",
            padding: "8px 12px",
            backgroundColor: colorScheme.primary,
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500"
          }}
        >
          +1m ⏩
        </button>
      </div> */}

      <div className="relative h-[50px]">
        {/* Track */}
        <div
          className="absolute top-0 left-0 w-full h-12 overflow-visible shadow-inner"
          style={{ background: colorScheme.track }}
        >
          {/* Progress */}
          <div
            className="h-full transition-[width] duration-[50ms] linear"
            style={{
              width: `${((position+vCurrent) / totalDuration) * 100}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${colorScheme.primary} 0%, ${colorScheme.secondary} 50%, ${colorScheme.accent} 100%)`,
              transition: "width 0.05s linear",
            }}
          />

          {/* Markers */}
          {markers.map((m, i) => {
            const leftPx = containerWidth * (m / totalDuration);
            const isHour = m % 3600 === 0;
            const isHalfHour = m % 1800 === 0 && m % 3600 !== 0;
            
            // Calculate marker height and styling based on type
            let markerHeight = "25%"; // 15-min markers
            let markerOpacity = 0.12;
            let markerWidth = "1px";
            
            if (isHour) {
              markerHeight = "100%";
              markerOpacity = 0.35;
              markerWidth = "2px";
            } else if (isHalfHour) {
              markerHeight = "50%";
              markerOpacity = 0.2;
              markerWidth = "1px";
            }
            
            return (
              <div
                key={i}
                onClick={() => isHour && setPosition(m)}
                style={{
                  position: "absolute",
                  left: leftPx,
                  top: isHour ? 0 : "25%",
                  height: markerHeight,
                  width: markerWidth,
                  backgroundColor: `rgba(7, 72, 106, ${markerOpacity})`,
                  cursor: isHour ? "pointer" : "default",
                  zIndex: isHour ? 3 : (isHalfHour ? 2 : 1),
                }}
                title={isHour ? formatTime(m) : undefined}
              />
            );
          })}

          {/* Time Labels inside bar (every 2h) */}
          {Array.from({ length: 13 }, (_, i) => {
            const hour = i * 2;
            const leftPx = (containerWidth * (hour * 3600)) / totalDuration;
            const isCurrentHour = Math.floor(position / 3600) === hour;
            
            // Adjust position for labels to prevent overflow on both sides
            // Assuming each label is approximately 40px wide
            const labelWidth = 40;
            let adjustedLeft = leftPx - 20;
            
            // Prevent overflow on the left side (first labels)
            if (adjustedLeft < 0) {
              adjustedLeft = 0;
            }
            
            // Prevent overflow on the right side (last labels)
            if (leftPx > containerWidth - labelWidth) {
              adjustedLeft = containerWidth - labelWidth;
            }
            
            return (
              <div
                key={i}
                onClick={() => setPosition(hour * 3600)}
                style={{
                  position: "absolute",
                  left: adjustedLeft,
                  bottom: 8,
                  color: "black",
                  fontSize: "12px",
                  fontWeight: isCurrentHour ? 600 : 500,
                  cursor: "pointer",
                  userSelect: "none",
                  letterSpacing: "0.3px",
                }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            );
          })}
         

          {/* Time Labels inside bar (every 2h) */}
          
          {/* Detection Events */}
          {detections.map((det, idx) => {
            const leftPx = containerWidth * (det.time / totalDuration);
            const config = detectionConfig[det.type] || detectionConfig.motion;
            
            return (
              <div
                key={det.incidentId || idx}
                onClick={() => setPosition(det.time)}
                onMouseEnter={() => setHoveredDetection(idx)}
                onMouseLeave={() => setHoveredDetection(null)}
                className="absolute top-0 w-4 h-full rounded cursor-pointer flex items-center justify-center text-[10px] font-bold transition-all duration-200 ease-in-out"
                style={{
                  left: leftPx - 8,
                  backgroundColor: config?.color,
                  transform: hoveredDetection === idx ? "scale(1.2)" : "scale(1)",
                  zIndex: hoveredDetection === idx ? 10 : 1,
                  opacity: det.resolved ? 0.7 : 1,
                }}
              >
                { config?.icon}

                {/* Enhanced Tooltip */}
                {hoveredDetection === idx && (
                  <div
                    className="absolute -top-[120px] -left-20 w-40 bg-black/90 text-white p-2.5 rounded-lg text-xs shadow-lg z-[100] text-left"
                  >
                    <div className="flex items-center mb-1.5">
                      <span className="mr-1.5">{ config?.icon}</span>
                      <strong>{config.label}</strong>
                      {det.resolved && (
                        <span className="ml-2 text-[10px] bg-emerald-500 px-1.5 py-0.5 rounded">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div>Time: {formatTime(det.time)}</div>
                    {det.confidence && (
                      <div>Confidence: {(det.confidence * 100).toFixed(0)}%</div>
                    )}
                    {det.severity && (
                      <div>Severity: <span className="capitalize">{det.severity}</span></div>
                    )}
                    {det.description && (
                      <div className="mt-1 italic">
                        {det.description}
                      </div>
                    )}
                    {det.zone && (
                      <div className="mt-1 text-[11px]">
                        Zone: {det.zone}
                      </div>
                    )}
                    
                    {/* Thumbnail with expand option */}
                    {det.image && (
                      <div
                        className="mt-2 cursor-pointer border-2 border-white rounded overflow-hidden"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedImage(det.image);
                        }}
                      >
                        <img
                          src={det.image}
                          alt={det.type}
                          className="w-full h-20 object-cover"
                        />
                        <div className="text-[10px] p-0.5" style={{ background: config?.color }}>
                          Click to expand
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time bubble - YouTube style: shows on hover only */}
        {isHovering && (
          <div
            className="absolute -top-[45px] bg-white/10 text-white px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap z-30 pointer-events-none transition-[left] duration-[50ms] linear"
            style={{
              left: Math.min(Math.max(containerWidth * (hoverPosition / totalDuration) - 40, 0), containerWidth - 80),
            }}
          >
            {formatTime(hoverPosition)}
          </div>
        )}

        {/* Detection type legend */}
        <div
          className="absolute top-0 left-0 flex gap-2.5 text-[11px] flex-wrap"
          style={{ color: colorScheme.lightText }}
        >
          {Object.entries(detectionConfig).map(([type, config]) => (
            <div key={type} className="flex items-center">
              <div
                className="w-3 h-3 rounded-sm mr-1"
                style={{ backgroundColor: config?.color }}
              />
              { config?.icon} {config.label}
            </div>
          ))}
        </div>

        {/* Transparent range input */}
        <input
          type="range"
          min={0}
          max={totalDuration}
          value={position}
          onChange={handleSeek}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          step={1}
          className="w-full h-[50px] opacity-0 cursor-pointer absolute top-0 left-0 z-[5]"
        />
      </div>

     

      {/* Current detections at selected time */}
      {/* <div style={{ 
        position: "fixed",
        top: "200px",
        left: "20px",
        zIndex: 1000,
        width: "350px",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(8px)",
        padding: "15px",
        borderRadius: "10px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        textAlign: "left",
        maxHeight: "400px",
        overflowY: "auto"
      }}>
        <h3 style={{ 
          marginBottom: "10px", 
          color: colorScheme.text,
          borderBottom: `2px solid ${colorScheme.primary}`,
          paddingBottom: "5px"
        }}>
          Detections near current time:
        </h3>

        {detections
          .filter(det => Math.abs(det.time - position) <= 300)
          .sort((a, b) => Math.abs(a.time - position) - Math.abs(b.time - position))
          .slice(0, 3)
          .map((det, idx) => {
            const config = detectionConfig[det.type] || detectionConfig.motion;
            return (
              <div
                key={det.incidentId || idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px",
                  margin: "5px 0",
                  backgroundColor: "#f8fafc",
                  borderRadius: "6px",
                  cursor: "pointer",
                  borderLeft: `4px solid ${config.color}`,
                  opacity: det.resolved ? 0.7 : 1,
                }}
                onClick={() => setPosition(det.time)}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    backgroundColor: config?.color,
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "10px",
                    fontSize: "12px",
                  }}
                >
                  { config?.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", color: colorScheme.text }}>
                    {config.label} at {formatTime(det.time)}
                    {det.resolved && (
                      <span style={{ 
                        marginLeft: "8px", 
                        fontSize: "0.8em", 
                        backgroundColor: "#10b981",
                        color: "white",
                        padding: "2px 6px",
                        borderRadius: "4px"
                      }}>
                        Resolved
                      </span>
                    )}
                  </div>
                  {det.confidence && (
                    <span style={{ marginLeft: "8px", color: colorScheme.lightText, fontSize: "0.9em" }}>
                      ({(det.confidence * 100).toFixed(0)}% confidence)
                    </span>
                  )}
                  {det.description && (
                    <div style={{ fontSize: "0.9em", color: colorScheme.lightText }}>{det.description}</div>
                  )}
                  {det.zone && (
                    <div style={{ fontSize: "0.8em", color: colorScheme.lightText, marginTop: "2px" }}>
                      Zone: {det.zone}
                    </div>
                  )}
                </div>
                {det.image && (
                  <img
                    src={det.image}
                    alt={det.type}
                    style={{
                      width: "60px",
                      height: "40px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImage(det.image);
                    }}
                  />
                )}
              </div>
            );
          })}
        
        {detections.filter(det => Math.abs(det.time - position) <= 300).length === 0 && (
          <div style={{ color: colorScheme.lightText, fontStyle: "italic" }}>
            No detections within 5 minutes
          </div>
        )}
      </div> */}
      </div>
    </AutoHideWrapper>
  );
};

export default TimePicker24Hour;