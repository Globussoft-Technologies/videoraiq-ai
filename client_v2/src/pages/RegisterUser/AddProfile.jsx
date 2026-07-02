import { useEffect, useState } from 'react';
import {
  Search,
  CirclePlus,
  Trash,
  Trash2,
  Mail,
  User,
  Briefcase,
  PencilLine,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  LayoutGrid,
  List,
} from 'lucide-react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/Pagination';
import ConfirmationModal from '@/components/DeleteConfirmation';
import getAccessToken from '@/utils/getAccessToken';
import { useTheme } from '@/theme/ThemeContext';
import RegisterForm from './RegisterForm';
import VerifyUserDialog from './VerifyUserDialog';
import ImportEmpUsersModal from './ImportEmpUsers';
import { UserDetailModal } from './UserDetailModal';
import MultiSelect from './MultiSelect';
import {
  authorizedUsers,
  getFilterDepartments,
  getEmployeeLocations,
  delete_user,
  delete_all_users,
  bulkUploadUsers,
} from './Api';

const nasUrl = import.meta.env.VITE_BACKEND;

/* Decode a JWT payload without a dependency. */
const decodeJwt = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

const getInitialsPlaceholder = (firstName, lastName, size = 128) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const colors = ['#3b82f6', '#22d3ee', '#a855f7'];
  const index = initials.charCodeAt(0) % colors.length;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="${colors[index]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.38}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const StatusBadge = ({ verified }) =>
  verified ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/30">
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--crit)]/15 text-[var(--crit)] border border-[var(--crit)]/30">
      Not Verified
    </span>
  );

/* ─────────────── Card ─────────────── */
const UserCard = ({ user, handleEdit, handleDelete, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const [imgIdx, setImgIdx] = useState(0);
  const pics = user.profilePics || [];
  const many = pics.length > 1;

  return (
    <div
      onClick={() => {
        setSelectedUser(user);
        setIsUserModalOpen(true);
      }}
      className="bg-[var(--bg1solid)] rounded-2xl p-5 border border-[var(--bd)] flex flex-col items-center relative hover:shadow-md transition-shadow cursor-pointer h-full"
    >
      <div className="absolute top-3 left-3 z-20">
        <StatusBadge verified={!!user.verified} />
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1 z-30">
        <input
          type="checkbox"
          checked={selectedUserIds.includes(user._id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleUserSelection(user._id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded accent-[var(--blue)]"
        />
        <button
          title="Edit User"
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(user);
          }}
          className="text-[var(--blue)] hover:bg-[var(--blue)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
        >
          <PencilLine className="w-4 h-4" />
        </button>
        <button
          title="Delete User"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(user._id);
          }}
          className="text-[var(--crit)] hover:bg-[var(--crit)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
        >
          <Trash className="w-4 h-4" />
        </button>
      </div>

      <div className="relative mb-4 flex items-center justify-center gap-2 w-full">
        {many && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((p) => (p - 1 + pics.length) % pics.length);
            }}
            className="p-1 cursor-pointer text-[var(--tx3)] hover:text-[var(--tx)] z-30"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden shrink-0 ring-4 ring-[var(--bg2)]">
          <img
            src={pics.length > 0 ? `${nasUrl}/api/v1/uploads/${pics[imgIdx]}` : getInitialsPlaceholder(user.firstName, user.lastName)}
            alt={`${user.firstName} ${user.lastName}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
            }}
          />
        </div>
        {many && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((p) => (p + 1) % pics.length);
            }}
            className="p-1 cursor-pointer text-[var(--tx3)] hover:text-[var(--tx)] z-30"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="w-full h-px bg-[var(--bd)] mb-5" />

      <div className="w-full space-y-3.5">
        {[
          { icon: Mail, label: 'Email', value: user.email },
          { icon: User, label: 'Username', value: user.userName || `${user.firstName} ${user.lastName}` },
          { icon: Briefcase, label: 'Dept', value: user.departmentId?.departmentName || 'N/A' },
          { icon: Briefcase, label: 'Location', value: user.location || 'N/A' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <Icon className="w-5 h-5 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] w-24 shrink-0 text-[11px] uppercase tracking-wider">
              {label}
            </span>
            <span className="text-[var(--tx2)] truncate flex-1 text-right" title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─────────────── Table row ─────────────── */
const UserTableRow = ({ user, index, currentPage, limit, handleEdit, handleDelete, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const pics = user.profilePics || [];
  const avatar = pics.length > 0 ? `${nasUrl}/api/v1/uploads/${pics[0]}` : getInitialsPlaceholder(user.firstName, user.lastName, 40);

  return (
    <tr
      onClick={() => {
        setSelectedUser(user);
        setIsUserModalOpen(true);
      }}
      className="border-b border-[var(--bd)] hover:bg-[var(--bg2)] transition-colors cursor-pointer text-[var(--tx)]"
    >
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={selectedUserIds.includes(user._id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleUserSelection(user._id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded accent-[var(--blue)]"
        />
      </td>
      <td className="px-3 py-3 text-xs text-[var(--tx3)] text-center">
        {(currentPage - 1) * limit + index + 1}
      </td>
      <td className="px-3 py-3 max-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={avatar}
            alt={`${user.firstName} ${user.lastName}`}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = getInitialsPlaceholder(user.firstName, user.lastName, 40);
            }}
            className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-[var(--bd)]"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--tx)] truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[10px] text-[var(--tx3)] truncate">{user.userName || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate" title={user.email}>
          {user.email}
        </span>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate">
          {user.departmentId?.departmentName || 'N/A'}
        </span>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="block text-xs text-[var(--tx2)] truncate">{user.location || '-'}</span>
      </td>
      <td className="px-3 py-3 text-center">
        <StatusBadge verified={!!user.verified} />
      </td>
      <td className="px-3 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <button
            title="Edit User"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(user);
            }}
            className="text-[var(--blue)] hover:bg-[var(--blue)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <PencilLine className="w-4 h-4" />
          </button>
          <button
            title="Delete User"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(user._id);
            }}
            className="text-[var(--crit)] hover:bg-[var(--crit)]/10 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

/* ─────────────── Main page ─────────────── */
const AddProfile = () => {
  const { theme } = useTheme();
  const token = getAccessToken();
  const decodedtoken = token ? decodeJwt(token) : null;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(10);
  const [editUser, setEditUser] = useState(null);
  const [viewMode, setViewMode] = useState('grid');

  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);

  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [openDeleteAllConfirm, setOpenDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [uploadErrors, setUploadErrors] = useState([]);

  const [selectedUser, setSelectedUser] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const loadLocations = async () => {
    try {
      const resp = await getEmployeeLocations();
      const locs = resp?.data?.body?.data?.locations || [];
      setLocations(locs.map((loc) => ({ id: loc.locationName, label: loc.locationName })).filter((l) => l.id));
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = {};
      if (selectedLocations.length > 0) data.selectedLocations = selectedLocations;
      const resp = await getFilterDepartments(data);
      if (resp?.status === 'success') {
        const dept = resp?.data || [];
        setDepartments(dept.map((d) => ({ id: d._id, label: d.departmentName })));
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * limit;
      const data = {};
      if (selectedLocations.length > 0) data.locations = selectedLocations;
      if (selectedDepartments.length > 0) data.departmentIds = selectedDepartments;
      const result = await authorizedUsers(skip, limit, debouncedSearch, data);
      if (result?.body?.status === 'success') {
        const count = result.body.data.totalCount || 0;
        setUsers(result.body.data.users || []);
        setTotalCount(count);
        setTotalPages(Math.max(1, Math.ceil(count / limit)));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [selectedLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchUsers();
  }, [currentPage, debouncedSearch, selectedLocations, selectedDepartments, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  const allUsersSelected = users.length > 0 && users.every((u) => selectedUserIds.includes(u._id));

  const toggleUserSelection = (userId) =>
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );

  const handleSelectAll = () =>
    setSelectedUserIds(allUsersSelected ? [] : users.map((u) => u._id));

  const handleEdit = (user) => setEditUser(user);

  const handleDelete = (userId) => {
    setDeleteTargetIds([userId]);
    setOpenDeleteConfirm(true);
  };

  const handleBulkDelete = () => {
    if (selectedUserIds.length === 0) return;
    setDeleteTargetIds(selectedUserIds);
    setOpenDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetIds.length) return;
    setDeleting(true);
    const deletedIds = [];
    const failedIds = [];
    for (const id of deleteTargetIds) {
      try {
        await delete_user(id);
        deletedIds.push(id);
      } catch (error) {
        console.error('Failed to delete user', id, error);
        failedIds.push(id);
      }
    }
    if (deletedIds.length > 0) {
      toast.success(
        failedIds.length === 0
          ? `Deleted ${deletedIds.length} user${deletedIds.length > 1 ? 's' : ''} successfully`
          : `Deleted ${deletedIds.length}, but ${failedIds.length} failed`
      );
    }
    if (failedIds.length > 0 && deletedIds.length === 0) {
      toast.error(`Failed to delete ${failedIds.length} user${failedIds.length > 1 ? 's' : ''}`);
    }
    setOpenDeleteConfirm(false);
    setDeleteTargetIds([]);
    setSelectedUserIds((prev) => prev.filter((id) => !deletedIds.includes(id)));
    if (deletedIds.length > 0) {
      if (users.length === deletedIds.length && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        fetchUsers();
      }
    }
    setDeleting(false);
  };

  const confirmDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await delete_all_users();
      toast.success('All authorized users deleted successfully');
      setOpenDeleteAllConfirm(false);
      setSelectedUserIds([]);
      setCurrentPage(1);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete all users', error);
      toast.error('Failed to delete all users');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkLoading(true);
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        if (!jsonData.length) {
          toast.error('Excel file is empty');
          setUploadErrors([]);
          return;
        }
        const response = await bulkUploadUsers({ users: jsonData });
        if (response?.statusCode === 200) {
          toast.success(response?.body?.message || 'Employees uploaded successfully');
          setShowBulkModal(false);
          fetchUsers();
          setSelectedFileName('');
          setUploadErrors([]);
        } else {
          toast.error(response?.body?.message || 'Failed to upload employees');
          if (response?.errors) setUploadErrors(response.errors);
        }
      } catch (error) {
        console.error(error);
        toast.error('Failed to upload employees');
      } finally {
        setBulkLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const actionBtn =
    'flex items-center focus:outline-none gap-1.5 px-3 py-2 bg-[var(--blue)] hover:opacity-95 active:scale-95 text-white rounded-lg text-xs font-medium transition-all cursor-pointer shadow-sm shadow-[var(--blue)]/20';

  return (
    <div className="p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col p-6 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px]">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative w-full md:w-64">
            <Input
              type="text"
              placeholder="Search employees..."
              className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-40 xl:w-48">
              <MultiSelect
                options={locations}
                value={selectedLocations}
                onChange={(val) => {
                  setSelectedLocations(val);
                  setCurrentPage(1);
                }}
                placeholder="Select location"
              />
            </div>
            <div className="w-40 xl:w-48">
              <MultiSelect
                options={departments}
                value={selectedDepartments}
                onChange={(val) => {
                  setSelectedDepartments(val);
                  setCurrentPage(1);
                }}
                placeholder="Select department"
              />
            </div>

            {/* view toggle */}
            <div className="flex items-center rounded-lg border border-[var(--bd)] overflow-hidden h-10">
              <button
                title="Grid View"
                onClick={() => setViewMode('grid')}
                className={`flex items-center justify-center w-10 h-full transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-[var(--blue)] text-white' : 'bg-[var(--bg2)] text-[var(--tx2)] hover:bg-[var(--bg3)]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <div className="w-px h-full bg-[var(--bd)]" />
              <button
                title="Table View"
                onClick={() => setViewMode('table')}
                className={`flex items-center justify-center w-10 h-full transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-[var(--blue)] text-white' : 'bg-[var(--bg2)] text-[var(--tx2)] hover:bg-[var(--bg3)]'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {!decodedtoken?.memberId && (
              <button onClick={() => setShowImportModal(true)} className={actionBtn}>
                <CirclePlus className="w-4 h-4" />
                <span>Import Emp Users</span>
              </button>
            )}

            <VerifyUserDialog
              trigger={
                <button className={actionBtn}>
                  <User className="w-4 h-4" />
                  <span>Verify User</span>
                </button>
              }
            />

            <button onClick={() => setShowBulkModal(true)} className={actionBtn}>
              <FilePlus className="w-4 h-4" />
              <span>Register Bulk Employee</span>
            </button>

            <RegisterForm
              fetchUsers={fetchUsers}
              editUser={editUser}
              setEditUser={setEditUser}
              locations={locations.map((loc) => loc.label)}
              trigger={
                <button className={actionBtn}>
                  <CirclePlus className="w-4 h-4" />
                  <span>Register New Employee</span>
                </button>
              }
            />

            {selectedUserIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-[var(--crit)] hover:opacity-90 text-white rounded-lg text-xs font-medium"
              >
                <Trash className="w-4 h-4" />
                <span>Delete selected ({selectedUserIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOpenDeleteAllConfirm(true)}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-[var(--crit)] hover:opacity-90 text-white rounded-lg text-xs font-medium"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete All</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <SkeletonTheme
          baseColor={theme === 'dark' ? '#171c28' : '#e8edf5'}
          highlightColor={theme === 'dark' ? '#22283a' : '#f3f6fb'}
        >
          <div className="mt-5 flex-1">
            {viewMode === 'grid' ? (
              <div className="max-h-[65vh] overflow-y-auto vq-scroll pr-1">
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="bg-[var(--bg1solid)] rounded-2xl p-5 border border-[var(--bd)]">
                        <Skeleton circle width={96} height={96} className="mx-auto" />
                        <div className="mt-4">
                          <Skeleton count={4} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-12 text-[var(--tx3)]">No users found.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {users.map((user) => (
                      <UserCard
                        key={user._id}
                        user={user}
                        handleEdit={handleEdit}
                        handleDelete={handleDelete}
                        selectedUserIds={selectedUserIds}
                        toggleUserSelection={toggleUserSelection}
                        setSelectedUser={setSelectedUser}
                        setIsUserModalOpen={setIsUserModalOpen}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full overflow-x-auto overflow-y-auto max-h-[65vh] vq-scroll rounded-xl border border-[var(--bd)]">
                <table className="w-full min-w-[700px] text-left border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '36px' }} />
                    <col style={{ width: '48px' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[var(--bg2)] text-[var(--tx2)]">
                      <th className="px-3 py-3 text-[11px] font-semibold text-center">
                        <input
                          type="checkbox"
                          checked={allUsersSelected}
                          onChange={handleSelectAll}
                          className="accent-[var(--blue)]"
                        />
                      </th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-center">#</th>
                      <th className="px-3 py-3 text-[11px] font-semibold">Name</th>
                      <th className="px-3 py-3 text-[11px] font-semibold">Email</th>
                      <th className="px-3 py-3 text-[11px] font-semibold">Department</th>
                      <th className="px-3 py-3 text-[11px] font-semibold">Location</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-center">Status</th>
                      <th className="px-3 py-3 text-[11px] font-semibold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [...Array(8)].map((_, i) => (
                        <tr key={i} className="border-b border-[var(--bd)]">
                          {[...Array(8)].map((__, j) => (
                            <td key={j} className="px-4 py-3">
                              <Skeleton height={16} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-[var(--tx3)] text-sm">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((user, index) => (
                        <UserTableRow
                          key={user._id}
                          user={user}
                          index={index}
                          currentPage={currentPage}
                          limit={limit}
                          handleEdit={handleEdit}
                          handleDelete={handleDelete}
                          selectedUserIds={selectedUserIds}
                          toggleUserSelection={toggleUserSelection}
                          setSelectedUser={setSelectedUser}
                          setIsUserModalOpen={setIsUserModalOpen}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SkeletonTheme>

        {/* Bulk upload modal */}
        {showBulkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
            <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-xl w-[90%] max-w-md p-6 relative shadow-xl">
              <button
                onClick={() => setShowBulkModal(false)}
                className="absolute top-4 right-4 text-[var(--tx3)] hover:text-[var(--tx)] cursor-pointer text-lg"
              >
                ✕
              </button>
              <h2 className="text-lg font-semibold text-center mb-4 text-[var(--tx)]">
                Register Bulk Employees
              </h2>
              {selectedFileName && (
                <p className="text-sm text-[var(--tx2)] mb-3 text-center">
                  Selected File : <span className="font-medium ml-1">{selectedFileName}</span>
                </p>
              )}
              <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-[var(--bd2)] rounded-lg py-8 cursor-pointer hover:border-[var(--blue)] transition">
                <span className="text-sm text-[var(--tx2)] mb-1">Click to upload Excel file</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleBulkUpload} />
              </label>
              {bulkLoading && (
                <p className="text-sm text-[var(--tx3)] mt-3 text-center">Uploading...</p>
              )}
              <a
                href="/Sample_Bulk_Employees.xlsx"
                download
                className="block text-center text-sm text-[var(--blue)] mt-3 font-medium hover:underline"
              >
                Download Sample Excel Sheet
              </a>
              {uploadErrors.length > 0 && (
                <div className="mt-4 border border-[var(--bd)] rounded-lg overflow-hidden">
                  <p className="text-[var(--crit)] text-sm font-semibold p-2 bg-[var(--crit)]/10 border-b border-[var(--bd)]">
                    {uploadErrors.length} Errors Found
                  </p>
                  <div className="max-h-56 overflow-y-auto vq-scroll">
                    <table className="w-full text-sm border-collapse text-[var(--tx)]">
                      <thead className="bg-[var(--bg2)] sticky top-0">
                        <tr>
                          <th className="border border-[var(--bd)] p-2 text-left">SL No</th>
                          <th className="border border-[var(--bd)] p-2 text-left">Row No</th>
                          <th className="border border-[var(--bd)] p-2 text-left">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadErrors.map((item, index) => (
                          <tr key={index}>
                            <td className="border border-[var(--bd)] p-2">{item.slNo}</td>
                            <td className="border border-[var(--bd)] p-2">{item.rowNo}</td>
                            <td className="border border-[var(--bd)] p-2 text-[var(--crit)] break-words">
                              {item.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <ImportEmpUsersModal
          open={showImportModal}
          fetchUsers={fetchUsers}
          onClose={() => setShowImportModal(false)}
          refreshLocations={loadLocations}
          refreshDepartments={loadDepartments}
        />

        {/* Pagination */}
        {users.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[var(--bd)] grid items-center gap-4" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            <div className="text-sm text-[var(--tx2)] bg-[var(--bg2)] px-2.5 py-1.5 rounded-md inline-flex items-center gap-2 w-fit">
              Total users -
              <span className="text-[var(--blue)] font-medium bg-[var(--blue)]/10 px-2.5 py-1 rounded-md">
                {totalCount}
              </span>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="flex justify-center" />
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs text-[var(--tx3)] whitespace-nowrap">Rows:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-9 border border-[var(--bd)] rounded-lg text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
              >
                {[10, 20, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        open={openDeleteConfirm}
        title="Delete User"
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message={
          deleteTargetIds.length > 1
            ? `Are you sure you want to delete ${deleteTargetIds.length} users?`
            : 'Are you sure you want to delete this user?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onClose={() => {
          setOpenDeleteConfirm(false);
          setDeleteTargetIds([]);
        }}
        loading={deleting}
      />

      <ConfirmationModal
        open={openDeleteAllConfirm}
        title="Delete All Users"
        icon={<Trash2 className="w-7 h-7 text-[var(--crit)]" />}
        message="Are you sure you want to delete all authorized users?"
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteAll}
        onClose={() => setOpenDeleteAllConfirm(false)}
        loading={deletingAll}
      />

      {isUserModalOpen && selectedUser && (
        <UserDetailModal
          user={selectedUser}
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          nasUrl={nasUrl}
        />
      )}
    </div>
  );
};

export default AddProfile;
