import React from 'react';
import { flexRender } from '@tanstack/react-table';

export function DesktopTableView({ table }) {
  return (
    <div className="block">
      <div className="max-w-full overflow-x-auto scroll-auto rounded-[10px]" >
        <table className="w-full min-w-[900px] ">
          <thead className="bg-gray-100  text-[#333333]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b-2 border-[#FFFFFF]">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-2 py-3 md:px-4 whitespace-nowrap md:text-[14px] text-sm font-medium text-gray-700 text-left ${
                      header.column.id === 'select'
                        ? 'sticky left-0 z-10 bg-gray-100'
                        : ''
                    }`}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y-4 divide-[#FFFFFF] text-nowrap">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="bg-[#F5F5F5] shadow-sm">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`p-2 md:p-4 text-sm ${
                      cell.column.id === 'select'
                        ? 'sticky left-0 z-10 bg-[#F5F5F5]'
                        : ''
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}