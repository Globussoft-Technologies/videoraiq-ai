import express from 'express';
import request from 'supertest';
import { describe, it, expect, afterEach } from 'vitest';
import { localTestGuard, localSessionCollection } from '../../core/v2/xray/dev/localTestSafety.js';
afterEach(() => { delete process.env.XRAY_LOCAL_TEST_MODE; delete process.env.XRAY_LOCAL_SESSION_COLLECTION; });
const app = () => { const a=express(); a.use(localTestGuard); a.use((_q,s)=>s.sendStatus(204)); return a; };
describe('local X-Ray test against shared dev data',()=>{
 it('leaves existing mutations untouched when disabled',async()=>{
  expect((await request(app()).delete('/api/v2/nvr/abc')).status).toBe(204);
 });
 it('refuses camera edits and legacy destructive GETs, permits viewing',async()=>{
  process.env.XRAY_LOCAL_TEST_MODE='true';
  expect((await request(app()).put('/api/v2/channel/abc')).status).toBe(403);
  expect((await request(app()).get('/api/v2/nvr/delete-all')).status).toBe(403);
  expect((await request(app()).get('/api/v2/channel/all-channels')).status).toBe(204);
 });
 it('permits login, prompt, heartbeat and teardown',async()=>{
  process.env.XRAY_LOCAL_TEST_MODE='true';
  for(const p of ['/api/v2/auth/by-login-pass','/api/v2/xray/sessions/abc/prompt','/api/v2/xray/sessions/abc/heartbeat']) {
   expect((await request(app()).post(p)).status).toBe(204);
  }
  expect((await request(app()).delete('/api/v2/xray/sessions/abc')).status).toBe(204);
 });
 it('fails closed on a missing or shared collection override',()=>{
  process.env.XRAY_LOCAL_TEST_MODE='true';
  expect(()=>localSessionCollection()).toThrow();
  process.env.XRAY_LOCAL_SESSION_COLLECTION='xraysessions';
  expect(()=>localSessionCollection()).toThrow();
  process.env.XRAY_LOCAL_SESSION_COLLECTION='xray_controlled_laptop';
  expect(localSessionCollection()).toBe('xray_controlled_laptop');
 });
});
