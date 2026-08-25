/**
 * IncidentsService.editIncidentDetails — timeOfIncident persistence.
 *
 * Regression coverage for the ANPR "Edit Log" date/time field: PATCH
 * /incidents/:id/details must actually write the new timeOfIncident onto a
 * discriminator document (vehicleDetection here), not just accept the
 * request. Written while diagnosing a report that editing an ANPR log's
 * date/time appeared to do nothing — the backend turned out fine; the bug
 * was the ANPR list/grid rendering `createdAt` instead of `timeOfIncident`
 * (client_v2/src/pages/ANPRLogs/anprColumns.jsx), so an edit never showed.
 * This test guards the half of the contract that lives on the server.
 *
 * Mocks: 2 (alerts, socket) — matches the existing incidents test suites.
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

const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

async function seedNvrAndChannel(userId) {
  const nvr = await NVR.create({
    userId,
    nvrName: "N1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "local-1",
  });
  const channel = await Channel.create({
    name: "C1",
    customName: "Custom",
    nvrId: nvr._id,
    userId,
    streamingPath: "/s/1",
    localChannelId: "l1",
    isAdded: true,
  });
  return { nvr, channel };
}

describe("IncidentsService.editIncidentDetails — timeOfIncident", () => {
  it("persists an edited timeOfIncident on a vehicleDetection incident", async () => {
    const { nvr, channel } = await seedNvrAndChannel("100");
    const incident = await Incident.create({
      timeOfIncident: new Date("2026-08-14T18:23:41.000Z"),
      nvrId: nvr._id,
      channelId: channel._id,
      userId: "100",
      incidentName: "Number Plate Detection",
      incidentType: "vehicleDetection",
      vehicleNumber: "S1066",
      severity: "moderate",
    });

    const newTime = new Date("2026-08-21T18:23:00.000Z");
    const { req, res, next } = serviceCtx({
      user_id: "100",
      params: { id: incident._id.toString() },
      body: {
        incidentName: "Number Plate Detection",
        vehicleNumber: "S1066",
        severity: "moderate",
        timeOfIncident: newTime.toISOString(),
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
      },
    });

    await IncidentsService.editIncidentDetails(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(new Date(payload(res).data.Incident.timeOfIncident).toISOString()).toBe(
      newTime.toISOString(),
    );

    const fresh = await Incident.findById(incident._id).lean();
    expect(fresh.timeOfIncident.toISOString()).toBe(newTime.toISOString());
    // createdAt is Mongoose-managed and must stay untouched by the edit —
    // this is the field the UI bug was reading by mistake.
    expect(fresh.createdAt.toISOString()).not.toBe(newTime.toISOString());
  });

  it("rejects the update when the NVR doesn't belong to the requesting user", async () => {
    const { nvr, channel } = await seedNvrAndChannel("100");
    const incident = await Incident.create({
      timeOfIncident: new Date("2026-08-14T18:23:41.000Z"),
      nvrId: nvr._id,
      channelId: channel._id,
      userId: "100",
      incidentName: "Number Plate Detection",
      incidentType: "vehicleDetection",
      vehicleNumber: "S1066",
      severity: "moderate",
    });

    const { req, res, next } = serviceCtx({
      user_id: "999", // different owner
      params: { id: incident._id.toString() },
      body: {
        timeOfIncident: new Date("2026-08-21T18:23:00.000Z").toISOString(),
        nvrId: nvr._id.toString(),
      },
    });

    await IncidentsService.editIncidentDetails(req, res, next);

    expect(res.statusCode).toBe(400);
    const fresh = await Incident.findById(incident._id).lean();
    expect(fresh.timeOfIncident.toISOString()).toBe("2026-08-14T18:23:41.000Z");
  });
});
