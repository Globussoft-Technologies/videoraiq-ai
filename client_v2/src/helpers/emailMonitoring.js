function buildBaseUrl() {
  const explicit = import.meta.env.VITE_EMAIL_MONITORING_API;
  if (explicit) return explicit.replace(/\/$/, '');

  const backend = (import.meta.env.VITE_BACKEND || '').replace(/\/$/, '');
  if (!backend) return '/api/v2/email-monitoring';
  if (/\/api\/v2$/i.test(backend)) return `${backend}/email-monitoring`;
  if (/\/api\/v1$/i.test(backend)) return `${backend.replace(/\/api\/v1$/i, '/api/v2')}/email-monitoring`;
  return `${backend}/api/v2/email-monitoring`;
}

const BASE_URL = buildBaseUrl();
const TOKEN_KEY = 'emailMonitoringToken';

export class EmailMonitoringAuthError extends Error {
  constructor(message = 'Email monitoring session expired') {
    super(message);
    this.name = 'EmailMonitoringAuthError';
  }
}

export function getEmailMonitoringToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setEmailMonitoringToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function logoutEmailMonitoring() {
  localStorage.removeItem(TOKEN_KEY);
}

function unwrap(data) {
  return data?.body?.data ?? data?.data ?? data?.body ?? data;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function emailMonitoringFetch(path, options = {}) {
  const token = getEmailMonitoringToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await readJson(res);
  if (res.status === 401) {
    logoutEmailMonitoring();
    throw new EmailMonitoringAuthError();
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.body?.message || data?.error || 'Email monitoring request failed');
  }
  return unwrap(data);
}

export async function loginEmailMonitoring(username, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(data?.message || data?.body?.message || data?.error || 'Login failed');
  }

  const payload = unwrap(data);
  const token = payload?.token || data?.token;
  if (!token) throw new Error('Login succeeded but no email monitoring token was returned');
  setEmailMonitoringToken(token);
  return payload;
}

export function getEmailMonitoringMe() {
  return emailMonitoringFetch('/auth/me');
}

export function getEmailMonitoringOrganizations() {
  return emailMonitoringFetch('/organizations');
}

export function getEmailMonitoringDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  return emailMonitoringFetch(`/dashboard${query ? `?${query}` : ''}`);
}

export function getEmailMonitoringActivity(params = {}) {
  const query = new URLSearchParams(params).toString();
  return emailMonitoringFetch(`/activity${query ? `?${query}` : ''}`);
}
