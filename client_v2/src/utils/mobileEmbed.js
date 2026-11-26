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

export async function verifyMobileEmbedSession(backend, token, signal) {
  const response = await fetch(`${backend}/mobile-access/session`, {
    headers: { 'x-access-token': token },
    signal,
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Mobile access verification unavailable');
  const { body } = await response.json();
  if (body?.status !== 'success' || !body.data?.user) {
    throw new Error('Invalid mobile access verification response');
  }
  return body.data.user;
}
