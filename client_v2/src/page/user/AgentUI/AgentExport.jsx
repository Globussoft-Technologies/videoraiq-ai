import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { runAssistantLogExport } from '@/page/user/Assistant/assistantLogExport';
import { fetchIncidents } from '@/helpers/incidents';
import { yieldToBrowser } from './downloadUtils.js';

const formatsFor = (item) => {
  const formats = Array.isArray(item?.formats) ? item.formats : [item?.format];
  return formats.map((format) => format === 'excel' ? 'xlsx' : format).filter((format) => ['csv', 'pdf', 'xlsx'].includes(format));
};

const reportDate = (value) => String(value || '').slice(0, 10);

const AGENT_EXPORT_TYPES = [
  { resource: 'crowd_detection_logs', incidentType: 'crowdDetection', title: 'Crowd Detection Report', pattern: /crowd\s*detect/i },
  { resource: 'gender_age_logs', incidentType: 'genderAgeDetection', title: 'Gender & Age Logs', pattern: /gender\s*(?:and|&)\s*age|gender[_ -]?age/i },
  { resource: 'fire_smoke_logs', incidentType: 'fireSmokeDetection', title: 'Fire & Smoke Logs', pattern: /fire\s*(?:and|&)\s*smoke|fire[_ -]?smoke/i },
  { resource: 'person_posture_logs', incidentType: 'personPostureDetection', title: 'Person Posture Logs', pattern: /person\s*posture|posture\s*logs/i },
  { resource: 'emotion_detection_logs', incidentType: 'emotionDetection', title: 'Emotion Detection Logs', pattern: /emotion\s*detect/i },
  { resource: 'uniform_detection_logs', incidentType: 'uniformDetection', title: 'Uniform Detection Logs', pattern: /uniform\s*detect/i },
  { resource: 'machine_operations_logs', incidentType: 'machineOpsDetection', title: 'Machine Operations Logs', pattern: /machine\s*oper/i },
  { resource: 'box_packing_logs', incidentType: 'boxPackingDetection', title: 'Box Packing Logs', pattern: /box\s*packing/i },
  { resource: 'stock_counting_logs', incidentType: 'loadingUnloadingStockCountingDetection', title: 'Stock Counting Logs', pattern: /stock\s*count|loading\s*\/?\s*unloading/i },
  { resource: 'blurred_camera_logs', incidentType: 'blurredCameraDetection', title: 'Blurred Camera Logs', pattern: /blurred\s*camera/i },
  { resource: 'water_spill_logs', incidentType: 'waterSpillageDetection', title: 'Water Spillage Logs', pattern: /water\s*(?:spill|spillage)/i },
  { resource: 'conveyor_logs', incidentType: 'conveyorDetection', title: 'Conveyor Detection Logs', pattern: /conveyor\s*detect/i },
  { resource: 'crusher_logs', incidentType: 'crusherDetection', title: 'Crusher Detection Logs', pattern: /crusher\s*detect/i },
  { resource: 'cylinder_logs', incidentType: 'cylinderDetection', title: 'Cylinder Stacking Detection Logs', pattern: /cylinder\s*(?:stack|detect)/i },
  { resource: 'vehicle_obstruction_logs', incidentType: 'vehicleObstruction', title: 'Vehicle & Obstruction Detection Logs', pattern: /vehicle\s*(?:and\s*)?obstruction|vehicle\s*detect/i },
  { resource: 'line_crossing_logs', incidentType: 'lineCrossing', title: 'Line Crossing Logs', pattern: /line\s*cross/i },
  { resource: 'unauthorized_access_logs', incidentType: 'unauthorizedAccess', title: 'Unauthorized Access Logs', pattern: /unauthori[sz]ed\s*access/i },
  { resource: 'person_fall_sick_logs', incidentType: 'personFallSickDetection', title: 'Person Fall/Sick Detection Logs', pattern: /person\s*(?:fall|sick)/i },
  { resource: 'unauthorized_parking_logs', incidentType: 'unauthorizedParkingDetection', title: 'Unauthorized Parking Detection Logs', pattern: /unauthori[sz]ed\s*parking/i },
  { resource: 'working_at_height_logs', incidentType: 'workingAtHeightDetection', title: 'Working at Height Detection Logs', pattern: /working\s*at\s*height/i },
  { resource: 'oil_leakage_logs', incidentType: 'oilLeakageDetection', title: 'Oil Leakage Detection Logs', pattern: /oil\s*leakage/i },
  { resource: 'equipment_oil_leakage_logs', incidentType: 'equipmentOilLeakageDetection', title: 'Equipment Oil Leakage Detection Logs', pattern: /equipment\s*oil/i },
  { resource: 'vehicle_fuel_oil_leakage_logs', incidentType: 'vehicleFuelOilLeakageDetection', title: 'Vehicle Fuel/Oil Leakage Detection Logs', pattern: /vehicle\s*fuel|fuel\s*oil/i },
  { resource: 'wrong_location_logs', incidentType: 'gunnyBagsMaterialsWrongLocationDetection', title: 'Wrong Location Detection Logs', pattern: /wrong\s*location/i },
  { resource: 'waste_disposal_logs', incidentType: 'sandDustWasteScrapDisposalDetection', title: 'Waste Disposal Detection Logs', pattern: /waste\s*(?:disposal|scrap)|sand\s*dust/i },
  { resource: 'animal_entry_logs', incidentType: 'unauthorizedAnimalEntryDetection', title: 'Unauthorized Animal Entry Logs', pattern: /animal\s*entry/i },
  { resource: 'messy_area_logs', incidentType: 'spillsDirtyMessyAreasDetection', title: 'Messy Area Detection Logs', pattern: /messy\s*area|dirty\s*area/i },
  { resource: 'door_detection_logs', incidentType: 'doorDetection', title: 'Door Logs', pattern: /door\s*detect|door\s*logs/i },
  { resource: 'person_sitting_on_can_logs', incidentType: 'personSittingOnCan', title: 'Person Sitting On Can Logs', pattern: /person\s*sitting\s*on\s*can/i },
  { resource: 'cans_stack_logs', incidentType: 'cansStackDetection', title: 'Cans Stack Detection Logs', pattern: /cans?\s*stack/i },
  { resource: 'lighting_visibility_site_conditions_logs', incidentType: 'lightingVisibilitySiteConditionsDetection', title: 'Lighting / Visibility / Site Conditions Logs', pattern: /lighting|visibility|site\s*condition/i },
  { resource: 'hygiene_food_safety_logs', incidentType: 'hygieneSanitationFoodSafetyDetection', title: 'Hygiene & Food Safety Logs', pattern: /hygiene|sanitation|food\s*safety/i },
  { resource: 'sack_loading_unloading_logs', incidentType: 'sackLoadingUnloadingDetection', title: 'Sack Loading/Unloading Logs', pattern: /sack\s*(?:loading|unloading)/i },
];

export function resolveAgentExportMeta({ resource = '', title = '', text = '' } = {}) {
  const source = `${resource} ${title} ${text}`;
  return AGENT_EXPORT_TYPES.find((item) => item.resource === resource || item.pattern.test(source)) || null;
}

export async function downloadAgentReport({ startDate, endDate, timezone = 'Asia/Kolkata', title, resource, incidentType, filters = {}, reportCacheKey } = {}, format, { onProgress } = {}) {
  const reportProgress = (progress) => onProgress?.({ ...progress, elapsedMs: progress?.elapsedMs ?? 0 });
  const meta = resolveAgentExportMeta({ resource, title });
  const selected = meta || { resource: resource || 'crowd_detection_logs', incidentType: incidentType || 'crowdDetection', title: title || 'Crowd Detection Report' };
  reportProgress({ phase: 'preparing', progress: null });
  // Dedicated incident-log endpoints return the joined camera/NVR records
  // used by the reference exports. Do not substitute the generic incidents
  // feed here, because it omits those display fields.
  if (selected.resource !== 'crowd_detection_logs') {
    return runAssistantLogExport({
      resource: selected.resource,
      startDate,
      endDate,
      timezone,
      reportCacheKey,
      title: title || selected.title,
      dateRange: { startDate, endDate, timezone },
      filters: { ...filters, incidentTypeFilter: [incidentType || selected.incidentType] },
    }, format, { onProgress: reportProgress });
  }
  const rows = [];
  let totalRecords = 0;
  // Fetch a large export page so the backend does not repeat its expensive
  // total-count aggregation once for every 500-row batch.
  const pageSize = 10000;
  const filter = {
    incidentTypeFilter: [incidentType || selected.incidentType],
    statusFilter: ['new', 'resolved', 'reported'],
    ...filters,
    startDate: reportDate(startDate),
    endDate: reportDate(endDate),
  };
  for (let skip = 0; ; skip += pageSize) {
    const page = await fetchIncidents({ skip, limit: pageSize }, filter);
    rows.push(...(page.items || []));
    totalRecords = Number(page.totalCount || totalRecords || rows.length);
    reportProgress({ phase: 'preparing', unit: 'records', loaded: rows.length, total: totalRecords, progress: totalRecords ? rows.length / totalRecords : null });
    if (!page.items?.length || rows.length >= Number(page.totalCount || rows.length)) break;
  }
  const exportRows = format === 'pdf' ? rows.slice(0, 3000) : rows;
  if (!exportRows.length) throw new Error('No matching incidents were found.');
  return runAssistantLogExport({
    resource: selected.resource,
    records: exportRows,
    totalRecords,
    startDate,
    endDate,
    timezone,
    title: title || selected.title,
    dateRange: { startDate, endDate, timezone },
    filters: filter,
  }, format, { onProgress: reportProgress });
}

export default function AgentExport({ ui, exportText = '' }) {
  const isExport = Boolean(ui && ['export', 'multi_export'].includes(ui.type));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const rawItems = ui?.type === 'multi_export' ? (ui.exports || []) : ui ? [ui] : [];
  const items = rawItems.map((item) => {
    const meta = resolveAgentExportMeta({ resource: item?.resource, title: item?.title, text: exportText });
    return meta ? { ...item, ...meta } : item;
  });

  const download = async (requestedFormat = null) => {
    if (busy || !items.length) return;
    const targets = items.flatMap((item) => formatsFor(item)
      .filter((format) => !requestedFormat || format === requestedFormat)
      .map((format) => ({ item, format })));
    if (!targets.length) return;
    setBusy(true);
    setStatus('Preparing download...');
    try {
      await yieldToBrowser();
      const results = [];
      for (let index = 0; index < targets.length; index += 1) {
        const { item, format } = targets[index];
        setStatus(`Preparing ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}...`);
        results.push(await runAssistantLogExport(item, format));
      }
      if (!results.length) throw new Error('No export format was returned.');
      setStatus('Downloaded successfully');
    } catch {
      setStatus('Download failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isExport || !ui?.autoDownload || started.current) return;
    started.current = true;
    download();
  }, [isExport, ui]);

  if (!isExport || !items.length) return null;
  const formats = [...new Set(items.flatMap(formatsFor))];

  return <div className="agent-export-card" role="group" aria-label="Report downloads">
    <div className="agent-export-actions">
      {formats.map((format) => <button key={format} type="button" disabled={busy} onClick={() => download(format)} aria-busy={busy}>{busy ? <LoaderCircle className="agent-download-spinner" size={13} /> : <Download size={13} />}{busy ? 'Downloading...' : format === 'xlsx' ? 'Excel' : format.toUpperCase()}</button>)}
    </div>
    {status && <small role="status" aria-live="polite">{busy && <LoaderCircle className="agent-download-spinner" size={12} />}{status}</small>}
  </div>;
}
