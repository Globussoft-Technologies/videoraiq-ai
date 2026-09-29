export const ADMIN_STORAGE_UI_ENABLED =
  import.meta.env.VITE_ADMIN_STORAGE_CONFIG_ENABLED !== 'false';

// Opt-in client profile. Missing/false keeps the existing product navigation
// unchanged; only the exact value "true" enables the Flo Mattress sidebar.
export const IS_FLO_MATTRESS =
  String(import.meta.env.VITE_IS_FLO_MATTRESS || '').trim().toLowerCase() === 'true';
