import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import agentChatRoutes from '../../core/v2/agentChat/agentChat.routes.js';

const calls = [];
function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/v2/agent-chat', (req, _res, next) => { req.verified = { userData: { memberId: 'member' } }; next(); }, agentChatRoutes);
  return instance;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  calls.length = 0;
  vi.stubEnv('DETECTION_AGENT_ENABLED', 'true');
  vi.stubEnv('DETECTION_AGENT_BASE_URL', 'https://agent.test');
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/agent/sign-in')) return json({ session: 'private-session', expires_at: new Date(Date.now() + 3600000).toISOString() });
    if (url.includes('/events?')) return new Response('id: 8\nevent: tool_started\ndata: {"kind":"tool_started"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    if (url.endsWith('/preview')) return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/jpeg' } });
    return json({ conversation_id: 'conv_1', run_id: 'run_1' }, 201);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Detection Agent proxy', () => {
  it('signs in once per dashboard token and never exposes the agent session', async () => {
    const client = app();
    const first = await request(client).post('/api/v2/agent-chat/conversations').set('x-access-token', 'dashboard-a');
    const second = await request(client).get('/api/v2/agent-chat/conversations').set('x-access-token', 'dashboard-a');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(calls.filter((call) => call.url.endsWith('/agent/sign-in'))).toHaveLength(1);
    expect(calls[1].options.headers.Authorization).toBe('Bearer private-session');
    expect(JSON.stringify(first.body)).not.toContain('private-session');
  });
  it('forwards only the message contract fields', async () => {
    const result = await request(app()).post('/api/v2/agent-chat/conversations/conv_1/messages')
      .set('x-access-token', 'dashboard-b').send({ request_id: 'request1', message: 'Count incidents', adminId: 'forged' });
    expect(result.status).toBe(201);
    expect(JSON.parse(calls.at(-1).options.body)).toEqual({ request_id: 'request1', message: 'Count incidents' });
  });
  it('re-signs in once after an upstream 401', async () => {
    let signIns = 0; let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/agent/sign-in')) return json({ session: `session-${++signIns}`, expires_at: new Date(Date.now() + 3600000).toISOString() });
      reads++;
      return reads === 1 ? json({ errorCode: 'UNAUTHENTICATED' }, 401) : json({ items: [] });
    }));
    const result = await request(app()).get('/api/v2/agent-chat/conversations').set('x-access-token', 'dashboard-c');
    expect(result.status).toBe(200);
    expect(signIns).toBe(2);
  });
  it('validates and forwards an exact approval decision', async () => {
    const client = app();
    const bad = await request(client).post('/api/v2/agent-chat/actions/bad.id/decision').set('x-access-token', 'dashboard-d').send({ decision: 'approve', proposalVersion: 1, digest: 'abc' });
    expect(bad.status).toBe(400);
    const result = await request(client).post('/api/v2/agent-chat/actions/action_1/decision').set('x-access-token', 'dashboard-d')
      .send({ decision: 'approve', proposalVersion: 3, digest: 'abc', token: 'forged' });
    expect(result.status).toBe(201);
    expect(JSON.parse(calls.at(-1).options.body)).toEqual({ decision: 'approve', proposalVersion: 3, digest: 'abc' });
  });
  it('passes through the protected preview and finite event batch', async () => {
    const client = app();
    const preview = await request(client).get('/api/v2/agent-chat/actions/action_1/preview').set('x-access-token', 'dashboard-e');
    const events = await request(client).get('/api/v2/agent-chat/runs/run_1/events?after=7').set('x-access-token', 'dashboard-e');
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toContain('image/jpeg');
    expect(events.text).toContain('id: 8');
  });
});
