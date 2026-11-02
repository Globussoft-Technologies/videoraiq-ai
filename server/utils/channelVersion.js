// Snapshot refresh and lease bookkeeping are operational data, not camera
// configuration. They must not invalidate an approved detector action.
const operationalRoots = new Set([
  "latestSnapshot", "snapshotNextAttemptAt", "snapshotLeaseUntil",
  "snapshotLeaseToken", "snapshotPendingDelete", "createdAt", "updatedAt", "__v",
]);

export function isChannelConfigurationPath(path) {
  return !operationalRoots.has(String(path).split(".")[0]) && path !== "configurationVersion";
}

// Keep model/query/bulk configuration writes on the same concurrency counter.
export function versionChannelUpdate(update) {
  if (Array.isArray(update)) {
    return [...update, { $set: { configurationVersion: { $add: [{ $ifNull: ["$configurationVersion", 0] }, 1] } } }];
  }
  const source = update && typeof update === "object" ? update : {};
  const hasOperator = Object.keys(source).some((key) => key.startsWith("$"));
  const paths = hasOperator
    ? Object.entries(source).filter(([operator]) => operator.startsWith("$")).flatMap(([, value]) => Object.keys(value && typeof value === "object" ? value : {}))
    : Object.keys(source);
  if (!paths.some(isChannelConfigurationPath)) return source;
  const result = hasOperator ? { ...source } : { $set: { ...source } };
  delete result.configurationVersion;
  for (const operator of Object.keys(result).filter((key) => key.startsWith("$"))) {
    result[operator] = { ...result[operator] };
    delete result[operator].configurationVersion;
    if (!Object.keys(result[operator]).length) delete result[operator];
  }
  result.$inc = { ...result.$inc, configurationVersion: 1 };
  return result;
}
