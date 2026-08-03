/**
 * All user-facing copy for the AI Assistant in one place, so wording changes
 * don't mean touching layout code.
 */
export const ASSISTANT_TITLE = 'AI Assistant';
export const ASSISTANT_SUB = 'Ask questions about your live operational data';

export const EMPTY_TITLE = 'How can I help?';
export const EMPTY_SUB =
  'Get quick answers from alerts, incidents, attendance, and camera data you have permission to view.';

export const COMPOSER_PLACEHOLDER = 'Ask about alerts, cameras, attendance, or incidents…';

/** Shown under the composer — the same permission promise the backend must honour. */
export const COMPOSER_FOOTNOTE = "Answers are limited to data you're authorized to access.";

/**
 * Starter prompts on the empty state. Deliberately mapped to modules that
 * actually exist in V2 (alerts, attendance, cameras/NVRs, analytics) so the
 * suggestions stay honest once the API is wired.
 */
export const SUGGESTED_PROMPTS = [
  'How many alerts were raised today?',
  'Show the attendance summary for this month',
  'Which cameras are offline right now?',
  'Top 5 cameras by detections this week',
];

/** The launcher pill label, bottom-left of every page. */
export const LAUNCHER_LABEL = 'AI Assistant';
