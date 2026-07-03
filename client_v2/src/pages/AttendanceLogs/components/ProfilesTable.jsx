import React from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

/**
 * Table renderer for the log pages. Theme-aware (dark/light) via CSS vars.
 * The header row always renders (even with no rows), so switching to
 * table/row view always shows the column headings.
 */
function ProfilesTable({ data, columns, loading }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <table className="min-w-full bg-[var(--bg1solid)]">
        <thead className="bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap">
          <tr className="border-b border-[var(--bd)]">
            {table.getAllColumns().map((column) => (
              <th
                key={column.id}
                className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.06em] text-[var(--tx3)] font-medium"
              style={{ fontFamily: 'var(--mono)' }}
              >
                <Skeleton width={80} height={18} baseColor="var(--bg3)" highlightColor="var(--bg2)" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bd)]">
          {Array(8)
            .fill(0)
            .map((_, idx) => (
              <tr key={idx} className="hover:bg-[var(--bg2)]/60">
                {table.getAllColumns().map((col, colIdx) => (
                  <td key={colIdx} className="px-6 py-5 whitespace-nowrap text-sm text-[var(--tx2)]">
                    <Skeleton width={colIdx === 0 ? 20 : 120} height={18} baseColor="var(--bg3)" highlightColor="var(--bg2)" />
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="min-w-full bg-[var(--bg1solid)]">
      <thead className="bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap">
        <tr className="border-b border-[var(--bd)]">
          {table.getAllColumns().map((column) => (
            <th
              key={column.id}
              className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.06em] text-[var(--tx3)] font-medium"
              style={{ fontFamily: 'var(--mono)' }}
            >
              {typeof column.columnDef.header === 'function'
                ? column.columnDef.header()
                : column.columnDef.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--bd)]">
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="hover:bg-[var(--bg2)]/60 transition-colors">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="px-5 py-3.5 whitespace-nowrap text-sm text-[var(--tx2)]">
                {typeof cell.column.columnDef.cell === 'function'
                  ? cell.column.columnDef.cell(cell)
                  : cell.renderValue()}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ProfilesTable;
