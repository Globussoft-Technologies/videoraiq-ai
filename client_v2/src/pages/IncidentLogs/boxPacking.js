// DS sends zones keyed by name; stored incidents contain a normalized array.
// Keep actual zone values, including zero, without assuming worker names/counts.
export function packingZones(zones) {
  if (Array.isArray(zones)) return zones;
  if (zones && typeof zones === 'object') return Object.entries(zones).map(([zone, values]) => ({ zone, boxNumber: values?.box_number, timeTakenSec: values?.time_taken }));
  return [];
}

export function packingSeconds(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return '--';
  return `${Number(value)} s`;
}

export const BOX_PACKING_FIELDS = [
  { key: 'boxId', label: 'Box ID', value: row => row.boxId ?? '--' },
  { key: 'completedBy', label: 'Completed by', value: row => row.completedBy ?? '--' },
  { key: 'packingZone', label: 'Zone', value: row => packingZones(row.zones).map(zone => zone.zone ?? '--').join('\n') || '--' },
  { key: 'boxNumber', label: 'Box number', value: row => packingZones(row.zones).map(zone => zone.boxNumber ?? '--').join('\n') || '--' },
  { key: 'timeTakenSec', label: 'Time taken', value: row => packingZones(row.zones).map(zone => packingSeconds(zone.timeTakenSec)).join('\n') || '--' },
  { key: 'endTimeSource', label: 'End time source', value: row => row.endTimeSource ?? '--' },
  { key: 'detectedVia', label: 'Detected via', value: row => row.detectedVia ?? '--' },
  { key: 'confirmationReason', label: 'Confirmation reason', value: row => row.confirmationReason ?? '--' },
];

export const packingExportValues = row => Object.fromEntries(BOX_PACKING_FIELDS.map(field => [field.key, field.value(row)]));
