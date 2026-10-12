/** Optional exact window; ordinary Incident Center calendar filters stay intact. */
export function exactIncidentWindow(body = {}) {
  if (body.startInclusive === undefined && body.endExclusive === undefined) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof body.startInclusive !== "string" || typeof body.endExclusive !== "string"
    || !iso.test(body.startInclusive) || !iso.test(body.endExclusive)) throw new Error("An exact incident window requires two ISO timestamps with time zones.");
  for (const text of [body.startInclusive, body.endExclusive]) {
    const [year, month, day, hour, minute, second] = text.match(/\d+/g).slice(0, 6).map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error("Invalid exact incident calendar date.");
  }
  const start = new Date(body.startInclusive), end = new Date(body.endExclusive);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new Error("Invalid exact incident window.");
  return { $gte: start, $lt: end };
}

export function incidentRecordSort(body = {}) {
  return body.sortField === "timeOfIncident"
    ? { timeOfIncident: -1, createdAt: -1, _id: -1 }
    : { sortAt: -1, createdAt: -1 };
}
