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
  reportFile: (reportId, fileName, { onProgress } = {}) => api.get(endpoint(`/reports/${encodeURIComponent(reportId)}/${encodeURIComponent(fileName)}`), {
    responseType: 'blob',
    onDownloadProgress: (event) => onProgress?.({
      phase: 'downloading',
      loadedBytes: event.loaded,
      totalBytes: event.total || 0,
    }),
  }).then((response) => response.data),
  capabilities: (signal) => api.get(endpoint('/capabilities'), { signal }).then(data),
  cameraInventory: (id, signal) => api.get(endpoint('/camera-inventory/' + encodeURIComponent(id)), { signal }).then(data),
  cameraInventoryExportLinks: async (id) => {
    const response = await api.post(endpoint('/camera-inventory/' + encodeURIComponent(id) + '/export-links'));
    const { grant, images } = response.data;
    const keyPattern = /^[a-f0-9]{32}$/i;
    return new Map(Object.entries(images || {}).flatMap(([file, key]) => {
      if (typeof grant !== 'string' || !keyPattern.test(grant) || typeof key !== 'string' || !keyPattern.test(key)) return [];
      const url = new URL(api.getUri({ url: endpoint('/export-image/' + grant + '/' + key) }), window.location.origin);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? [[file, url.href]] : [];
    }));
  },
  cameraInventoryImage: (id, fileName, signal) => api.get(
    endpoint('/camera-inventory/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(fileName)),
    { responseType: 'blob', signal, timeout: 15_000 },
  ).then(data),
  events: (id, after, signal) => api.get(endpoint(`/runs/${encodeURIComponent(id)}/events`), {
    params: { after }, responseType: 'text', headers: { Accept: 'text/event-stream' }, signal,
  }).then(data),
};
