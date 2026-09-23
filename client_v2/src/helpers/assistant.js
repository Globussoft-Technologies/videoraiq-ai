import { api, unwrap } from './client';

const CHAT_ENDPOINT = import.meta.env.VITE_ASSISTANT_API || '';
const ASSISTANT_ENDPOINT = CHAT_ENDPOINT.replace(/\/chat\/?$/, '') || '/assistant';
const MOCK_DELAY_MS = 900;

const NOT_WIRED_REPLY =
  "I'm not connected to a model yet — the assistant API isn't live on this environment.\n\n" +
  'Once it is, this is where the answer would appear, scoped to the alerts, cameras, ' +
  'attendance and incident data your role is permitted to view.';

export async function askAssistant({ message, conversationId, signal } = {}) {
  if (!CHAT_ENDPOINT) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    return { text: NOT_WIRED_REPLY };
  }

  const res = await api.post(CHAT_ENDPOINT, { message, conversationId: conversationId || undefined }, { signal });
  const data = unwrap(res);
  return {
    ...data,
    text: data?.reply || data?.text || data?.message || '',
  };
}

export async function listAssistantConversations({ page = 1, limit = 10, signal } = {}) {
  const res = await api.get(`${ASSISTANT_ENDPOINT}/conversations`, {
    params: { page, limit },
    signal,
  });
  return unwrap(res);
}

export async function getAssistantConversation(conversationId, { signal } = {}) {
  const res = await api.get(`${ASSISTANT_ENDPOINT}/conversations/${conversationId}`, { signal });
  return unwrap(res);
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
