import getAccessToken from './getAccessToken';

/** Decode a JWT payload without verifying it. Verification remains server-side. */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;

    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function getAccessTokenPayload() {
  return decodeJwtPayload(getAccessToken());
}

/** Runtime deployment mode supplied by the authenticated user's JWT. */
export function isLocalSetup() {
  const value = getAccessTokenPayload()?.VITE_LOCAL_SETUP;
  return value === true || String(value).trim().toLowerCase() === 'true';
}
