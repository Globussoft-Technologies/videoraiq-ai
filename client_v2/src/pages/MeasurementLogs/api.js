import api, { unwrap } from '@/helpers/client';

const BASE = '/measurement-logs';

/**
 * Fetch mattress QC measurement records. Server derives Pass / Mismatch /
 * QR-error from the raw `measurement_incidents` status + per-axis deviation
 * and returns rows already in the table's shape.
 */
export async function getMeasurementRecords(params = {}) {
  const res = await api.get(BASE, { params });
  const data = unwrap(res) || {};
  return {
    rows: data.rows ?? [],
    total: data.total ?? 0,
    stats: data.stats ?? null,
    skus: data.skus ?? [],
    stations: data.stations ?? [],
  };
}

/**
 * KPI row + the three analytics cards (deviation by axis, hourly throughput /
 * failures, mismatch rate by SKU). Same filters as getMeasurementRecords,
 * plus optional fromDate / toDate (ISO). Defaults server-side to the last 24h.
 */
export async function getMeasurementAnalytics(params = {}) {
  const res = await api.get(`${BASE}/analytics`, { params });
  const data = unwrap(res) || {};
  return {
    window: data.window ?? null,
    kpis: data.kpis ?? null,
    deviationByAxis: data.deviationByAxis ?? [],
    throughput: data.throughput ?? [],
    throughputUnit: data.throughputUnit ?? 'hour',
    mismatchBySku: data.mismatchBySku ?? [],
  };
}

/**
 * Server-side search for the "Mismatch Rate by SKU" modal.
 * `q` filters by SKU / model text; `fromDate` / `toDate` (ISO) scope the window
 * (defaults server-side to the last 24h, matching the analytics card).
 */
export async function searchMismatchBySku(params = {}) {
  const res = await api.get(`${BASE}/mismatch-by-sku`, { params });
  const data = unwrap(res) || {};
  return {
    rows: data.rows ?? [],
    total: data.total ?? (data.rows ?? []).length,
    q: data.q ?? '',
  };
}
