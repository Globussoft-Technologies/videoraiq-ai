export const EMAIL_EMOJI_ERROR = 'Email address cannot contain emojis';

// Keep the browser-side check intentionally conventional: no quoted local
// parts, no whitespace, and at least one dot-separated domain label.
const EMAIL_ATOM = "A-Za-z0-9!#$%&'*+/=?^_`{|}~-";
const EMAIL_FORMAT_RE = new RegExp(
  `^[A-Za-z0-9](?:[${EMAIL_ATOM}]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[${EMAIL_ATOM}]*[A-Za-z0-9])?)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$`
);

export const isValidEmailFormat = (value) => EMAIL_FORMAT_RE.test(String(value ?? '').trim());

// Match emoji symbols and sequence components without rejecting ordinary
// email characters such as digits, +, #, dots, underscores or hyphens.
const EMAIL_EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u{E0020}-\u{E007F}]/u;

export const hasEmailEmoji = (value) => EMAIL_EMOJI_RE.test(String(value ?? ''));
