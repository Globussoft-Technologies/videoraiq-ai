import React, { useState, useMemo, useEffect } from 'react';
import { Search, CirclePlus, Trash } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { FiSettings, FiEye, FiEdit3, FiTrash2 } from 'react-icons/fi';
import PermissionTable from './PermissionTable';
import AddRoleDialog from './AddRoleDialog';
import PermissionStep from './PermissionStep';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getAllRolesAndPermissionDetails } from './Api/get';
import { toast } from 'sonner';
import { updatePermissionByRole, updateRolePermissions } from './Api/put';
import { deleteRoleById } from './Api/delete';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import Pagination from '@/components/Pagination';

const styles = {
  text: 'text-[#333333] text-xs md:text-sm 2xl:text-sm font-normal',
  checkbox:
    'border-[#777777] data-[state=checked]:bg-[#07486A] size-4 md:size-4 2xl:size-5 cursor-pointer data-[state=checked]:text-white',
  Rolecheckbox:
    'border-[#777777] data-[state=checked]:bg-[#07486A] size-3 md:size-4 2xl:size-4 cursor-pointer data-[state=checked]:text-white',

};

const initialRoles = [
  { id: 'r1', name: 'Employee', permissions: { view: true, create: false, edit: false, delete: false } },
  { id: 'r2', name: 'Team Lead', permissions: { view: true, create: true, edit: true, delete: false } },
  { id: 'r3', name: 'Manager', permissions: { view: true, create: true, edit: true, delete: true } },
];

const LOG_SUB_KEYS = ['accessLogs', 'attendanceLogs', 'trackLogs', 'deskLogs', 'guardLogs', 'ANPRLogs'];
const EMPTY_ACTIONS = { view: false, create: false, edit: false, delete: false };

// Ensure logs permissions are in nested {global, accessLogs, ...} shape.
// If backend returned the legacy flat {view,...}, treat those values as global
// and initialize all sub-sections to false.
const normalizeLogsPermissions = (config) => {
  if (!config || typeof config !== 'object' || !config.logs) return config;
  const logs = config.logs;
  if (typeof logs !== 'object') return config;

  const hasNested = Object.values(logs).some(
    (v) => v && typeof v === 'object'
  );

  const next = { ...config };
  if (!hasNested) {
    const global = {
      view: !!logs.view,
      create: !!logs.create,
      edit: !!logs.edit,
      delete: !!logs.delete,
    };
    next.logs = {
      global,
      ...LOG_SUB_KEYS.reduce((acc, k) => {
        acc[k] = { ...EMPTY_ACTIONS };
        return acc;
      }, {}),
    };
  } else {
    next.logs = {
      global: logs.global
        ? { ...EMPTY_ACTIONS, ...logs.global }
        : { ...EMPTY_ACTIONS },
      ...LOG_SUB_KEYS.reduce((acc, k) => {
        acc[k] = logs[k]
          ? { ...EMPTY_ACTIONS, ...logs[k] }
          : { ...EMPTY_ACTIONS };
        return acc;
      }, {}),
    };
  }
  return next;
};

const RolesandPermission = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canViewRole = permissions?.roles?.view;
  const canCreateRole = permissions?.roles?.create;
  const canEditRole = permissions?.roles?.edit;
  const canDeleteRole = permissions?.roles?.delete;

  const canViewPermission = permissions?.permission?.view;
  const canEditPermission = permissions?.permission?.edit;
  
 
  if (permissionsLoading) return <PageLoader />;
  if (!canViewRole) {
    return <AccessDenied message="You don't have permission to view Roles." />;
  }
  const [roles, setRoles] = useState(initialRoles);
  
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [editPermissionsOpen, setEditPermissionsOpen] = useState(false);
  const [editPermissions, setEditPermissions] = useState({});
  const [editingRole, setEditingRole] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editRoleData, setEditRoleData] = useState(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
const [currentPage, setCurrentPage] = useState(1);
const [total, setTotal] = useState(0);
const [limit] = useState(8);
  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const res = await getAllRolesAndPermissionDetails((currentPage - 1) * limit, limit,searchInput);
      const roleData = res?.data?.body?.data?.rolesWithPermissions || [];
       const totalCount = res?.data?.body?.data?.totalLength; 
      setTotal(totalCount);
      const mapped = roleData.map((r) => ({
        id: r._id,
        name: r.roleName || r.role || '',
        permissions: {
          view: !!r.view,
          create: !!r.create,
          edit: !!r.edit,
          delete: !!r.delete,
        },
        isDefault: !!r.is_default,
        permissionId: r.permissionDetails?._id || r.permissionId || null,
        adminId: r.createdBy?.userId || r.adminId || null,
        orgId: r.orgId || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        assignedUsersCount: Array.isArray(r.AssignedUserRole) ? r.AssignedUserRole.length : 0,
        raw: r,
      }));

      setRoles(mapped);
    } catch (err) {
      console.error('Failed to fetch roles with permissions', err);
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [currentPage,searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
    const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };
  const handleSearchInput = (e) => {
    const value = e.target.value;
    setSearchInput(value);
  };

  const handleEditPermissions = (role) => {
    const config = role?.raw?.permissionDetails?.permissionConfig || role?.permissionDetails?.permissionConfig || {};
    const clone = config && typeof config === 'object' ? JSON.parse(JSON.stringify(config)) : {};
    const normalized = normalizeLogsPermissions(clone);

    setEditingRole(role);
    setEditPermissions(normalized);
    setIsViewMode(false);
    setEditPermissionsOpen(true);
  };

  const handleViewPermissions = (role) => {
    const config = role?.raw?.permissionDetails?.permissionConfig || role?.permissionDetails?.permissionConfig || {};
    const clone = config && typeof config === 'object' ? JSON.parse(JSON.stringify(config)) : {};
    const normalized = normalizeLogsPermissions(clone);

    setEditingRole(role);
    setEditPermissions(normalized);
    setIsViewMode(true);
    setEditPermissionsOpen(true);
  };

  const handleSavePermissions = async () => {
    if (editingRole) {
      try {
        const permissionId = editingRole?.raw?.permissionDetails?._id;
        if (!permissionId) {
          toast.error('Permission ID not found');
          return;
        }

     const permissionConfig = Object.keys(editPermissions || {}).reduce((acc, key) => {
      const val = editPermissions[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        // Nested shape (e.g. logs): values of sub-keys are themselves
        // {view,create,edit,delete} objects. Preserve that structure.
        const subKeys = Object.keys(val);
        const isNested =
          subKeys.length > 0 &&
          subKeys.every(
            (k) =>
              val[k] &&
              typeof val[k] === 'object' &&
              !Array.isArray(val[k]) &&
              ('view' in val[k] ||
                'create' in val[k] ||
                'edit' in val[k] ||
                'delete' in val[k])
          );

        if (isNested) {
          acc[key] = subKeys.reduce((sub, k) => {
            sub[k] = {
              view: !!val[k].view,
              create: !!val[k].create,
              edit: !!val[k].edit,
              delete: !!val[k].delete,
            };
            return sub;
          }, {});
        } else {
          acc[key] = {
            view: !!val.view,
            create: !!val.create,
            edit: !!val.edit,
            delete: !!val.delete,
          };
        }
      }
      return acc;
    }, {});

    // 🔒 FORCE channels.create & channels.delete = false
    if (permissionConfig.channels) {
      permissionConfig.channels.create = false;
      permissionConfig.channels.delete = false;
    }

    const payload = { permissionConfig };
    console.log(payload);
    
        const response = await updatePermissionByRole(permissionId, payload);

        // if (response?.body?.status === 'success') {
        //   toast.success(response?.body?.message || 'Permissions updated successfully');
        //   const newConfig = payload.permissionConfig;
        //   const summary = { view: false, create: false, edit: false, delete: false };

        //   console.log("New Permission Config:", newConfig);
        //   Object.values(newConfig).forEach((m) => {
        //     summary.view = summary.view || !!m.view;
        //     summary.create = summary.create || !!m.create;
        //     summary.edit = summary.edit || !!m.edit;
        //     summary.delete = summary.delete || !!m.delete;
        //   });

        //   setRoles((prev) =>
        //     prev.map((r) =>
        //       r.id === editingRole.id
        //         ? { ...r, permissions: summary, raw: { ...r.raw, permissionDetails: { ...(r.raw.permissionDetails || {}), permissionConfig: newConfig } } }
        //         : r
        //     )
        //   );

        //   setEditPermissionsOpen(false);
        //   setEditingRole(null);
        // }
        if (response?.body?.status === 'success') {
          toast.success(response?.body?.message || 'Permissions updated successfully');
         fetchRoles()
          // incoming config
          const newConfig = { ...payload.permissionConfig };

          // 🔒 Force channels.create & channels.delete = false
          if (newConfig.channels) {
            newConfig.channels = {
              ...newConfig.channels,
              create: false,
              delete: false
            };
          }

          const summary = { view: false, create: false, edit: false, delete: false };
          const foldActions = (obj) => {
            summary.view = summary.view || !!obj?.view;
            summary.create = summary.create || !!obj?.create;
            summary.edit = summary.edit || !!obj?.edit;
            summary.delete = summary.delete || !!obj?.delete;
          };
          Object.values(newConfig).forEach((m) => {
            if (!m || typeof m !== 'object') return;
            // Nested (logs-style): fold every sub-section into the summary.
            const isNested = Object.values(m).some(
              (v) => v && typeof v === 'object'
            );
            if (isNested) {
              Object.values(m).forEach(foldActions);
            } else {
              foldActions(m);
            }
          });

          setRoles((prev) =>
            prev.map((r) =>
              r.id === editingRole.id
                ? {
                  ...r,
                  permissions: summary,
                  raw: {
                    ...r.raw,
                    permissionDetails: {
                      ...(r.raw.permissionDetails || {}),
                      permissionConfig: newConfig
                    }
                  }
                }
                : r
            )
          );

          setEditPermissionsOpen(false);
          setEditingRole(null);
        }
         else {
          toast.error(response?.body?.message || 'Failed to update permissions');
        }
      } catch (error) {
        console.error('Failed to update permissions:', error);
        toast.error('Failed to update permissions. Please try again.');
      }
    }
  };

  const handleCancelPermissions = () => {
    setEditPermissionsOpen(false);
    setEditingRole(null);
    setEditPermissions({});
    setIsViewMode(false);
  };

  const handleDeleteRole = (role) => {
    setRoleToDelete(role);
    setDeleteConfirmationOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roleToDelete) return;

    try {
      const response = await deleteRoleById(roleToDelete.id);

      if (response?.data?.body?.status === 'success') {
        toast.success(response?.data?.body?.message || '');
        fetchRoles();
        setDeleteConfirmationOpen(false);
        setRoleToDelete(null);
      } else {
        toast.error(response?.data?.body?.message || 'Failed to delete role');
      }
    } catch (err) {
      console.error('Failed to delete role', err);
      toast.error('Failed to delete role. Please try again.');
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmationOpen(false);
    setRoleToDelete(null);
  };

  const handleEditRole = (role) => {
    setEditRoleData(role);
  };

  const handleSaveRole = (roleId, newName) => {
    setRoles((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, name: newName } : r))
    );
    setEditRoleData(null);
  };


  const togglePermission = (roleId, perm) => {
    (async () => {
      const prevRole = roles.find((r) => r.id === roleId);
      if (!prevRole) return;

      const newPermissions = { ...prevRole.permissions, [perm]: !prevRole.permissions[perm] };

      const payload = {
        roleName: prevRole.name || '',
        roleCreate: !!newPermissions.create,
        roleEdit: !!newPermissions.edit,
        roleDelete: !!newPermissions.delete,
        roleView: !!newPermissions.view,
      };

      try {
        const response = await updateRolePermissions(roleId, payload);
        if (response?.body.status === 'success') {
          setRoles((prev) =>
            prev.map((r) => (r.id === roleId ? { ...r, permissions: newPermissions } : r))
          );
          fetchRoles();
          toast.success(response?.body?.message || '');
        } else {
          toast.error(response?.body?.message || 'Failed to update role permissions');
        }
      } catch (err) {
        console.error('Failed to update role permissions', err);
        toast.error('Failed to update role permissions. Please try again.');
      }
    })();
  };

  const columns = useMemo(() => [
    // {
    //   accessorKey: 'select',
    //   header: () => {
    //     const all = filtered.map((r) => r.id);
    //     const allSelected = all.length > 0 && all.every((id) => selected.includes(id));
    //     const someSelected = filtered.some((r) => selected.includes(r.id));
    //     return (
    //       <Checkbox
    //         checked={allSelected}
    //         indeterminate={someSelected && !allSelected}
    //         onCheckedChange={(val) => {
    //           if (val) setSelected((p) => [...new Set([...p, ...all])]);
    //           else setSelected((p) => p.filter((id) => !all.includes(id)));
    //         }}
    //         className={`${styles.checkbox} mt-1`}
    //       />
    //     );
    //   },
    //   cell: (cell) => (
    //     <Checkbox
    //       checked={selected.includes(cell.row.original.id)}
    //       onCheckedChange={(val) => {
    //         if (val) setSelected((p) => [...p, cell.row.original.id]);
    //         else setSelected((p) => p.filter((id) => id !== cell.row.original.id));
    //       }}
    //       className={`${styles.checkbox}`}
    //     />
    //   ),
    // },
    {
      accessorKey: 'name',
      header: 'Role Name',
      cell: (cell) => <span className={styles.text}>{cell.row.original.name}</span>,
    },
    {
      accessorKey: 'view',
      header: 'View',
      cell: (cell) => (
        <div className="flex items-center">
          <div className=" rounded-md p-1 border border-transparent">
            <Checkbox checked={!!cell.row.original.permissions.view} onCheckedChange={() => togglePermission(cell.row.original.id, 'view')} className={`${styles.Rolecheckbox}`} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'create',
      header: 'Create',
      cell: (cell) => (
        <div className="flex items-center">
          <div className=" rounded-md p-1 border border-transparent">
            <Checkbox checked={!!cell.row.original.permissions.create} onCheckedChange={() => togglePermission(cell.row.original.id, 'create')} className={`${styles.Rolecheckbox}`} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'edit',
      header: 'Edit',
      cell: (cell) => (
        <div className="flex items-center">
          <div className=" rounded-md p-1 border border-transparent">
            <Checkbox checked={!!cell.row.original.permissions.edit} onCheckedChange={() => togglePermission(cell.row.original.id, 'edit')} className={`${styles.Rolecheckbox}`} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'delete',
      header: 'Delete',
      cell: (cell) => (
        <div className="flex items-center">
          <div className=" rounded-md p-1 border border-transparent">
            <Checkbox checked={!!cell.row.original.permissions.delete} onCheckedChange={() => togglePermission(cell.row.original.id, 'delete')} className={`${styles.Rolecheckbox}`} />
          </div>
        </div>
      ),
    },
    ...(canViewPermission || canEditPermission || canEditRole || canDeleteRole
      ? [
    {
      accessorKey: 'action',
      header: 'Action',
      cell: (cell) => {
        const protectedNames =  import.meta.env.VITE_DESK_CLIENT === 'true' ? ['write', 'admin', 'read','biometric'] : ['write', 'admin', 'read'];
        const roleName = cell.row.original.name || '';
        const isProtected = protectedNames.includes(String(roleName).toLowerCase());

        return (
          <div className="flex items-center gap-2 md:gap-2 2xl:gap-3">
            {canEditPermission && (
              <button onClick={() => handleEditPermissions(cell.row.original)} className="text-[#07486A] hover:text-[#07486A] cursor-pointer" aria-label="settings"><FiSettings strokeWidth={1.5} className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5" /></button>
            )}
            {canViewPermission && (
              <button onClick={() => handleViewPermissions(cell.row.original)} className="text-[#07486A] hover:text-[#07486A] cursor-pointer" aria-label="view"><FiEye strokeWidth={1.5} className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5" /></button>
            )}
            {canEditRole && !isProtected && (
              <button onClick={() => handleEditRole(cell.row.original)} className="text-[#07486A] hover:text-[#07486A] cursor-pointer" aria-label="edit"><FiEdit3 strokeWidth={1.5} className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5" /></button>
            )}
            {canDeleteRole && !isProtected && (
              <button onClick={() => handleDeleteRole(cell.row.original)} className="text-[#EF4444] hover:text-red-600 cursor-pointer" aria-label="delete"><Trash strokeWidth={1.5} size={18} className="w-4 h-4 md:w-4 md:h-4 2xl:w-[18px] 2xl:h-[18px]" /></button>
            )}
          </div>
        );
      },
    },
    ]
      : []),
  ], [roles, selected]);

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
                placeholder="Search roles..."
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-8 md:h-8 2xl:h-10 text-xs md:text-xs 2xl:text-sm"
                value={searchInput}
                onChange={handleSearchInput}
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-[#595959]" />
            </div>
            {canCreateRole && (
              <AddRoleDialog
                trigger={
                  <button
                    className="flex items-center focus:outline-none gap-1 sm:gap-2 px-2.5 py-1.5 md:px-2.5 md:py-1.5 2xl:px-3.5 2xl:py-2.5 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-xs md:text-xs 2xl:text-sm cursor-pointer"
                  >
                    <CirclePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                    <span className="md:hidden lg:inline">Add New Role</span>
                  </button>
                }
                fetchRoles={fetchRoles}
              />
            )}

            <AddRoleDialog
              editRole={editRoleData}
              onSave={handleSaveRole}
              onClose={() => setEditRoleData(null)}
              fetchRoles={fetchRoles}
            />
          </div>

          <div className="w-full overflow-x-auto">
            <PermissionTable data={roles} columns={columns} loading={rolesLoading} />
          </div>
        </div>
         <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
            
      <Dialog open={editPermissionsOpen} onOpenChange={setEditPermissionsOpen}>
        <DialogContent
          className="bg-transparent hide-scrollbar rounded-[12px] px-3 sm:px-4 md:px-4 2xl:px-6 py-3 sm:py-4 md:py-4 2xl:py-6 shadow-none w-full max-w-[98vw] sm:max-w-[95vw] md:max-w-[650px] 2xl:max-w-[750px] h-[100vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] scrollbar-hide"
          closeBtn="[_&_svg]:!size-5 md:!size-5 2xl:!size-6 [&_svg]:!w-5 md:!w-5 2xl:!w-6 [&_svg]:!h-5 md:!h-5 2xl:!h-6 sm:mt-6 mr-3 sm:mr-4"
        >
          <div className="bg-white rounded-[18px] p-3 sm:p-4 md:p-4 2xl:p-6 shadow-xl border border-gray-200 flex flex-col justify-between h-full overflow-x-hidden">
            <div>
              <DialogHeader>
                <DialogTitle className="text-sm sm:text-base md:text-lg 2xl:text-xl justify-center items-center flex font-[500] text-[#333333]">
                  {isViewMode ? 'View Permissions' : 'Permission Setting'}
                </DialogTitle>
                <DialogDescription className="text-[10px] md:text-[10px] 2xl:text-xs font-[300] text-[#9E9E9E] text-center">
                  {isViewMode ? 'View detailed permissions for the selected role.' : 'Define time-based alert behavior. Keep it simple up-front; extras appear when you enable them..'}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-white p-2 md:p-2 2xl:p-3 rounded-lg mt-3 sm:mt-4">
                <PermissionStep
                  permissions={editPermissions}
                  onChange={setEditPermissions}
                  readOnly={isViewMode}
                  roleData={editingRole?.raw}
                />
              </div>
            </div>
            <DialogFooter className="mt-4 md:mt-5 2xl:mt-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 items-center w-full gap-3 sm:gap-4">
                <div></div>
                <div className="flex flex-col mt-4 items-center justify-center">
                  <div className="py-3 md:py-3 2xl:py-4 flex justify-center gap-3 md:gap-3 2xl:gap-4">
                    <button
                      type="button"
                      className="w-28 md:w-28 2xl:w-32 py-1.5 md:py-1.5 2xl:py-2 cursor-pointer text-xs md:text-xs 2xl:text-sm rounded-md bg-[#E6E6E6] text-[#000000] font-medium"
                      onClick={handleCancelPermissions}
                    >
                      {isViewMode ? 'Close' : 'Cancel'}
                    </button>

                    {!isViewMode && (
                      <button
                        type="button"
                        className="w-28 md:w-28 2xl:w-32 py-2 md:py-2 2xl:py-3 cursor-pointer text-xs md:text-xs 2xl:text-sm rounded-md bg-[#07486A] text-white font-[500]"
                        onClick={handleSavePermissions}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
                <div></div>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
                    
      <DeleteConfirmation
        open={deleteConfirmationOpen}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${roleToDelete?.name}"? This will permanently remove the role and all its associated permissions.`}
        icon={<Trash className="w-6 h-6 text-red-500" />}
        confirmLabel="Delete Role"
        cancelLabel="Cancel"
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
      />   
    </div>
  );
};

export default RolesandPermission;