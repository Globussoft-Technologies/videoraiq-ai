import {
  dbQueryDuration,
  cacheHits,
  cacheMisses,
  jobDuration,
  activeConnections,
  videoProcessingDuration,
  detectionEvents,
  incidentAlerts
} from './prometheus.js';

// Database query timing
export const recordDbQuery = (operation, collection, durationMs) => {
  dbQueryDuration.observe(
    { operation, collection },
    durationMs / 1000
  );
};

// Cache operations
export const recordCacheHit = (cacheName) => {
  cacheHits.inc({ cache_name: cacheName });
};

export const recordCacheMiss = (cacheName) => {
  cacheMisses.inc({ cache_name: cacheName });
};

// Background job tracking
export const recordJobCompletion = (jobName, durationMs, status = 'success') => {
  jobDuration.observe(
    { job_name: jobName, status },
    durationMs / 1000
  );
};

// Connection tracking
export const updateActiveConnections = (type, count) => {
  activeConnections.set({ type }, count);
};

// Video processing
export const recordVideoProcessing = (processingType, durationMs) => {
  videoProcessingDuration.observe(
    { processing_type: processingType },
    durationMs / 1000
  );
};

// Detection events
export const recordDetectionEvent = (detectionType, channel) => {
  detectionEvents.inc({ detection_type: detectionType, channel });
};

// Incident alerts
export const recordIncidentAlert = (alertType, severity) => {
  incidentAlerts.inc({ alert_type: alertType, severity });
};

// Timer helper for synchronous code
export class MetricsTimer {
  constructor(metricRecord) {
    this.startTime = Date.now();
    this.metricRecord = metricRecord;
  }

  end(labels) {
    const duration = Date.now() - this.startTime;
    this.metricRecord(labels, duration);
  }
}

// Timer helper for async code
export async function recordAsyncMetric(asyncFn, metricRecord, labels) {
  const startTime = Date.now();
  try {
    return await asyncFn();
  } finally {
    const duration = Date.now() - this.startTime;
    metricRecord(labels, duration);
  }
}
