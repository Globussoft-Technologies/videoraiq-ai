import { api, unwrap } from './client';

/**
 * AI Assistant transport — the single seam between the finished UI and the
 * backend that doesn't exist yet.
 *
 * There is no /assistant route on the server today, so every send resolves to
 * a clearly-labelled placeholder reply. That keeps the whole interaction
 * exercisable end to end (optimistic user bubble -> typing indicator -> reply
 * -> history entry) without pretending to answer anything.
 *
 * To go live: expose the endpoint and set VITE_ASSISTANT_API to its path
 * (e.g. "/assistant/chat"). No component changes are needed — the real call
 * below takes over and goes through the shared axios instance, so it inherits
 * the same x-access-token auth every other V2 helper uses.
 */
const ENDPOINT = import.meta.env.VITE_ASSISTANT_API || '';

/** Long enough for the typing indicator to read as real work, short enough not to annoy. */
const MOCK_DELAY_MS = 900;

const NOT_WIRED_REPLY =
  "I'm not connected to a model yet — the assistant API isn't live on this environment.\n\n" +
  'Once it is, this is where the answer would appear, scoped to the alerts, cameras, ' +
  'attendance and incident data your role is permitted to view.';

/**
 * Ask the assistant a question.
 *
 * @param {Object}   args
 * @param {string}   args.message  the user's prompt
 * @param {Array}    args.history  prior turns as [{ role, text }] for context
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ text: string }>}
 */
export async function askAssistant({ message, history = [], signal } = {}) {
  if (!ENDPOINT) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
    return { text: NOT_WIRED_REPLY };
  }

  const res = await api.post(ENDPOINT, { message, history }, { signal });
  const data = unwrap(res);
  // Tolerate whichever field name the endpoint lands on rather than coupling
  // the UI to one guess made before the API exists.
  return { text: data?.reply || data?.text || data?.message || '' };
}

/** True while the assistant is running against the placeholder, not a real model. */
export const isAssistantMocked = !ENDPOINT;
