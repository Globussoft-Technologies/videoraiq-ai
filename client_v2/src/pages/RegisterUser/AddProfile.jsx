import { useEffect, useState } from 'react';
import {
  Search,
  CirclePlus,
  Trash,
  Trash2,
  User,
  FilePlus,
  LayoutGrid,
  List,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
import ConfirmationModal from '@/components/DeleteConfirmation';
import getAccessToken from '@/utils/getAccessToken';
import { useTheme } from '@/theme/ThemeContext';
import RegisterForm from './RegisterForm';
import RegisterUserCard from './RegisterUserCard';
import VerifyUserDialog from './VerifyUserDialog';
import ImportEmpUsersModal from './ImportEmpUsers';
import { UserDetailModal } from './UserDetailModal';
import MultiSelect from './MultiSelect';
import UsersListView from './UsersListView';
import BulkUploadModal from './BulkUploadModal';
import UsersPagination from './UsersPagination';
import {
  authorizedUsers,
  getFilterDepartments,
  fetchDepartments,
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
  const [formDepartments, setFormDepartments] = useState([]);
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

  // Raw departments ({ _id, departmentName }) for the inline Register New User form dropdown.
  const loadFormDepartments = async () => {
    try {
      const res = await fetchDepartments(0, 100, '');
      if (res?.data?.body?.status === 'success') {
        setFormDepartments(res.data.body.data.data || []);
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
    loadFormDepartments();
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
      {/* Register New User (inline, two-step) */}
      <RegisterUserCard
        departments={formDepartments}
        locations={locations.map((loc) => loc.label)}
        onCreated={fetchUsers}
      />

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

            {/* Edit uses the existing modal register form (opens when editUser is set). */}
            <RegisterForm
              fetchUsers={fetchUsers}
              editUser={editUser}
              setEditUser={setEditUser}
              locations={locations.map((loc) => loc.label)}
              trigger={<span className="hidden" />}
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
        <UsersListView
          viewMode={viewMode}
          loading={loading}
          users={users}
          theme={theme}
          currentPage={currentPage}
          limit={limit}
          selectedUserIds={selectedUserIds}
          allUsersSelected={allUsersSelected}
          handleSelectAll={handleSelectAll}
          toggleUserSelection={toggleUserSelection}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
          setSelectedUser={setSelectedUser}
          setIsUserModalOpen={setIsUserModalOpen}
        />

        <BulkUploadModal
          open={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          selectedFileName={selectedFileName}
          bulkLoading={bulkLoading}
          uploadErrors={uploadErrors}
          onUpload={handleBulkUpload}
        />

        <ImportEmpUsersModal
          open={showImportModal}
          fetchUsers={fetchUsers}
          onClose={() => setShowImportModal(false)}
          refreshLocations={loadLocations}
          refreshDepartments={loadDepartments}
        />

        {/* Pagination */}
        <UsersPagination
          show={users.length > 0}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          limit={limit}
          onPageChange={setCurrentPage}
          onLimitChange={(val) => {
            setLimit(val);
            setCurrentPage(1);
          }}
        />
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
