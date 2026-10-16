const KEY = 'vq_mobile_embed';
export function getMobileEmbed() {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!session || session.expiresAt <= Date.now()) return null;
    return session;
  } catch { return null; }
}
export function isMobileEmbedded() {
  if (new URLSearchParams(window.location.search).get('embedded') === '1') return true;
  try { return sessionStorage.getItem(KEY) !== null; } catch { return false; }
}
export function saveMobileEmbed(session) {
  sessionStorage.setItem(KEY, JSON.stringify({ ...session, expiresAt: Date.now() + session.expiresIn * 1000 }));
}
export function clearMobileEmbed() { sessionStorage.removeItem(KEY); }
