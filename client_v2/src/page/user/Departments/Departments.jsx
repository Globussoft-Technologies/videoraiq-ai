import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Search, CirclePlus, Trash } from 'lucide-react';
import { FiEdit3 } from "react-icons/fi";
import { toast } from 'sonner';
import DeleteConfirmation from '@/components/DeleteConfirmation';
import Pagination from '@/components/Pagination';
import PermissionTable from '@/components/PermissionTable';
import { fetchDepartments, deleteDepartment } from './Api';
import DepartmentForm from './DepartmentForm';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';

const styles = {
  text: 'text-[var(--tx)] text-xs md:text-sm 2xl:text-sm font-normal',
};

const AVATAR_PALETTE = [
  { bg: 'bg-[#E8ECFF]', text: 'text-[#4F5DFF]' },
  { bg: 'bg-[#FCE7F6]', text: 'text-[#D6318C]' },
  { bg: 'bg-[#E1F6FA]', text: 'text-[#0EA5B7]' },
  { bg: 'bg-[#FDE8E8]', text: 'text-[#E0524B]' },
  { bg: 'bg-[#FDF1DC]', text: 'text-[#D28A1E]' },
  { bg: 'bg-[#E4F7E9]', text: 'text-[#2FA860]' },
  { bg: 'bg-[#EDE7FE]', text: 'text-[#7C5CE0]' },
];

const avatarColor = (key) => {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const initialsOf = (name) => (String(name || '').trim().slice(0, 2).toUpperCase() || '--');

const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [onLoading, setOnLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(8);
  const [total, setTotal] = useState(0);
  const [sortOrder, setSortOrder] = useState('asc');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.departments?.view;
  const canEdit = permissions?.departments?.edit;
  const canDelete = permissions?.departments?.delete;
  const canCreate = permissions?.departments?.create;

  console.log("permissions",permissions)
  const loadDepartments = useCallback(async () => {
    setOnLoading(true);
    try {
      const skip = (currentPage - 1) * limit;
      const resp = await fetchDepartments(skip, limit, searchInput);
      if (resp?.data?.statusCode === 200) {
        const data = resp?.data?.body?.data;
        setDepartments(data.data || []);
        setTotal(data.totalCount || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch departments');
    } finally {
      setOnLoading(false);
    }
  }, [currentPage, limit, searchInput]);

  useEffect(() => {
    loadDepartments();
  }, [currentPage, sortOrder, loadDepartments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleConfirmDelete = async () => {
    try {
      const response = await deleteDepartment(deleteTarget._id);
      if (response?.data?.statusCode === 200) {
        toast.success(response?.data?.body?.message || 'Department deleted successfully');
        loadDepartments();
      }
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to delete department');
    }
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'departmentName',
      header: () => (
        <button
          onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          className="flex items-center gap-1 hover:bg-[var(--bg3)] text-[var(--tx)] px-2 py-1 rounded-md transition-colors"
        >
          Department Name
        </button>
      ),
      cell: ({ row }) => {
        const name = row.original.departmentName;
        const color = avatarColor(row.original._id || name);
        return (
          <div className="flex items-center gap-2.5">
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold shrink-0 ${color.bg} ${color.text}`}
            >
              {initialsOf(name)}
            </span>
            <span className={styles.text}>{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className={styles.text}>{row.original.description || '-'}</span>,
    },
    {
      accessorKey: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 md:gap-3">
          {canEdit && (
            <DepartmentForm
              mode="edit"
              initialValues={row.original}
              onSave={loadDepartments}
              trigger={
                <button className="text-[var(--blue)] hover:opacity-80 cursor-pointer p-1 rounded hover:bg-[var(--bg2)] transition-colors">
                  <FiEdit3 strokeWidth={1.5} className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5" />
                </button>
              }
            />
          )}
          {canDelete && (
            <button
              onClick={() => {
                setDeleteTarget(row.original);
                setShowDeleteModal(true);
              }}
              className="text-[var(--crit)] hover:opacity-80 cursor-pointer p-1 rounded hover:bg-[var(--bg2)] transition-colors"
            >
              <Trash strokeWidth={1.5} size={18} className="w-4 h-4 md:w-4 md:h-4 2xl:w-[18px] 2xl:h-[18px]" />
            </button>
          )}
        </div>
      ),
    },
  ], [canEdit, canDelete, loadDepartments]);

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col justify-between p-3 sm:p-6 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] space-y-4">
        <div className="space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative w-full md:w-[30%]">
              <Input
                type="text"
                placeholder="Search department..."
                className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
            </div>
            {canCreate && (
              <DepartmentForm
                mode="create"
                onSave={loadDepartments}
                trigger={
                  <button
                    className="flex items-center gap-2 px-4 py-2 hover:opacity-95 active:scale-95 text-white rounded-lg text-sm font-medium transition-all cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                      boxShadow: '0 4px 16px rgba(99,102,241,.28)',
                    }}
                  >
                    <CirclePlus className="w-4 h-4 text-white" />
                    <span>Add New Department</span>
                  </button>
                }
              />
            )}
          </div>

          <div className="w-full overflow-x-auto pt-2">
            <PermissionTable data={departments} columns={columns} loading={onLoading} />
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--bd)] mt-auto">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash className="w-7 h-7 text-[var(--crit)]" />}
        message={
          deleteTarget
            ? <>Are you sure you want to delete "{deleteTarget.departmentName}"?</>
            : 'Are you sure you want to delete this department?'
        }
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default memo(Departments);
