import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import { guardColors as colors } from '@/pages/VisibilityLog/TimelineBar';
import { axisLabels, buildSegmentsFromIncidents } from '@/pages/VisibilityLog/timelineUtils';
import TimelineCell from './TimelineCell';
import { downloadLogsExcel } from './guardExport';
import { getGuardChannelGraph } from './Api';

const LIMIT = 10;

const GuardLog = () => {
  const navigate = useNavigate();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const resolveLogPerm = (action) => {
    const logs = permissions?.logs;
    if (!logs) return false;
    if (typeof logs.guardLogs?.[action] === 'boolean') return logs.guardLogs[action];
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
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));

  const handleZoom = (zoomFactor, mouseX, container) => {
    setZoom((prev) => {
      const newZoom = Math.min(Math.max(prev * zoomFactor, 1), 5);
      if (newZoom === prev) return prev;

      const scrollPercent = (container.scrollLeft + mouseX) / container.scrollWidth;
      requestAnimationFrame(() => {
        const newScrollWidth = container.clientWidth * newZoom;
        const newScroll = scrollPercent * newScrollWidth - mouseX;
        document.querySelectorAll('.timeline-sync-scroll').forEach((c) => {
          c.scrollLeft = newScroll;
        });
      });

      return newZoom;
    });
  };

  useEffect(() => {
    if (!canView) return;
    const fetchChannels = async () => {
      setLoading(true);
      try {
        const response = await getGuardChannelGraph(searchQuery, (currentPage - 1) * LIMIT, LIMIT, {
          date: selectedDate,
        });

        const result = response?.data?.body?.data?.result || [];
        const total = response?.data?.body?.data?.totalCount || 0;

        const mappedData = result.map((channel) => ({
          id: channel._id,
          channelId: channel?.incidents?.[0]?.channel?.name || `Channel ${channel._id}`,
          customName: channel?.incidents?.[0]?.channel?.customName || '',
          department: channel?.incidents?.[0]?.channel?.department?.[0]?.departmentName || '-',
          totalPresenceTime: channel?.totalPresenceTime || '0h 0m',
          totalAbsenceTime: channel?.totalAbsenceTime || '0h 0m',
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

  const handleExport = () => {
    const exported = downloadLogsExcel(channels, selectedDate);
    if (!exported) toast.error('No logs available');
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'channelId',
        header: () => <span className="font-medium text-[var(--tx2)]">Channel ID</span>,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap">{row.original.channelId}</span>
            {row.original.customName && (
              <span className="text-[13px] font-medium text-[var(--tx3)]">(Alias Name: {row.original.customName})</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'totalPresenceTime',
        header: () => <span className="font-medium text-[var(--tx2)]">Total Present Time</span>,
        cell: ({ row }) => (
          <span className="text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap">
            {row.original.totalPresenceTime || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'totalAbsenceTime',
        header: () => <span className="font-medium text-[var(--tx2)]">Total Absent Time</span>,
        cell: ({ row }) => (
          <span className="text-[var(--tx2)] text-[13px] font-medium whitespace-nowrap">
            {row.original.totalAbsenceTime || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'segments',
        header: () => <span className="font-medium text-[var(--tx2)]">Visibility Timeline (24 Hours)</span>,
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

  if (permissionsLoading) return null;
  if (!canView) {
    return (
      <AccessDenied
        message="You don't have permission to view Guard Logs."
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
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 h-10 bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white rounded-md text-sm font-medium shadow-sm hover:opacity-95 cursor-pointer transition-opacity"
          >
            <Download className="w-4 h-4" />
            Export Logs
          </button>

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

export default GuardLog;
