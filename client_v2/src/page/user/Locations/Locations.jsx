import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Search, CirclePlus, Trash, ArrowUp, ArrowDown } from 'lucide-react';
import { FiEdit3 } from "react-icons/fi";
import { toast } from 'sonner';
import DeleteConfirmation from '@/components/DeleteConfirmation';
import Pagination from '@/components/Pagination';
import PermissionTable from '@/components/PermissionTable';
import { fetchLocations, deleteLocation } from './Api';
import LocationForm from './LocationForm';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/context/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';

const styles = {
  text: 'text-[var(--tx)] text-xs md:text-sm 2xl:text-sm font-normal',
};

const Locations = () => {
  const [locations, setLocations] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [onLoading, setOnLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(8);
  const [total, setTotal] = useState(0);
  const [sortOrder, setSortOrder] = useState('asc');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { permissions, loading: permissionsLoading } = usePermissions();
  console.log(permissions,"permissions")
  const canView = permissions?.locations?.view;
  const canEdit = permissions?.locations?.edit;
  const canDelete = permissions?.locations?.delete;
  const canCreate = permissions?.locations?.create;
  
  const loadLocations = useCallback(async (page = currentPage, search = searchInput) => {
    setOnLoading(true);
    try {
      const skip = (page - 1) * limit;
      const resp = await fetchLocations(skip, limit, search);
      if (resp?.data?.statusCode === 200) {
        const data = resp?.data?.body?.data;
        setLocations(data.locations || []);
        setTotal(data.totalCount || 0);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch locations');
    } finally {
      setOnLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadLocations(currentPage, searchInput);
  }, [currentPage, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        loadLocations(1, searchInput);
      } else {
        setCurrentPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleConfirmDelete = async () => {
    try {
      const response = await deleteLocation(deleteTarget._id);
      if (response?.data?.statusCode === 200) {
        toast.success(response?.data?.body?.message || 'Location deleted successfully');
        loadLocations();
      }
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Failed to delete location');
    }
  };

  const columns = useMemo(() => [
     {
      accessorKey: 'empLocationId',
      header: 'Employee Location ID',
      cell: ({ row }) => <span className={styles.text}>{row.original.empLocationId || '-'}</span>,
    },
    {
      accessorKey: 'locationName',
      header: () => (
        <button
          onClick={() => {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          }}
          className="flex items-center gap-1 hover:bg-[var(--bg3)] text-[var(--tx)] px-2 py-1 rounded-md transition-colors"
        >
          Location Name
        </button>
      ),
      cell: ({ row }) => <span className={styles.text}>{row.original.locationName}</span>,
    },
   
    {
      accessorKey: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <div className="flex items-center gap-2 md:gap-3">
          {canEdit && (
            <LocationForm
              mode="edit"
              initialValues={row.original}
              onSave={loadLocations}
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
  ], [canEdit, canDelete, loadLocations]);

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col justify-between p-6 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] space-y-4">
        <div className="space-y-4 flex-1">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="relative w-full md:w-[30%]">
              <Input
                type="text"
                placeholder="Search location..."
                className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
            </div>
            {canCreate && (
              <LocationForm
                mode="create"
                onSave={loadLocations}
                trigger={
                  <button
                    className="flex items-center gap-2 px-4 py-2 hover:opacity-95 active:scale-95 text-white rounded-lg text-sm font-medium transition-all cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                      boxShadow: '0 4px 16px rgba(99,102,241,.28)',
                    }}
                  >
                    <CirclePlus className="w-4 h-4 text-white" />
                    <span>Add New Location</span>
                  </button>
                }
              />
            )}
          </div>

          {canView && (
            <div className="w-full overflow-x-auto pt-2">
              <PermissionTable data={locations} columns={columns} loading={onLoading} />
            </div>
          )}
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
            ? (
                <>
                  Are you sure you want to delete "{deleteTarget.locationName}"?{' '}
                  <strong className="text-[var(--crit)]">Default location will be assigned to users and NVR's</strong>
                </>
              )
            : 'Are you sure you want to delete this location?'
        }
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
};

export default memo(Locations);