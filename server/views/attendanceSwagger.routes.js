import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';

// Bundled alongside the existing Swagger files, including packaged on-prem builds.
export const attendanceSpec = JSON.parse(readFileSync(new URL('./attendance-openapi.json', import.meta.url), 'utf8'));

export const attendanceSwaggerOptions = {
  customSiteTitle: 'VideoraIQ Attendance Integration',
  customCss: '.swagger-ui .topbar { display: none; }',
  swaggerOptions: {
    url: './openapi.json',
    validatorUrl: null, // No requests to an internet validator in on-prem deployments.
    persistAuthorization: false,
    withCredentials: false,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
  },
};

// Keep browser code as a string: Swagger's function.toString() serialization
// can capture missing closure names after the on-prem JS obfuscation step.
export const attendanceSwaggerInit = `window.onload = function () {
  var options = ${JSON.stringify(attendanceSwaggerOptions.swaggerOptions)};
  options.dom_id = '#swagger-ui';
  options.presets = [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset];
  options.layout = 'BaseLayout';
  options.requestInterceptor = function (request) {
    request.credentials = 'omit';
    Object.keys(request.headers || {}).forEach(function (name) {
      if (['authorization', 'x-access-token'].indexOf(name.toLowerCase()) !== -1) delete request.headers[name];
    });
    return request;
  };
  window.ui = SwaggerUIBundle(options);
};`;

const router = express.Router();
// HTTP LAN IPs are supported: Helmet's default upgrade directive would force
// the locally served Swagger scripts/styles onto HTTPS on a non-localhost IP.
router.use(helmet.contentSecurityPolicy({ directives: {
  upgradeInsecureRequests: null,
  connectSrc: ["'self'", 'http:', 'https:'],
  scriptSrc: ["'self'"],
} }));
router.get('/openapi.json', (req, res) => {
  if (req.query.download === '1') res.attachment('attendance-openapi.json');
  res.json(attendanceSpec);
});
router.get('/swagger-ui-init.js', (_req, res) => res.type('application/javascript').send(attendanceSwaggerInit));
router.get('/', (req, res, next) => {
  // The UI's relative assets/spec must resolve below this mount, not /api-doc/.
  if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(302, `${req.baseUrl}/`);
  next();
});
router.use(swaggerUi.serveFiles(null, attendanceSwaggerOptions));
router.get('/', swaggerUi.setup(null, attendanceSwaggerOptions));

// The specification contains no account data/secrets. API calls still pass the
// ordinary API-key middleware; document viewing doesn't require admin Basic auth.
export default router;
