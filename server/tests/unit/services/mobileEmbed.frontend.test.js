import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getMobileEmbed, saveMobileEmbed, clearMobileEmbed, isMobileEmbedded } from '../../../../client_v2/src/utils/mobileEmbed.js';
import getAccessToken from '../../../../client_v2/src/utils/getAccessToken.js';

beforeEach(() => {
  const entries = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  });
  vi.stubGlobal('window', { location: { search: '' } });
  vi.stubGlobal('document', { cookie: 'access-token=normal-browser-token; dev-access-token=normal-browser-token; prod-access-token=normal-browser-token' });
});
afterEach(() => vi.unstubAllGlobals());

describe('isolated mobile web credentials', () => {
  it('keeps the normal cookie-backed login unchanged outside embedded mode', () => {
    expect(isMobileEmbedded()).toBe(false);
    expect(getAccessToken()).toBe('normal-browser-token');
  });
  it('uses only a tab-local derived token without changing browser cookies', () => {
    const cookies = document.cookie;
    saveMobileEmbed({ token: 'derived-token', expiresIn: 600, screen: { webPath: '/logs/attendance' } });
    expect(isMobileEmbedded()).toBe(true);
    expect(getMobileEmbed().token).toBe('derived-token');
    expect(getAccessToken()).toBe('derived-token');
    expect(document.cookie).toBe(cookies);
  });
  it('never falls back to a normal browser token for an expired embedded session', () => {
    saveMobileEmbed({ token: 'expired', expiresIn: -1 });
    expect(isMobileEmbedded()).toBe(true);
    expect(getAccessToken()).toBeNull();
  });
  it('does not use a browser cookie when an embedded page has no session', () => {
    window.location.search = '?embedded=1';
    expect(getAccessToken()).toBeNull();
  });
  it('clears only the embedded record, preserving browser cookies', () => {
    saveMobileEmbed({ token: 'derived', expiresIn: 600 });
    clearMobileEmbed();
    expect(getMobileEmbed()).toBeNull();
    expect(getAccessToken()).toBe('normal-browser-token');
  });
});
