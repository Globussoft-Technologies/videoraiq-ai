import { httpRequestDuration, httpRequestTotal } from '../utils/prometheus.js';

export const prometheusMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
    httpRequestTotal.inc({ method, route, status_code: statusCode });
  });

  next();
};
