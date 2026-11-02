import { describe, expect, it } from "vitest";
import ChannelValidator from "../../core/v2/channels/channels.validate.js";
import { versionChannelUpdate } from "../../utils/channelVersion.js";
import { normalizeV2Error } from "../../middlewares/v2ErrorContract.js";

describe("29 October agent staging regressions", () => {
  it("accepts a partial detector configuration and rejects invalid threshold values", () => {
    expect(ChannelValidator.validateUpdateChannelConfig({ alertThreshold: 2 }).error).toBeUndefined();
    expect(ChannelValidator.validateUpdateChannelConfig({ alertThreshold: -1 }).error).toBeDefined();
  });

  it("does not invalidate approvals for snapshot bookkeeping", () => {
    const claim = { $set: { snapshotLeaseToken: "test", snapshotLeaseUntil: new Date() } };
    expect(versionChannelUpdate(claim)).toEqual(claim);
    const snapshot = { $set: { latestSnapshot: { path: "test.jpg" } }, $addToSet: { snapshotPendingDelete: "old.jpg" } };
    expect(versionChannelUpdate(snapshot)).toEqual(snapshot);
    expect(versionChannelUpdate({ $set: { "detections.fireSmokeDetectionSettings.enabled": true } }).$inc.configurationVersion).toBe(1);
  });

  it("keeps dedicated refusal codes in the v2 error envelope", () => {
    const failure = { statusCode: 400, body: { status: "failed", message: "No saved model thresholds available to reset", errorCode: "NO_SAVED_THRESHOLDS" } };
    expect(normalizeV2Error(failure, 400).body.errorCode).toBe("NO_SAVED_THRESHOLDS");
  });
});
