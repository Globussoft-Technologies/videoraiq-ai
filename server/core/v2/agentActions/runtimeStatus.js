import { isScheduleActiveNow } from "../../../services/detectionSchedule.resolver.js";
import { runtimeIsStale, RUNTIME_STALE_AFTER_SECONDS } from "../agentData/runtimeFreshness.js";

export function runtimeStatus(channel, detectionType, observation) {
  const detection = channel.detections?.[detectionType];
  const configuredEnabled = Boolean(detection?.enabled);
  const effectiveEnabled = configuredEnabled && isScheduleActiveNow(detection?.schedule);
  const stale = !observation || runtimeIsStale(observation.observedAt);
  const observationReachable = !stale && Boolean(observation.observationReachable);
  return {
    channelId: String(channel._id), detectionType, configuredEnabled, effectiveEnabled,
    runtimeState: observationReachable ? observation.runtimeState : "unknown",
    lastReportedRuntimeState: observation?.runtimeState || null,
    observedAt: observation?.observedAt || null,
    lastFrameAt: observation?.lastFrameAt || null,
    lastInferenceAt: observation?.lastInferenceAt || null,
    desiredConfigurationVersion: String(channel.configurationVersion ?? 0),
    appliedConfigurationVersion: observationReachable ? observation.appliedConfigurationVersion ?? null : null,
    lastReportedAppliedConfigurationVersion: observation?.appliedConfigurationVersion ?? null,
    stale, staleAfterSeconds: RUNTIME_STALE_AFTER_SECONDS,
    lastError: observation?.lastError || null,
    observationSource: observation?.observationSource || null,
    observationReachable,
    lastReportedReachability: observation?.observationReachable ?? null,
  };
}
