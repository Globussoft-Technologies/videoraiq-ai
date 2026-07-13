import { useEffect, useState } from 'react';

export const ROWS_OPTIONS = [35, 60, 100];

export const REFRESH_KEY = 'detected_users_auto_refresh_enabled';
export const INTERVAL_KEY = 'detected_users_auto_refresh_interval';

// The /grouped API returns image fields as relative paths, so build the full
// upload URL from VITE_BACKEND here.
export const uploadDomain = import.meta.env.VITE_BACKEND + '/api/v1/uploads';

// Map a raw /grouped API group into the folder shape the UI renders. `images`
// are full display URLs (leading slash stripped before joining so the grid src
// has no double slash). `rawImages` keeps the ORIGINAL stored relative paths
// (leading slash intact) — that's the exact format normal registration stores
// in `profilePics`, so a folder tagged/quick-created from here displays
// identically everywhere. Passing the full display URL instead leaves a
// double-prefixed path that 404s. `images` / `rawImages` / `imageIds` stay
// index-aligned.
export const mapGroup = (group) => {
  const valid = (group.images || []).filter((i) => i && i.image);
  return {
    dsId: group.dsId,
    authorizedUser: group.authorizedUser || null,
    images: valid.map((i) => `${uploadDomain}/${i.image.replace(/^\/+/, '')}`),
    rawImages: valid.map((i) => i.image),
    imageIds: valid.map((i) => i._id),
  };
};

// Themed initials avatar (data URI) used as a fallback when a user has no
// profile picture. Colours are intentionally neutral so it reads in both modes.
export const getInitialsPlaceholder = (firstName, lastName) => {
  const initials =
    `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const svg = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="20" fill="#E3F5FF"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#07486A" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

// Small debounce hook — v2 has no shared one, so this mirrors the setTimeout
// pattern used elsewhere in the app.
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
