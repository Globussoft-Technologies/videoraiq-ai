import React from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function ProfilesTable({ data, columns, loading }) {
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
                className="px-6 py-4 text-left text-sm font-[500] text-[#333333] tracking-wider"
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
                    key={colIdx}
                    className="px-6 py-5 whitespace-nowrap text-sm text-[#333333]"
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
              className="px-6 py-4 text-left text-sm font-[500] text-[#333333] tracking-wider"
            >
              {typeof column.columnDef.header === 'function' 
                ? column.columnDef.header() 
                : column.columnDef.header}
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
                className="px-6 py-3 whitespace-nowrap text-sm text-[#414141]"
              >
                {typeof cell.column.columnDef.cell === 'function'
                  ? cell.column.columnDef.cell(cell)
                  : cell.renderValue()
                }
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ProfilesTable;