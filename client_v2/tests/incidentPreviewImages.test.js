import assert from 'node:assert/strict';
import test from 'node:test';
import { incidentPreviewImageUrls } from '../src/components/Playback/incidentPreviewImages.js';

const bases = {
  incidentBase: 'https://media.example/api/v2/uploads/',
  backendBase: 'https://backend.example/api/v2/',
};

test('starts with the Alerts URL and retries the existing backend uploads route', () => {
  assert.deepEqual(incidentPreviewImageUrls('v2/admin/nas/incident.jpg', bases), [
    'https://media.example/api/v2/uploads/v2/admin/nas/incident.jpg',
    'https://backend.example/api/v2/uploads/v2/admin/nas/incident.jpg',
  ]);
});

test('normalizes leading slashes while preserving legacy provider paths', () => {
  const urls = incidentPreviewImageUrls(' /bucket/uploads/images/frame.jpg ', bases);
  assert.equal(urls.at(-1), 'https://backend.example/api/v2/uploads/bucket/uploads/images/frame.jpg');
  assert.equal(urls[1], 'https://media.example/api/v2/uploads/bucket/uploads/images/frame.jpg');
});

test('avoids duplicating a full API uploads prefix', () => {
  const urls = incidentPreviewImageUrls('/api/v2/uploads/v2/admin/nas/frame.jpg', bases);
  assert.equal(urls.at(-1), 'https://backend.example/api/v2/uploads/v2/admin/nas/frame.jpg');
});

test('preserves signed, absolute, data and blob image URLs', () => {
  for (const path of ['https://storage.example/frame.jpg?sig=123', '//storage.example/frame.jpg', 'data:image/png;base64,123', 'blob:http://localhost/example']) {
    assert.deepEqual(incidentPreviewImageUrls(path, bases), [path]);
  }
});

test('retries a stored URL on the configured media host without rewriting other hosts or signatures', () => {
  const url = `${bases.incidentBase}v2/admin/nas/frame.jpg`;
  assert.deepEqual(incidentPreviewImageUrls(url, bases), [url, 'https://backend.example/api/v2/uploads/v2/admin/nas/frame.jpg']);
  assert.deepEqual(incidentPreviewImageUrls(`${url}?signature=secret`, bases), [`${url}?signature=secret`]);
});

test('works without an image base and keeps the existing media URL first', () => {
  assert.deepEqual(incidentPreviewImageUrls('frame.jpg', { backendBase: bases.backendBase, primaryUrl: '/existing/frame.jpg' }), [
    '/existing/frame.jpg', 'https://backend.example/api/v2/uploads/frame.jpg',
  ]);
});

test('missing image paths generate no requests', () => {
  for (const path of [null, undefined, '', ' ', {}]) assert.deepEqual(incidentPreviewImageUrls(path, bases), []);
});
