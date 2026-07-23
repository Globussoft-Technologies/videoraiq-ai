import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp } from 'lucide-react';
import moment from 'moment';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import TimelineBar, { visibilityColors as colors } from './TimelineBar';
import { axisLabels, buildSegmentsFromIncidents } from './timelineUtils';
import { getDeskChannelGraph } from './Api';

const LIMIT = 10;

const VisibilityLog = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.visibilityLogs?.[action] === 'boolean') return logs.visibilityLogs[action];
    if (typeof logs.global?.[action] === 'boolean') return logs.global[action];
    if (typeof logs[action] === 'boolean') return logs[action];
    return false;
  };
  const canView = resolveLogPerm('view');

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const timelineRef = useRef(null);

  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));

  const handleWheelZoom = (e) => {
    e.preventDefault();
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scrollPercent = (container.scrollLeft + mouseX) / container.scrollWidth;
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;

    setZoom((prev) => {
      const newZoom = Math.min(Math.max(prev * zoomFactor, 1), 5);
      setTimeout(() => {
        container.scrollLeft = scrollPercent * container.scrollWidth - mouseX;
      }, 0);
      return newZoom;
    });
  };

  useEffect(() => {
    if (!canView) return;
    const fetchChannels = async () => {
      setLoading(true);
      try {
        const response = await getDeskChannelGraph(searchQuery, (currentPage - 1) * LIMIT, LIMIT, {
          date: selectedDate,
        });

        const result = response?.data?.body?.data?.result || [];
        const total = response?.data?.body?.data?.totalCount || 0;

        const mappedData = result.map((channel) => ({
          id: channel._id,
          channelId: channel?.incidents?.[0]?.channel?.name || `Channel ${channel._id}`,
          department: channel?.incidents?.[0]?.department?.departmentName || '-',
          segments: buildSegmentsFromIncidents(channel.incidents || []),
        }));

        setChannels(mappedData);
        setTotalCount(total);
      } catch (error) {
        console.error('Error fetching channels:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, [currentPage, selectedDate, searchQuery, canView]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'channelId',
        header: () => (
          <span className="flex items-center gap-1 font-medium text-[var(--tx2)]">
            Channel ID
            <ArrowDownUp className="w-4 h-4 text-[var(--tx3)]" />
          </span>
        ),
        cell: ({ row }) => <span className="text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap">{row.original.channelId}</span>,
      },
      {
        accessorKey: 'department',
        header: () => (
          <span className="flex items-center gap-1 font-medium text-[var(--tx2)]">
            Department
            <ArrowDownUp className="w-4 h-4 text-[var(--tx3)]" />
          </span>
        ),
        cell: ({ row }) => <span className="text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap">{row.original.department || '-'}</span>,
      },
      {
        accessorKey: 'segments',
        header: () => <span className="font-medium text-[var(--tx2)]">Visibility Timeline (24 Hours)</span>,
        cell: ({ row }) => (
          <div ref={timelineRef} onWheel={handleWheelZoom} className="w-full overflow-x-auto py-3">
            <div style={{ width: `${700 * zoom}px` }} className="transition-all duration-200">
              <TimelineBar segments={row.original.segments} colors={colors} />
              <div className="flex justify-between text-[10px] text-[var(--tx3)] mt-2 border-t border-[var(--bd)] pt-2">
                {axisLabels.map((label, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="w-[1px] h-2 bg-[var(--bd)]" />
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

  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Visibility Logs."
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ReusableTablePage
        from="visibility"
        data={channels}
        columns={columns}
        searchKeys={['channelId', 'department']}
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
            max={moment().format('YYYY-MM-DD')}
            onChange={(e) => {
              setCurrentPage(1);
              setSelectedDate(e.target.value);
            }}
            className="h-10 border border-[var(--bd)] rounded-lg px-3 text-sm w-full sm:w-auto bg-[var(--bg2)] text-[var(--tx)]"
          />

          <div className="flex items-center gap-4 text-xs text-[var(--tx2)]">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.presence }} />
              Presence
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.absence }} />
              Absence
            </div>
          </div>
        </div>
      </ReusableTablePage>
    </div>
  );
};

export default VisibilityLog;
