import React, { useState, useEffect, memo } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import Pagination from '@/components/Pagination';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { FaRegTrashAlt } from 'react-icons/fa';
import AddStorageModal from './AddStorageModal';
import { getAllStorageDetails } from './Api/get';
import { deleteStorage } from './Api/delete';
import { toast } from 'sonner';
import ConfirmationModal from '../../Detection/components/DeleteConfirmation';
import { CirclePlus, Edit, Server, ServerCog, ServerOff, Trash2 } from 'lucide-react';
import { TbServerSpark } from "react-icons/tb";
import { updateStorageStatus } from './Api/put';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
const StorageSettings = () => {
  const [tableData, setTableData] = useState([]);
  const [fullStorageData, setFullStorageData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [storageToEdit, setStorageToEdit] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [storageToDelete, setStorageToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [ArchiveModelOpen, setArchiveModelOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const limit = 7;

  const selectedStorage = Array.isArray(fullStorageData)
  ? fullStorageData.find((s) => s._id === storageToDelete)
  : null;

  const fetchStorageDetails = async () => {
    setLoading(true);
    try {
      const response = await getAllStorageDetails();
     
      const apiData = Array.isArray(response?.data?.body?.data?.storages)
  ? response?.data?.body?.data?.storages
  : [];

      setFullStorageData(apiData);
      // const totalItems = apiData.length;
      // setTotalPages(Math.ceil(totalItems / limit));


         const totalItems = apiData.length;
     const pages = Math.max(1, Math.ceil(totalItems / limit));
    setTotalPages(pages);
      const storageTypeMap = {
        google_drive_oauth: 'Google Drive',
        s3: 'Amazon S3',
        sftp: 'SFTP',
      };

      const mappedData = apiData.map((item) => {
        const typeKey = item.type || item.storageType;
        let data = {
          id: item._id,
          storageName:
            item.name || storageTypeMap[typeKey] || typeKey || 'Unknown',
          storageType: typeKey,
          createdAt: item.createdAt,
          status: item.active ? 'Active' : 'Not active',
          note: item.isValid ? 'Valid' : 'Invalid',
          action: item.active ? 'Active' : 'Inactive',
          fullData: item,
        };
        return data;
      });

      setTableData(mappedData);
      // setTotalPages(Math.ceil(mappedData.length / limit));
     
    } catch (error) {
      console.error('Storage fetch error:', error);
      setTableData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageDetails();
  }, []);

  useEffect(() => {
     if (!Array.isArray(fullStorageData) || fullStorageData.length === 0) {
    setTableData([]);
    return;
  }

    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;

    const storageTypeMap = {
      google_drive_oauth: 'Google Drive',
      s3: 'Amazon S3',
      sftp: 'SFTP',
    };
    const mappedData = fullStorageData.map((item) => {
      const typeKey = item.type || item.storageType;
      return {
        id: item._id,
        storageName:
          item.name || storageTypeMap[typeKey] || typeKey || 'Unknown',
        storageType: typeKey,
        createdAt: item.createdAt,
        status: item.active ? 'Active' : 'Not active',
        note: item.note ? item.note : '-',
        action: item.active ? 'Active' : 'Inactive',
        fullData: item,
      };
    });
    const paginated = mappedData.slice(startIndex, endIndex);
    setTableData(paginated);
  }, [currentPage, fullStorageData]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleDeleteClick = (storageId) => {
    setStorageToDelete(storageId);
    setDeleteModalOpen(true);
  };
  const confirmDelete = async () => {
    if (!storageToDelete) return;
    let response;
    let updatedData;
    setIsDeleting(true);
    try {
      response = await deleteStorage(storageToDelete);

      if (response?.data?.statusCode == 200) {
        toast.success(response?.data?.body?.message || '');
        updatedData = fullStorageData.filter(
          (item) => item._id !== storageToDelete
        );
        setFullStorageData(updatedData);
      } else if (response?.data?.statusCode == 400) {
        toast.error(
          response?.data?.body?.message ||
            'Something went wrong while deleting storage'
        );
      }
      if (
        updatedData.length > 0 &&
        updatedData.length % limit === 0 &&
        currentPage > 1
      ) {
        setCurrentPage((prev) => prev - 1);
      }
    } catch (error) {
      console.error('Error deleting storage:', error);
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setStorageToDelete(null);
    }
  };

  const handleEditStorage = (storageId) => {
    const storage = fullStorageData.find((s) => s._id === storageId);
    if (storage) {
      setStorageToEdit(storage);
      setIsModalOpen(true);
    }
  };

  const confirmActivate = async (storageId) => {
    if (!storageId) return;

    try {
      setIsActivating(true);

      const storage = fullStorageData.find((s) => s._id === storageId);

      const response = await updateStorageStatus(storageId, !storage?.active);

      if (response?.data?.statusCode === 200) {
        fetchStorageDetails();
        toast.success(response?.data?.body?.message || '');
      } else if (response?.data?.statusCode === 400) {
        toast.error(
          response?.data?.body.message ||
            'Something went wrong while activating storage'
        );
      }
    } catch (error) {
      console.error('Error updating storage status:', error);
    } finally {
      setIsActivating(false);
      setArchiveModelOpen(false);
      setStorageToDelete(null);
    }
  };

  const handleNewStorage = () => {
    fetchStorageDetails();
  };

  const styles = {
    text: 'text-[#333333] text-xs font-[500]',
    statusBadge: (status) =>
      `px-2 py-1 rounded-[8px] text-[10px] md:text-xs font-medium whitespace-nowrap ${
        status === 'Active'
          ? 'text-[#338904] bg-[#E8FFDB]'
          : 'text-[#CE241C] bg-[#FFDBD9]'
      }`,
  };

  const columns = [
    {
      accessorKey: 'storageName',
      header: 'Storage Name',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original.storageName}</span>
      ),
    },
    {
      accessorKey: 'storageType',
      header: 'Storage Type',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original.storageType}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: ({ row }) => {
        const date = new Date(row.original.createdAt);
        const formattedDate = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return <span className={styles.text}>{formattedDate}</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={styles.statusBadge(row.original.status)}>
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: 'note',
      header: 'Note',
      cell: ({ row }) => (
        <span className={styles.text}>{row.original.note}</span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`p-1 rounded-[4px] cursor-pointer transition-colors ${
                  row.original.status === 'Active'
                    ? 'bg-white hover:bg-red-100'
                    : 'bg-white hover:bg-green-100'
                }`}
                onClick={() => {
                  setStorageToDelete(row.original.id);
                  setArchiveModelOpen(true);
                }}
                disabled={isActivating}
              >
                {row.original.status === 'Active' ? (
                  <ServerOff className="w-4 h-4 text-[#333333]" />
                ) : (
                  <Server className="w-4 h-4 text-[#333333]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {row.original.status === 'Active' ? 'Deactivate' : 'Activate'}
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-1 bg-white hover:bg-gray-100 rounded-[4px] cursor-pointer"
                onClick={() => handleEditStorage(row.original.id)}
                disabled={isDeleting}
              >
                <Edit className="w-4 h-4 text-[#333333]" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit Storage</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-1 bg-white hover:bg-red-100 rounded-[4px] cursor-pointer"
                onClick={() => handleDeleteClick(row.original.id)}
                disabled={isDeleting}
              >
                <FaRegTrashAlt className="w-4 h-4 text-[#C41717]" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete Storage</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  const StorageTable = memo(({ data, columns, loading }) => {
    const table = useReactTable({
      data,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    if (loading) {
      return (
        <table className="min-w-full bg-[#FAFAFA]">
          <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
            <tr className="border-b-2 border-[#FFFFFF]">
              {table.getAllColumns().map((column) => (
                <th
                  key={column.id}
                  className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-left text-xs sm:text-sm font-[500] text-[#333333] tracking-wider"
                >
                  <Skeleton width={80} height={18} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-4 divide-[#FFFFFF]">
            {Array(8)
              .fill(0)
              .map((_, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {table.getAllColumns().map((col, colIdx) => (
                    <td
                      key={col.id ?? colIdx}
                      className="px-4 md:px-6 py-4 md:py-5 whitespace-nowrap text-sm text-[#333333]"
                    >
                      <Skeleton width={colIdx === 0 ? 20 : 120} height={18} />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="min-w-full bg-[#FAFAFA]">
        <thead className="bg-[#F5F5F5] text-[#333333] whitespace-nowrap">
          <tr className="border-b-2 border-[#FFFFFF]">
            {table.getAllColumns().map((column) => (
              <th
                key={column.id}
                className="px-4 md:px-6 py-4 text-left text-sm font-[500] text-[#333333] tracking-wider"
              >
                {flexRender(column.columnDef.header, { column, header: column, table: table })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#F5F5F5] rounded-[10px] divide-y-4 divide-[#FFFFFF]">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-xs sm:text-sm text-[#414141]"
                >
                  {flexRender(cell.column.columnDef.cell, { cell, column: cell.column, row: cell.row, table: table })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  });
  return (
    <div className="h-full flex flex-col">

      <div className="w-full flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
        <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-2 sm:p-3 md:p-4 lg:p-6 space-y-2 sm:space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="w-full md:w-auto md:ml-auto">
              <div className="flex items-center gap-2 sm:gap-3">
                <AddStorageModal
                  trigger={(
                    <button
                      className="flex items-center focus:outline-none gap-1 sm:gap-2 px-3 py-2 bg-[#07486A] text-white rounded-[8px] md:rounded-[5px] text-sm cursor-pointer"
                      aria-label="Add Storage"
                    >
                      <TbServerSpark className="w-5 h-5 text-white" />
                      <span className="md:hidden lg:inline">Add Storage</span>
                    </button>
                  )}
                  onStorageSelect={handleNewStorage}
                />
              </div>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <StorageTable
              data={tableData}
              columns={columns}
              loading={loading}
            />
            {tableData.length === 0 && !loading && (
              <div className="text-center py-4 text-gray-500">
                No storage found
              </div>
            )}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      {storageToEdit && (
        <AddStorageModal
          trigger={null}
          editData={storageToEdit}
          isOpen={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            if (!open) setStorageToEdit(null);
          }}
          onStorageSelect={handleNewStorage}
        />
      )}

      <ConfirmationModal
        open={deleteModalOpen}
        message="Are you sure you want to delete this storage.? "
        icon={<FaRegTrashAlt className="w-6 h-6 text-red-600" />}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        confirmClass="bg-[#07486A] text-white hover:bg-[#063B4D]"
        loading={isDeleting}
      />
<ConfirmationModal
  open={ArchiveModelOpen}
  message={
    selectedStorage?.active
      ? 'Are you sure you want to deactivate this storage?'
      : 'Are you sure you want to activate this storage?'
  }
  icon={
    <Server
      className={`w-6 h-6 ${
        selectedStorage?.active ? 'text-red-600' : 'text-green-600'
      }`}
    />
  }
  confirmLabel={
    isActivating
      ? selectedStorage?.active
        ? 'Deactivating...'
        : 'Activating...'
      : selectedStorage?.active
      ? 'Deactivate'
      : 'Activate'
  }
  title={
    selectedStorage?.active ? 'Confirm Deactivate' : 'Confirm Activate'
  }
  onClose={() => {
    setArchiveModelOpen(false);
    setStorageToDelete(null);
  }}
  onConfirm={() => confirmActivate(storageToDelete)}
  confirmClass="bg-[#07486A] text-white hover:bg-[#063B4D]"
  loading={isActivating}
/>

    </div>
  );
};

export default StorageSettings;
