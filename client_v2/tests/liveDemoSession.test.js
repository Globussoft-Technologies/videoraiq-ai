import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLiveDemoSession, readLiveDemoSession, updateLiveDemoSession } from '../src/pages/LiveDemo/liveDemoSession.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('active Live Demo session can be updated, restored, and cleared', () => {
  const storage = memoryStorage();
  updateLiveDemoSession({ recordId: 'record-1', status: 'processing' }, storage);
  updateLiveDemoSession({ status: 'ready', videos: [{ dsVideoUrl: '/processed.mp4' }] }, storage);

  assert.deepEqual(readLiveDemoSession(storage), {
    recordId: 'record-1',
    status: 'ready',
    videos: [{ dsVideoUrl: '/processed.mp4' }],
  });

  clearLiveDemoSession(storage);
  assert.equal(readLiveDemoSession(storage), null);
});
