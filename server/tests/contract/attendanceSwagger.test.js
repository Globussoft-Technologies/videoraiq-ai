import { describe, it, expect } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import attendanceSwaggerRouter, { attendanceSpec, attendanceSwaggerOptions, attendanceSwaggerInit } from '../../views/attendanceSwagger.routes.js';
import { keyAllows } from '../../core/v2/apiKeys/apiKey.policy.js';

const makeApp = () => {
  const app = express();
  app.use(helmet());
  app.use('/api-doc/attendance', attendanceSwaggerRouter);
  // Match server.js's following legacy router: the new mount must finish its
  // own requests before a legacy docs login could intercept them.
  app.use('/api-doc', (_req, res) => res.status(401).send('Legacy Swagger login'));
  return app;
};

describe('on-prem attendance Swagger contract', () => {
  it('documents all guide endpoints using only API-key authentication', () => {
    expect(attendanceSpec.openapi).toBe('3.0.3');
    expect(attendanceSpec.security).toEqual([{ AdminApiKey: [] }]);
    expect(attendanceSpec.components.securitySchemes).toEqual({ AdminApiKey: expect.objectContaining({ type: 'apiKey', in: 'header', name: 'x-api-key' }) });
    const doc = readFileSync(new URL('../../../docs/attendance-api-key-integration.md', import.meta.url), 'utf8');
    const endpoints = [...doc.matchAll(/\| (POST|GET) \| `([^`]+)`/g)];
    expect(endpoints).toHaveLength(9);
    for (const [, method, guidePath] of endpoints) {
      const path = guidePath.replace('<stored-media-path>', '{mediaPath}');
      expect(attendanceSpec.paths[path]?.[method.toLowerCase()], `${method} ${path}`).toBeDefined();
    }
    const operations = Object.values(attendanceSpec.paths).flatMap(path => Object.values(path));
    expect(new Set(operations.map(op => op.operationId)).size).toBe(9);
    expect(attendanceSpec.paths['/attendance/settings']).not.toHaveProperty('put');
    expect(operations.every(op => op.responses['401'] && op.responses['403'])).toBe(true);
    const file = JSON.stringify(attendanceSpec);
    expect(file).not.toMatch(/vrq_[A-Za-z0-9_-]{43}/);
    expect(file).not.toContain('Bearer <JWT>');
  });

  it('uses only the current installation IP/port without editable server variables', () => {
    expect(attendanceSpec.servers).toHaveLength(1);
    expect(attendanceSpec.servers[0].url).toBe('/api/v2');
    expect(new URL(attendanceSpec.servers[0].url, 'http://192.168.1.100:5055/api-doc/attendance/').href).toBe('http://192.168.1.100:5055/api/v2');
    expect(new URL(attendanceSpec.servers[0].url, 'http://10.0.0.8:5000/api-doc/attendance/').href).toBe('http://10.0.0.8:5000/api/v2');
    expect(attendanceSpec.servers[0]).not.toHaveProperty('variables');
  });

  it('resolves every internal reference and requires all path parameters', () => {
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) {
        expect(value.$ref.startsWith('#/')).toBe(true);
        const resolved = value.$ref.slice(2).split('/').reduce((current, key) => current?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], attendanceSpec);
        expect(resolved, value.$ref).toBeDefined();
      }
      Object.values(value).forEach(visit);
    };
    visit(attendanceSpec);
    for (const [path, methods] of Object.entries(attendanceSpec.paths)) {
      for (const method of Object.values(methods)) {
        for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
          expect(method.parameters.some(param => param.name === name && param.in === 'path' && param.required)).toBe(true);
        }
      }
    }
  });

  it('allows read-only keys for every documented operation', () => {
    for (const [path, methods] of Object.entries(attendanceSpec.paths)) {
      for (const method of Object.keys(methods)) {
        const url = `/api/v2${path.replace('{mediaPath}', 'example.jpg')}`;
        expect(keyAllows({ scopes: ['*'], access: 'read' }, method.toUpperCase(), url), `${method} ${path}`).toBe(true);
        expect(keyAllows({ scopes: ['*'], access: 'full' }, method.toUpperCase(), url)).toBe(true);
      }
    }
    const exportFlag = attendanceSpec.paths['/attendance/export'].post.parameters.find(param => param.name === 'export');
    expect(exportFlag.required).toBe(true); expect(exportFlag.schema.default).toBe(true);
    expect(attendanceSpec.paths['/attendance/export'].post.responses['200'].content).toHaveProperty('application/json');
    expect(attendanceSpec.components.parameters.DepartmentIds.schema).toEqual({ $ref: '#/components/schemas/MongoId' });
    // Shared ID examples prefill optional Swagger filters with nonexistent resources.
    expect(attendanceSpec.components.schemas.MongoId).not.toHaveProperty('example');
    expect(attendanceSpec.components.schemas.MongoId).not.toHaveProperty('default');
    for (const name of ['NvrId', 'ChannelId', 'DepartmentIds']) {
      const parameter = attendanceSpec.components.parameters[name];
      expect(parameter.required).not.toBe(true);
      expect(parameter).not.toHaveProperty('example');
      expect(parameter.description).toContain('Leave blank');
    }
  });

  it('serves the UI, JSON download and bundled assets without a second login', async () => {
    const app = makeApp();
    await request(app).get('/api-doc/attendance').expect(302).expect('Location', '/api-doc/attendance/');
    const ui = await request(app).get('/api-doc/attendance/').expect(200).expect('Content-Type', /html/);
    expect(ui.text).toContain('VideoraIQ Attendance Integration');
    expect(ui.text).toContain('./swagger-ui-bundle.js');
    expect(ui.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(ui.headers['content-security-policy']).toContain("script-src 'self'");
    expect(ui.headers['www-authenticate']).toBeUndefined();
    const spec = await request(app).get('/api-doc/attendance/openapi.json').expect(200).expect('Content-Type', /json/);
    expect(spec.body).toEqual(attendanceSpec);
    const download = await request(app).get('/api-doc/attendance/openapi.json?download=1').expect(200);
    expect(download.headers['content-disposition']).toContain('attendance-openapi.json');
    const init = await request(app).get('/api-doc/attendance/swagger-ui-init.js').expect(200);
    expect(init.text).toContain('./openapi.json');
    expect(init.text).toContain('request.credentials');
    await request(app).get('/api-doc/attendance/swagger-ui.css').expect(200).expect('Content-Type', /css/);
    await request(app).get('/api-doc/attendance/swagger-ui-bundle.js').expect(200).expect('Content-Type', /javascript/);
    await request(app).get('/api-doc/v2').expect(401);
  });

  it('uses no external validator or persisted secret and removes conflicting credentials', () => {
    const options = attendanceSwaggerOptions.swaggerOptions;
    expect(options.validatorUrl).toBeNull(); expect(options.persistAuthorization).toBe(false);
    const req = { headers: { Authorization: 'Basic example', 'X-Access-Token': 'old-session', 'x-api-key': 'fixture-key', Accept: 'application/json' } };
    let renderedOptions;
    const bundle = settings => { renderedOptions = settings; return {}; };
    bundle.presets = { apis: {} };
    const browser = { window: {}, SwaggerUIBundle: bundle, SwaggerUIStandalonePreset: {} };
    runInNewContext(attendanceSwaggerInit, browser);
    browser.window.onload();
    expect(renderedOptions.url).toBe('./openapi.json');
    expect(renderedOptions.requestInterceptor(req)).toEqual({ credentials: 'omit', headers: { 'x-api-key': 'fixture-key', Accept: 'application/json' } });
  });
});
