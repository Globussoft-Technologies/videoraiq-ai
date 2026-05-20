import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Search, CirclePlus, Trash } from 'lucide-react';
import { FiEdit3 } from "react-icons/fi";
import { toast } from 'sonner';
import DeleteConfirmation from '../Detection/components/DeleteConfirmation';
import Pagination from '@/components/Pagination';
import PermissionTable from '../RolePermissions/PermissionTable';
import { fetchDepartments, deleteDepartment } from './Api';
import DepartmentForm from './DepartmentForm';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';

const styles = {
  text: 'text-[#333333] text-xs md:text-sm 2xl:text-sm font-normal',
};

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
          className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded-md"
        >
          Department Name
        </button>
      ),
      cell: ({ row }) => <span className={styles.text}>{row.original.departmentName}</span>,
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
        <div className="flex items-center gap-2 md:gap-2 2xl:gap-3">
          {canEdit && (
            <DepartmentForm
              mode="edit"
              initialValues={row.original}
              onSave={loadDepartments}
              trigger={
                <button className="text-[#07486A] hover:text-[#07486A] cursor-pointer">
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
              className="text-[#EF4444] hover:text-red-600 cursor-pointer"
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
    <div className="h-full flex flex-col">
      <div className="w-full flex-1 overflow-y-auto px-2 space-y-3 sm:space-y-4 md:space-y-4 lg:space-y-5 xl:space-y-6 2xl:space-y-8 bg-white rounded-[18px]">
        <div className="flex items-center justify-between mb-4"></div>
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-2 sm:p-3 md:p-3 lg:p-4 2xl:p-6 space-y-2 sm:space-y-3 md:space-y-3 2xl:space-y-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-2 2xl:gap-3 pt-2 justify-between">
            <div className="relative w-full md:w-[25%]">
              <Input
                type="text"
                placeholder="Search department..."
                className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-8 md:h-8 2xl:h-10 text-xs md:text-xs 2xl:text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-[#595959]" />
            </div>
            {canCreate && (
              <DepartmentForm
                mode="create"
                onSave={loadDepartments}
                trigger={
                  <button className="flex items-center focus:outline-none gap-1 sm:gap-2 px-2.5 py-1.5 md:px-2.5 md:py-1.5 2xl:px-3.5 2xl:py-2.5 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-xs md:text-xs 2xl:text-sm cursor-pointer">
                    <CirclePlus className="w-3.5 h-3.5 md:w-3.5 md:h-3.5 2xl:w-4 2xl:h-4 text-white" />
                    <span>Add New Department</span>
                  </button>
                }
              />
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <PermissionTable data={departments} columns={columns} loading={onLoading} />
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      <DeleteConfirmation
        open={showDeleteModal}
        icon={<Trash className="w-7 h-7 text-red-600" />}
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
