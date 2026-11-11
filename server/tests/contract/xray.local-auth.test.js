import express from 'express';
import request from 'supertest';
import {afterEach,it,expect} from 'vitest';
import v2ErrorContract from '../../middlewares/v2ErrorContract.js';
import {localTestGuard} from '../../core/v2/xray/dev/localTestSafety.js';
afterEach(()=>delete process.env.XRAY_LOCAL_TEST_MODE);
const upstream={ok:false,authenticated:true,code:-6,reason:'subscription_expired',msg:'Your subscription has expired'};
const app=()=>{const a=express();a.use(localTestGuard);a.use(v2ErrorContract);a.post('/api/v2/auth/by-login-pass',(_q,s)=>s.status(403).json(upstream));return a;};
it('keeps a real authentication refusal intact for local login diagnostics',async()=>{
 process.env.XRAY_LOCAL_TEST_MODE='true';
 const response=await request(app()).post('/api/v2/auth/by-login-pass');
 expect(response.status).toBe(403);expect(response.body).toEqual(upstream);
});
it('retains the normal deployment error contract when test mode is off',async()=>{
 const response=await request(app()).post('/api/v2/auth/by-login-pass');
 expect(response.status).toBe(403);expect(response.body.body.errorCode).toBe('ACCESS_DENIED');
});
