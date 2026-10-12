// Show only the selected movement's count; All keeps both counts and the total.
export function stockMovementColumns(columns, direction) {
  const hidden = direction === 'loading' ? ['unloadedBoxCount', 'boxCount']
    : direction === 'unloading' ? ['loadedBoxCount', 'boxCount'] : [];
  return columns.filter((column) => !hidden.includes(column.accessorKey));
}

const splitText = (brown, white, other) => [['Brown', brown], ['White', white], ['Other', other]]
  .filter(([, n]) => n > 0)
  .map(([label, n]) => `${label} ${n}`)
  .join(', ');

// "Brown 3, White 1" when DS sent the colour split (a vehicle row only when
// every event has it, see colourCounted), else the plain box type(s).
export function boxSplitLabel(item) {
  if (item?.colourCounted ?? Number.isFinite(item?.brownCount)) {
    const text = splitText(item.brownCount, item.whiteCount, item.otherCount);
    if (text) return text;
  }
  const types = Array.isArray(item?.boxTypes) ? item.boxTypes : item?.boxType ? [item.boxType] : [];
  return types.filter(Boolean).join(', ') || '--';
}

// Colour split behind a vehicle row's Loaded or Unloaded count, summed from its
// events; '' when any of those events predates the colour split.
export function directionSplitLabel(row, direction) {
  const events = (row?.events || []).filter((event) => event?.direction === direction);
  if (!events.length || !events.every((event) => Number.isFinite(event.brownCount))) return '';
  const sum = (key) => events.reduce((total, event) => total + (event[key] || 0), 0);
  return splitText(sum('brownCount'), sum('whiteCount'), sum('otherCount'));
}
