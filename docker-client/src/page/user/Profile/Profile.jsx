import React, { useState, useMemo, useEffect, memo } from 'react';
import { Search, Columns, Upload, Plus, CirclePlus, Ellipsis, ArrowDownUp, Copy, Edit, Download, Files, Trash2, SquareStack, Trash } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { FiEdit3 } from "react-icons/fi";
import { Input } from '@/components/ui/input';
import MultiStepForm from './MultiStepForm';
import { getProfileDetails, getProfileExport } from './Api/get';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';
import { toast } from 'sonner';
import { deleteProfile } from './Api/delete';
import ProfilesTable from './ProfilesTable';
import { deleteBulkProfiles, profileBulkExport } from './Api/post';
import Pagination from '@/components/Pagination';
import { LuColumns2 } from "react-icons/lu";
import useDebounce from '@/hooks/useDebounce';
import { ArrowUp,ArrowDown  } from 'lucide-react';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
const styles = {
  text: 'text-[#333333] text-xs sm:text-sm font-normal',
  checkbox:
    'border-[#07486A] data-[state=checked]:bg-[#07486A] cursor-pointer data-[state=checked]:text-white',
  statusBadge: (active) =>
    `px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-[4px] md:rounded-[5px] text-[10px] xl:text-xs font-medium ${active ? 'text-[#338904]  bg-[#E8FFDB]' : 'text-[#848484] border border-[#D8D8D8] bg-[#F2F2F2]'
    }`,
};

const Profile = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.profiles?.view;
  const canCreate = permissions?.profiles?.create;
  const canEdit = permissions?.profiles?.edit;
  const canDelete = permissions?.profiles?.delete;

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Profile's." />;
  }
  const [profiles, setProfiles] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [onLoading, setOnLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(8);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [total, setTotal] = useState(0); // <-- add total state
  const [sortOrder, setSortOrder] = useState('asc');
  const [sortField, setSortField] = useState('name');
  // which columns are visible
  const [visibleCols, setVisibleCols] = useState({
    select: true,
    name: true,
    // type: true,
    createdBy: true,
    createdAt: true,
    lastModified: true,
    status: true,
    actions: true,
  });
    const debouncedSearch = useDebounce(searchInput, 300);
  const fetchProfiles = async () => {
    setOnLoading(true);
    try {
      const params = {
  page: currentPage,
  limit,
  search: searchInput.trim().toLowerCase(),
  sort: sortOrder,
  orderBy: sortField === 'name' ? 'basics.profileName' : sortField,
};
const response = await getProfileDetails(params);
      
      const data = response?.data?.body?.data?.profiles || response.data || [];
      const totalCount = response?.data?.body?.data?.total || data.length;
      
      const formatted = data.map((item) => ({
        ...item,
        id: item._id,
        name: item.basics?.profileName || '',
        createdBy: item.createdBy?.email || '',
        createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
        lastModified: item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '',
        active: item.status === 'Active',
        status: item.status,
      }));
      setProfiles(formatted);
      setTotal(totalCount)
    } catch (e) {
      setProfiles([]);
      setTotal(0);
    }
    setOnLoading(false);
  };

  // Fetch profiles from API with pagination
  useEffect(() => {

    fetchProfiles();
     if (searchInput) {
      setCurrentPage(1);
    }
  }, [currentPage, limit, debouncedSearch, sortOrder, sortField]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Reset to first page when search input changes
  useEffect(() => {
    // When the search changes, reset to the first page so results start from the beginning
    setCurrentPage(1);
  }, [searchInput]);
    const handleSearchInput = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    
    setCurrentPage(1);
  };

  const baseColumns = useMemo(() => [
    {
      accessorKey: 'select',
      header: () => {
        const currentPageIds = profiles.map(p => p.id);
        const allCurrentSelected = profiles.length > 0 && profiles.every(p => selectedProfiles.includes(p.id));
        const someCurrentSelected = profiles.some(p => selectedProfiles.includes(p.id));
        
        return (
          <Checkbox
            checked={allCurrentSelected}
            indeterminate={someCurrentSelected && !allCurrentSelected}
            onCheckedChange={(value) => {
              if (value) {
                // Add all current page profiles to selection
                setSelectedProfiles(prev => [...new Set([...prev, ...currentPageIds])]);
              } else {
                // Remove all current page profiles from selection
                setSelectedProfiles(prev => prev.filter(id => !currentPageIds.includes(id)));
              }
            }}
            className={`${styles.checkbox} mt-1`}
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={selectedProfiles.includes(row.original.id)}
          onCheckedChange={(value) => {
            if (value) {
              setSelectedProfiles(prev => [...prev, row.original.id]);
            } else {
              setSelectedProfiles(prev => prev.filter(id => id !== row.original.id));
            }
          }}
          className={`${styles.checkbox}`}
        />
      ),
    },
   {
  accessorKey: 'name',
  header: () => (
    <button
      onClick={() => {
        setSortField('name');
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      }}
      className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded-md"
    >
      Name
     {sortField === 'name' && (
  sortOrder === 'asc'
    ? <ArrowUp className="w-4 h-4" />
    : <ArrowDown className="w-4 h-4" />
)}
    </button>
  ),
  cell: ({ row }) => <span className={styles.text}>{row.original.name}</span>,
},
    // {
    //   accessorKey: 'type',
    //   header: 'Type',
    //   cell: ({ row }) => <span className={styles.text}>{row.original.type}</span>,
    // },
    {
      accessorKey: 'createdBy',
      header: 'Created By',
      cell: ({ row }) => <span className={styles.text}>{row.original.createdBy}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => <span className={styles.text}>{row.original.createdAt}</span>,
    },
    {
      accessorKey: 'lastModified',
      header: 'Last Modified',
      cell: ({ row }) => <span className={styles.text}>{row.original.lastModified}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row: r }) => (
        <span className={styles.statusBadge(r.original.active)}>
          {r.original.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(canCreate || canEdit || canDelete
      ? [
        {
          accessorKey: 'actions',
          header: 'Actions',
          cell: ({ row }) => (
            <div className="flex items-center ml-3 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1 cursor-pointer rounded">
                    <Ellipsis className='text-[#333333]' size={20} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 rounded-[12px] bg-white border border-[#E5E5E5] shadow-lg p-2">
                  <div className="space-y-1">
                    {/* <button 
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#333333] hover:bg-gray-50 rounded-md"
                    onClick={() => {
                      navigator.clipboard.writeText(row.original.id);
                    }}
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Profile ID</span>
                  </button> */}
                    {canEdit && (
                      <MultiStepForm
                        row={row?.original}
                        fetchProfiles={fetchProfiles}
                        trigger={(
                          <button
                            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#333333] hover:bg-gray-50 rounded-md cursor-pointer"
                            onClick={() => {
                              console.log('Edit profile:', row.original.id);
                            }}
                          >
                            <FiEdit3 className="md:flex lg:hidden w-4 h-4" />
                            <span className="md:hidden lg:inline">Edit</span>
                          </button>
                        )}
                      />
                    )}
                    {canCreate && (
                      <button
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#333333] hover:bg-gray-50 rounded-md cursor-pointer"
                        onClick={async () => {
                          const response = await getProfileExport(row.original._id);
                        }}
                      >
                        <Download className="md:flex lg:hidden w-4 h-4" />
                        <span className="md:hidden lg:inline">Export</span>
                      </button>
                    )}
                    {/* <button
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#333333] hover:bg-gray-50 rounded-md"
                    onClick={() => {
                      console.log('Duplicate profile:', row.original.id);
                    }}
                  >
                    <SquareStack className="w-4 h-4" />
                    <span>Duplicate</span>
                  </button> */}
                    {canDelete && (
                      <button
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#EF4444] hover:bg-red-50 rounded-md cursor-pointer"
                        onClick={() => {
                          // Open delete confirmation modal (UI only)
                          setDeleteTarget(row.original);
                          setShowDeleteModal(true);
                        }}
                      >
                        <Trash className="md:flex lg:hidden w-4 h-4" />
                        <span className="md:hidden lg:inline">Delete</span>
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ),
        },
      ]
      : []),
  ], [profiles, selectedProfiles,sortOrder]);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleConfirmDelete = async () => {
    try {
      // Check if deleting multiple profiles
      if (deleteTarget?.isMultiple) {
        let successCount = 0;
        let failCount = 0;
        const response = await deleteBulkProfiles(selectedProfiles);
        if (response?.status == "success") {
          toast?.success(response?.message);
        }
        else {
          toast?.success(response?.message);
        }

        for (const profileId of selectedProfiles) {
          try {

            if (response?.data?.statusCode === 200) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            failCount++;
          }
        }

        if (successCount > 0) {
          toast.success(`${successCount} profile(s) deleted successfully`);
        }
        // if (failCount > 0) {
        //   toast.error(`Failed to delete ${failCount} profile(s)`);
        // }

        setShowDeleteModal(false);
        setDeleteTarget(null);
        setSelectedProfiles([]);
        fetchProfiles();
      } else {
        // Single profile deletion
        const response = await deleteProfile(deleteTarget._id);
        if (response?.data?.statusCode === 200) {
          toast.success(response?.data?.body?.message);
          setShowDeleteModal(false);
          setDeleteTarget(null);
          fetchProfiles();
        } else {
          toast.error(response?.data?.body?.message || 'Failed to delete profile.');
        }
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      // toast.error(error?.response?.data?.body?.message);
    } finally {
      console.log('delete'); // You can keep this for debug or remove if unnecessary
    }
  };


  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  // filter columns based on visibility state
  const columns = useMemo(() => {
    return baseColumns.filter((c) => visibleCols[c.accessorKey || c.id || ''] !== false);
  }, [baseColumns, visibleCols]);

  // Pagination logic


  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // importing profile
  // const handleImportProfile =async()=>{
  //   const selectedEmployees =employeesdata.filter(emp=>selectedProfiles.includes(emp.id))
  //   const result =await importEmployeeProfile(selectedEmployees)
  //   if(result?.status === "success")
  //   {
  //      toast.success(result?.message || "Users processed successfully")
  //      fetchProfiles();
  //      setSelectedProfiles([]);
  //   }
  //   else{
  //     toast.error(result?.message || "Fail to process Users")
  //   }
  // }

  return (
    <div className="h-full flex flex-col">

      <div className="w-full flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-2 sm:p-3 md:p-4 lg:p-6 space-y-2 sm:space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="relative w-full md:w-[15%]">
              <Input
                type="text"
                placeholder="Search"
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-10"
                value={searchInput}
                onChange={
                  handleSearchInput
                }
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[#595959]" />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center cursor-pointer gap-2 px-3 sm:px-6 md:px-3 py-2 md:py-2.5 bg-white border border-[#C7C7C7] rounded-[8px] sm:rounded-[10px] text-sm"
                  aria-label="Columns"
                >
                  <Columns className=" w-4 h-4" />
                  
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 rounded-[12px] bg-white border border-[#E5E5E5] shadow-lg p-4">
                <div className="space-y-3">
                  {/* Render checkboxes for each column */}
                  {[
                    { key: 'name', label: 'Name' },
                    // { key: 'type', label: 'Type' },
                    { key: 'createdBy', label: 'Created By' },
                    { key: 'createdAt', label: 'Created At' },
                    { key: 'lastModified', label: 'Last Modified' },
                    { key: 'status', label: 'Status' },
                    { key: 'actions', label: 'Action' },
                  ].map((c) => (
                    <label key={c.key} className="flex items-center gap-3 cursor-pointer">
                      <Checkbox
                        checked={visibleCols[c.key]}
                        onCheckedChange={(val) =>
                          setVisibleCols((s) => ({ ...s, [c.key]: !!val }))
                        }
                        className={`${styles.checkbox}`}
                      />
                      <span className="text-[#07486A] text-sm font-normal">{c.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="w-full md:w-auto md:ml-auto">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* <button
                  className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-white border border-[#C7C7C7] rounded-[8px] sm:rounded-[10px] text-sm"
                  aria-label="Import Profile"
                >
                  <Upload className=" w-4 h-4 text-[#333333]" />
                  <span className="hidden lg:inline">Import Profile</span>
                </button> */}
                {canCreate && (
                  <MultiStepForm
                    fetchProfiles={fetchProfiles}
                    trigger={(
                      <button
                      className="flex items-center focus:outline-none gap-1 sm:gap-2 px-3 py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-sm cursor-pointer"
                      aria-label="Add New Profile"
                      >
                        <CirclePlus className="w-4 h-4 text-white" />
                        <span className="md:hidden lg:inline">Add New Profile</span>
                      </button>
                    )}
                  />
                 )}
              </div>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <ProfilesTable data={profiles} columns={columns} loading={onLoading} />
          </div>
          {profiles.length === 0 && !onLoading ? (
            <div className="text-center py-4 text-gray-500">No profiles found</div>
          ) : null}

          {/* Floating Action Bar for Multiple Selection */}
          {selectedProfiles.length > 0 && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
              <div className="bg-white text-[#333333] border border-gray-300 rounded-[12px] shadow-2xl px-6 py-4 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{selectedProfiles.length} profile{selectedProfiles.length > 1 ? 's' : ''} selected</span>
                </div>
                <div className="h-6 w-px bg-gray-300"></div>
                <div className="flex items-center gap-3">
                  {canCreate && (
                    <button
                    onClick={async () => {
                      // Export selected profiles
                      const response = await profileBulkExport(selectedProfiles);
                      if (response?.status == 200) {
                        toast?.success('Profiles exported successfully');
                      }
                      else {
                        toast?.success("Failed to export profiles");
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#333333] rounded-lg transition-colors text-sm"
                    >
                    <Download className="md:flex lg:hidden w-4 h-4" />
                    <span className="md:hidden lg:inline">Export</span>
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        // Open delete confirmation for multiple profiles
                        setDeleteTarget({ isMultiple: true, count: selectedProfiles.length });
                        setShowDeleteModal(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-red-200 cursor-pointer border border-red-300 text-white rounded-lg transition-colors text-sm"
                    >
                      <Trash className="md:flex lg:hidden w-4 h-4 text-red-600" />
                      <span className='md:hidden lg:inline text-red-600'>Delete</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setSelectedProfiles([])}
                  className="ml-2 p-1 cursor-pointer text-[#333333] rounded-full transition-colors"
                  aria-label="Clear selection"
                >
                  <span className="text-xl">×</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
      {/* Delete confirmation modal (UI only) */}
      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash2 className="w-7 h-7 text-red-600" />}
        message={
          deleteTarget?.isMultiple
            ? `Are you sure you want to delete ${deleteTarget.count} profile${deleteTarget.count > 1 ? 's' : ''}?`
            : deleteTarget
              ? `Are you sure you want to delete "${deleteTarget.name || deleteTarget._id}"`
              : 'Are you sure you want to delete this profile?'
        }
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default memo(Profile);
