import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { AlertTriangle, ArrowLeft, Search, FilterX } from 'lucide-react';
import cctv from '@/assets/lucide_cctv.svg';
import { toast } from 'sonner';
import { RiLink } from 'react-icons/ri';
import Pagination from '@/components/Pagination';
import { getIncidentData } from '../Api/post';
import moment from 'moment';
import { getNvrNames, getCamerasBasedOnNvr } from '../Api/get';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const styles = {
  selectTrigger:
    'w-[90px] xl:w-[100px] 2xl:w-[110px] h-6 xl:h-7 2xl:h-8 bg-[#FAFAFA] border-[#C9C9C9] cursor-pointer',
  text: 'text-[#414141] text-[10px] xl:text-[11px] 2xl:text-xs font-normal',
  selectContent:
    'bg-[#FAFAFA] border-[#C9C9C9] min-w-[90px] xl:min-w-[100px] 2xl:min-w-[110px]',
  selectItem: 'flex items-center gap-2 hover:bg-[#EEEEEE] cursor-pointer',
  statusBadge: (status) =>
    `px-2.5 py-1.5 rounded-[5px]  text-xs font-medium ${
      status === 'Resolved'
        ? 'text-[#07486A] bg-[#E9F1FF]'
        : status === 'In Progress'
          ? 'text-[#F5BE0B] bg-[#FFF8E7]'
          : 'text-[#CE241C] bg-[#FFDBD9]'
    }`,
  severityBadge: (severity) =>
    `px-2.5 py-1.5 rounded-[5px] text-xs font-medium ${
      severity === 'High'
        ? 'text-[#CE241C]  bg-[#FFDBD9]'
        : severity === 'Medium'
          ? 'text-[#EF8000]  bg-[#FFE4C5]'
          : 'text-[#338904]  bg-[#E8FFDB]'
    }`,
  button:
    'bg-[#F0F3FF] cursor-pointer font-medium text-[12px] rounded-lg text-[#0B1A6A] border border-[#DBDBDB]',
};

const TableSkeleton = ({ columns = 4, rows = 6 }) => (
  <table className="min-w-full bg-[#FAFAFA]">
    <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
      <tr className="border-b-2 border-[#FFFFFF]">
        {Array.from({ length: columns }).map((_, idx) => (
          <th
            key={idx}
            className="px-3 xl:px-4 2xl:px-6 py-2 xl:py-2.5 2xl:py-4 text-left text-[10px] xl:text-[11px] 2xl:text-sm font-[500] text-[#333333] tracking-wider"
          >
            <Skeleton width={80} height={18} />
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-3 xl:divide-y-4 divide-[#FFFFFF]">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} className="hover:bg-gray-50">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <td
              key={colIdx}
              className="px-3 xl:px-4 2xl:px-6 py-2 xl:py-3 2xl:py-5 whitespace-nowrap text-[9px] xl:text-[10px] 2xl:text-xs text-[#414141]"
            >
              <Skeleton width={colIdx === 0 ? 100 : 120} height={18} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export default function CameraAlerts() {
  const navigate = useNavigate();
  const [tableData, setTableData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const location = useLocation();
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [nvrList, setNvrList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nvrId, setNvrId] = useState('');
  const [cameraList, setCameraList] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [onLoading, setOnLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setOnLoading(true);
      const today = moment().format('YYYY-MM-DD');
      const data = {
        ActiveChannels: true,
        startDate: today,
        endDate: today,
      };

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
  }, [nvrId, cameraId, searchTerm, skip, limit]);

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
  }, []);

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

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    setSkip((page - 1) * limit);
  };
  // Columns configuration
  const columns = [
    {
      accessorKey: 'CameraName',
      header: 'Camera Name',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original?.customName||row.original?.name||'---'}</span>
      ),
    },
    {
      accessorKey: 'Modal',
      header: 'Model',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original?.model ||'---'}</span>
      ),
    },
    // {
    //   accessorKey: 'SerialNumber',
    //   header: 'Serial Number',
    //   cell: ({ row }) => (
    //     <span className={styles.text}>{row.original?.nvrData?.serialNumber}</span>
    //   ),
    // },
    {
      accessorKey: 'FirmwareVersion',
      header: 'Firmware Version',
      cell: ({ row }) => (
        <span className={styles.text}>
          {row.original?.firmwareVersion||'---'}
        </span>
      ),
    },
    {
      accessorKey: 'ChannelID',
      header: 'Nvr Name',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original?.nvrData?.nvrName}</span>
      ),
    },
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="min-h-screen ">
      {' '}
      <div className="px-1 pb-2 sm:pb-3 xl:pb-3 2xl:pb-4 sticky z-20">
        <button
          onClick={location?.state?.dashboard ? () => navigate('/dashboard') : () => navigate('/incidents')}
          className="flex items-center text-gray-600 hover:text-gray-800 cursor-pointer"
        >
          <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 md:w-12 md:h-12 rounded-full bg-white/30 backdrop-blur-sm border border-white/30 shadow-sm mr-1.5 sm:mr-2">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#333333] group-hover:text-[#07486A] transition-colors" />
          </div>
          <span className="text-[12px] sm:text-[14px] md:text-[18px] font-medium text-[#333333] bg-white backdrop-blur-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg group-hover:text-[#07486A] transition-colors">
           {location?.state?.dashboard ? "Back to Dashboard" : "Back to Incidents"}
          </span>
        </button>
      </div>{' '}
      <div className="w-full overflow-x-auto p-3 md:p-4 xl:p-5 2xl:p-8 space-y-4 xl:space-y-5 2xl:space-y-8 bg-white rounded-[10px]">
        {' '}
        <nav className="space-y-1 md:space-y-2 xl:space-y-2 2xl:space-y-4">
          <div className="text-[10px] md:text-[12px] xl:text-[12px] 2xl:text-[16px] text-[#696969]">
            Dashboard
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <h1 className="text-base md:text-xl xl:text-xl 2xl:text-3xl font-medium text-[#333333]">
              Cameras with Detections
            </h1>
          </div>
        </nav>
        {/* Critical Alerts Info Box */}{' '}
        <div className="flex items-center gap-3 xl:gap-3 2xl:gap-4 mt-3 xl:mt-3 2xl:mt-4">
          <div className="w-9 h-9 xl:w-10 xl:h-10 2xl:w-12 2xl:h-12 rounded-full bg-[#E5EAFF] flex items-center justify-center">
            <img
              src={cctv}
              alt="cctv"
              className="h-5 w-5 xl:h-6 xl:w-6 2xl:h-7 2xl:w-7"
            />
          </div>
          <div>
            <div className="text-lg xl:text-lg 2xl:text-xl font-[700] text-[#333333]">
              {totalCount|| 0}
            </div>
            <div className="text-xs xl:text-xs 2xl:text-sm font-[400] text-[#696969]">
              Currently Active Detections
            </div>
          </div>
        </div>
        {/* Alert Statistics */}
        {/* Alerts Table */}{' '}
        <div className="border-gray-200 rounded-[10px] bg-[#FAFAFA] p-3 md:p-4 xl:p-5 2xl:p-6 space-y-3 xl:space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 xl:gap-4">
            {' '}
            <h2 className="text-[11px] md:text-[14px] xl:text-[14px] 2xl:text-[18px] font-medium text-[#333333] pb-2 xl:pb-3 2xl:pb-4">
              Camera Details
            </h2>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 md:gap-3">
              {/* Search Input */}
              <div className="relative w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full sm:w-auto pl-2.5 sm:pl-3 md:pl-4 pr-8 sm:pr-10 bg-[#FFFFFF] py-1.5 sm:py-2 md:py-2.5 border border-[#C7C7C7] rounded-[6px] sm:rounded-[8px] md:rounded-[10px] text-[11px] sm:text-xs md:text-sm focus:outline-none"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value.toLowerCase());
                  }}
                />
                <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#595959]" />
              </div>

              {/* Select NVR */}
              <Select
                value={nvrId}
                onValueChange={(value) => {
                  setNvrId(value);
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px] cursor-pointer md:w-[180px] h-[32px] sm:h-[36px] md:h-[40px] text-[#595959] font-[400] text-[11px] sm:text-xs border border-[#C7C7C7]">
                  <SelectValue placeholder="Select NVR" />
                </SelectTrigger>
                <SelectContent className="border border-[#C7C7C7] bg-white text-[11px] sm:text-xs">
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
                }}
              >
                <SelectTrigger className="w-full cursor-pointer sm:w-[160px] md:w-[180px] h-[32px] sm:h-[36px] md:h-[40px] font-[400] text-[11px] sm:text-xs border border-[#C7C7C7] text-[#595959]">
                  <SelectValue placeholder="Select Camera" />
                </SelectTrigger>
                <SelectContent className="border max-h-64 border-[#C7C7C7] bg-white text-[11px] sm:text-xs">
                  {loading && cameraList.length === 0 ? (
                    <SelectItem className="text-gray-500">
                      Loading...
                    </SelectItem>
                  ) : (
                    cameraList.map((camera) => (
                      <SelectItem
                        key={camera._id}
                        value={camera._id}
                        className={styles.selectItem}
                      >
                        {camera.customName || camera.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <button
                className="text-white cursor-pointer h-[32px] sm:h-[36px] md:h-[40px] px-2 sm:px-3 md:px-3.5 text-[11px] sm:text-xs md:text-sm font-medium border-2 border-[#07486a] bg-[#07486A] hover:bg-[#07486A]/90 rounded-[6px] sm:rounded-[8px] md:rounded-[10px] shadow-sm transition-all duration-150 flex items-center justify-center"
                onClick={() => {
                  setCameraId(''), setNvrId(''), setSearchTerm('');
                }}
                title="Clear Filters"
              >
                <FilterX className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            {onLoading ? (
              <TableSkeleton columns={columns.length} rows={6} />
            ) : (
              <table className="min-w-full bg-[#FAFAFA]">
                <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
                  <tr className="border-b-2 border-[#FFFFFF]">
                    {table.getAllColumns().map((column) => (
                      <th
                        key={column.id}
                        className="px-3 xl:px-4 2xl:px-6 py-2 xl:py-2.5 2xl:py-4 text-left text-[10px] xl:text-[11px] 2xl:text-sm font-[500] text-[#333333] tracking-wider"
                      >
                        {column.columnDef.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-3 xl:divide-y-4 divide-[#FFFFFF]">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 xl:px-4 2xl:px-6 py-2 xl:py-3 2xl:py-5 whitespace-nowrap text-[9px] xl:text-[10px] 2xl:text-xs text-[#414141]"
                        >
                          {cell.column.columnDef.cell({ row })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {table.getRowModel().rows.length === 0 && !onLoading ? (
            <div className="text-center py-4 text-gray-500">No data found</div>
          ) : null}
        </div>
        {/* Pagination */}{' '}
        <div className="mt-4 xl:mt-5 2xl:mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </div>
  );
}
