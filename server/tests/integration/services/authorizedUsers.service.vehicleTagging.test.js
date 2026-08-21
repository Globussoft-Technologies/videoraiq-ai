/**
 * AuthUsersService.tagVehicleNumber / untagVehicleNumber — the write side of
 * the Tag User / Untag User actions on ANPR Logs and Vehicle Detection
 * incidents.
 *
 * Runs against a real in-memory Mongo so the plate-collision check and the
 * separator-insensitive comparison are exercised for real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: AuthUsersService } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.service.js"
);
const { default: authorizedUsersModel } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);
const { default: adminModel } = await import(
  "../../../core/v1/admin/admin.model.js"
);

let ADMIN_ID;

const seedUser = (firstName, vehicleNumber = null) =>
  authorizedUsersModel.create({
    adminId: ADMIN_ID,
    firstName,
    lastName: "Tester",
    userName: `${firstName} Tester`,
    email: `${firstName.toLowerCase()}@example.com`,
    vehicleNumber,
  });

const ctx = (body) => serviceCtx({ adminId: String(ADMIN_ID), user_id: "100", body });

const reload = (id) => authorizedUsersModel.findById(id).lean();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  const admin = await adminModel.create({
    user_id: "100",
    login: "admin",
    email: "admin@example.com",
  });
  ADMIN_ID = admin._id;
});

describe("tagVehicleNumber", () => {
  it("writes the plate onto the selected user", async () => {
    const user = await seedUser("Asha");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("success");
    expect((await reload(user._id)).vehicleNumber).toBe("KA02MP9657");
  });

  it("reports the plate the user previously held", async () => {
    const user = await seedUser("Asha", "KA05XY1111");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).data.previousVehicleNumber).toBe("KA05XY1111");
    expect((await reload(user._id)).vehicleNumber).toBe("KA02MP9657");
  });

  it("refuses a plate another user already holds, whatever its formatting", async () => {
    await seedUser("Vikram", "KA 02 MP 9657");
    const user = await seedUser("Asha");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "ka02mp9657" });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/already tagged to Vikram Tester/);
    expect((await reload(user._id)).vehicleNumber).toBeNull();
  });

  it("is idempotent when the same user already holds the plate", async () => {
    const user = await seedUser("Asha", "KA-02-MP-9657");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("success");
    expect((await reload(user._id)).vehicleNumber).toBe("KA02MP9657");
  });

  it("rejects a plate with nothing matchable in it", async () => {
    const user = await seedUser("Asha");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: " -- " });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect((await reload(user._id)).vehicleNumber).toBeNull();
  });

  it("rejects a missing or malformed userId", async () => {
    for (const userId of [undefined, "not-an-id"]) {
      const { req, res, next } = ctx({ userId, vehicleNumber: "KA02MP9657" });
      await AuthUsersService.tagVehicleNumber(req, res, next);
      expect(payload(res).status).toBe("failed");
    }
  });

  it("will not tag a user belonging to another admin", async () => {
    const otherAdmin = await adminModel.create({
      user_id: "200",
      login: "other",
      email: "other@example.com",
    });
    const stranger = await authorizedUsersModel.create({
      adminId: otherAdmin._id,
      firstName: "Stranger",
      userName: "Stranger",
    });

    const { req, res, next } = ctx({ userId: String(stranger._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.tagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect((await reload(stranger._id)).vehicleNumber).toBeNull();
  });
});

describe("untagVehicleNumber", () => {
  it("clears the plate so the vehicle reads as untagged again", async () => {
    const user = await seedUser("Asha", "KA02MP9657");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.untagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("success");
    expect((await reload(user._id)).vehicleNumber).toBeNull();
  });

  it("matches the plate regardless of formatting on either side", async () => {
    const user = await seedUser("Asha", "KA-02-MP-9657");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "ka02 mp 9657" });
    await AuthUsersService.untagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("success");
    expect((await reload(user._id)).vehicleNumber).toBeNull();
  });

  it("refuses when the user holds a different plate", async () => {
    // A stale list — rendered before someone re-tagged the plate — must not be
    // able to clear a number this user never held.
    const user = await seedUser("Asha", "KA05XY1111");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.untagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect((await reload(user._id)).vehicleNumber).toBe("KA05XY1111");
  });

  it("refuses when the user holds no plate at all", async () => {
    const user = await seedUser("Asha");

    const { req, res, next } = ctx({ userId: String(user._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.untagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
  });

  it("will not untag a user belonging to another admin", async () => {
    const otherAdmin = await adminModel.create({
      user_id: "200",
      login: "other",
      email: "other@example.com",
    });
    const stranger = await authorizedUsersModel.create({
      adminId: otherAdmin._id,
      firstName: "Stranger",
      userName: "Stranger",
      vehicleNumber: "KA02MP9657",
    });

    const { req, res, next } = ctx({ userId: String(stranger._id), vehicleNumber: "KA02MP9657" });
    await AuthUsersService.untagVehicleNumber(req, res, next);

    expect(payload(res).status).toBe("failed");
    expect((await reload(stranger._id)).vehicleNumber).toBe("KA02MP9657");
  });
});
