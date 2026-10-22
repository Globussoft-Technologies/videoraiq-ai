/**
 * scripts/delete-incidents-by-date.js: one admin's incidents in a local date
 * range are deleted with their media; a failed media delete keeps the row for
 * a re-run; a dry run deletes nothing. Media layer faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";

const { dayRange, purgeWithMedia } = await import("../../../scripts/delete-incidents-by-date.js");
const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");
const { collectMediaPaths } = await import("../../../utils/mediaCleanup.js");

let deletedMedia;
const media = {
  collectMediaPaths,
  toRelativeMediaPath: (p) => p,
  // "broken" files fail to delete, like a NAS outage would.
  deleteMediaBestEffort: async (paths) => {
    deletedMedia.push(...paths.filter((p) => !p.includes("broken")));
    return paths.filter((p) => p.includes("broken")).length;
  },
};
// Raw inserts: only the fields the script reads matter here.
const make = (userId, timeOfIncident, extra = {}) =>
  Incident.collection.insertOne({ userId, incidentType: "deskSolarShoulderDetection", timeOfIncident: new Date(timeOfIncident), ...extra });

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  deletedMedia = [];
});

describe("dayRange", () => {
  it("reads the days in the admin's timezone", () => {
    const { start, end } = dayRange("2026-10-21", "2026-10-21", "Asia/Kolkata");
    expect([start.toISOString(), end.toISOString()]).toEqual(["2026-10-20T18:30:00.000Z", "2026-10-21T18:29:59.999Z"]);
    expect(() => dayRange("2026-10-22", "2026-10-21", "Asia/Kolkata")).toThrow(/before/);
    expect(() => dayRange("21-10-2026", "2026-10-21", "Asia/Kolkata")).toThrow(/YYYY-MM-DD/);
  });
});

describe("purgeWithMedia on incidents", () => {
  const { start, end } = dayRange("2026-10-21", "2026-10-21", "Asia/Kolkata");
  const query = { userId: "147", timeOfIncident: { $gte: start, $lte: end } };

  beforeEach(async () => {
    await make("147", "2026-10-20T19:00:00Z", { Image: "uploads/a.jpg" }); // 00:30 IST today
    await make("147", "2026-10-21T08:00:00Z", { Image: "uploads/b.jpg", videoLink: "uploads/b.mp4" });
    await make("147", "2026-10-21T09:00:00Z", { Image: "uploads/broken.jpg" });
    await make("147", "2026-10-21T10:00:00Z", { videoLink: "https://external/v.mp4" });
    await make("147", "2026-10-20T18:00:00Z", { Image: "uploads/yesterday.jpg" }); // 23:30 IST yesterday
    await make("999", "2026-10-21T08:00:00Z", { Image: "uploads/other-admin.jpg" });
  });

  it("dry run counts and deletes nothing", async () => {
    const result = await purgeWithMedia({ Model: Incident, query, media, execute: false, log: () => {} });
    expect(result).toMatchObject({ matched: 4, deleted: 0, mediaFiles: 4 });
    expect(await Incident.countDocuments()).toBe(6);
    expect(deletedMedia).toEqual([]);
  });

  it("deletes the range's incidents and media, keeps a failed one, leaves the rest", async () => {
    const result = await purgeWithMedia({ Model: Incident, query, media, execute: true, batchSize: 2, log: () => {} });
    expect(result).toMatchObject({ matched: 4, deleted: 3 });
    expect(result.kept).toHaveLength(1);
    expect(deletedMedia.sort()).toEqual(["uploads/a.jpg", "uploads/b.jpg", "uploads/b.mp4"]);
    const left = (await Incident.find().lean()).map((i) => i.Image).sort();
    expect(left).toEqual(["uploads/broken.jpg", "uploads/other-admin.jpg", "uploads/yesterday.jpg"]);
  });
});

describe("purgeWithMedia on solder panels", () => {
  it("deletes the day's panels and their images, other days stay", async () => {
    const { default: SolderPanel } = await import("../../../core/v2/incidents/solderPanel.model.js");
    const panel = (time, Image) => SolderPanel.collection.insertOne({ userId: "147", channelId: null, panelId: Image, time: new Date(time), Image });
    await panel("2026-10-21T05:00:00Z", "uploads/panel-today.jpg");
    await panel("2026-10-20T10:00:00Z", "uploads/panel-yesterday.jpg");
    const { start, end } = dayRange("2026-10-21", "2026-10-21", "Asia/Kolkata");
    const result = await purgeWithMedia({ Model: SolderPanel, query: { userId: "147", time: { $gte: start, $lte: end } }, media, execute: true, log: () => {} });
    expect(result).toMatchObject({ matched: 1, deleted: 1, mediaFiles: 1 });
    expect(deletedMedia).toEqual(["uploads/panel-today.jpg"]);
    expect((await SolderPanel.find().lean()).map((p) => p.Image)).toEqual(["uploads/panel-yesterday.jpg"]);
  });
});
