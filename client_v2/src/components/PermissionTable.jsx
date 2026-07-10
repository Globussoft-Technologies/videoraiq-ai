import React from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function PermissionTable({ data, columns, loading }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  console.log("columns", columns);
  console.log("data", data);

  // Common wrapper class
  const tableWrapperClass = "min-w-full border-collapse text-left";

  // ✅ 1. Loading Skeleton
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)]">
        <table className={tableWrapperClass}>
          <thead className="bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap">
            <tr className="border-b border-[var(--bd)]">
              {table.getAllColumns().map((column) => (
                <th 
                  key={column.id}
                  className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium tracking-wider"
                >
                  <Skeleton 
                    width={80} 
                    height={18} 
                    baseColor="var(--bg3)" 
                    highlightColor="var(--bg2)" 
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--bd)]">
            {Array(8)
              .fill(0)
              .map((_, idx) => (
                <tr key={idx} className="hover:bg-[var(--bg2)]/50 transition-colors">
                  {table.getAllColumns().map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm"
                    >
                      <Skeleton 
                        width={colIdx === 0 ? 30 : 120} 
                        height={18} 
                        baseColor="var(--bg3)" 
                        highlightColor="var(--bg2)"
                      />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ✅ 2. No Data Condition
  if (!data || data.length === 0) {
    return (
      <div className="overflow-x-auto rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)]">
        <table className={tableWrapperClass}>
          <thead className="bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap">
            <tr className="border-b border-[var(--bd)]">
              {columns.map((col) => (
                <th
                  key={col.accessorKey || col.id}
                  className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium tracking-wider"
                >
                  {typeof col.header === "function" ? col.header() : col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-10 text-[var(--tx3)] text-sm"
              >
                No data available
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ✅ 3. Table With Data
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)]">
      <table className={tableWrapperClass}>
        <thead className="bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap">
          <tr className="border-b border-[var(--bd)]">
            {table.getAllColumns().map((column) => (
              <th
                key={column.id}
                className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium tracking-wider text-[var(--tx)]"
              >
                {typeof column.columnDef.header === "function"
                  ? column.columnDef.header()
                  : column.columnDef.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bd)] text-[var(--tx2)]">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-[var(--bg2)]/60 transition-colors">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 sm:px-6 py-3 sm:py-3.5 whitespace-nowrap text-sm"
                >
                  {typeof cell.column.columnDef.cell === "function"
                    ? cell.column.columnDef.cell(cell)
                    : cell.renderValue()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PermissionTable;
