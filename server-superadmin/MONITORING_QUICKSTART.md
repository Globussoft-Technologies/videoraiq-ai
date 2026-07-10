# Prometheus + Grafana + Loki - Quick Start

## TL;DR - Get Started in 3 Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Your App
```bash
npm run dev
```
Metrics available at: `http://localhost:5000/metrics`

### 3. Start Monitoring Stack
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Loki**: http://localhost:3100

---

## What You Can Do

### View Metrics in Grafana
1. Open http://localhost:3001
2. Login: `admin` / `admin`
3. Go to **Dashboards** → **EMP Surveillance Monitoring**
4. See request rates, latency, job queues, detection events, alerts


---

## Common Tasks

### Stop Everything
```bash
docker-compose -f docker-compose.monitoring.yml down
```

### Clean Up (Remove Data)
```bash
docker-compose -f docker-compose.monitoring.yml down -v
```

### View Container Logs
```bash
docker-compose -f docker-compose.monitoring.yml logs -f loki
docker-compose -f docker-compose.monitoring.yml logs -f grafana
```

### Check Metrics Endpoint
```bash
curl http://localhost:5000/metrics
```

### Check Prometheus is Scraping
1. Open http://localhost:9090
2. Go to **Status → Targets**
3. Look for `emp-surveillance-backend` - should be "UP"

---

## Common PromQL Queries

### Request Rate (per second)
```
rate(http_requests_total[5m])
```

### Average Response Time (milliseconds)
```
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m])) * 1000
```

### 95th Percentile Latency
```
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Error Rate
```
rate(http_requests_total{status_code=~"5.."}[5m])
```

### Job Queue Size
```
job_queue_size
```

### Detection Events Rate
```
rate(detection_events_total[5m])
```

---

## Troubleshooting

### "No data" in Grafana
1. Check app is running: `curl http://localhost:3000/metrics`
2. Check Prometheus target: http://localhost:9090/targets
3. Wait 10-15 seconds for Prometheus to scrape

### Logs not showing in Loki
1. Check Loki is running: `docker-compose -f docker-compose.monitoring.yml logs loki`
2. Enable Loki: `ENABLE_LOKI=true npm run dev`
3. Generate some logs by making API requests

### Port already in use
If port 3001 (Grafana), 9090 (Prometheus), or 3100 (Loki) is in use, modify `docker-compose.monitoring.yml` ports section.

---

## Environment Variables

```bash
# Node environment
NODE_ENV=development|production
```

---

## Full Documentation

See [MONITORING.md](MONITORING.md) for complete documentation including:
- Detailed setup instructions
- All available metrics
- Integrating custom metrics
- Production deployment
- Security considerations
- Advanced log queries
