import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Search,
  CirclePlus,
  Pencil,
  Trash2,
  Mail,
  User,
  Briefcase,
  Filter,
  PencilLine,
  Trash,
  ChevronLeft,
  ChevronRight,
  Camera,
  Upload,
  FilePlus,
  LayoutGrid,
  List,
  Link as LinkIcon,
} from 'lucide-react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/Tooltip';
import { authorizedUsers, getDepartments } from '@/page/user/Dashboard/Api/get';
import VerifyUserDialog from './VerifyUserDialog';
import Pagination from '@/components/Pagination';
import useDebounce from '@/hooks/useDebounce';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import * as XLSX from 'xlsx';
import { jwtDecode } from 'jwt-decode';
import getAccessToken from '@/utils/getAccessToken';

import { toast } from 'sonner';
import RegisterForm from './RegisterForm';
import { delete_user, delete_all_users } from './Api/delete';
import ConfirmationModal from '@/page/user/Detection/components/DeleteConfirmation';
import { bulkUploadUsers, isEmpAdminApi } from './Api/post';
import { getEmployeeLocations } from '@/page/user/UserDetails/Api/Post';
import ImportEmpUsersModal from './ImortEmpUsers';
import GenerateRegLinkModal from './GenerateRegLinkModal';
import { useAuth } from '@/context/AuthContext';
import MultiSelect from '@/components/ui/multiselect';
import { UserDetailModal } from './UserDetailModal';
import { displayEmail } from '@/utils/displayEmail';

const UserCardSkeleton = () => {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center relative">
      {/* Actions Skeleton */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Skeleton circle width={32} height={32} />
        <Skeleton circle width={32} height={32} />
      </div>

      {/* Avatar Skeleton */}
      <div className="mb-6">
        <Skeleton circle width={128} height={128} />
      </div>

      {/* Divider Skeleton */}
      <div className="w-full mb-6">
        <Skeleton height={1} />
      </div>

      {/* Info Skeleton */}
      <div className="w-full space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <Skeleton circle width={20} height={20} />
              <Skeleton width={80} />
            </div>
            <Skeleton width={120} />
          </div>
        ))}
      </div>
    </div>
  );
};

const TableRowSkeleton = () => (
  <tr className="border-b border-gray-100">
    {[...Array(8)].map((_, i) => (
      <td key={i} className="px-4 py-3">
        <Skeleton height={16} />
      </td>
    ))}
  </tr>
);

const UserCard = ({ user, handleEdit, handleDelete, nasUrl, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const isVerified = !!user?.verified;
  
  const getInitialsPlaceholder = (firstName, lastName) => {
    const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
    const colors = ['#07486A', '#CFEFFF', '#E3F5FF'];
    const textColors = ['#FFFFFF', '#07486A', '#07486A'];
    const index = initials.charCodeAt(0) % colors.length;
    const svg = `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" fill="${colors[index]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="${textColors[index]}" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const handleNextImage = (e) => {
    e.stopPropagation();
    if (user.profilePics && user.profilePics.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % user.profilePics.length);
    }
  };

  const handlePrevImage = (e) => {
    e.stopPropagation();
    if (user.profilePics && user.profilePics.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + user.profilePics.length) % user.profilePics.length);
    }
  };

  const hasMultipleImages = user.profilePics && user.profilePics.length > 1;

  return (
    <div 
      onClick={() => { setSelectedUser(user); setIsUserModalOpen(true); }}
      className="bg-white rounded-2xl p-4 md:p-5 lg:p-6 shadow-sm border border-gray-100 flex flex-col items-center relative group hover:shadow-md transition-shadow cursor-pointer h-full"
    >
        {/* Verification Badge */}
        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-20">
          {isVerified ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 shadow-sm">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 shadow-sm">
              Not Verified
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="absolute top-2 right-2 flex flex-row flex-nowrap items-center gap-1 z-30">
          <input
            type="checkbox"
            checked={selectedUserIds.includes(user._id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleUserSelection(user._id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-[#07486A]"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(user);
                }}
                className="text-blue-500 hover:bg-blue-50 p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
              >
                <PencilLine className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit User</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(user._id);
                }}
                className="text-red-500 hover:bg-red-50 p-1 md:p-1.5 rounded-full transition-colors cursor-pointer"
              >
                <Trash className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete User</TooltipContent>
          </Tooltip>
        </div>

        {/* Avatar with Carousel */}
        <div className="relative mb-4 md:mb-6 flex items-center justify-center gap-2 md:gap-3 w-full">
          {hasMultipleImages && (
            <button
              onClick={handlePrevImage}
              className="flex-shrink-0 p-1 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors z-30"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden shadow-sm shrink-0 ring-4 ring-gray-50 group-hover:ring-[#CFEFFF] transition-all">
            <img
              src={
                user.profilePics && user.profilePics.length > 0
                  ? `${nasUrl}/api/v1/uploads/${user.profilePics[currentImageIndex]}`
                  : getInitialsPlaceholder(user.firstName, user.lastName)
              }
              alt={`${user.firstName} ${user.lastName}`}
              className="w-full h-full object-cover object-top"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
              }}
            />
          </div>

          {hasMultipleImages && (
            <button
              onClick={handleNextImage}
              className="flex-shrink-0 p-1 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors z-30"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-6"></div>

        {/* Info */}
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="w-5 h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-24 shrink-0 text-[11px] uppercase tracking-wider">Email</span>
            <span className="text-gray-600 truncate flex-1 text-right" title={displayEmail(user.email)}>{displayEmail(user.email)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <User className="w-5 h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-24 shrink-0 text-[11px] uppercase tracking-wider">Username</span>
            <span className="text-gray-600 truncate flex-1 text-right" title={user.userName || `${user.firstName} ${user.lastName}`}>
              {user.userName || `${user.firstName} ${user.lastName}`}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Briefcase className="w-5 h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-24 shrink-0 text-[11px] uppercase tracking-wider">Dept</span>
            <span className="text-gray-600 truncate flex-1 text-right">
              {user.departmentId?.departmentName || 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Briefcase className="w-5 h-5 text-gray-700 shrink-0" />
            <span className="font-semibold text-gray-900 w-24 shrink-0 text-[11px] uppercase tracking-wider">Location</span>
            <span className="text-gray-600 truncate flex-1 text-right">
              {user.location || 'N/A'}
            </span>
            {console.log("user location", user.location)}
          </div>
        </div>
      </div>
  );
};

/* ─────────────────────────── Table Row ─────────────────────────── */
const UserTableRow = ({ user, handleEdit, handleDelete, nasUrl, index, currentPage, limit, setSelectedUser, setIsUserModalOpen, selectedUserIds, toggleUserSelection }) => {
  const isVerified = !!user?.verified;

  const getInitialsPlaceholder = (firstName, lastName) => {
    const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
    const colors = ['#07486A', '#CFEFFF', '#E3F5FF'];
    const textColors = ['#FFFFFF', '#07486A', '#07486A'];
    const idx = initials.charCodeAt(0) % colors.length;
    const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="${colors[idx]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="${textColors[idx]}" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const avatarSrc =
    user.profilePics && user.profilePics.length > 0
      ? `${nasUrl}/api/v1/uploads/${user.profilePics[0]}`
      : getInitialsPlaceholder(user.firstName, user.lastName);

  const serialNo = (currentPage - 1) * limit + index + 1;

  return (
    <tr 
      onClick={() => { setSelectedUser(user); setIsUserModalOpen(true); }}
      className="border-b border-gray-100 hover:bg-[#F8FBFD] transition-colors group cursor-pointer"
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
            className="h-4 w-4 rounded border-gray-300 text-[#07486A]"
          />
        </td>
        <td className="px-3 py-3 text-xs text-gray-500 text-center">{serialNo}</td>
        <td className="px-3 py-3 max-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={avatarSrc}
              alt={`${user.firstName} ${user.lastName}`}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
              }}
              className="w-8 h-8 rounded-full object-cover object-top shrink-0 ring-1 ring-gray-200"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-gray-400 truncate">{user.userName || '—'}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 max-w-0">
          <span className="block text-xs text-gray-600 truncate" title={displayEmail(user.email)}>
            {displayEmail(user.email)}
          </span>
        </td>
        <td className="px-3 py-3 max-w-0">
          <span className="block text-xs text-gray-600 truncate" title={user.departmentId?.departmentName}>
            {user.departmentId?.departmentName || 'N/A'}
          </span>
        </td>
        <td className="px-3 py-3 max-w-0">
          <span className="block text-xs text-gray-600 truncate" title={user.location}>
            {user.location || '-'}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {isVerified ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">
              Not Verified
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(user); }}
                  className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-full transition-colors cursor-pointer"
                >
                  <PencilLine className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Edit User</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(user._id); }}
                  className="text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors cursor-pointer"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete User</TooltipContent>
            </Tooltip>
          </div>
        </td>
      </tr>
  );
};

/* ──────────────────────────── Main Page ──────────────────────────── */
const AddProfile = () => {
  const token = getAccessToken();
  const decodedtoken = token ? jwtDecode(token) : null;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editUser, setEditUser] = useState(null);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRegLinkModal, setShowRegLinkModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [locations, setLocations] = useState([]);
   const [departments, setDepartments] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  // Local UI state
  const [isGridView, setIsGridView] = useState(true);
  const [onLoading, setOnLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 500);

  const [limit, setLimit] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const nasUrl = import.meta.env.VITE_BACKEND;

  useEffect(() => {
    fetchUsers();
  }, [currentPage, debouncedSearch, selectedLocations, selectedDepartments, limit]);

  const loadLocations = async () => {
    try {
      const resp = await getEmployeeLocations();
      const locs = resp?.data?.body?.data?.locations || [];
      setLocations(locs.map(loc => ({ id: loc.locationName, label: loc.locationName })));
    } catch (error) {
      console.error("Error fetching locations:", error);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = {};
      if (selectedLocations.length > 0) {
        data.selectedLocations = selectedLocations;
      }
      const resp = await getDepartments(data);
      if (resp?.status === 'success') {
        const dept = resp?.data || [];
        setDepartments(dept.map(d => ({ id: d._id, label: d.departmentName })));
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [selectedLocations]); // eslint-disable-line react-hooks/exhaustive-deps


  const fetchUsers = async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * limit;
      const data = {};
      if (selectedLocations.length > 0) {
        data.locations = selectedLocations;
      }
      if (selectedDepartments.length > 0) {
        data.departmentIds = selectedDepartments;
      }
      const result = await authorizedUsers(skip, limit, debouncedSearch, data);

      if (result.body.status === 'success') {
        const count = result.body.data.totalCount || 0;
        setUsers(result.body.data.users || []);
        setTotalCount(count);
        setTotalPages(Math.ceil(count / limit));
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleEdit = (user) => {
    setEditUser(user);
  };

  const allUsersSelected = users.length > 0 && selectedUserIds.length === users.length;

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (allUsersSelected) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map((user) => user._id));
    }
  };

  const handleDelete = (userId) => {
    setDeleteTargetIds([userId]);
    setOpenDeleteConfirm(true);
  };

  const handleBulkDelete = () => {
    if (selectedUserIds.length === 0) return;
    setDeleteTargetIds(selectedUserIds);
    setOpenDeleteConfirm(true);
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
  };

  const confirmDelete = async () => {
    if (!deleteTargetIds || deleteTargetIds.length === 0) return;

    setDeleting(true);
    const deletedIds = [];
    const failedIds = [];

    for (const id of deleteTargetIds) {
      try {
        await delete_user(id);
        deletedIds.push(id);
      } catch (error) {
        console.error("Failed to delete user", id, error);
        failedIds.push(id);
      }
    }

    if (deletedIds.length > 0) {
      toast.success(
        failedIds.length === 0
          ? `Deleted ${deletedIds.length} user${deletedIds.length > 1 ? 's' : ''} successfully`
          : `Deleted ${deletedIds.length} user${deletedIds.length > 1 ? 's' : ''}, but ${failedIds.length} failed`
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
        setCurrentPage((prev) => prev - 1);
      } else {
        fetchUsers();
      }
    }

    setDeleting(false);
  };

  const [openDeleteAllConfirm, setOpenDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleDeleteAll = () => {
    setOpenDeleteAllConfirm(true);
  };

  const confirmDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await delete_all_users();
      toast.success('All authorized users deleted successfully');
      setOpenDeleteAllConfirm(false);
      setSelectedUserIds([]);
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete all users', error);
      toast.error('Failed to delete all users');
    } finally {
      setDeletingAll(false);
    }
  };

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isEmpAdmin, setIsEmpAdmin] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBulkLoading(true);
    setSelectedFileName(file.name);

    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonData.length) {
          toast.error("Excel file is empty");
          setUploadErrors([]);
          return;
        }

        const payload = { users: jsonData };

        const response = await bulkUploadUsers(payload);
        if (response?.statusCode === 200) {
          toast.success(response?.body?.message);
          setShowBulkModal(false);
          fetchUsers();
          setSelectedFileName("");
          setUploadErrors([]);
        } else {
          toast.error(response?.body?.message || "Failed to upload employees");
          if (response?.errors) {
            setUploadErrors(response?.errors);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to upload employees");
      } finally {
        setBulkLoading(false);
        e.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const { user, setUser, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (user?.user_email) {
      isEmpAdminApi({ email: user?.user_email })
        .then((res) => {
          if (res?.statusCode === 200) {
            setIsEmpAdmin(res?.body?.data?.isEmpAdmin || false);
          }
        })
        .catch((err) => {
          console.error("isEmpAdminApi Error:", err);
        });
    }
  }, [user]);

  return (
    <div className="h-full flex flex-col">
      <div className="w-full flex-1 overflow-y-auto px-2 bg-white rounded-[18px]">
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] p-2 space-y-2">

          {/* ── Top Bar ── */}
          <div className="flex flex-wrap items-center gap-2 md:gap-2 2xl:gap-3 pt-2 justify-between">

            {/* Search */}
            <div className="relative w-full md:w-48 xl:w-64">
              <Input
                type="text"
                placeholder="Search"
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-8 md:h-8 2xl:h-10 text-xs md:text-xs 2xl:text-sm"
                value={search}
                onChange={handleSearchChange}
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-[#595959]" />
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 flex-wrap">
              
              {/* Location filter */}
              <div className="w-full md:w-40 xl:w-48 mb-1  ">
                <MultiSelect
                  options={locations}
                  value={selectedLocations}
                  onChange={(val) => {
                    setSelectedLocations(val);
                    setCurrentPage(1);
                  }}
                  placeholder="select location"
                  type="location"
                  className="h-3 md:h-8 2xl:h-10"
                />
                
              </div>
                   <MultiSelect
                  options={departments}
                  value={selectedDepartments}
                  onChange={(val) => {
                    setSelectedDepartments(val);
                    setCurrentPage(1);
                  }}
                  placeholder="select department"
                  type="department"
                  className="h-3 w-60 md:h-8 2xl:h-10"
                />
              {/* ── Grid / Table Toggle ── */}
              <div className="flex items-center rounded-[8px] border border-[#C7C7C7] overflow-hidden h-8 2xl:h-10">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-[#07486A] text-white'
                          : 'bg-white text-[#595959] hover:bg-gray-50'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Grid View</TooltipContent>
                </Tooltip>
                <div className="w-px h-full bg-[#C7C7C7]" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center justify-center w-8 h-full transition-colors cursor-pointer ${
                        viewMode === 'table'
                          ? 'bg-[#07486A] text-white'
                          : 'bg-white text-[#595959] hover:bg-gray-50'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Table View</TooltipContent>
                </Tooltip>
              </div>

              {/* Import Emp Users */}
              {!decodedtoken?.memberId && (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center focus:outline-none gap-1 sm:gap-2 px-1.5 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs cursor-pointer"
                >
                  <CirclePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                  <span>Import Emp Users</span>
                </button>
              )}


              <VerifyUserDialog
                trigger={
                  <button className="flex items-center focus:outline-none gap-1 sm:gap-2 px-1.5 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs cursor-pointer">
                    <User className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                    <span>Verify User</span>
                  </button>
                }
              />

              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center focus:outline-none gap-1 sm:gap-2 px-1.5 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                <span>Register Bulk Employee</span>
              </button>

              <ImportEmpUsersModal
                open={showImportModal}
                fetchUsers={fetchUsers}
                onClose={() => setShowImportModal(false)}
                refreshLocations={loadLocations}
                refreshDepartments={loadDepartments}
              />

              <button
                onClick={() => setShowRegLinkModal(true)}
                className="flex items-center focus:outline-none gap-1 sm:gap-2 px-1.5 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs cursor-pointer"
              >
                <LinkIcon className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                <span className="md:hidden lg:flex">Generate Registration Link</span>
              </button>

              <GenerateRegLinkModal
                open={showRegLinkModal}
                onClose={() => setShowRegLinkModal(false)}
                adminId={decodedtoken?.adminId}
              />

              <RegisterForm
                fetchUsers={fetchUsers}
                editUser={editUser}
                setEditUser={setEditUser}
                locations={locations.map(loc => loc.label)}
                trigger={
                  <button className="flex items-center focus:outline-none gap-1 sm:gap-2 px-1.5 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs cursor-pointer">
                    <CirclePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                    <span className="md:hidden lg:flex">Register New Employee</span>
                  </button>
                }
              />
              {selectedUserIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className= "cursor-pointer flex items-center focus:outline-none gap-1 sm:gap-2 px-2 py-1 md:px-3 md:py-1.5 bg-red-600 text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs hover:bg-red-700"
                >
                  <Trash className="w-3.5 h-3.5" />
                  <span>Delete selected ({selectedUserIds.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDeleteAll}
                className="cursor-pointer flex items-center focus:outline-none gap-1 sm:gap-2 px-2 py-1 md:px-3 md:py-1.5 bg-red-700 text-white rounded-[8px] md:rounded-[5px] text-[10px] md:text-[10px] 2xl:text-xs hover:bg-red-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All</span>
              </button>
            </div>
          </div>

          {/* ── Bulk Upload Modal ── */}
          {showBulkModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl w-[90%] max-w-md p-6 relative shadow-xl">
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-black cursor-pointer text-lg"
                >
                  ✕
                </button>
                <h2 className="text-lg font-semibold text-center mb-4">
                  Register Bulk Employees
                </h2>
                {selectedFileName && (
                  <p className="text-sm text-gray-700 mb-3 text-center">
                    Selected File :
                    <span className="font-medium ml-1">{selectedFileName}</span>
                  </p>
                )}
                <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-8 cursor-pointer hover:border-[#07486A] transition">
                  <span className="text-sm text-gray-600 mb-1">Click to upload Excel file</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleBulkUpload}
                  />
                </label>
                {bulkLoading && (
                  <p className="text-sm text-gray-500 mt-3 text-center">Uploading...</p>
                )}
                <a
                  href="/Sample_Bulk_Employees.xlsx"
                  download
                  className="block text-center text-sm text-[#07486A] mt-3 font-medium hover:underline"
                >
                  Download Sample Excel Sheet
                </a>
                {uploadErrors.length > 0 && (
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    <p className="text-red-500 text-sm font-semibold p-2 bg-red-50 border-b">
                      {uploadErrors.length} Errors Found
                    </p>
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                          <tr>
                            <th className="border p-2 text-left">SL No</th>
                            <th className="border p-2 text-left">Row No</th>
                            <th className="border p-2 text-left">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadErrors.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="border p-2">{item.slNo}</td>
                              <td className="border p-2">{item.rowNo}</td>
                              <td className="border p-2 text-red-500 break-words">{item.error}</td>
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

          {/* ── Content Area ── */}
          {viewMode === 'grid' ? (
            /* ── Grid View ── */
            loading ? (
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {[...Array(8)].map((_, index) => (
                    <UserCardSkeleton key={index} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {users.map((user) => (
                    <UserCard
                      key={user._id}
                      user={user}
                      handleEdit={handleEdit}
                      handleDelete={handleDelete}
                      nasUrl={nasUrl}
                      selectedUserIds={selectedUserIds}
                      toggleUserSelection={toggleUserSelection}
                      setSelectedUser={setSelectedUser}
                      setIsUserModalOpen={setIsUserModalOpen}
                    />
                  ))}
                </div>
                {!loading && users.length === 0 && (
                  <div className="text-center py-12 text-gray-500">No users found.</div>
                )}
              </div>
            )
          ) : (
            /* ── Table View ── */
            <div className="w-full overflow-x-auto overflow-y-auto max-h-[70vh] rounded-xl border border-gray-100 shadow-sm mt-2">
              <table className="w-full min-w-[700px] text-left border-collapse bg-white table-fixed">
                <colgroup>
                  <col style={{width: '36px'}} />
                  <col style={{width: '48px'}} />
                  <col style={{width: '20%'}} />
                  <col style={{width: '22%'}} />
                  <col style={{width: '16%'}} />
                  <col style={{width: '13%'}} />
                  <col style={{width: '13%'}} />
                  <col style={{width: '13%'}} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#F3F6FA] text-[#07486A]">
                    <th className="px-3 py-3 text-[11px] font-semibold text-center">
                      <input
                        type="checkbox"
                        checked={allUsersSelected}
                        onChange={handleSelectAll}
                        className="mx-auto rounded border-gray-300 text-[#07486A]"
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
                    [...Array(8)].map((_, i) => <TableRowSkeleton key={i} />)
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">
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
                        nasUrl={nasUrl}
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

        {/* ── Pagination ── */}
        {users.length > 0 && (
          <div className="mt-6 grid items-center gap-4" style={{gridTemplateColumns: 'auto 1fr auto'}}>
            <div className="text-sm text-[#333333] bg-[#F5F5F5] px-2.5 py-1.5 font-normal rounded-[5px] inline-flex items-center gap-2 w-fit">
              Total users -{' '}
              <span className="text-[#07486A] font-medium bg-[#E3F5FF] px-2.5 py-1 rounded-md">
                {totalCount}
              </span>
            </div>
            <div className="flex items-center justify-center">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="flex justify-center"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs text-[#595959] whitespace-nowrap">Rows:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setCurrentPage(1); }}
                className="h-9 border border-[#C7C7C7] rounded-lg text-xs text-[#595959] bg-white px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#07486A]"
              >
                {[10, 20, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        open={openDeleteConfirm}
        title="Delete User"
        message={
          deleteTargetIds.length > 1
            ? `Are you sure you want to delete ${deleteTargetIds.length} users? This action cannot be undone.`
            : 'Are you sure you want to delete this user? This action cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onClose={() => {
          setOpenDeleteConfirm(false);
          setDeleteTargetIds([]);
        }}
        loading={deleting}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
      />

      {/* Delete All Confirmation Modal */}
      <ConfirmationModal
        open={openDeleteAllConfirm}
        title="Delete All Users"
        message="Are you sure you want to delete all authorized users? This action cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteAll}
        onClose={() => setOpenDeleteAllConfirm(false)}
        loading={deletingAll}
        confirmClass="bg-red-600 text-white hover:bg-red-700"
      />

      {/* User Detail Modal */}
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
