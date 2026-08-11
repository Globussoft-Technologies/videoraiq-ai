/**
 * Regression coverage for v2 location casing propagation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

const { default: LocationService } = await import(
  "../../../core/v2/locations/location.service.js"
);
const { default: Location } = await import(
  "../../../core/v2/locations/location.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../../core/v2/authorizedUsers/authorizedUsers.model.js"
);
const { default: AuthorizedChannel } = await import(
  "../../../core/v2/cameraRestrictions/authorizedChannels.model.js"
);
const { default: NVR } = await import(
  "../../../core/v2/NVR/nvr.model.js"
);

const adminId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("LocationService.updateLocation v2", () => {
  it("propagates canonical casing to all v2 location references", async () => {
    const loc = await Location.create({ adminId, locationName: "Bangalore" });
    const employee = await AuthorizedUser.create({
      adminId,
      email: "afzal-v2@example.com",
      location: "bangalore",
    });
    const nvr = await NVR.create({
      userId: "1",
      nvrName: "NVR 1",
      brand: "hikvision",
      domain: "http://nvr.test",
      location: "BANGALORE",
      localNvrId: "local-v2-1",
    });
    const restrictions = await AuthorizedChannel.create({
      adminId,
      userId: new mongoose.Types.ObjectId(),
      employeeLocations: ["bangalore", "Remote"],
      locations: ["BANGALORE", "Other"],
      nvrIds: [],
      departmentIds: [],
      channels: [],
    });
    const { req, res, next } = serviceCtx({
      adminId,
      user_id: "1",
      query: { id: loc._id.toString() },
      body: { locationName: "Bangalore" },
    });

    await LocationService.updateLocation(req, res, next);

    expect(res.statusCode).toBe(200);
    expect((await AuthorizedUser.findById(employee._id)).location).toBe("Bangalore");
    expect((await NVR.findById(nvr._id)).location).toBe("Bangalore");
    const updatedRestrictions = await AuthorizedChannel.findById(restrictions._id);
    expect(updatedRestrictions.employeeLocations).toEqual(["Bangalore", "Remote"]);
    expect(updatedRestrictions.locations).toEqual(["Bangalore", "Other"]);
  });
});
