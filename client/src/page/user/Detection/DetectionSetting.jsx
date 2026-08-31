  import React, { useState, useMemo, useEffect } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { Cctv, ChevronDown, RotateCcw } from 'lucide-react';
  import { Input } from '@/components/ui/input';
  import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
  import Skeleton from 'react-loading-skeleton';
  import 'react-loading-skeleton/dist/skeleton.css';
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
  import { FiEdit3 } from "react-icons/fi";
  import { getChannelsWithDetections, getAllNVRs, getAllDetectionTypes } from './Api/get';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import Monitorcog from '@/components/ui/Monitorcog';
  import { TbHexagonPlus } from 'react-icons/tb';
  import Pagination from '@/components/Pagination';
  import { updateCameraSettingById } from '../Streams/Api/patch';
  import { Switch } from '@/components/ui/switch';
  import { toast } from 'sonner';
  import { usePermissions } from '@/context/Permission/PermissionContext';
  import AccessDenied from '@/components/AccessDenied';
  import PageLoader from '@/components/PageLoader';
  import { Popover, PopoverTrigger,PopoverContent } from '@/components/ui/popover';
  import { enableDetectionSettings } from './Api/put';

  function ProfilesTable({ data, columns, loading, onRowClick, detectionSettings }) {
    const table = useReactTable({
      data,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    return (
      <table className="min-w-full bg-[#FAFAFA]">
        <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
          <tr className="border-b-2 border-[#FFFFFF]">
            {table.getAllColumns().map((column) => (
              <th
                key={column.id}
                className="px-6 py-4 text-left text-sm font-[600] text-[#333333] tracking-wider"
              >
                {typeof column.columnDef.header === 'function'
                  ? column.columnDef.header()
                  : column.columnDef.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-4 divide-[#FFFFFF]">
          {/* 👉 Loading State */}
          {loading && (
            <>
              {Array(7)
                .fill(0)
                .map((_, idx) => (
                  <tr key={idx}>
                    {table.getAllColumns().map((col, colIdx) => (
                      <td key={colIdx} className="px-6 py-5">
                        <Skeleton width={colIdx === 0 ? 40 : 120} height={18} />
                      </td>
                    ))}
                  </tr>
                ))}
            </>
          )}

          {/* 👉 No data in detectionSettings */}
          {!loading && (!detectionSettings || detectionSettings.length === 0) && (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-8 text-gray-500 font-medium"
              >
                No Detections found
              </td>
            </tr>
          )}

          {/* 👉 Normal Data Rows */}
          {!loading &&
            detectionSettings?.length > 0 &&
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onRowClick && onRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-6 py-3 whitespace-nowrap text-sm text-[#414141]"
                    onClick={(e) => {
                      if (
                        cell.column.id === 'select' ||
                        cell.column.id === 'actions' ||
                        cell.column.id === 'enabled' ||
                        cell.column.id === 'cameraType'
                      ) {
                        e.stopPropagation();
                      }
                    }}
                  >
                    {typeof cell.column.columnDef.cell === 'function'
                      ? cell.column.columnDef.cell(cell)
                      : cell.renderValue()}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    );
  }

  const DetectionSettings = () => { 
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canView = permissions?.detectionSettings?.view;
    const canCreate = permissions?.detectionSettings?.create;
    const canEdit = permissions?.detectionSettings?.edit;
    // console.log("permissions",  permissions);
    if (permissionsLoading) return <PageLoader />;
    if (!canView) {
      return (
        <AccessDenied message="You don't have permission to view Detections." />
      );
    }
    const [detectionSettings, setDetectionSettings] = useState([]);
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [limit] = useState(8);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [nvrs, setNvrs] = useState([]);
    const [selectedNvr, setSelectedNvr] = useState(null);
    const [cameraTypes, setCameraTypes] = useState({});
    const [isCameraSettingLoading, setIsCameraSettingLoading] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const navigate = useNavigate();
    const [openDetectionModal, setOpenDetectionModal] = useState(false);
    const [activeRow, setActiveRow] = useState(null);
    const [activeDetectionType, setActiveDetectionType] = useState(null);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isDetectionActionLoading, setIsDetectionActionLoading] = useState(false);


    const fetchData = async (nvrId, search) => {
      setLoading(true);
      try {
        const skip = (currentPage - 1) * limit;

        const res = await getChannelsWithDetections(nvrId, search, skip, limit);

        const channels = res?.data?.body?.data?.channels || [];
        const total = res?.data?.body?.data?.total;
        setTotalCount(total);
        const mapped = channels.map((ch) => ({
          detectionSetting: ch.detections || null,
          appliedProfile: ch.profile || null,
          linkedCameras: [
            {
              _id: ch._id,
              cameraType: ch.checkType,
              name: ch?.customName || ch.name,
              nvrId: {
                _id: ch.nvrId,
                nvrName: ch.nvrId.nvrName || '',
                ip: ch.nvr?.ip || ch.ipAddress,
                model: ch.nvr?.model || ch.model,
              },
              channelId: ch.channelId,
            },
          ],
        }));
        setDetectionSettings(mapped);
      } catch (err) {
        console.error('Failed to fetch detection settings:', err);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      getChannelsWithDetections('', '');
    }, []);

    // Listen for external refetch requests (e.g., when an inner setting resets a channel)
    useEffect(() => {
      const handler = (event) => {
        try {
          const nvrIdFromEvent = event?.detail?.nvrId;
          const nvrToFetch = nvrIdFromEvent ?? selectedNvr?._id ?? '';
          fetchData(nvrToFetch, searchInput);
        } catch (err) {
          console.error('Refetch handler error:', err);
        }
      };

      window.addEventListener('detectionSettingsRefetch', handler);
      return () =>
        window.removeEventListener('detectionSettingsRefetch', handler);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNvr?._id, searchInput, currentPage, limit]);

    const fetchNvrs = async () => {
      try {
        const res = await getAllNVRs();
        const nvrsList = res?.data?.body?.data?.nvrs || [];
        setNvrs(nvrsList);
        if (nvrsList.length > 0) {
          setSelectedNvr(nvrsList[0]);
        }
      } catch (err) {
        console.error('Failed to fetch NVRs:', err);
      }
    };

    useEffect(() => {
      fetchNvrs();
    }, []);

    useEffect(() => {
      if (selectedNvr?._id) {
        fetchData(selectedNvr._id, searchInput);
      }
    }, [selectedNvr?._id, searchInput, currentPage, limit]);

    const detectionData = detectionSettings.map((item, originalIndex) => ({
      id: item.detectionSetting?._id,
      name: item.linkedCameras.map((cam) => cam.name).join(', ') || 'N/A',
      nvr:
        item.linkedCameras
          .map((cam) => cam.nvrId)
          .map((nvr) => nvr?.nvrName)
          .join(', ') || 'N/A',
      ip: item.linkedCameras.map((cam) => cam.nvrId?.ip).join(', ') || 'N/A',
      status: 'Online', // Add status field
      model:
        item.linkedCameras.map((cam) => cam.nvrId?.model).join(', ') || 'N/A',
      originalChannelData: item,
      applied: (() => {
        const det = item.detectionSetting || {};
        const names = [];
        const detectionKeys = Object.keys(det || {});
        const prettify = (key) => {
          return key
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .replace(/Settings?$/i, ' Settings')
            .replace(/^./, (s) => s.toUpperCase());
        };
        detectionKeys.forEach((key) => {
          const val = det[key];
          if (val) {
            const name = val?.id?.name || val?.id?.settingType || prettify(key);
            names.push(name);
          }
        });
        return names.length ? names : ['N/A'];
      })(),
      appliedProfiles: (() => {
        const ap = item.appliedProfile;

        if (ap) {
          if (Array.isArray(ap)) {
            return ap
              .map((p) => p?.basics?.profileName || p?.name || String(p))
              .filter(Boolean);
          }
          if (typeof ap === 'object') {
            return [ap?.basics?.profileName || ap.name || String(ap)].filter(
              Boolean
            );
          }
          return [String(ap)];
        }

        return ['N/A'];
      })(),
      enabled: item.detectionSetting?.enabled ?? false,
      originalIndex, // Add original index for stable row IDs
    }));

    // Pagination logic
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    // const startIndex = (currentPage - 1) * limit;
    // const endIndex = startIndex + limit;
    // const paginatedData = detectionData.slice(startIndex, endIndex);
    const paginatedData = detectionData;
    // Ensure stable id for rows: fallback to linked camera id if detection id missing
    const paginatedDataWithIds = paginatedData.map((d) => ({
      ...d,
      __rowId: d.id || `${d.name}-${d.originalIndex}`,
    }));

    const handlePageChange = (page) => {
      if (page < 1 || page > totalPages) return;
      setCurrentPage(page);
    };

      const [detectionTypes, setDetectionTypes] = useState([]);
    const [selectedType, setSelectedType] = useState('');
    const fetchDetectionTypes = async () => {
      try {
        const res = await getAllDetectionTypes();
        const typesObj = res?.data?.body?.data?.detectionTypes || {};
        // Convert object to array of { key, label }
        const typesArr = Object.entries(typesObj).map(([key, label]) => ({
          key,
          label,
        }));
        setDetectionTypes(typesArr);
      } catch (err) {
        setDetectionTypes([]);
      }
    };
    useEffect(() => {
      fetchDetectionTypes();
    }, []);


  const handleEnableDetectionType = async (rowData, typeKey, enable) => {
    try {
      setIsDetectionActionLoading(true);

      const data = {
        channelId: rowData?.originalChannelData?.linkedCameras[0]?._id,
        detectionType: typeKey,
        enable: enable,
      };

     const response = await enableDetectionSettings(data);

      await fetchData(selectedNvr._id, searchInput);
        if(response?.data?.statusCode == 200){
          toast.success(response?.data?.body?.message)
        }
        else{
           toast.error(response?.data?.body?.message)
        }
       
    } catch (err) {
      // A 400/4xx makes axios throw, so the API's message lives on err.response
      // (not the response variable above). Surface it; fall back to a generic one.
      const apiMessage = err?.response?.data?.body?.message;
      toast.error(apiMessage || 'Failed to update detection status');
      console.error(err);
    } finally {
      setIsDetectionActionLoading(false);
    }
  };


  const isDetectionEnabled = (row, typeKey) => {
    const settings = row?.originalChannelData?.detectionSetting || {};

    // Convert "crowdDetection" → "crowdDetectionSettings"
    const settingsKey = `${typeKey}`;

    return settings?.[settingsKey]?.enabled ;
  };

  const [openPopoverRow, setOpenPopoverRow] = useState(null);



    const columns = useMemo(
      () => [
        // {
        //   accessorKey: 'select',
        //   header: () => (
        //     // Header checkbox — toggles select all on current page
        //     <Checkbox
        //       aria-label="select all"
        //       className="border-[#07486A] data-[state=checked]:bg-[#07486A] cursor-pointer data-[state=checked]:text-white"
        //       checked={paginatedDataWithIds.every((r) => selectedIds.has(r.__rowId)) && paginatedDataWithIds.length > 0}
        //       onCheckedChange={(val) => {
        //         const newSet = new Set(selectedIds);
        //         if (val) {
        //           paginatedDataWithIds.forEach((r) => newSet.add(r.__rowId));
        //         } else {
        //           paginatedDataWithIds.forEach((r) => newSet.delete(r.__rowId));
        //         }
        //         setSelectedIds(newSet);
        //       }}
        //     />
        //   ),
        //   cell: ({ row: r }) => (
        //     <Checkbox
        //       aria-label={`select-${r.original.id}`}
        //       className="border-[#07486A] data-[state=checked]:bg-[#07486A] cursor-pointer data-[state=checked]:text-white"
        //       checked={selectedIds.has(r.original.__rowId || r.original.id)}
        //       onCheckedChange={(val) => {
        //         const newSet = new Set(selectedIds);
        //         const id = r.original.__rowId || r.original.id;
        //         if (val) newSet.add(id);
        //         else newSet.delete(id);
        //         setSelectedIds(newSet);
        //       }}
        //     />
        //   ),
        // },
        {
          accessorKey: 'name',
          header: 'Camera Name',
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <Cctv className="w-6 h-6 text-[#333333] mb-2" strokeWidth={1} />
              <div>
                <div className="text-sm font-[400] text-[#333333]">
                  {row.original.name}
                </div>
                <div className="text-[10px] text-[#878787] mt-1">
                  {row.original.ip}
                </div>
              </div>
              {row.original.profile !== 'N/A' && (
                <div className="mb-4">
                  <Monitorcog className="w-5 h-5" />
                </div>
              )}
            </div>
          ),
        },
        // { accessorKey: 'nvr', header: 'NVR' },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: ({ row: r }) => (
            <div className="flex items-center">
              <span
                className={`px-3 py-1 rounded-[5px] text-xs ${r.original.status === 'Online' ? 'bg-[#E8FFDB] text-[#338904]' : 'bg-[#E6E6E6] text-[#928787]'}`}
              >
                {r.original.status}
              </span>
            </div>
          ),
        },
        {
          accessorKey: 'enabled',
          header: 'Enable Detection',
          cell: ({ row }) => {
            const detections = detectionTypes
            return (
              <Popover 
              open={openPopoverRow === row.id}
    onOpenChange={(open) => {
      setOpenPopoverRow(open ? row.id : null);
    }}>
                <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <div className="w-32 h-8 cursor-pointer text-xs border border-[#D8D8D8] bg-[#F2F2F2] rounded-[8px] flex items-center justify-between px-2 text-[#333] hover:bg-gray-100 transition-colors">
                    <span className="font-[400]">Applied Types</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#878787]" />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-[#F2F2F2] border border-[#D8D8D8] shadow-lg rounded-[8px] mt-1">
                  <div className="space-y-4">
                    <div className="text-[10px] font-semibold text-[#878787] uppercase tracking-wider border-b border-[#D8D8D8] pb-2">
                      Detection Types
                    </div>
                    <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                      {detections.map((det) => {
                        const enabled = isDetectionEnabled(row.original, det.key);

                        return (
                          <div
                            key={det.key}
                            className="flex items-center justify-between group"
                          >
                            <span className="text-xs text-[#333] font-[400] group-hover:text-[#07486A] transition-colors">
                              {det.label}
                            </span>

                            <Switch
                              disabled={!canEdit}
                              className="scale-90 data-[state=checked]:bg-[#07486A]"
                              checked={enabled}
                              onCheckedChange={() => {
                                // close popover
                                setOpenPopoverRow(null);

                                // set modal context FROM API STATE
                                setActiveRow(row.original);
                                setActiveDetectionType(det.key);
                                setIsEnabled(enabled); // decides Start vs Stop
                                setOpenDetectionModal(true);
                              }}
                            />
                          </div>
                        );
                      })}

                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            );
          },
        },
        // { accessorKey: 'model', header: 'Model' },
        // { accessorKey: 'model', header: 'Model' },
        // { accessorKey: 'nvr', header: 'NVR' },
        // {
        //   accessorKey: 'applied',
        //   header: 'Applied Setting',
        //   cell: ({ row }) => {
        //     const applied = Array.isArray(row.original.applied) ? row.original.applied : [row.original.applied];
        //     const displayApplied = applied.slice(0, 1);
        //     const remaining = applied.length - 1;
        //     return (
        //       <div className="flex flex-nowrap gap-1">
        //         {displayApplied.map((a, i) => {
        //           const truncated = a.length > 15 ? a.substring(0, 15) + '...' : a;
        //           return (
        //             <Tooltip key={i}>
        //               <TooltipTrigger asChild>
        //                 <span className="px-3 py-1 border border-[#D8D8D8] rounded-[5px] bg-[#F2F2F2] text-xs text-[#333333] whitespace-nowrap cursor-pointer">
        //                   {truncated}
        //                 </span>
        //               </TooltipTrigger>
        //               {a.length > 10 && (
        //                 <TooltipContent>
        //                   <p>{a}</p>
        //                 </TooltipContent>
        //               )}
        //             </Tooltip>
        //           );
        //         })}
        //         {remaining > 0 && (
        //           <span className="px-3 py-1 border border-[#D8D8D8] rounded-[5px] bg-[#F2F2F2] text-xs text-[#333333] whitespace-nowrap">
        //             +{remaining} more
        //           </span>
        //         )}
        //       </div>
        //     );
        //   },
        // },
        // {
        //   accessorKey: 'appliedSettings',
        //   header: 'Applied Profile',
        //   cell: ({ row }) => {
        //     const profiles = Array.isArray(row.original.appliedProfiles)
        //       ? row.original.appliedProfiles
        //       : [row.original.appliedProfiles];
        //     const display = profiles.slice(0, 3);
        //     const remaining = profiles.length - display.length;
        //     return (
        //       <div className="flex flex-nowrap gap-1 items-center">
        //         {display.map((p, i) => {
        //           if (p === 'N/A') {
        //             return (
        //               <span key={i} className="px-3 py-1 border border-[#D8D8D8] rounded-[5px] bg-[#F2F2F2] text-xs text-[#333333] whitespace-nowrap cursor-pointer flex items-center justify-center">
        //                 <TbHexagonPlus className="w-4 h-4" />
        //               </span>
        //             );
        //           }
        //           return (
        //             <Tooltip key={i}>
        //               <TooltipTrigger asChild>
        //                 <span className="px-3 py-1 border border-[#D8D8D8] rounded-[5px] bg-[#F2F2F2] text-xs text-[#333333] whitespace-nowrap cursor-pointer">
        //                   {p.length > 16 ? p.slice(0, 16) + '...' : p}
        //                 </span>
        //               </TooltipTrigger>
        //               {p.length > 16 && (
        //                 <TooltipContent>
        //                   <p>{p}</p>
        //                 </TooltipContent>
        //               )}
        //             </Tooltip>
        //           );
        //         })}
        //         {remaining > 0 && (
        //           <span className="px-3 py-1 border border-[#D8D8D8] rounded-[5px] bg-[#F2F2F2] text-xs text-[#333333] whitespace-nowrap">
        //             +{remaining} more
        //           </span>
        //         )}
        //       </div>
        //     );
        //   },
        // },
        {
          accessorKey: 'cameraType',
          header: 'Camera Type',
          cell: ({ row }) => {
            const cameraId =
              row.original.originalChannelData?.linkedCameras?.[0]?._id;
            const currentType =
              cameraTypes[cameraId] ??
              row.original.originalChannelData?.linkedCameras?.[0]?.cameraType ??
              '';

            
            if (!canEdit) {
              return (
                <span className="px-3 py-1 rounded-[6px] text-xs bg-[#F2F2F2] border border-[#D8D8D8] text-[#333333] whitespace-nowrap">
                  {currentType || '—'}
                </span>
              );
            }

            return (
              <Select
                value={currentType}
                onValueChange={async (value) => {
                  if (!cameraId) return;
                  setCameraTypes((prev) => ({
                    ...prev,
                    [cameraId]: value,
                  }));
                  setIsCameraSettingLoading(true);
                  try {
                    const response = await updateCameraSettingById(cameraId, {
                      checkType: value,
                    });
                    if (response?.data?.body?.status === 'success') {
                      toast.success(response?.data?.body?.message || '');
                    } else {
                      toast.error(
                        response?.data?.body?.message ||
                          'Failed to update camera type'
                      );
                    }
                  } catch (err) {
                    toast.error(
                      err?.response?.data?.body?.message ||
                        'Failed to update camera type'
                    );
                    console.log('err:', err);
                  } finally {
                    setIsCameraSettingLoading(false);
                  }
                }}
              >
                <SelectTrigger className="w-32 h-8 cursor-pointer text-xs border-[#D8D8D8] bg-[#F2F2F2]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[#F2F2F2]">
                  <SelectItem value="checkin">Check-in</SelectItem>
                  <SelectItem value="checkout">Check-out</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            );
          },
        },
        // {
        //   accessorKey: 'actions',
        //   header: 'Action',
        //   cell: () => (
        //     <div className="flex items-center gap-3">
        //       <button className="p-2 cursor-pointer rounded hover:bg-gray-100">
        //         <FiEdit3 className="w-4.5 h-4.5 text-[#07486A]" />
        //       </button>
        //       <button className="p-2 cursor-pointer rounded hover:bg-gray-100">
        //         <RotateCcw className="w-4.5 h-4.5 text-[#07486A]" />
        //       </button>
        //     </div>
        //   ),
        // },
      ],
      // dependencies: columns reference paginatedDataWithIds for data updates
      [paginatedDataWithIds, selectedIds, cameraTypes, canEdit]
    );

    return (
      <div className="h-full flex flex-col">
        {isCameraSettingLoading && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="bg-white p-3 rounded shadow flex items-center gap-3">
              <div className="loader" style={{ width: 18, height: 18, border: '3px solid #eee', borderTop: '3px solid #07486A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div className="text-sm">Updating camera...</div>
            </div>
          </div>
        )}
        <div className="w-full flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
          <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA]  lg:px-4 lg:py-4 space-y-2 sm:space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="relative w-full md:w-[15%]">
                <Input
                  type="text"
                  placeholder="Filter Camera"
                  className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-10"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

              <div className="w-full md:w-[25%] xl:w-[14%]">
                <Select
                  value={selectedNvr?._id}
                  onValueChange={(value) => {
                    const nvr = nvrs.find((n) => n._id === value);
                    setSelectedNvr(nvr);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="border-[#C7C7C7] cursor-pointer bg-white text-[11px] text-[#333]  h-10">
                    <SelectValue placeholder="Select NVR" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[12px] max-h-60 overflow-y-auto bg-white border border-[#E5E5E5] shadow-lg">
                    {loading ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        Loading...
                      </div>
                    ) : nvrs.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No NVRs found
                      </div>
                    ) : (
                      nvrs.map((nvr) => (
                        <SelectItem key={nvr._id} value={nvr._id}>
                          {nvr.nvrName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              {/* <div className="w-full md:w-auto md:ml-auto">
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm border ${selectedIds.size > 0 ? 'bg-[#07486A] border-[#07486A] text-white' : 'bg-white text-[#595959] border border-[#C7C7C7]'}`}
                  onClick={() => { }}
                  disabled={selectedIds.size === 0}
                >
                  <Gear className={`w-5 h-5 ${selectedIds.size > 0 ? 'text-white' : 'text-[#595959]'}`} />
                  Apply Profile ({selectedIds.size})
                </button>
              </div> */}
            </div>
            {<div className="w-full overflow-x-auto">
              <ProfilesTable detectionSettings={detectionSettings} data={paginatedDataWithIds} columns={columns} loading={loading}
                onRowClick={(row) => navigate('/settings/inner', { state: { rowData: row, channelData: row.originalChannelData, currentNvr: selectedNvr } })}
              />
            </div>
              // <div className="text-center py-4 text-gray-500">No Detections found</div>
            }

            {/* {!loading && detectionData.length === 0 && (
            )} */}
          </div>
          {openDetectionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl w-[360px] p-5 space-y-4 shadow-lg">

                <h3 className="text-sm font-semibold text-[#333]">
                  Detection Control
                </h3>

                <p className="text-xs text-[#666]">
                  Camera: <span className="font-medium">{activeRow?.name}</span>
                </p>

                <p className="text-xs text-[#666]">
                  Detection Type: <span className="font-medium">{activeDetectionType}</span>
                </p>

                <div className="flex items-center justify-between gap-3 pt-3">
                  <button
                    className="flex-1 py-2 rounded-lg border text-xs hover:bg-gray-100"
                    onClick={() => setOpenDetectionModal(false)}
                  >
                    Cancel
                  </button>

                  {openDetectionModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                      <div className="bg-white rounded-xl w-[360px] p-5 space-y-4 shadow-lg">

                        <h3 className="text-sm font-semibold text-[#333]">
                          Detection Control
                        </h3>

                        <p className="text-xs text-[#666]">
                          Camera: <span className="font-medium">{activeRow?.name}</span>
                        </p>

                        <p className="text-xs text-[#666]">
                          Detection Type:{' '}
                          <span className="font-medium">{activeDetectionType}</span>
                        </p>

                        <p className="text-xs text-[#666]">
                          Status:{' '}
                          <span className={isEnabled ? 'text-green-600' : 'text-red-600'}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </p>

                        <div className="flex gap-3 pt-4">
                          <button
                            className="flex-1 py-2 rounded-lg border text-xs"
                            onClick={() => setOpenDetectionModal(false)}
                          >
                            Cancel
                          </button>

                          {isEnabled ? (
                            <button
                              disabled={isDetectionActionLoading}
                              className={`flex-1 py-2 rounded-lg text-xs text-white 
                                  ${isDetectionActionLoading ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600'}`}
                              onClick={async () => {
                                await handleEnableDetectionType(
                                  activeRow,
                                  activeDetectionType,
                                  false
                                );
                                setOpenDetectionModal(false);
                              }}
                            >
                              {isDetectionActionLoading ? 'Stopping...' : 'Stop Detection'}
                            </button>
                          ) : (
                            <button
                              disabled={isDetectionActionLoading}
                              className={`flex-1 py-2 rounded-lg text-xs text-white 
                                  ${isDetectionActionLoading ? 'bg-[#4f7f99] cursor-not-allowed' : 'bg-[#07486A]'}`}
                              onClick={async () => {
                                await handleEnableDetectionType(
                                  activeRow,
                                  activeDetectionType,
                                  true
                                );
                                setOpenDetectionModal(false);
                              }}
                            >
                              {isDetectionActionLoading ? 'Starting...' : 'Start Detection'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    );
  };

  export default DetectionSettings;
