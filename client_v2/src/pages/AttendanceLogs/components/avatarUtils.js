/**
 * Deterministic initials + accent colour for a person, matching the vivid
 * avatar chips in the VideoraIQ prototype (blue / teal / violet / amber / …).
 * Same name always yields the same colour so cards stay stable across renders.
 */
const AVATAR_COLORS = [
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#a855f7', // violet
  '#f59e0b', // amber
  '#22c55e', // green
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // indigo
];

export const avatarColor = (name = '') => {
  const s = String(name);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export const initials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
