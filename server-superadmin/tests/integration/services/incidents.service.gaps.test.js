/**
 * Gap-fill for IncidentsService — exercises the catch arms of
 *   getVehicleCountLogs (line 2499)
 *   getLineCrossingLogs (lines 2523-2525)
 * The baseline incidents.service.logs.test.js never forces _fetchIncidentLogs
 * to throw, so the AppError-wrapping catch arm stays cold.
 *
 * We use vi.spyOn to make the internal _fetchIncidentLogs reject so the
 * outer try{}'s catch arm fires and calls next(new AppError(...)).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReqRes } from "../../helpers/factory.js";

vi.mock("../../../core/v1/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);

function ctx({ query, params, body } = {}) {
  const { req, res, next } = makeReqRes();
  req.verified = {
    userData: { user_id: "100", adminId: "admin-1" },
    authorizedChannel: { channels: [] },
  };
  if (query) req.query = query;
  if (params) req.params = params;
  if (body) req.body = body;
  return { req, res, next };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("IncidentsService.getVehicleCountLogs catch (line 2499)", () => {
  it("calls next(AppError) when _fetchIncidentLogs throws", async () => {
    const spy = vi
      .spyOn(IncidentsService, "_fetchIncidentLogs")
      .mockRejectedValueOnce(new Error("synthetic boom"));

    const { req, res, next } = ctx({ query: {} });
    await IncidentsService.getVehicleCountLogs(req, res, next);

    expect(spy).toHaveBeenCalled();
    expect(next.calls).toHaveLength(1);
    const err = next.calls[0];
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Failed to fetch vehicle count logs/);
  });
});

describe("IncidentsService.getLineCrossingLogs catch (lines 2523-2525)", () => {
  it("calls next(AppError) when _fetchIncidentLogs throws", async () => {
    const spy = vi
      .spyOn(IncidentsService, "_fetchIncidentLogs")
      .mockRejectedValueOnce(new Error("synthetic boom"));

    const { req, res, next } = ctx({ query: {} });
    await IncidentsService.getLineCrossingLogs(req, res, next);

    expect(spy).toHaveBeenCalled();
    expect(next.calls).toHaveLength(1);
    const err = next.calls[0];
    expect(err.message).toMatch(/Failed to fetch line crossing logs/);
  });
});
