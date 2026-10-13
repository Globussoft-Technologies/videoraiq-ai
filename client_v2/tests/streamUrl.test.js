import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const source = await readFile(new URL('../src/lib/stream.js', import.meta.url), 'utf8');

async function resolve(channel, { local = false, host = 'https://media.example/' } = {}) {
  const module = new SourceTextModule(source);
  await module.link((specifier) => specifier.includes('getStreamHost')
    ? new SyntheticModule(['default'], function () { this.setExport('default', () => host); })
    : new SyntheticModule(['isLocalSetup'], function () { this.setExport('isLocalSetup', () => local); }));
  await module.evaluate();
  return module.namespace.streamUrl(channel);
}

test('missing API URL uses the same NVR/database camera key as preview', async () => {
  assert.equal(await resolve({ _id: 'camera-db', localChannelId: '1', nvrId: { _id: 'nvr-db' }, streamingUrl: null }),
    'https://media.example/stream/nvr-db-camera-db/playlist.m3u8');
  assert.equal(await resolve({ _id: 'camera-db', nvrId: 'nvr-db' }),
    'https://media.example/stream/nvr-db-camera-db/playlist.m3u8');
});

test('explicit API addresses retain precedence over the fallback', async () => {
  assert.equal(await resolve({ _id: 'camera', nvrId: 'nvr', streamingUrl: 'https://recorder.example/live.m3u8' }),
    'https://recorder.example/live.m3u8');
  assert.equal(await resolve({ StreamingUrl: '/stream/existing/playlist.m3u8' }),
    'https://media.example/stream/existing/playlist.m3u8');
  assert.equal(await resolve({ config: { StreamingUrl: 'stream/config/playlist.m3u8' } }),
    'https://media.example/stream/config/playlist.m3u8');
});

test('local setup and missing host preserve existing URL routing', async () => {
  const channel = { dbId: 'camera', nvrId: 'nvr' };
  assert.equal(await resolve(channel, { local: true }), '/stream/nvr-camera/playlist.m3u8');
  assert.equal(await resolve(channel, { host: '' }), 'stream/nvr-camera/playlist.m3u8');
});

test('incomplete camera identity does not invent a stream address', async () => {
  for (const channel of [undefined, {}, { _id: 'camera' }, { nvrId: 'nvr', localChannelId: '1' }, { _id: 'camera', nvrId: {} }]) {
    assert.equal(await resolve(channel), '');
  }
});
