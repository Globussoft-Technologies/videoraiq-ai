import { isNvrConfirmationPrompt } from './nvrWorkflowUi.js';
export function pendingConfirmation(messages = []) {
  const latest = [...messages].reverse().find(message => message.role === 'assistant');
  if (!latest || ['completed', 'cancelled', 'failed', 'error'].includes(latest.ui?.status)) return null;
  if (['review', 'confirmation'].includes(latest.ui?.type)
    || isNvrConfirmationPrompt(latest.text)
    || /\breply\s+yes\s+to\s+confirm\b/i.test(String(latest.text || ''))) return latest;
  return null;
}
