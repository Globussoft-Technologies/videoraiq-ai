import express from 'express';
import http from 'node:http';
import {once} from 'node:events';
import request from 'supertest';
import {it,expect} from 'vitest';
import {registerLocalHls,localHlsRelay,releaseLocalHls,bindSessionLocalHls,releaseSessionLocalHls} from '../../core/v2/xray/dev/localHlsRelay.js';
it('retains browser credentials locally while preserving exact segment bytes and sequence',async()=>{
  const seen=[];
  const origin=http.createServer((q,s)=>{
    const url=new URL(q.url,'http://localhost'); seen.push(url.searchParams.get('token'));
    if(url.pathname.endsWith('.m3u8')) s.end('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:123\n#EXTINF:2.0,\nseg_123.ts\n');
    else s.end(Buffer.from([0x47,1,2,3]));
  }).listen(0,'127.0.0.1');
  await once(origin,'listening');
  process.env.XRAY_LOCAL_TEST_MODE='true';
  process.env.XRAY_API_KEY='test-service-key';
  process.env.XRAY_LOCAL_STREAM_HOSTS='127.0.0.1:'+origin.address().port;
  let reference;
  try {
    const path=new URL(reference=registerLocalHls('http://127.0.0.1:'+origin.address().port+'/stream/camera/playlist.m3u8','browser-only-secret')).pathname;
    expect(path).not.toContain('browser-only-secret');
    const app=express();app.get('/internal/xray-test/hls/:id/:file',localHlsRelay);
    expect((await request(app).get(path)).status).toBe(401);
    const playlist=await request(app).get(path).set('X-API-Key','test-service-key');
    expect(playlist.status).toBe(200);
    expect(playlist.text).toContain('#EXT-X-MEDIA-SEQUENCE:123');
    expect(playlist.text).not.toContain('browser-only-secret');
    const ref=playlist.text.trim().split('\n').at(-1);
    const segment=await request(app).get(path.replace('playlist.m3u8',ref)).set('X-API-Key','test-service-key');
    expect(Buffer.from(segment.body)).toEqual(Buffer.from([0x47,1,2,3]));
    expect(seen).toEqual(['browser-only-secret','browser-only-secret']);
  } finally {
    releaseLocalHls(reference);
    delete process.env.XRAY_LOCAL_TEST_MODE;delete process.env.XRAY_API_KEY;delete process.env.XRAY_LOCAL_STREAM_HOSTS;
    await new Promise(r=>origin.close(r));
  }
});


it('repeated resets revoke credentials and reclaim capacity without revoking another session',async()=>{
  process.env.XRAY_LOCAL_TEST_MODE='true';
  process.env.XRAY_API_KEY='test-service-key';
  process.env.XRAY_LOCAL_STREAM_HOSTS='dev-stream.test';
  const refs=[];
  const app=express(); app.get('/internal/xray-test/hls/:id/:file',localHlsRelay);
  try {
    const stable=registerLocalHls('http://dev-stream.test/camera/playlist.m3u8','keep-local');
    refs.push(stable); bindSessionLocalHls('other-session',stable);
    for(let i=0;i<12;i++) {
      const ref=registerLocalHls('http://dev-stream.test/camera/playlist.m3u8','keep-local');
      refs.push(ref); bindSessionLocalHls('reset-'+i,ref);
      releaseSessionLocalHls('reset-'+i); releaseSessionLocalHls('reset-'+i);
      expect((await request(app).get(new URL(ref).pathname).set('X-API-Key','test-service-key')).status).toBe(404);
    }
    // The other reference still occupies its own slot; exactly seven more fit.
    for(let i=0;i<7;i++) refs.push(registerLocalHls('http://dev-stream.test/camera/playlist.m3u8','keep-local'));
    expect(()=>registerLocalHls('http://dev-stream.test/camera/playlist.m3u8','keep-local')).toThrow('capacity');
    releaseSessionLocalHls('other-session');
    refs.push(registerLocalHls('http://dev-stream.test/camera/playlist.m3u8','keep-local'));
  } finally {
    for(const ref of refs) releaseLocalHls(ref);
    delete process.env.XRAY_LOCAL_TEST_MODE; delete process.env.XRAY_API_KEY; delete process.env.XRAY_LOCAL_STREAM_HOSTS;
  }
});
