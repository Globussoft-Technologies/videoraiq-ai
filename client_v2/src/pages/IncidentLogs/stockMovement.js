// Show only the selected movement's count; All keeps both counts and the total.
export function stockMovementColumns(columns, direction) {
  const hidden = direction === 'loading' ? ['unloadedBoxCount', 'boxCount']
    : direction === 'unloading' ? ['loadedBoxCount', 'boxCount'] : [];
  return columns.filter((column) => !hidden.includes(column.accessorKey));
}
