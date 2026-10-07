/**
 * Time-of-day (fromTime/toTime) filter on v2 IncidentsService.getAllIncidents
 * — the Incident Center's new from/to time filter, added alongside the
 * existing date-range filter.
 *
 * fromTime/toTime are UTC "HH:mm" strings (the frontend converts whatever
 *12-hour local time the admin picked to UTC before sending), and the filter
 * applies independently to EVERY day in the selected date range — an
 * incident matches if its own time-of-day falls in [fromTime, toTime],
 * regardless of which day it's on. This mirrors Attendance Logs' fromTime/
 * toTime semantics (a per-day window, not one continuous span across the
 * whole date range).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

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
  withSFTPConnection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsServiceV2 } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");

const USER_ID = "200";
const ADMIN_ID = new mongoose.Types.ObjectId();

const seed = (isoTimestamp, overrides = {}) =>
  Incident.create({
    incidentType: "motionDetection",
    timeOfIncident: new Date(isoTimestamp),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: USER_ID,
    Image: "/uploads/x.jpg",
    severity: "low",
    resolved: false,
    ...overrides,
  });

const centerCtx = (body = {}) =>
  serviceCtx({
    adminId: ADMIN_ID,
    user_id: USER_ID,
    query: { skip: 0, limit: 50 },
    body: { statusFilter: ["new", "reported", "resolved"], ...body },
  });

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("detection history uses authorized events rather than the snapshot feed", () => {
  it("includes snapshot-free count and crossing events while the default feed excludes them", async () => {
    await seed("2026-10-06T08:00:00Z", { incidentType: "countPersons", Image: null });
    await seed("2026-10-06T08:00:00Z", { incidentType: "lineCrossing", Image: null });
    await seed("2026-10-06T08:00:00Z", { incidentType: "lineCrossing", Image: null, userId: "foreign-account" });
    const history = centerCtx({ eventSource: "detection_history", incidentTypeFilter: ["countPersons", "lineCrossing"] });
    await IncidentsServiceV2.getAllIncidents(history.req, history.res, history.next);
    expect(history.res.statusCode).toBe(200);
    expect(payload(history.res).totalCount).toBe(2);
    const feed = centerCtx();
    await IncidentsServiceV2.getAllIncidents(feed.req, feed.res, feed.next);
    expect(payload(feed.res).totalCount).toBe(0);
  });

  it("camera rankings retain the member's authorized camera restriction", async () => {
    const allowed = new mongoose.Types.ObjectId();
    await seed("2026-10-06T08:00:00Z", { incidentType: "lineCrossing", Image: null, channelId: allowed });
    await seed("2026-10-06T08:00:00Z", { incidentType: "lineCrossing", Image: null });
    const context = serviceCtx({ user_id: USER_ID, adminId: ADMIN_ID, memberId: "member-a", authorizedChannel: { channels: [allowed] }, query: { skip: 0, limit: 50 }, body: { eventSource: "detection_history", groupBy: "channelId", incidentTypeFilter: ["lineCrossing"], statusFilter: ["new", "reported", "resolved"] } });
    await IncidentsServiceV2.getAllIncidents(context.req, context.res, context.next);
    expect(payload(context.res).totalCount).toBe(1);
    expect(payload(context.res).groups).toHaveLength(1);
    expect(String(payload(context.res).groups[0].channelId)).toBe(String(allowed));
  });

  it("location rankings aggregate the complete authorized event set", async () => {
    const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
    const nvrId = new mongoose.Types.ObjectId();
    await NVR.collection.insertOne({ _id: nvrId, userId: USER_ID, location: "Warehouse" });
    await seed("2026-10-06T08:00:00Z", { incidentType: "lineCrossing", Image: null, nvrId });
    await seed("2026-10-06T09:00:00Z", { incidentType: "lineCrossing", Image: null, nvrId });
    const context = centerCtx({ eventSource: "detection_history", groupBy: "location", incidentTypeFilter: ["lineCrossing"] });
    await IncidentsServiceV2.getAllIncidents(context.req, context.res, context.next);
    expect(payload(context.res).groups).toEqual([{ location: "Warehouse", count: 2 }]);
  });
});

describe("IncidentsService (v2) getAllIncidents — fromTime/toTime", () => {
  it("applies a continuous half-open instant window and preserves account ownership", async () => {
    await seed("2026-10-05T11:12:12.999Z");
    await seed("2026-10-05T11:12:13.000Z");
    await seed("2026-10-06T11:12:12.999Z");
    await seed("2026-10-06T11:12:13.000Z");
    await seed("2026-10-06T08:00:00.000Z", { userId: "another-account" });
    const { req, res, next } = centerCtx({
      startDate: "2026-10-05", endDate: "2026-10-06",
      startInclusive: "2026-10-05T11:12:13.000Z",
      endExclusive: "2026-10-06T11:12:13.000Z",
    });
    await IncidentsServiceV2.getAllIncidents(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(2);
  });

  it("rejects malformed continuous windows instead of returning an unfiltered count", async () => {
    await seed("2026-10-06T08:00:00.000Z");
    const { req, res, next } = centerCtx({ startInclusive: "invalid", endExclusive: "2026-10-06T11:12:13.000Z" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);
    expect(res._body).toBeUndefined();
    expect(next.calls).toHaveLength(1);
    expect(next.calls[0].statusCode).toBe(500);
  });
  it("keeps only incidents whose UTC time-of-day falls within [fromTime, toTime]", async () => {
    await seed("2026-08-01T08:00:00.000Z"); // before window
    await seed("2026-08-01T12:00:00.000Z"); // inside window
    await seed("2026-08-01T20:00:00.000Z"); // after window

    const { req, res, next } = centerCtx({ fromTime: "09:00", toTime: "18:00" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(1);
  });

  it("applies the time window independently to every day in the date range, not once across the whole range", async () => {
    await seed("2026-08-01T12:00:00.000Z"); // day 1, inside window
    await seed("2026-08-02T12:00:00.000Z"); // day 2, inside window
    await seed("2026-08-01T22:00:00.000Z"); // day 1, outside window

    const { req, res, next } = centerCtx({
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      fromTime: "09:00",
      toTime: "18:00",
    });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    // Both in-window incidents match even though they're on different days —
    // a single continuous-span interpretation would only catch one of them.
    expect(payload(res).totalCount).toBe(2);
  });

  it("supports an open-ended window with only fromTime set", async () => {
    await seed("2026-08-01T08:00:00.000Z");
    await seed("2026-08-01T20:00:00.000Z");

    const { req, res, next } = centerCtx({ fromTime: "12:00" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(1);
  });

  it("supports an open-ended window with only toTime set", async () => {
    await seed("2026-08-01T08:00:00.000Z");
    await seed("2026-08-01T20:00:00.000Z");

    const { req, res, next } = centerCtx({ toTime: "12:00" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(1);
  });

  it("ignores a malformed fromTime/toTime instead of erroring or matching nothing", async () => {
    await seed("2026-08-01T12:00:00.000Z");

    const { req, res, next } = centerCtx({ fromTime: "not-a-time", toTime: "25:99" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(1);
  });

  it("returns everything when no time filter is given", async () => {
    await seed("2026-08-01T08:00:00.000Z");
    await seed("2026-08-01T20:00:00.000Z");

    const { req, res, next } = centerCtx({});
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(2);
  });

  // Regression: the frontend converts a LOCAL 12-hour pick to UTC before
  // sending. That conversion can flip which of fromTime/toTime is numerically
  // larger even when the local window itself never wrapped midnight — e.g.
  // "2:00 AM to 7:01 PM" IST becomes fromTime=20:30, toTime=13:31 UTC (2 AM
  // IST is 20:30 UTC the PREVIOUS day). Naively AND-ing $gte fromTime and
  // $lte toTime then requires a time simultaneously >= 20:30 and <= 13:31,
  // which nothing satisfies — silently returning zero rows for a perfectly
  // ordinary same-day local window. This must be matched with OR instead once
  // fromTime > toTime in UTC terms.
  it("matches a UTC-wrapped window (fromTime > toTime) with OR semantics, not AND", async () => {
    await seed("2026-08-01T21:00:00.000Z"); // 21:00 UTC — inside [20:30, ...] side of the wrap
    await seed("2026-08-01T10:00:00.000Z"); // 10:00 UTC — inside [..., 13:31] side of the wrap
    await seed("2026-08-01T16:00:00.000Z"); // 16:00 UTC — outside both sides

    const { req, res, next } = centerCtx({ fromTime: "20:30", toTime: "13:31" });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(2);
  });

  it("reproduces the exact reported case: 2:00 AM–7:01 PM IST must still return matches", async () => {
    // Same UTC values IST 2:00 AM / 7:01 PM convert to.
    const fromTime = "20:30";
    const toTime = "13:31";
    await seed("2026-08-01T12:00:00.000Z"); // 12:00 UTC = 17:30 IST — inside the local 2AM-7:01PM window
    await seed("2026-08-01T02:00:00.000Z"); // 02:00 UTC = 07:30 IST — inside the local window
    await seed("2026-08-01T16:00:00.000Z"); // 16:00 UTC = 21:30 IST — outside the local window

    const { req, res, next } = centerCtx({ fromTime, toTime });
    await IncidentsServiceV2.getAllIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).totalCount).toBe(2);
  });
});
