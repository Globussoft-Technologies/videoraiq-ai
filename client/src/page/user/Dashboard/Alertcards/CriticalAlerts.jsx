import React, { useState, useEffect, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useDebounce from '@/hooks/useDebounce';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowLeft,
  Search,
  Bell,
  Camera,
  CheckCircle,
  FilterX,
} from 'lucide-react';
import { toast } from 'sonner';
import { RiLink } from 'react-icons/ri';
import Pagination from '@/components/Pagination';
import VideoModal from '@/components/VideoModal';
import Incidentspng from '@/assets/Incidentspng.svg';
import lucide_cctv from '@/assets/lucide_cctv.svg';
import alerts from '@/assets/alerts.svg';
import { getIncidentData } from '../Api/post';
import moment from 'moment';
import { getNvrNames, getCamerasBasedOnNvr } from '../Api/get';
import { load } from '@amcharts/amcharts5/.internal/core/util/Net';
import { set } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { formatFromToTimestamps } from '@/utils/UtcConverter';
import { markAlertResolved } from '../../Dashboard/Api/put';
import ReportIncidentModal from '../../Incidents/components/ReportIncidentModal';
import { usePermissions } from '@/context/Permission/PermissionContext';
const styles = {
  selectTrigger: 'w-[110px] h-8 bg-[#FAFAFA] border-[#C9C9C9] cursor-pointer',
  text: 'text-[#414141] text-xs font-normal',
  selectContent: 'bg-[#FAFAFA] max-h-64 border-[#C9C9C9] min-w-[110px]',
  selectItem: 'flex items-center gap-2 hover:bg-[#EEEEEE] cursor-pointer',
  statusBadge: (status) =>
    `px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-[4px] sm:rounded-[5px] text-[10px] sm:text-xs font-medium ${
      status === true
        ? 'text-[#338904]  bg-[#E8FFDB]'
        : status === false
          ? 'text-[#CE241C] bg-[#FFDBD9]'
          : 'text-[#F5BE0B] bg-[#FFF8E7]'
    }`,
  severityBadge: (severity) =>
    `px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-[4px] sm:rounded-[5px] text-[10px] sm:text-xs font-medium ${
      severity === 'High'
        ? 'text-[#CE241C]  bg-[#FFDBD9]'
        : severity === 'Moderate'
          ? 'text-[#EF8000]  bg-[#FFE4C5]'
          : 'text-[#338904]  bg-[#E8FFDB]'
    }`,
  button:
    'bg-[#F0F3FF] cursor-pointer font-medium text-[12px] rounded-lg text-[#0B1A6A] border border-[#DBDBDB]',
};

function CriticalAlerts() {
  const navigate = useNavigate();
  const [tableData, setTableData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [incidentType, setIncidentType] = useState('');
  const location = useLocation();
  const [nvrList, setNvrList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nvrId, setNvrId] = useState('');
  const [cameraList, setCameraList] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Use the debounce hook
  const debouncedSearchTerm = useDebounce(searchInput, 500);
  const [onLoading, setOnLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [start, setStart] = useState();
  const [end, setEnd] = useState();
  const state = location.state || {};
  const { date, incident } = state;
  const userDetails = useAuth();
  const [firstIncidentCreatedDate, setFirstIncidentCreatedDate] = useState(
    userDetails?.user?.firstIncidentCreatedDate
  );
  const [resolved, setResolved] = useState(false);
  const { permissions } = usePermissions();
  const canEdit = permissions?.incidents?.edit;
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingIncidentId, setReportingIncidentId] = useState(null);
  const [manualTrigger, setManualTrigger] = useState(0);
  // Update searchTerm when debounced value changes
  useEffect(() => {
    setSearchTerm(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  const INCIDENT_TYPE_MAP = {
    '/critical-incidents': 'Critical Incidents',
    '/total-incidents': 'Total Incidents',
    '/incidents-resolved': 'Incidents Resolved',
  };

  const API_TYPE_MAP = {
    'Critical Incidents': 'criticalIncidents',
    'Total Incidents': 'totalIncidents',
    'Incidents Resolved': 'resolvedIncidents',
  };

  useEffect(() => {
    const currentType =
      INCIDENT_TYPE_MAP[location.pathname] || 'Incidents Resolved';
    setIncidentType(currentType);
  }, [location.pathname]);

  // useEffect(() => {
  //   if (date?.start && date?.end) {
  //     const startDate = moment(date.start).startOf('day').format('YYYY-MM-DD');
  //     const endDate = moment(date.end).endOf('day').format('YYYY-MM-DD');
  //     setStart(startDate);
  //     setEnd(endDate);
  //   } else {
  //     const today = moment().format('YYYY-MM-DD');
  //     const incidentDate = firstIncidentCreatedDate
  //       ? firstIncidentCreatedDate.slice(0, 10)
  //       : moment().format('YYYY-MM-DD');

  //     setStart(incidentDate);
  //     setEnd(today);
  //   }
  // }, [date]);
  useEffect(() => {
  if (date?.start && date?.end) {
    const startDate = moment(date.start)
      .startOf('day')
      .format('YYYY-MM-DD');

    const endDate = moment(date.end)
      .endOf('day')
      .format('YYYY-MM-DD');

    setStart(startDate);
    setEnd(endDate);
  } else {
    const DEFAULT_START_DATE = '2025-01-01';
    const today = moment().format('YYYY-MM-DD');

    setStart(DEFAULT_START_DATE);
    setEnd(today);
  }
}, [date]);

  useEffect(() => {
    setSkip(0)
    setCurrentPage(1)
    console.log('nvrId changed, reset skip to 0')
  }, [nvrId])


  useEffect(() => {
    if (!incidentType || !start || !end) return;

    const fetchData = async () => {
      setOnLoading(true);
      let data;

      if (incident) {
        data = {
          [API_TYPE_MAP[incidentType]]: true,
          startDate: start,
          endDate: end,
        };
      } else {
        const today = moment().format('YYYY-MM-DD');
        data = {
          [API_TYPE_MAP[incidentType]]: true,
          startDate: today,
          endDate: today,
        };
      }

      try {
        const result = await getIncidentData(
          data,
          nvrId,
          cameraId,
          searchTerm,
          skip,
          limit
        );
        if (result.statusCode === 200) {
          setTableData(result?.body?.data?.data || []);
          setTotalPages(Math.ceil(result?.body?.data?.totalCount / limit));
          setTotalCount(result?.body?.data?.totalCount || 0);
        } else {
          toast.error('Failed to fetch incident data');
        }
      } catch (error) {
        console.error('Error fetching incident data:', error);
      } finally {
        setOnLoading(false);
      }
    };

    fetchData();
  }, [
    incidentType,
    nvrId,
    cameraId,
    searchTerm,
    skip,
    limit,
    incident,
    start,
    end,
    manualTrigger,
  ]);

  //  getting NVR names for select options
  useEffect(() => {
    const fetchNvrNames = async () => {
      setLoading(true);
      try {
        const response = await getNvrNames();
        if (response.statusCode === 200) {
          const nvrs = response.body.data.nvrs;
          setNvrList(nvrs);
        } else {
          console.log('No NVRs found');
        }
      } catch (error) {
        console.error('Error fetching NVR names:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNvrNames();
  }, [incidentType]);

  // getting cameras based on NVR selection
  useEffect(() => {
    const fetchCameras = async () => {
      if (!nvrId) return;

      setLoading(true);
      try {
        const response = await getCamerasBasedOnNvr(nvrId);
        if (response.statusCode === 200) {
          setCameraList(response?.body?.data?.channels || []);
        } else {
          console.log('No cameras found');
        }
      } catch (error) {
        console.error('Error fetching cameras:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, [nvrId]);

  const handleMarkResolved = async (id, incidentType, newResolved) => {
    const data = {
      resolved: newResolved,
      incidentType,
    };
    const result = await markAlertResolved(id, data);
    if (result?.status === 'success') {
      setResolved(newResolved);
      toast.success(result?.message || '');
    } else {
      toast.error(result?.message || 'Something went wrong');
    }
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    setSkip((page - 1) * limit);
  };
  const handleOpenModal = (camera) => {
    // Create a video data object for VideoModal
    const videoData = {
      id: camera._id,
      title: camera.incidentName || 'Camera View',
      timestamp: camera.timeOfIncident || new Date().toLocaleString(),
      videoSrc: camera.videoLink || '',
      thumbnailSrc: camera.Image || '',
      peopleDetected: camera.peopleDetected || 0,
      suspiciousActivity: camera.suspiciousActivity || 'None',
      phoneUsage: camera.phoneUsage || 0,
      emotion: camera.emotion || 'Neutral',
      resolved: camera.resolved || false,
    };
    setSelectedCamera(videoData);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCamera(null);
  };

  const handleReportIncident = (incidentId) => {
    setReportingIncidentId(incidentId);
    setReportModalOpen(true);
  };

  // Columns configuration
  const columns = [
    {
      accessorKey: 'timeOfIncident',
      header: 'Time',
      cell: ({ row }) => {
        const utcTime = row.original.timeOfIncident;
        const formatted = moment.utc(utcTime).format('YYYY-MM-DD HH:mm:ss'); // or any format you prefer
        return <span className={styles.text}>{formatted}</span>;
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const desc = row.original.description;
        const result = formatFromToTimestamps(desc);

        return <span className={styles.text}>{result}</span>;
      },
    },
    {
      accessorKey: 'incidentType',
      header: 'Incident Type',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original.incidentType}</span>
      ),
    },

    {
      accessorKey: 'cameraName',
      header: 'Camera Name',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original?.channelData?.name}</span>
      ),
    },
    {
      accessorKey: 'nvrName',
      header: 'NVR Name',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original?.nvrData?.nvrName}</span>
      ),
    },
    {
      accessorKey: 'zone',
      header: 'Zone',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original.zone}</span>
      ),
    },
    {
      accessorKey: 'severity',
      header: 'Severity',
      cell: ({ row }) => (
        <span
          className={styles.severityBadge(
            row?.original?.severity?.charAt(0).toUpperCase() +
              row?.original?.severity?.slice(1).toLowerCase()
          )}
        >
          {row.original.severity?.charAt(0).toUpperCase() +
            row.original.severity?.slice(1).toLowerCase() || ''}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={styles.statusBadge(row.original?.resolved)}>
          {row.original?.resolved ? 'Resolved' : 'Not Resolved'}
        </span>
      ),
    },
    {
      accessorKey: 'actions',
      header: 'Image',
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-1">
            <RiLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#07486A]" />
            <button
              onClick={() => handleOpenModal(row.original)}
              className="inline-flex items-center underline text-[#07486A] hover:text-[#071A4A] text-[11px] sm:text-sm cursor-pointer"
            >
              Link
            </button>
            <Select
              value={
                row.original.status
                  ? row.original.status.toLowerCase().replace(/ /g, '-')
                  : ''
              }
              onValueChange={(value) => {
                const newData = [...tableData];
                newData[row.index] = {
                  ...newData[row.index],
                  status: value
                    .split('-')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' '),
                };
                setTableData(newData);
                toast.success('Status updated successfully');
              }}
            >
              <SelectContent className={styles.selectContent}>
                <SelectItem value="not-resolved" className={styles.selectItem}>
                  <span className="w-2 h-2 rounded-full bg-[#CE241C] mr-1" />
                  Not Resolved
                </SelectItem>
                <SelectItem value="in-progress" className={styles.selectItem}>
                  <span className="w-2 h-2 rounded-full bg-[#F5BE0B] mr-1" />
                  In Progress
                </SelectItem>
                <SelectItem value="resolved" className={styles.selectItem}>
                  <span className="w-2 h-2 rounded-full bg-[#4dab1a] mr-1" />
                  Resolved
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
  ];

  const IncidentTable = memo(({ data, columns, loading }) => {
    const table = useReactTable({
      data,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    if (loading) {
      return (
        <table className="min-w-full bg-[#FAFAFA]">
          <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
            <tr className="border-b-2 border-[#FFFFFF]">
              {table.getAllColumns().map((column) => (
                <th
                  key={column.id}
                  className="px-6 py-4 text-left text-sm font-[500] text-[#333333] tracking-wider"
                >
                  <Skeleton width={80} height={18} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-4 divide-[#FFFFFF]">
            {Array(10)
              .fill(0)
              .map((_, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {table.getAllColumns().map((column, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-6 py-5 whitespace-nowrap text-sm text-[#414141]"
                    >
                      <Skeleton width={colIdx === 0 ? 100 : 120} height={18} />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="min-w-full bg-[#FAFAFA]">
        <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
          <tr className="border-b-2 border-[#FFFFFF]">
            {table.getAllColumns().map((column) => (
              <th
                key={column.id}
                className="px-6 py-4 text-left text-sm font-[500] text-[#333333] tracking-wider"
              >
                {column.columnDef.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-4 divide-[#FFFFFF]">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-6 py-5 whitespace-nowrap text-sm text-[#414141]"
                >
                  {cell.column.columnDef.cell({ row })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  });

  const renderIncidentIcon = () => {
    if (incidentType === 'Critical Incidents') {
      return (
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FFD7D7] flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-[#C20000]" />
        </div>
      );
    } else if (incidentType === 'Total Incidents') {
      return (
        <div className="w-[26px] sm:w-[30px] xl:w-[34px] 2xl:w-[43px] h-[26px] sm:h-[30px] xl:h-[34px] 2xl:h-[43px] bg-[#fff3c3] rounded-full flex justify-center items-center mr-1.5 sm:mr-2">
          <img src={alerts} alt="" className="h-3.5 sm:h-4 xl:h-5 2xl:h-6" />
        </div>
      );
    } else {
      return (
        <div className="w-[30px] xl:w-[34px] 2xl:w-[43px] h-[30px] xl:h-[34px] 2xl:h-[43px] bg-[#e8fec9] rounded-full flex justify-center items-center mr-2">
          <img src={Incidentspng} alt="" className="h-4 xl:h-5 2xl:h-6" />
        </div>
      );
    }
  };
  return (
    <div className="min-h-screen ">
      {' '}
      <div className="px-1 pb-2 sm:pb-3 xl:pb-3 2xl:pb-4 sticky z-20">
        <button
          onClick={() =>
            incident ? navigate('/incidents') : navigate('/dashboard')
          }
          className="flex items-center text-gray-600 hover:text-gray-800 cursor-pointer"
        >
          <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 md:w-12 md:h-12 rounded-full bg-white/30 backdrop-blur-sm border border-white/30 shadow-sm mr-1.5 sm:mr-2">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#333333] group-hover:text-[#07486A] transition-colors" />
          </div>
          <span className="text-[12px] sm:text-[14px] md:text-[18px] font-medium text-[#333333] bg-white backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg group-hover:text-[#07486A] transition-colors">
            {incident ? 'Back to Incidents' : 'Back to Dashboard'}
          </span>
        </button>
      </div>
      <div className="w-full overflow-x-auto p-3 sm:p-4 md:p-8 space-y-5 md:space-y-7 xl:space-y-8 bg-white rounded-[8px] md:rounded-[10px]">
        {' '}
        <nav className="space-y-1.5 sm:space-y-2 md:space-y-4">
          <div className="text-[11px] sm:text-[12px] md:text-[16px] text-[#696969]">
            {incident ? 'Incidents' : 'Dashboard'}
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <h1 className="text-xl md:text-3xl font-medium text-[#333333]">
              {incidentType || ''}
            </h1>
          </div>
        </nav>
        {/* Critical Alerts Info Box */}
        <div className="flex items-center gap-4 mt-4">
          {renderIncidentIcon()}
          <div>
            <div className="text-xl font-[700] text-[#333333]">
              {totalCount || 0}
            </div>
            <div className="text-sm font-[400] text-[#696969]">
              {incidentType === 'Critical Incidents'
                ? 'Immediate attention needed'
                : incidentType === 'Total Incidents'
                  ? 'Alerts Notified'
                  : 'Acknowledged or closed alerts'}
            </div>
          </div>
        </div>
        {/* Alert Statistics */}
        {/* Alerts Table */}
        <div className="border-gray-200 rounded-[8px] sm:rounded-[10px] bg-[#FAFAFA] p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <h2 className="text-[12px] sm:text-[14px] md:text-[18px] font-medium text-[#333333] pb-3 sm:pb-4">
              {incidentType} List
            </h2>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 md:gap-3">
              {/* Search Input */}
              <div className="relative w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full sm:w-auto pl-2.5 sm:pl-3 md:pl-4 pr-8 sm:pr-10 bg-[#FFFFFF] py-1.5 sm:py-2 md:py-2.5 border border-[#C7C7C7] rounded-[6px] sm:rounded-[8px] md:rounded-[10px] text-[11px] sm:text-xs md:text-sm focus:outline-none"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value.toLowerCase());
                  }}
                  disabled={loading}
                />
                <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#595959]" />
              </div>

              {/* Select NVR */}
              <Select
                value={nvrId}
                onValueChange={(value) => {
                  setNvrId(value);
                   setCurrentPage(1);
                    setSkip(0);
                    setCameraId(''); // Reset camera selection when NVR changes
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px] cursor-pointer md:w-[180px] h-[32px] sm:h-[36px] md:h-[40px] text-[#595959] font-[400] text-[11px] sm:text-xs border border-[#C7C7C7]">
                  <SelectValue
                    placeholder="Select NVR"
                    className="select-none"
                  />
                </SelectTrigger>
                <SelectContent className="border max-h-64 border-[#C7C7C7] bg-white">
                  {loading && nvrList.length === 0 ? (
                    <SelectItem className="text-gray-500">
                      Loading...
                    </SelectItem>
                  ) : (
                    nvrList.map((nvr) => (
                      <SelectItem
                        key={nvr._id}
                        value={nvr._id}
                        className={styles.selectItem}
                      >
                        {nvr.nvrName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Select Camera */}
              <Select
                value={cameraId}
                disabled={!nvrId}
                onValueChange={(value) => {
                  setCameraId(value);
                  setSkip(0);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px] md:w-[180px] h-[32px] sm:h-[36px] md:h-[40px] font-[400] text-[11px] sm:text-xs border border-[#C7C7C7] text-[#595959]">
                  <SelectValue placeholder="Select Camera" />
                </SelectTrigger>
                <SelectContent className="border max-h-64 border-[#C7C7C7] bg-white">
                  {loading && cameraList.length === 0 ? (
                    <SelectItem>Loading...</SelectItem>
                  ) : (
                    cameraList.map((camera) => (
                      <SelectItem
                        key={camera._id}
                        value={camera._id}
                        className={styles.selectItem}
                      >
                        {camera.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <button
                className="text-white cursor-pointer h-[32px] sm:h-[36px] md:h-[40px] px-2 sm:px-3 md:px-3.5 text-[11px] sm:text-xs md:text-sm font-medium border-2 border-[#07486a] bg-[#07486A] hover:bg-[#07486A]/90 rounded-[6px] sm:rounded-[8px] md:rounded-[10px] shadow-sm transition-all duration-150 flex items-center justify-center"
                onClick={() => {
                  setCameraId(''),
                    setNvrId(''),
                    setSearchTerm(''),
                    setSearchInput('');
                }}
                title="Clear Filters"
              >
                <FilterX className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <IncidentTable
              data={tableData}
              columns={columns}
              loading={onLoading}
            />
          </div>
          {tableData.length === 0 && !onLoading ? (
            <div className="text-center py-4 text-gray-500">No data found</div>
          ) : null}
        </div>
        {/* Pagination */}
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />{' '}
        </div>
      </div>
      {/* Video Modal */}
      {selectedCamera && (
        <VideoModal
          isOpen={isModalOpen}
          onClose={closeModal}
          videoData={selectedCamera}
          totalIncidents={true}
          resolved={selectedCamera?.resolved}
          onMarkResolved={async (newResolved) => {
            if (!selectedCamera) return;
            await handleMarkResolved(
              selectedCamera.id,
              selectedCamera.incidentType,
              newResolved
            );
            setSelectedCamera((prev) =>
              prev ? { ...prev, resolved: newResolved } : prev
            );
          }}
          onReport={() => {
            if (selectedCamera) {
              handleReportIncident(selectedCamera.id);
            }
          }}
          canEdit={canEdit}
        />
      )}
      {/* Report Incident Modal */}
      <ReportIncidentModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportingIncidentId(null);
        }}
        incidentId={reportingIncidentId}
        incidentData={tableData.find(
          (incident) => incident._id === reportingIncidentId
        )}
        onSuccess={() => {
          setManualTrigger((prev) => prev + 1);
        }}
      />
    </div>
  );
}

export default memo(CriticalAlerts);
