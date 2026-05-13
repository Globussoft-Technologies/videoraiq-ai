
import React, { useMemo, useState, useEffect, useRef } from "react";
import { ArrowDownUp } from "lucide-react";
import ReusableTablePage from "./ReusableTablePage";
import { getDeskChannelGraph } from "./Api/post";
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
  presence: "#06486A",
  absence: "#CEEEFF",
};

const axisLabels = [
  "00:00","03:00","06:00","09:00","12:00","15:00","18:00","21:00","24:00",
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
          label: `${formatTime(startMinute)} - ${formatTime(minute)} : ${
            currentState ? "Presence" : "Absence"
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
      label: `${formatTime(startMinute)} - ${formatTime(lastMinute)} : ${
        currentState ? "Presence" : "Absence"
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

const VisibilityLog = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoom, setZoom] = useState(1);

  const timelineRef = useRef(null);

  const [selectedDate, setSelectedDate] = useState(
    moment().format("YYYY-MM-DD")
  );

 const handleWheelZoom = (e) => {
  e.preventDefault();

  const container = e.currentTarget;

  const rect = container.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  const scrollPercent =
    (container.scrollLeft + mouseX) / container.scrollWidth;

  const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;

  setZoom((prev) => {
    const newZoom = Math.min(Math.max(prev * zoomFactor, 1), 5);

    setTimeout(() => {
      const newScroll =
        scrollPercent * container.scrollWidth - mouseX;

      container.scrollLeft = newScroll;
    }, 0);

    return newZoom;
  });
}; 

  useEffect(() => {
    const fetchChannels = async () => {
      setLoading(true);

      try {
        const response = await getDeskChannelGraph(
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

          const department =
            channel?.incidents?.[0]?.department?.departmentName || "-";

          return {
            id: channel._id,
            channelId: channelName,
            department,
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
            <ArrowDownUp className="w-4 h-4 text-gray-400" />
          </span>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>{row.original.channelId}</span>
        ),
      },
      {
        accessorKey: "department",
        header: () => (
          <span className="flex items-center gap-1 font-medium text-gray-700">
            Department
            <ArrowDownUp className="w-4 h-4 text-gray-400" />
          </span>
        ),
        cell: ({ row }) => (
          <span className={styles.text}>
            {row.original.department || "-"}
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
          <div
            ref={timelineRef}
            onWheel={handleWheelZoom}
            className="w-full overflow-x-auto py-3"
          >
            <div
              style={{ width: `${700 * zoom}px` }}
              className="transition-all duration-200"
            >
              <TimelineBar segments={row.original.segments} />

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
        ),
      },
    ],
    [zoom]
  );

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

export default VisibilityLog;

