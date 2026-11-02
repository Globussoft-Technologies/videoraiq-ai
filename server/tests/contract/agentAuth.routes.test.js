import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import config from 'config';
import routes from '../../core/v2/agentChat/agentAuth.routes.js';

const secret = config.get('jwt.secretKey');
const app = express();
app.use(express.json());
app.use('/api/v2/agent-auth', (req, _res, next) => {
  req.verified = { userData: { adminId: '507f1f77bcf86cd799439011', memberId: '507f1f77bcf86cd799439012', timezone: 'Asia/Kolkata' } };
  next();
}, routes);
afterEach(() => vi.unstubAllEnvs());

describe('agent delegated token', () => {
  it('returns a distinct, scoped token no longer lived than the dashboard token', async () => {
    vi.stubEnv('DETECTION_AGENT_WRITES_ENABLED', 'false');
    const dashboard = jwt.sign({ adminId: '507f1f77bcf86cd799439011', memberId: '507f1f77bcf86cd799439012' }, secret, { expiresIn: 900 });
    const result = await request(app).post('/api/v2/agent-auth/token').set('x-access-token', dashboard).send({ scopes: ['read', 'prepare'] });
    expect(result.status).toBe(200);
    const data = result.body.body.data;
    expect(data.agentToken).not.toBe(dashboard);
    expect(data.scopes).toEqual(['read']);
    expect(data.tenantId).toBe('507f1f77bcf86cd799439011');
    expect(data.timezone).toBe('Asia/Kolkata');
    expect(jwt.verify(data.agentToken, secret).exp).toBeLessThanOrEqual(jwt.decode(dashboard).exp);
  });
  it('does not mint another delegated token', async () => {
    const token = jwt.sign({ adminId: '507f1f77bcf86cd799439011', tokenType: 'detection-agent', scopes: ['read'] }, secret, { expiresIn: 900 });
    const result = await request(app).post('/api/v2/agent-auth/token').set('x-access-token', token).send({ scopes: ['read'] });
    expect(result.status).toBe(401);
  });
});
