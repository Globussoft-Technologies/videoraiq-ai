import React from 'react';
import ReactDOM from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { FaRegTrashAlt } from 'react-icons/fa';


/**
 * A reusable confirmation modal for Deleting Recipients Who have added detection settings under there emails.
 * Props:
 * - open: boolean (show/hide modal)
 * - onClose: function (called on cancel/close)
 * - onConfirm: function (called on confirm)
 * - loading: boolean (optional, show spinner in confirm button)
 * - detectionData: array (optional, detection info for the table)
 */


const DeleteAddedRecipients = ({
  open,
  onClose,
  onConfirm,
  loading = false,
  data = [],
}) => {

 const tableData = React.useMemo(() => {
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((item) => ({
    name: item.fullName || 'N/A',
    email: item.type === 'email' ? item.value : '',
    phone: item.type === 'phone' ? item.value : '',
    assignedDetection: item.detectionCount || 0,
  }));
}, [data]);

const hasPhone = React.useMemo(() =>
  tableData.some((item) => item.phone?.trim() !== ''),
[tableData]);

const hasEmail = React.useMemo(() =>
  tableData.some((item) => item.email?.trim() !== ''),
[tableData]);

  
  // Table columns styled like CriticalAlerts.jsx
 const columns = React.useMemo(() => {
  const baseColumns = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="text-[#414141] text-xs font-normal">{row.original.name}</span>
      ),
    },
  ];

  if (hasEmail) {
    baseColumns.push({
      accessorKey: 'email',
      header: 'Email ID',
      cell: ({ row }) => (
        <span className="text-[#414141] text-xs font-normal">
          {row.original.email || '—'}
        </span>
      ),
    });
  } else if (hasPhone) {
    baseColumns.push({
      accessorKey: 'phone',
      header: 'Phone No',
      cell: ({ row }) => (
        <span className="text-[#414141] text-xs font-normal">
          {row.original.phone || '—'}
        </span>
      ),
    });
  }

  baseColumns.push({
    accessorKey: 'assignedDetection',
    header: 'Assigned Detection',
    cell: ({ row }) => (
      <span className="text-[#414141] text-xs font-normal">{row.original.assignedDetection}</span>
    ),
  });

  return baseColumns;
}, [hasEmail, hasPhone]);


  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center bg-black/40 p-4 transition-opacity duration-300 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl px-6 py-8 w-full max-w-2xl text-center mx-4 sm:mx-0 max-h-[90vh] overflow-y-auto transition-all duration-300 animate-fade-in-up">
        {/* Trash Icon */}
        <div className="mx-auto mb-2 bg-[#F5F5F5] p-3 sm:p-5 rounded-full w-fit">
          <FaRegTrashAlt className="h-5 w-5 sm:h-7 sm:w-7 text-[#595959] stroke-1" />
        </div>

        {/* Confirmation Text */}
        <h1 className="text-[14px] sm:text-[16px] 2xl:text-xl text-balance text-[#333333] font-[500] mb-3">
          Are you sure you want to delete <br /> this recipient?
        </h1>
        <p className="text-xs sm:text-sm text-[#333333] text-balance font-[400] mb-4 sm:mb-6">
          This recipient is currently assigned to receive alerts for the following detection:
        </p>

        {/* Detection Info Table (TanStack Table) */}
        <div className='bg-[#FAFAFA] p-2 sm:p-3 rounded-[8px] sm:rounded-[10px] mb-4 sm:mb-6 overflow-x-auto'>
          <div className="rounded-lg sm:rounded-xl text-left min-w-[600px] sm:min-w-0">
            <table className="w-full bg-[#FAFAFA]">
              <thead className="bg-[#F5F5F5] text-[#333333] border-b-2 sm:border-b-4 border-[#FAFAFA]">
                <tr>
                  {table.getAllColumns().map((column) => (
                    <th
                      key={column.id}
                      className="px-3 sm:px-6 py-3 sm:py-4 text-[11px] sm:text-xs font-medium text-[#333333] text-left whitespace-nowrap"
                    >
                      {column.columnDef.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[#F5F5F5] rounded-[10px]">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-3 sm:px-4 py-3 sm:py-4 text-center text-gray-400 text-[11px] sm:text-xs">
                      No detection assigned
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 sm:px-4 py-3 sm:py-4 font-[500] text-[11px] sm:text-sm text-[#414141] whitespace-nowrap">
                          {cell.column.columnDef.cell({ row })}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-row justify-center items-center gap-3 sm:gap-4">
          <button
            onClick={onClose}
            className="text-gray-700 cursor-pointer text-xs sm:text-sm hover:underline rounded-[32px] transition py-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="bg-[#07486A] hover:bg-[#07486A]/90 cursor-pointer text-white text-xs sm:text-sm font-medium px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-full min-w-[90px] sm:min-w-[100px] flex items-center justify-center transition"
          >
            {loading ? (
              <Loader2 className="animate-spin w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeleteAddedRecipients;