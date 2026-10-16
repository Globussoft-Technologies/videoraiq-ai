import { packingIncidentDetails } from './packingIncidentDetails.js';

export const PACKING_INCIDENT_EXPORT_COLUMNS = ['Box ID', 'Completed by', 'Time to complete'];

export function incidentPackingExportFields(item) {
  if (item?.incidentType !== 'boxPackingDetection') return {};
  const packing = packingIncidentDetails(item);
  return { 'Box ID': packing.boxId, 'Completed by': packing.completedBy, 'Time to complete': packing.packingTime };
}
