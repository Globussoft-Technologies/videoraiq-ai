import { api } from '@/helpers/client';

const backend = String(import.meta.env.VITE_BACKEND || '').replace(/\/+$/, '');
const base = /\/api\/v2$/i.test(backend) ? '/agent-chat' : '/api/v2/agent-chat';
const endpoint = (path = '') => `${base}${path}`;
const data = (response) => response.data;

export const agentApi = {
  list: () => api.get(endpoint('/conversations')).then(data),
  create: () => api.post(endpoint('/conversations')).then(data),
  get: (id) => api.get(endpoint(`/conversations/${encodeURIComponent(id)}`)).then(data),
  remove: (id) => api.delete(endpoint(`/conversations/${encodeURIComponent(id)}`)).then(data),
  send: (id, message, requestId) => api.post(endpoint(`/conversations/${encodeURIComponent(id)}/messages`), { request_id: requestId, message }).then(data),
  run: (id) => api.get(endpoint(`/runs/${encodeURIComponent(id)}`)).then(data),
  cancel: (id) => api.post(endpoint(`/runs/${encodeURIComponent(id)}/cancel`)).then(data),
  recover: (id) => api.post(endpoint(`/runs/${encodeURIComponent(id)}/recover`)).then(data),
  decision: (id, proposal) => api.post(endpoint(`/actions/${encodeURIComponent(id)}/decision`), proposal).then(data),
  preview: (id) => api.get(endpoint(`/actions/${encodeURIComponent(id)}/preview`), { responseType: 'blob' }).then(data),
  capabilities: () => api.get(endpoint('/capabilities')).then(data),
  events: (id, after, signal) => api.get(endpoint(`/runs/${encodeURIComponent(id)}/events`), {
    params: { after }, responseType: 'text', headers: { Accept: 'text/event-stream' }, signal,
  }).then(data),
};
