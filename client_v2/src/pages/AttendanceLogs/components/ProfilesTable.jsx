import React, { Fragment, useEffect, useState } from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

/**
 * Table renderer for the log pages. Theme-aware (dark/light) via CSS vars.
 * The header row always renders (even with no rows), so switching to
 * table/row view always shows the column headings.
 */
function ProfilesTable({ data, columns, loading, renderExpandedRow, headerClassName = '' }) {
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    setExpandedRows(new Set());
  }, [data]);

  const expandable = typeof renderExpandedRow === 'function';
  const rowKey = (row) =>
    row.original?.aggregationKey || row.original?._id || row.original?.id || row.id;

  const toggleExpanded = (key) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <table className="min-w-full bg-[var(--bg1solid)]">
        <thead className={`bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap ${headerClassName}`}>
          <tr className="border-b border-[var(--bd)]">
            {expandable && <th className="w-10 px-3 py-3" aria-label="Expand row" />}
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
      <thead className={`bg-[var(--bg2)] text-[var(--tx2)] whitespace-nowrap ${headerClassName}`}>
        <tr className="border-b border-[var(--bd)]">
          {expandable && <th className="w-10 px-3 py-3" aria-label="Expand row" />}
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
        {table.getRowModel().rows.map((row) => {
          const key = rowKey(row);
          const expanded = expandedRows.has(key);
          return (
            <Fragment key={key}>
              <tr className="hover:bg-[var(--bg2)]/60 transition-colors">
                {expandable && (
                  <td className="w-10 px-3 py-3.5 text-[var(--tx3)]">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(key)}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--bg3)] hover:text-[var(--tx)]"
                      aria-label={expanded ? 'Collapse vehicle events' : 'Expand vehicle events'}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </td>
                )}
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-3.5 whitespace-nowrap text-sm text-[var(--tx2)]">
                    {typeof cell.column.columnDef.cell === 'function'
                      ? cell.column.columnDef.cell(cell)
                      : cell.renderValue()}
                  </td>
                ))}
              </tr>
              {expandable && expanded && (
                <tr className="border-b border-[var(--bd)]">
                  <td colSpan={row.getVisibleCells().length + 1} className="p-0">
                    {renderExpandedRow(row.original)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default ProfilesTable;
