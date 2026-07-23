import React, { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { Search, Columns, CirclePlus, Edit, Trash2, Trash, ArrowDownUp } from 'lucide-react';
import { FiEdit3 } from "react-icons/fi";
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';

import Pagination from '@/components/Pagination';
import { LuColumns2 } from "react-icons/lu";
import { ArrowUp, ArrowDown } from 'lucide-react';
import PermissionTable from '../RolePermissions/PermissionTable';
import NewPermissionForm from './NewPermissionForm';
import { getUserDetails } from './Api/Post';
import { first } from '@amcharts/amcharts5/.internal/core/util/Array';
import { deleteBulkUser, deleteUser } from './Api/delete';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { usePermissions } from '@/context/Permission/PermissionContext';
import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';

const styles = {
  text: 'text-[#333333] text-xs md:text-sm 2xl:text-sm font-normal',
  checkbox:
    'border-[#777777] data-[state=checked]:bg-[#07486A] size-4 md:size-4 2xl:size-5 cursor-pointer data-[state=checked]:text-white',
  Rolecheckbox:
    'border-[#777777] data-[state=checked]:bg-[#07486A] size-3 md:size-4 2xl:size-4 cursor-pointer data-[state=checked]:text-white',
  statusBadge: (active) =>
    `px-2 xl:px-2.5 py-1 xl:py-1.5 rounded-[4px] md:rounded-[5px] text-[10px] xl:text-xs font-medium ${active ? 'text-[#338904] bg-[#E8FFDB]' : 'text-[#848484] border border-[#D8D8D8] bg-[#F2F2F2]'
    }`,
};

const Userdetails= () => {
  const token = getAccessToken();
  const decodedtoken = jwtDecode(token);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.Users?.view;
  const canCreate = permissions?.Users?.create;
  const canEdit = permissions?.Users?.edit;
  const canDelete = permissions?.Users?.delete;
 
  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view Users." />;
  }

  const [roles, setRoles] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [onLoading, setOnLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(8);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [total, setTotal] = useState(0);
  // Defaults to newest-first (createdAt desc) so newly added users show up
  // at the top instead of being scattered alphabetically across pages.
  // Clicking the "User name" column header still switches to a userName sort.
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('createdAt');


  // which columns are visible
  const [visibleCols, _setVisibleCols] = useState({
    select: true,
    name: true,
    email: true,
    superAdmin: true,
    lastLogin: true,
    active: true,
    actions: true,
  });
  // Fetch users from backend (paginated)
  // Fetch users without useCallback
  const fetchUsers = async () => {
    setOnLoading(true);
    try {
      // send search query as first param and pagination/sort in POST body
      const resp = await getUserDetails(searchInput || "",limit,currentPage -0 *10, {
        page: currentPage,
        limit,
        sortField,
        sortOrder,
      });
      const users = resp?.data?.body?.data?.users || resp?.data?.body?.data || [];
      // try multiple places where backend might return totals
      const bodyData = resp?.data?.body?.data || {};
      const totalCount =
        // common fields
        (typeof bodyData.total === 'number' && bodyData.total) ||
        (typeof bodyData.totalCount === 'number' && bodyData.totalCount) ||
        (typeof bodyData.count === 'number' && bodyData.count) ||
        // sometimes wrapped in meta / pagination
        (typeof bodyData.meta?.total === 'number' && bodyData.meta.total) ||
        (typeof bodyData.meta?.totalCount === 'number' && bodyData.meta.totalCount) ||
        (typeof bodyData.pagination?.total === 'number' && bodyData.pagination.total) ||
        // fallback to server-provided length or client-calculated
        (Array.isArray(bodyData.users) ? bodyData.users.length : (Array.isArray(users) ? users.length : 0));
      const formatted = (users || []).map((user) => ({
        id: user._id,
        _id: user._id,
        memberId: user.memberId || null,
        name:
          user.userName ||
          `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || '',
        role: user?.roleIds?.roleName || '',
        permission: user.permission || [],
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        lastLogin: user.lastLogin
          ? new Date(user.lastLogin).toLocaleString()
          : user.createdAt
          ? new Date(user.createdAt).toLocaleString()
          : '',
        active: !!user.active,
        username: user.userName || '',
        authorizedChannels: user.authorizedChannels || [],
        location: user.location || '',
        employeeLocations: user.authorizedChannels?.employeeLocations || [],
        password: user.password || "",

      }));

      setRoles(formatted);
      setTotal(Number.isFinite(Number(totalCount)) ? Number(totalCount) : formatted.length);
    } catch (err) {
      setRoles([]);
      setTotal(0);
    }
    setOnLoading(false);
  };

  
  // Fetch whenever page or search changes
  useEffect(() => {
    fetchUsers();
  }, [searchInput, currentPage, limit,sortOrder]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchInput]);

    const handleConfirmDelete = async () => {
    try {
   const response =  await deleteUser(deleteTarget._id);
      // TODO: Replace with actual API call
      // const response = await deleteRole(deleteTarget._id);
      if(response?.data.statusCode == 200){
      toast.success(response?.data?.body?.message);
      fetchUsers()
      }
      // fetchUsers();

      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
          toast.error(error?.response?.data?.body?.message);
    }

  };


  const handleSearchInput = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    setCurrentPage(1);
  };

  const baseColumns = useMemo(() => [
{
  accessorKey: 'select',
  header: () => {
    // identify current user per row
    const selectableRoles = roles.filter(
      r => !(r.email === decodedtoken?.user_email && decodedtoken?.memberId)
    );

    const currentPageIds = selectableRoles.map(r => r.id);

    const allSelected =
      selectableRoles.length > 0 &&
      selectableRoles.every(r => selectedRoles.includes(r.id));

    const someSelected =
      selectableRoles.some(r => selectedRoles.includes(r.id));

    return (
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected && !allSelected}
        // ❌ don't disable
        // disabled={currentUserPresent}
        onCheckedChange={(value) => {
          if (value) {
            // ✅ select all EXCEPT current user
            setSelectedRoles(prev => [
              ...new Set([...prev, ...currentPageIds]),
            ]);
          } else {
            // ✅ clear only non-current-user ids on this page
            setSelectedRoles(prev =>
              prev.filter(id => !currentPageIds.includes(id))
            );
          }
        }}
        className={`${styles.checkbox} mt-1`}
      />
    );
  },
  cell: ({ row }) => {
 const currentPageIds = roles.map(r => r.id);

  const allSelected =
    roles.length > 0 && roles.every(r => selectedRoles.includes(r.id));

  const someSelected = roles.some(r => selectedRoles.includes(r.id));

  const currentUserPresent = roles.some(
    r => r.email === decodedtoken?.user_email && decodedtoken?.memberId
  );
    const isCurrentUser = row.original.email === decodedtoken?.user_email && decodedtoken?.memberId;
    return (
      <Checkbox
        checked={selectedRoles.includes(row.original.id)}
        onCheckedChange={(value) => {
          if (value) {
            setSelectedRoles(prev => [...prev, row.original.id]);
          } else {
            setSelectedRoles(prev => prev.filter(id => id !== row.original.id));
          }
        }}
        disabled={isCurrentUser}
        className={`${styles.checkbox}`}
      />
    );
  },
},


    // User name column with sort
    {
      accessorKey: 'name',
      header: () => (
        <button
          onClick={() => {
            setSortField('userName');
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          }}
          className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded-md"
        >
          User name
         {sortField === 'userName' && (
        sortOrder === 'asc'
          ? <ArrowUp className="w-4 h-4" />
          : <ArrowDown className="w-4 h-4" />
      )}
        </button>
      ),
      cell: ({ row }) => <span className={styles.text}>{row.original.name}</span>,
    },
    // Email
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className={styles.text}>{row.original.email || ''}</span>,
    },
    // Super Admin flag
    // {
    //   accessorKey: 'superAdmin',
    //   header: 'Super Admin',
    //   cell: ({ row }) => <span className={styles.text}>{row.original.superAdmin ? 'Yes' : 'No'}</span>,
    // },
     {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => <span className={styles.text}>{row.original.role }</span>,
    },
    // Last Login
    // {
    //   accessorKey: 'permission',
    //   header: 'Permission',
    //   cell: ({ row }) => <span className={styles.text}>{row.original.permission || ''}</span>,
    // },
    // Active toggle using shadcn Switch
    // {
    //   accessorKey: 'active',
    //   header: 'Active / Inactive',
    //   cell: ({ row }) => {
    //     const id = row.original.id;
    //     return (
    //       <Switch
    //         checked={!!row.original.active}
    //         onCheckedChange={(val) => {
    //           // update local state for immediate UI feedback
    //           setRoles((prev) => prev.map(r => r.id === id ? { ...r, active: val } : r));
    //           // TODO: send update to server
    //         }}
    //         className="scale-75"
    //       />
    //     );
    //   },
    // },
    ...(canEdit || canDelete
      ? [
    {
      accessorKey: 'actions',
      header: 'Action',
      cell: ({ row }) => {
        const isCurrentUser = row.original.email === decodedtoken?.user_email && decodedtoken?.memberId;
        return (
          <div className="flex items-center gap-2 md:gap-2 2xl:gap-3">
            {canEdit && !isCurrentUser && (
              <NewPermissionForm
                fetchUsers={fetchUsers}
                row={row}
                trigger={
                  <button
                    className="text-[#07486A] hover:text-[#07486A] cursor-pointer"
                    aria-label="Edit"
                  >
                    <FiEdit3 strokeWidth={1.5} className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5" />
                  </button>
                }
                initialValues={{
                  _id: row?.original?._id || "",
                  username: row?.original?.userName || row?.original?.username || row?.original?.name || "",
                  email: row?.original?.email || "",
                  role: row?.original?.roleIds?.roleName || row?.original?.role || "",
                  roleIds: row?.original?.roleIds?._id ? [row.original.roleIds._id] : [],
                  permission: row?.original?.permission || [],
                  firstName:
                    row?.original?.firstName ||
                    (row?.original?.name ? row.original.name.split(" ")[0] : "") ||
                    "",
                  lastName:
                    row?.original?.lastName ||
                    (row?.original?.name ? row.original.name.split(" ").slice(1).join(" ") : "") ||
                    "",
                  active: !!row?.original?.active,

                  // ✅ Include authorizedChannels

                  locations: row?.original?.authorizedChannels?.locations || [],
                  nvrs: (row?.original?.authorizedChannels?.nvrIds || []).map(n => typeof n === "object" ? n._id : n),
                  departmentIds: (row?.original?.authorizedChannels?.departmentIds || []).map(d => typeof d === "object" ? d._id : d),
                  channels: (row?.original?.authorizedChannels?.channels || []).map(c => typeof c === "object" ? c._id : c),
                  location: row?.original?.location || "",
                  employeeLocations: row?.original?.authorizedChannels?.employeeLocations || row?.original?.employeeLocations || [],
                  password: row?.original?.password || "",
                }}
                mode="edit"
                onSave={() => fetchUsers()}
              />
            )}

            {!isCurrentUser && (
              <button
                onClick={() => { setDeleteTarget(row.original); setShowDeleteModal(true); }}
                className="text-[#EF4444] hover:text-red-600 cursor-pointer"
                aria-label="Delete"
              >
                <Trash strokeWidth={1.5} size={18} className="w-4 h-4 md:w-4 md:h-4 2xl:w-[18px] 2xl:h-[18px]" />
              </button>
            )}
          </div>
        );
      },
    },
    ]
      : []),
  ], [roles, selectedRoles, sortOrder, sortField, decodedtoken?.user_email, decodedtoken?.memberId]);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);



  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const columns = useMemo(() => {
    return baseColumns.filter((c) => visibleCols[c.accessorKey || c.id || ''] !== false);
  }, [baseColumns, visibleCols]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // removed unused handleGetUserDetails to avoid duplicate API calls

  const handleDeleteBulkUsers = async () => {
    const response = await deleteBulkUser(selectedRoles);
    if(response?.data.statusCode == 200){
      toast.success(response?.data?.body?.message);
      fetchUsers()
      setSelectedRoles([]);
    }
  }


  return (
    <div className="h-full flex flex-col">
      <div className="w-full flex-1 overflow-y-auto px-2 space-y-3 sm:space-y-4 md:space-y-4 lg:space-y-5 xl:space-y-6 2xl:space-y-8 bg-white rounded-[18px]">
        <div className="flex items-center justify-between mb-4">
        </div>
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-2 sm:p-3 md:p-3 lg:p-4 2xl:p-6 space-y-2 sm:space-y-3 md:space-y-3 2xl:space-y-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-2 2xl:gap-3 pt-2 justify-between">
            <div className="relative w-full md:w-[15%]">
              <Input
                type="text"
                placeholder="Search "
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-8 md:h-8 2xl:h-10 text-xs md:text-xs 2xl:text-sm"
                value={searchInput}
                onChange={handleSearchInput}
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-[#595959]" />
            </div>
            {canCreate && (
              <NewPermissionForm fetchUsers={fetchUsers} trigger={
                <button
                  className="flex items-center focus:outline-none gap-1 sm:gap-2 px-2.5 py-1.5 md:px-2.5 md:py-1.5 2xl:px-3.5 2xl:py-2.5 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-xs md:text-xs 2xl:text-sm cursor-pointer"
                >
                  <CirclePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                  <span className="md:hidden lg:inline">Add New User</span>
                </button>
              } />
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <PermissionTable data={roles} columns={columns} loading={onLoading} />
          </div>
          {/* {roles?.length === 0 && !onLoading ? (
            <div className="text-center py-4 text-gray-500">No users found</div>
          ) : null} */}

          {/* Floating Action Bar for Multiple Selection */}
          {selectedRoles.length > 0 && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
              <div className="bg-white text-[#333333] border border-gray-300 rounded-[12px] shadow-2xl px-6 py-4 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{selectedRoles.length} user{selectedRoles.length > 1 ? 's' : ''} selected</span>
                </div>
                <div className="h-6 w-px bg-gray-300"></div>
                {canDelete && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setDeleteTarget({ isMultiple: true, count: selectedRoles.length });

                        handleDeleteBulkUsers();
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-red-200 cursor-pointer border border-red-300 text-white rounded-lg transition-colors text-sm"
                    >
                      <Trash2 className="md:flex lg:hidden w-4 h-4 text-red-600" />
                      <span className='md:hidden lg:inline text-red-600'>Delete</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setSelectedRoles([])}
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

      {/* Delete confirmation modal */}
      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash2 className="w-7 h-7 text-red-600" />}
        message={
          deleteTarget?.isMultiple
            ? `Are you sure you want to delete ${deleteTarget.count} role${deleteTarget.count > 1 ? 's' : ''}? This action cannot be undone.`
            : deleteTarget
              ? `Are you sure you want to delete "${deleteTarget.name}" role?`
              : 'Are you sure you want to delete this role?'
        }
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default memo(Userdetails);