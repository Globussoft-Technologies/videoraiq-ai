const messageText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(messageText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return messageText(value.message);
  return '';
};

export function getApiErrorMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data;
  const body = data?.body ?? data;
  const message = messageText(body?.message);
  const detail = messageText(body?.error) || messageText(body?.errors);
  const status = Number(err?.response?.status || data?.statusCode);
  // Validation responses carry the actionable reason in error/errors. Keep
  // server-error internals hidden behind the API's public message otherwise.
  if ((status === 400 || status === 422 || /^validation failed[.!]?$/i.test(message)) && detail) return detail;
  return message || detail || messageText(err?.message) || fallback;
}
