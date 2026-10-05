import { api, unwrap } from './client';

// VITE_BACKEND may be either the API origin or an already-prefixed v2 base
// (for example http://localhost:5000/api/v2). Append only the assistant
// portion so we never generate /api/v2/api/v2/assistant/chat.
const configuredBackend = String(import.meta.env.VITE_BACKEND || '').replace(/\/+$/, '');
const backendAlreadyHasV2 = /\/api\/v2$/i.test(configuredBackend);
const defaultAssistantPath = backendAlreadyHasV2 ? '/assistant/chat' : '/api/v2/assistant/chat';
const CHAT_ENDPOINT = import.meta.env.VITE_ASSISTANT_API || defaultAssistantPath;
const ASSISTANT_ENDPOINT = CHAT_ENDPOINT.replace(/\/chat\/?$/, '') || (backendAlreadyHasV2 ? '/assistant' : '/api/v2/assistant');
const MOCK_DELAY_MS = 900;

const NOT_WIRED_REPLY =
  "I'm not connected to a model yet — the assistant API isn't live on this environment.\n\n" +
  'Once it is, this is where the answer would appear, scoped to the alerts, cameras, ' +
  'attendance and incident data your role is permitted to view.';

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function askAssistant({ message, conversationId, resetWorkflow = false, action, workflow, step, incidentContext, attachments = [], attachmentCount = attachments.length, signal } = {}) {
  if (!CHAT_ENDPOINT) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    return { text: NOT_WIRED_REPLY };
  }

  const imageAttachments = await Promise.all(attachments.slice(0, 3).filter((file) => /^image\/(jpeg|png)$/.test(file?.type || '')).map(fileAsDataUrl));
  const res = await api.post(CHAT_ENDPOINT, { message, conversationId: conversationId || undefined, resetWorkflow: Boolean(resetWorkflow), action: action || undefined, workflow: workflow || undefined, step: step || undefined, incidentContext: incidentContext || undefined, attachmentCount: Number(attachmentCount) || undefined, imageAttachments: imageAttachments.length ? imageAttachments : undefined }, { signal });
  const data = unwrap(res);
  return {
    ...data,
    text: data?.reply || data?.text || data?.message || '',
    ui: data?.ui || data?.assistantMessage?.ui,
  };
}

export async function uploadRegisterUserFace({ conversationId, angle, file, signal } = {}) {
  const form = new FormData();
  form.append('conversationId', conversationId || '');
  form.append('angle', angle || '');
  form.append('file', file);
  const res = await api.post(`${ASSISTANT_ENDPOINT}/register-user/face`, form, { signal, headers: { 'Content-Type': undefined } });
  return unwrap(res);
}

export async function uploadRegisterUserFaces({ conversationId, files, signal } = {}) {
  const form = new FormData();
  form.append('conversationId', conversationId || '');
  files.forEach((file) => form.append('files', file));
  const res = await api.post(`${ASSISTANT_ENDPOINT}/register-user/face`, form, { signal, headers: { 'Content-Type': undefined } });
  return unwrap(res);
}

export async function listAssistantConversations({ page = 1, limit = 50, search = '', signal } = {}) {
  const res = await api.get(`${ASSISTANT_ENDPOINT}/conversations`, {
    params: { page, limit, ...(search.trim() ? { search: search.trim() } : {}) },
    signal,
  });
  return unwrap(res);
}

export async function getAssistantConversation(conversationId, { signal } = {}) {
  const res = await api.get(`${ASSISTANT_ENDPOINT}/conversations/${conversationId}`, { signal });
  return unwrap(res);
}

export async function fetchAssistantAttachment(conversationId, attachmentId, { signal } = {}) {
  const res = await api.get(`${ASSISTANT_ENDPOINT}/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    responseType: 'blob',
    signal,
  });
  return URL.createObjectURL(res.data);
}

export async function deleteAssistantConversation(conversationId) {
  const res = await api.delete(`${ASSISTANT_ENDPOINT}/conversations/${conversationId}`);
  return unwrap(res);
}

export async function renameAssistantConversation(conversationId, title) {
  const res = await api.patch(`${ASSISTANT_ENDPOINT}/conversations/${conversationId}`, { title });
  return unwrap(res);
}

export const isAssistantMocked = !CHAT_ENDPOINT;
