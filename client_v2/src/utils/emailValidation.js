export const EMAIL_EMOJI_ERROR = 'Email address cannot contain emojis';

// Match emoji symbols and sequence components without rejecting ordinary
// email characters such as digits, +, #, dots, underscores or hyphens.
const EMAIL_EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u{E0020}-\u{E007F}]/u;

export const hasEmailEmoji = (value) => EMAIL_EMOJI_RE.test(String(value ?? ''));
