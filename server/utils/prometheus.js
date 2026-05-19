import promClient from 'prom-client';

// Default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics();

// Custom metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

export const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1]
});

export const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_name']
});

export const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_name']
});

export const jobQueueSize = new promClient.Gauge({
  name: 'job_queue_size',
  help: 'Current size of the job queue',
  labelNames: ['queue_name']
});

export const jobDuration = new promClient.Histogram({
  name: 'job_duration_seconds',
  help: 'Duration of background jobs in seconds',
  labelNames: ['job_name', 'status'],
  buckets: [1, 5, 10, 30, 60, 300]
});

export const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['type']
});

export const videoProcessingDuration = new promClient.Histogram({
  name: 'video_processing_duration_seconds',
  help: 'Duration of video processing in seconds',
  labelNames: ['processing_type'],
  buckets: [10, 30, 60, 120, 300, 600]
});

export const detectionEvents = new promClient.Counter({
  name: 'detection_events_total',
  help: 'Total number of detection events',
  labelNames: ['detection_type', 'channel']
});

export const incidentAlerts = new promClient.Counter({
  name: 'incident_alerts_total',
  help: 'Total number of incident alerts',
  labelNames: ['alert_type', 'severity']
});

// Export metrics endpoint handler
export const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (error) {
    res.status(500).end('Internal Server Error');
  }
};
