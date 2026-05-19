# Prometheus & Grafana Monitoring Setup

This guide explains how to set up and use Prometheus and Grafana for monitoring the EMP Surveillance Backend.

## Overview

- **Prometheus**: Time-series database that collects metrics from your application
- **Grafana**: Visualization tool that displays Prometheus metrics in dashboards
- **prom-client**: Node.js Prometheus client library for exposing application metrics

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed locally
- Ports available: 5000 (Express), 9090 (Prometheus), 3001 (Grafana)

## Quick Start - Local Development

### 1. Install Dependencies

```bash
npm install
```

This installs `prom-client` which is already added to `package.json`.

### 2. Start the Application

```bash
# In one terminal, start the Express server with metrics enabled
npm run dev

# Or use the production setup
npm start
```

Your application metrics will be available at: `http://localhost:5000/metrics`

### 3. Start Prometheus & Grafana

```bash
# From the server directory
docker-compose -f docker-compose.monitoring.yml up -d
```

This starts:
- **Prometheus** at `http://localhost:9090`
- **Grafana** at `http://localhost:3001`
- **Node Exporter** at `http://localhost:9100` (system metrics)

### 4. Verify Setup

#### Check Prometheus:
1. Open `http://localhost:9090`
2. Go to **Status > Targets**
3. You should see `emp-surveillance-backend` with state "UP"

#### Check Grafana:
1. Open `http://localhost:3001`
2. Login with credentials:
   - **Username**: `admin`
   - **Password**: `admin`
3. Navigate to **Dashboards** > **EMP Surveillance Monitoring**

## Available Metrics

### HTTP Request Metrics
- `http_requests_total` - Total HTTP requests by method, route, and status code
- `http_request_duration_seconds` - Request latency (p50, p95, p99 percentiles)

### Database Metrics
- `db_query_duration_seconds` - Query latency by operation and collection
- `cache_hits_total` / `cache_misses_total` - Cache performance

### Job Queue Metrics
- `job_queue_size` - Current size of background job queues
- `job_duration_seconds` - Job execution time by job name and status

### Application-Specific Metrics
- `video_processing_duration_seconds` - Video processing execution time
- `detection_events_total` - Detection events by type and channel
- `incident_alerts_total` - Incident alerts by type and severity
- `active_connections` - Active WebSocket/Socket.io connections

## Using the Dashboard

The pre-configured dashboard includes:

1. **HTTP Request Rate** - Requests per second over time
2. **HTTP Request Duration** - p95 and p99 latency percentiles
3. **Job Queue Size** - Background job queue depth
4. **Detection Events Rate** - Detection events per second
5. **Incident Alerts Rate** - Alerts generated per second

You can:
- Edit panels by clicking the dropdown menu in each card
- Create new dashboards by going to **Dashboard > Create > Dashboard**
- Add more visualizations using PromQL queries

## Common PromQL Queries

### Request Rate
```
rate(http_requests_total[5m])
```

### Error Rate
```
rate(http_requests_total{status_code=~"5.."}[5m])
```

### Average Response Time
```
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))
```

### Job Queue Depth
```
job_queue_size
```

### Cache Hit Ratio
```
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))
```

## Integrating Custom Metrics

To add custom metrics to your application:

```javascript
import {
  httpRequestDuration,
  detectionEvents,
  videoProcessingDuration,
  incidentAlerts
} from './utils/prometheus.js';

// Record a detection event
detectionEvents.inc({ 
  detection_type: 'person', 
  channel: 'camera_1' 
});

// Record video processing time
const timer = videoProcessingDuration.startTimer();
// ... do processing ...
timer({ processing_type: 'encoding' });

// Record incident alert
incidentAlerts.inc({ 
  alert_type: 'unauthorized_access', 
  severity: 'high' 
});
```

## Production Deployment

### Using Docker

```bash
docker-compose -f docker-compose.monitoring.yml -f docker-compose.yml up -d
```

### Environment Variables

Configure the monitoring stack via environment:

**Grafana**
```env
GF_SECURITY_ADMIN_PASSWORD=your_secure_password
GF_SECURITY_ADMIN_USER=admin
GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-simple-json-datasource
```

### Storage Configuration

**Prometheus** in `config/prometheus.yml`:
- **Retention**: 30 days (configurable via `--storage.tsdb.retention.time`)
- **Data location**: `/prometheus` volume

### Security Notes

1. Change Grafana default password in production
2. Use reverse proxy (nginx) to expose metrics endpoint only to trusted IPs
3. Enable authentication in Prometheus (use reverse proxy)
4. Regular backups of Grafana dashboards and Prometheus data

## Troubleshooting

### Prometheus can't reach the app
```bash
# Check if app is running on port 5000
curl http://localhost:5000/metrics

# Check Prometheus configuration
cat config/prometheus.yml
```

### Grafana shows "No data"
1. Check Prometheus is running: `http://localhost:9090`
2. Verify metrics are being scraped: **Status > Targets**
3. Manually query: `http_requests_total` in Prometheus

### Docker containers won't start
```bash
# Check logs
docker-compose -f docker-compose.monitoring.yml logs prometheus
docker-compose -f docker-compose.monitoring.yml logs grafana

# Clean up and restart
docker-compose -f docker-compose.monitoring.yml down -v
docker-compose -f docker-compose.monitoring.yml up
```

## Stopping the Stack

```bash
# Stop without removing data
docker-compose -f docker-compose.monitoring.yml stop

# Stop and remove everything
docker-compose -f docker-compose.monitoring.yml down

# Stop and remove data volumes
docker-compose -f docker-compose.monitoring.yml down -v
```

## Files Overview

### Monitoring Stack
- `docker-compose.monitoring.yml` - Docker Compose with Prometheus, Grafana, and Node Exporter
- `config/prometheus.yml` - Prometheus scrape configuration

### Metrics
- `utils/prometheus.js` - Metric definitions and handlers
- `middlewares/prometheusMiddleware.js` - Express middleware to track HTTP metrics
- `utils/metricsHelper.js` - Helper functions to easily record custom metrics

### Grafana Configuration
- `config/grafana/provisioning/datasources/` - Prometheus datasource
- `config/grafana/provisioning/dashboards/` - Pre-configured dashboards

### Documentation
- `MONITORING.md` - This comprehensive guide

## Next Steps

1. Run the application with monitoring enabled
2. Generate some traffic to see metrics flowing in
3. Customize dashboards to your needs
4. Set up alerting rules (optional)
5. Integrate with your CI/CD pipeline for automated deployments

## More Information

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client GitHub](https://github.com/siimon/prom-client)
