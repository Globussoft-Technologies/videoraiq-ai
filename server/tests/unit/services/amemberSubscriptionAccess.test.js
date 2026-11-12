import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAmemberSubscriptions } from '../../../services/amemberSubscriptionAccess.js';

afterEach(() => vi.unstubAllGlobals());
const respond = body => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
describe('background aMember access lookup', () => {
  it('uses authoritative access dates and ignores future access', async () => {
    respond({ _total: 3,
      0: { product_id: 3, expire_date: '2030-01-01' },
      1: { product_id: 3, expire_date: '2031-01-01' },
      2: { product_id: 4, begin_date: '2032-01-01', expire_date: '2033-01-01' },
    });
    expect(await loadAmemberSubscriptions('42', new Date('2030-01-02'))).toEqual({ 3: '2031-01-01' });
    const [url, options] = fetch.mock.calls[0];
    expect(url.searchParams.get('_filter[user_id]')).toBe('42');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('recognizes removed access', async () => {
    respond({ _total: 0 });
    expect(await loadAmemberSubscriptions('42')).toEqual({});
  });
  it.each([null, { _total: 2, 0: { product_id: 3, expire_date: '2030-01-01' } }, { 0: { product_id: 3, expire_date: 'bad' } }])('rejects invalid or incomplete results: %j', async body => {
    respond(body);
    await expect(loadAmemberSubscriptions('42')).rejects.toThrow();
  });
  it('reports upstream failure without including credentials or response content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadAmemberSubscriptions('42')).rejects.toThrow('aMember access lookup returned 503');
  });
});
