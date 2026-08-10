// server_network.rating -> dot/text color (see CAMERA_STATUS_API.md). Shared
// by the Sidebar footer widget and the Header pill so both read the same
// rating the same way.
export const NETWORK_RATING_COLOR = {
  excellent: 'var(--ok)',
  good: 'var(--ok)',
  moderate: 'var(--warn)',
  poor: 'var(--crit)',
  critical: 'var(--crit)',
  unknown: 'var(--tx3)',
};

export function networkRatingInfo(serverNetwork) {
  const rating = serverNetwork?.rating || 'unknown';
  const color = NETWORK_RATING_COLOR[rating] || 'var(--tx3)';
  const label = rating.charAt(0).toUpperCase() + rating.slice(1);
  return { rating, color, label };
}
