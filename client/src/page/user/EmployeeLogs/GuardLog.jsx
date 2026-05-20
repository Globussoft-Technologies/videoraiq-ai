
import React, { useMemo, useState, useEffect, useRef } from "react";
import { ArrowDownUp } from "lucide-react";
import ReusableTablePage from "./ReusableTablePage";
import { getDeskChannelGraph, getGuardChannelGraph } from "./Api/post";
import XLSX from "xlsx-js-style";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import moment from "moment";

const styles = {
  text: "text-[#333333] text-[13px] font-medium whitespace-nowrap",
};

const colors = {
  presence: "#51f85cfa", // Green
  absence: "#db3a3aff", // Red
};

const axisLabels = [
  "00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00",
];

const formatTime = (mins) => {
  const totalSeconds = Math.floor(mins * 60);

  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");

  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");

  const s = (totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${h}:${m}:${s}`;
};

// UTC → IST conversion
const getMinutes = (date) => {
  const d = moment.utc(date).local();
  return d.hours() * 60 + d.minutes() + d.seconds() / 60;
};

const buildSegmentsFromIncidents = (incidents) => {
  if (!incidents || incidents.length === 0) return [];

  const sorted = [...incidents].sort(
    (a, b) => new Date(a.timeOfIncident) - new Date(b.timeOfIncident)
  );

  const segments = [];

  let startMinute = getMinutes(sorted[0].timeOfIncident);
  let currentState = sorted[0].personPresent;

  for (let i = 1; i < sorted.length; i++) {
    const minute = getMinutes(sorted[i].timeOfIncident);

    if (sorted[i].personPresent !== currentState) {
      const width = ((minute - startMinute) / 1440) * 100;
      const left = (startMinute / 1440) * 100;

      if (width > 0) {
        segments.push({
          type: currentState ? "presence" : "absence",
          width,
          left,
          label: `${formatTime(startMinute)} - ${formatTime(minute)} : ${currentState ? "Presence" : "Absence"
            }`,
        });
      }

      startMinute = minute;
      currentState = sorted[i].personPresent;
    }
  }

  const lastMinute = getMinutes(sorted[sorted.length - 1].timeOfIncident);

  const width = ((lastMinute - startMinute) / 1440) * 100;
  const left = (startMinute / 1440) * 100;

  if (width > 0) {
    segments.push({
      type: currentState ? "presence" : "absence",
      width,
      left,
      label: `${formatTime(startMinute)} - ${formatTime(lastMinute)} : ${currentState ? "Presence" : "Absence"
        }`,
    });
  }

  return segments;
};

const TimelineBar = ({ segments }) => {
  return (
    <div className="relative w-full h-5 rounded-md bg-gray-100">
      <TooltipProvider delayDuration={0}>
        {segments.map((seg, idx) => (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div
                className="absolute h-full hover:opacity-80 cursor-pointer"
                style={{
                  left: `${seg.left}%`,
                  width: `${seg.width}%`,
                  backgroundColor: colors[seg.type],
                }}
              />
            </TooltipTrigger>

            <TooltipContent
              side="top"
              className="bg-slate-900 text-white text-xs px-2 py-1 rounded"
            >
              {seg.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
};

const TimelineCell = ({ zoom, segments, axisLabels, onZoom, isDragging, setIsDragging, startX, setStartX, scrollLeftState, setScrollLeftState }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      onZoom(zoomFactor, mouseX, container);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [onZoom]);

  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setStartX(e.pageX - e.currentTarget.offsetLeft);
    setScrollLeftState(e.currentTarget.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - e.currentTarget.offsetLeft;
    const walk = (x - startX) * 1.5;
    const newScroll = scrollLeftState - walk;

    const allContainers = document.querySelectorAll(".timeline-sync-scroll");
    allContainers.forEach(c => {
      c.scrollLeft = newScroll;
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`absolute inset-0 overflow-x-hidden py-3 hide-scrollbar timeline-sync-scroll ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div
        style={{ width: `${100 * zoom}%` }}
        className="h-full"
      >
        <TimelineBar segments={segments} />

        <div className="flex justify-between text-[10px] text-gray-500 mt-2 border-t pt-2">
          {axisLabels.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="w-[1px] h-2 bg-gray-300"></div>
              <span className="mt-1">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const GuardLog = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const [selectedDate, setSelectedDate] = useState(
    moment().format("YYYY-MM-DD")
  );

  const handleZoom = (zoomFactor, mouseX, container) => {
    setZoom((prev) => {
      const newZoom = Math.min(Math.max(prev * zoomFactor, 1), 5);
      if (newZoom === prev) return prev;

      const scrollPercent = (container.scrollLeft + mouseX) / container.scrollWidth;

      requestAnimationFrame(() => {
        const newScrollWidth = container.clientWidth * newZoom;
        const newScroll = (scrollPercent * newScrollWidth) - mouseX;
        const allContainers = document.querySelectorAll(".timeline-sync-scroll");
        allContainers.forEach(c => {
          c.scrollLeft = newScroll;
        });
      });

      return newZoom;
    });
  };

  useEffect(() => {
    const fetchChannels = async () => {
      setLoading(true);

      try {
        const response = await getGuardChannelGraph(
          searchQuery,
          (currentPage - 1) * 10,
          10,
          { date: selectedDate }
        );

        const result = response?.data?.body?.data?.result || [];
        const total = response?.data?.body?.data?.totalCount || 0;

        const mappedData = result.map((channel) => {
          const channelName =
            channel?.incidents?.[0]?.channel?.name ||
            `Channel ${channel._id}`;
          const customName = channel?.incidents?.[0]?.channel?.customName || "";
          const department =
            channel?.incidents?.[0]?.channel?.department?.[0]?.departmentName || "-";

          return {
            id: channel._id,
            channelId: channelName,
            customName,
            department,
            totalPresenceTime: channel?.totalPresenceTime || "0h 0m",
            totalAbsenceTime: channel?.totalAbsenceTime || "0h 0m",
            segments: buildSegmentsFromIncidents(channel.incidents || []),
          };
        });

        setChannels(mappedData);
        setTotalCount(total);
      } catch (error) {
        console.error("Error fetching channels:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, [currentPage, selectedDate, searchQuery]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "channelId",
        header: () => (
          <span className="flex items-center gap-1 font-medium text-gray-700">
            Channel ID
          </span>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className={styles.text}>
              {row.original.channelId}
            </span>
            {row.original.customName && (
              <span className="text-[13px] font-medium">
                (Alias Name: {row.original.customName || "-"})
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "totalPresenceTime",
        header: () => (
          <span className="flex items-center gap-1 font-medium text-gray-700">
            Total Present Time
          </span>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>
            {row.original.totalPresenceTime || "-"}
          </span>
        ),
      },
      {
        accessorKey: "totalAbsenceTime",
        header: () => (
          <span className="flex items-center gap-1 font-medium text-gray-700">
            Total Absent Time
          </span>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>
            {row.original.totalAbsenceTime || "-"}
          </span>
        ),
      },
      {
        accessorKey: "segments",
        header: () => (
          <span className="font-medium text-gray-700">
            Visibility Timeline (24 Hours)
          </span>
        ),
        cell: ({ row }) => (
          <div className="w-full h-[75px] relative min-w-[600px]">
            <TimelineCell
              zoom={zoom}
              segments={row.original.segments}
              axisLabels={axisLabels}
              onZoom={handleZoom}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              startX={startX}
              setStartX={setStartX}
              scrollLeftState={scrollLeftState}
              setScrollLeftState={setScrollLeftState}
            />
          </div>
        ),
      },
    ],
    [zoom, isDragging, startX, scrollLeftState]
  );
  // ✅ Duration Calculator
  const calculateDuration = (start, end) => {
    const toSeconds = (time) => {
      const [h, m, s] = time.split(":").map(Number);
      return h * 3600 + m * 60 + s;
    };

    let diff = toSeconds(end) - toSeconds(start);

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;

    return `${h}h ${m}m ${s}s`;
  };

  // ✅ Convert segments → logs
  const prepareLogs = (channels) => {
    const finalLogs = [];

    channels.forEach((channel) => {
      channel.segments.forEach((seg) => {
        const [timeRange, status] = seg.label.split(" : ");
        const [inTime, outTime] = timeRange.split(" - ");

        finalLogs.push({
          channelId: channel.channelId,
          inTime,
          outTime,
          duration: calculateDuration(inTime, outTime),
          status,
        });
      });
    });

    return finalLogs;
  };

  // ✅ CSV Download
  const downloadLogsExcel = (channels) => {

    const logs = prepareLogs(channels);

    if (!logs.length) {
      alert("No logs available");
      return;
    }

    // Group logs by camera
    const grouped = {};
    logs.forEach((log) => {
      if (!grouped[log.channelId]) grouped[log.channelId] = [];
      grouped[log.channelId].push(log);
    });

    const workbook = XLSX.utils.book_new();

    Object.keys(grouped).forEach((camera) => {
      const data = grouped[camera].map((log, index) => ({
        Camera: index === 0 ? camera : "",
        "IN Time": log.inTime,
        "OUT Time": log.outTime,
        Duration: log.duration,
        Status:
          log.status?.toLowerCase() === "presence"
            ? "Present"
            : log.status?.toLowerCase() === "absence"
              ? "Absent"
              : log.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);

      // 🔥 Header Styling
      const range = XLSX.utils.decode_range(worksheet["!ref"]);

      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];

        if (cell) {
          cell.s = {
            font: {
              bold: true,
              color: { rgb: "FFFFFF" },
            },
            fill: {
              fgColor: { rgb: "4F81BD" },
            },
            alignment: {
              horizontal: "center",
              vertical: "center",
            },
          };
        }
      }

      // 🔥 Use camera name as sheet name
      const safeSheetName = camera.substring(0, 31); // Excel limit

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        safeSheetName
      );
    });

    XLSX.writeFile(workbook, `camera_logs_${selectedDate}.xlsx`);
  };

  return (
    <div className="bg-transparent min-h-screen">
      <ReusableTablePage
        from="visibility"
        data={channels}
        columns={columns}
        searchKeys={["channelId", "department"]}
        loading={loading}
        attendanceLogsCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setCurrentPage(1);
          setSearchQuery(value);
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => downloadLogsExcel(channels)}
              className="px-4 py-2 bg-[#06486A] text-white rounded-md text-sm hover:bg-[#06486A] cursor-pointer transition-colors"
            >
              Export Logs
            </button>
          </div>

          <input
            type="date"
            value={selectedDate}
            max={moment().format("YYYY-MM-DD")}
            min={moment().month(2).date(1).format("YYYY-MM-DD")}
            onChange={(e) => {
              setCurrentPage(1);
              setSelectedDate(e.target.value);
            }}
            className="border rounded-md px-3 py-1.5 text-sm w-full sm:w-auto"
          />

          <div className="flex items-center gap-4 text-xs text-[#595959]">
            <div className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: colors.presence }}
              />
              Presence
            </div>

            <div className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: colors.absence }}
              />
              Absence
            </div>
          </div>

        </div>
      </ReusableTablePage>
    </div>
  );
};

export default GuardLog;

