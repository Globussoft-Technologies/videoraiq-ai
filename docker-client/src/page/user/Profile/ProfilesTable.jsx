import React from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
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
}

export default ProfilesTable;