import service from "./measurementLog.service.js";

class MeasurementLogController {
  /* #swagger.tags = ['Measurement Logs']
     #swagger.description = 'Mattress QC measurement records — declared vs measured L×W×H, deviation, and Pass / Mismatch / QR-error status. Filters: status, sku, station, from, to (HH:mm), q.' */
  list(req, res) { return service.list(req, res); }

  /* #swagger.tags = ['Measurement Logs']
     #swagger.description = 'KPI row + analytics cards (deviation by axis, hourly throughput/failures, mismatch rate by SKU). Same filters as list, plus fromDate/toDate (ISO); defaults to the last 24h.' */
  analytics(req, res) { return service.analytics(req, res); }

  /* #swagger.tags = ['Measurement Logs']
     #swagger.description = 'Search the "Mismatch Rate by SKU" list — q filters by SKU / model text. Same window params as analytics.' */
  mismatchBySku(req, res) { return service.mismatchBySku(req, res); }
}

export default new MeasurementLogController();
