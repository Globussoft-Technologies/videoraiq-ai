/**
 * Integration coverage for creating a vehicleCheckInOut incident.
 *
 * Registering the discriminator on the model is not enough on its own:
 * incidents.service keeps its own incidentType -> model map and a per-type
 * branch that copies the detection-specific fields off the request body. A type
 * missing from either resolves to no model, or saves with every vehicle field
 * dropped. These pin both.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn() }));
vi.mock("../../../core/v2/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn(),
}));

const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { VehicleCheckInOutIncident } = await import(
  "../../../core/v2/incidents/incidents.model.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { vehicleCheckInOutDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const mongoose = (await import("mongoose")).default;

let admin;
let channel;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: "910",
    login: "vcio",
    email: "vcio@test.com",
  });
  // createIncidents requires a real channel — an incident always comes from a
  // camera, and the enrichment/alert path reads the channel back off it.
  // createIncidents reads channel.detections[`${incidentType}Settings`], so the
  // detection has to be linked on the channel — an incident for a detection the
  // camera does not run is rejected, which is the point of that lookup.
  const setting = await vehicleCheckInOutDetectionSetting.create({
    userId: admin.user_id,
    settingType: "vehicleCheckInOutSettings",
    name: "Main Gate",
    enabled: true,
    settings: {
      camType: ["checkin", "checkout"],
      line_coordinates: [[100, 500], [1800, 500]],
      inside_reference_point: [900, 300],
    },
  });
  channel = await Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: admin.user_id,
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Main Gate",
    isAdded: true,
    detections: {
      vehicleCheckInOutSettings: { id: setting._id, enabled: true },
    },
  });
});

const create = async (body) => {
  const { req, res, next } = serviceCtx({
    body: {
      // createIncidents reads adminId off the body, not the token.
      adminId: admin._id.toString(),
      channelId: channel._id.toString(),
      nvrId: channel.nvrId.toString(),
      incidentType: "vehicleCheckInOut",
      incidentName: "Vehicle Check-In / Check-Out",
      timeOfIncident: new Date().toISOString(),
      severity: "moderate",
      ...body,
    },
  });
  await IncidentsService.createIncidents(req, res, next);
  return res;
};

describe("createIncidents — vehicleCheckInOut", () => {
  it("creates an incident and stores it under the right discriminator", async () => {
    const res = await create({
      checkin: true,
      vehicleNumber: "MH12AB1234",
      Image: "snap.jpg",
    });

    expect(res.statusCode).toBe(200);
    const saved = await VehicleCheckInOutIncident.findOne({});
    expect(saved).toBeTruthy();
    expect(saved.incidentType).toBe("vehicleCheckInOut");
    expect(saved.checkin).toBe(true);
    expect(saved.vehicleNumber).toBe("MH12AB1234");
  });

  it("records a check-out", async () => {
    await create({ checkin: false, vehicleNumber: "MH12AB1234" });
    expect((await VehicleCheckInOutIncident.findOne({})).checkin).toBe(false);
  });

  it("carries the vehicle attributes through", async () => {
    await create({
      checkin: true,
      vehicleNumber: "MH12AB1234",
      model_name: "Swift",
      company: "Maruti",
      color: "white",
      year: 2021,
    });

    const saved = await VehicleCheckInOutIncident.findOne({});
    expect(saved).toMatchObject({
      model_name: "Swift",
      company: "Maruti",
      color: "white",
      year: 2021,
    });
  });

  // The DS pipeline has shipped these under different keys across versions, so
  // the branch accepts every spelling rather than storing null and rendering
  // as "--" even though DS did send a value.
  it.each([
    ["direction string", { direction: "checkin" }, true],
    ["direction checkout", { direction: "checkout" }, false],
    ["in shorthand", { direction: "in" }, true],
    ["out shorthand", { direction: "out" }, false],
    ["entry wording", { event_type: "entry" }, true],
    ["exit wording", { event_type: "exit" }, false],
  ])("accepts %s", async (_label, body, expected) => {
    await create({ vehicleNumber: "MH12AB1234", ...body });
    expect((await VehicleCheckInOutIncident.findOne({})).checkin).toBe(expected);
  });

  it("accepts the DS aliases for colour and manufacturer", async () => {
    await create({
      checkin: true,
      vehicleNumber: "MH12AB1234",
      colour: "silver",
      make: "Hyundai",
      model_year: "2019",
    });

    const saved = await VehicleCheckInOutIncident.findOne({});
    expect(saved).toMatchObject({ color: "silver", company: "Hyundai", year: 2019 });
  });

  // Direction is the whole point of the detection, so an unresolvable one has
  // to fail rather than silently record an arrival as a departure.
  // The schema rejects these, and createIncidents swallows the resulting
  // validation error into its generic failure path -- no status code and no
  // body worth asserting on. What matters, and what these pin, is that nothing
  // reaches the database: a crossing whose direction could not be resolved must
  // never be recorded as an arrival.
  it("refuses an incident whose direction cannot be resolved", async () => {
    await create({ vehicleNumber: "MH12AB1234", direction: "sideways" });
    expect(await VehicleCheckInOutIncident.countDocuments()).toBe(0);
  });

  it("refuses an incident with no direction at all", async () => {
    await create({ vehicleNumber: "MH12AB1234" });
    expect(await VehicleCheckInOutIncident.countDocuments()).toBe(0);
  });
});
