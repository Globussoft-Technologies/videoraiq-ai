// Normalize report rows even when a caller supplies older 24-hour API values.
export function formatWhen12(row) {
  const value = String(row.dateTime || row.time || "");
  return value.replace(/(\d{1,2}):(\d{2})(:\d{2})?(?:\s*(AM|PM))?$/i,
    (match, rawHour, minute, seconds = "", period) => {
      const hour = Number(rawHour);
      if (hour > 23 || (period && (hour < 1 || hour > 12))) return match;
      return `${String(hour % 12 || 12).padStart(2, "0")}:${minute}${seconds} ${period?.toUpperCase() || (hour >= 12 ? "PM" : "AM")}`;
    });
}
