/**
 * Pure-Joi validator tests for record / event-shaped modules:
 *   - attendance.validate.js     (named export: attendanceSchema)
 *   - entry.validate.js          (named export: entrySchemaValidation)
 *   - vehicle.validate.js        (named: vehicleLogValidation / vehicleSearchValidation)
 *   - accesslogs.validate.js     (createSession / createAccessLogsValidate / create)
 *   - admin.validate.js          (UserValidation.createUser)
 *
 * No DB, no mocks. We exercise required/optional and the .or(...) branches.
 */
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import { attendanceSchema } from "../../../core/v1/attendance/attendance.validate.js";
import { entrySchemaValidation } from "../../../core/v1/entry/entry.validate.js";
import {
  vehicleLogValidation,
  vehicleSearchValidation,
} from "../../../core/v1/vehicle/vehicle.validate.js";
import AccessLogsValidation from "../../../core/v1/accesslogs/accesslogs.validate.js";
import AdminValidation from "../../../core/v1/admin/admin.validate.js";

const hex24 = () => new mongoose.Types.ObjectId().toString();

// ---------------------------------------------------------------------------
// attendanceSchema
// ---------------------------------------------------------------------------
describe("attendanceSchema", () => {
  const base = () => ({
    cameraType: "checkin",
    employeeId: "emp_1",
    userId: "user_1",
    nvrId: hex24(),
    channelId: hex24(),
    images: { face: "data:..." },
  });

  it("accepts a minimal valid attendance event", () => {
    expect(attendanceSchema.validate(base()).error).toBeUndefined();
  });

  it("rejects invalid cameraType", () => {
    const body = base();
    body.cameraType = "loitering";
    const { error } = attendanceSchema.validate(body);
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/cameraType/);
  });

  it("requires nvrId/channelId to be 24-char hex", () => {
    const body = base();
    body.nvrId = "not-hex";
    expect(attendanceSchema.validate(body).error).toBeDefined();
  });

  it("rejects empty images object (no face/person/frame)", () => {
    const body = base();
    body.images = {};
    const { error } = attendanceSchema.validate(body);
    expect(error).toBeDefined();
  });

  it("accepts when only person image is present", () => {
    const body = base();
    body.images = { person: "url" };
    expect(attendanceSchema.validate(body).error).toBeUndefined();
  });

  it("requires employeeId / userId", () => {
    for (const key of ["employeeId", "userId"]) {
      const body = base();
      delete body[key];
      expect(attendanceSchema.validate(body).error).toBeDefined();
    }
  });

  it("optional confidenceScore must be a number when supplied", () => {
    const body = base();
    body.confidenceScore = "high";
    expect(attendanceSchema.validate(body).error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// entrySchemaValidation
// ---------------------------------------------------------------------------
describe("entrySchemaValidation", () => {
  const base = () => ({
    adminId: "admin_1",
    userId: "user_1",
    nvrId: hex24(),
    channelId: hex24(),
    images: { frame: "url" },
  });

  it("accepts a minimal entry", () => {
    expect(entrySchemaValidation.validate(base()).error).toBeUndefined();
  });

  it("requires adminId + userId", () => {
    for (const key of ["adminId", "userId"]) {
      const body = base();
      delete body[key];
      expect(entrySchemaValidation.validate(body).error).toBeDefined();
    }
  });

  it("requires at least one image (face/person/frame)", () => {
    const body = base();
    body.images = {};
    expect(entrySchemaValidation.validate(body).error).toBeDefined();
  });

  it("rejects when nvrId is not hex24", () => {
    const body = base();
    body.nvrId = "abc";
    expect(entrySchemaValidation.validate(body).error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// vehicleLogValidation / vehicleSearchValidation
// ---------------------------------------------------------------------------
describe("vehicleLogValidation", () => {
  const base = () => ({
    adminId: "admin_1",
    vehicleNumber: "KA01AB1234",
    nvrId: hex24(),
    channelId: hex24(),
    images: { vehicle: "url" },
  });

  it("accepts a minimal valid log", () => {
    expect(vehicleLogValidation.validate(base()).error).toBeUndefined();
  });

  it("requires adminId / vehicleNumber", () => {
    for (const key of ["adminId", "vehicleNumber"]) {
      const body = base();
      delete body[key];
      expect(vehicleLogValidation.validate(body).error).toBeDefined();
    }
  });

  it("requires images.vehicle", () => {
    const body = base();
    body.images = {};
    expect(vehicleLogValidation.validate(body).error).toBeDefined();
  });

  it("rejects malformed channelId", () => {
    const body = base();
    body.channelId = "not-hex";
    expect(vehicleLogValidation.validate(body).error).toBeDefined();
  });
});

describe("vehicleSearchValidation", () => {
  it("accepts an empty body", () => {
    expect(vehicleSearchValidation.validate({}).error).toBeUndefined();
  });

  it("accepts an empty-string search", () => {
    expect(
      vehicleSearchValidation.validate({ search: "" }).error,
    ).toBeUndefined();
  });

  it("accepts a populated search", () => {
    expect(
      vehicleSearchValidation.validate({ search: "KA01" }).error,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// accesslogs.validate.js
// ---------------------------------------------------------------------------
describe("AccessLogsValidation.createSession", () => {
  it("accepts a minimal personName-only body", () => {
    expect(
      AccessLogsValidation.createSession({ personName: "John" }).error,
    ).toBeUndefined();
  });

  it("requires personName", () => {
    expect(AccessLogsValidation.createSession({}).error).toBeDefined();
  });

  it("rejects non-string personName", () => {
    expect(
      AccessLogsValidation.createSession({ personName: 42 }).error,
    ).toBeDefined();
  });

  it("accepts string ObjectIds for adminId/cameraId", () => {
    const { error } = AccessLogsValidation.createSession({
      personName: "John",
      adminId: hex24(),
      cameraId: hex24(),
      nvrId: hex24(),
      userId: hex24(),
    });
    expect(error).toBeUndefined();
  });

  it("rejects malformed adminId", () => {
    const { error } = AccessLogsValidation.createSession({
      personName: "John",
      adminId: "not-hex",
    });
    expect(error).toBeDefined();
  });

  it("accepts a valid date / timestamp", () => {
    const { error } = AccessLogsValidation.createSession({
      personName: "John",
      date: "2024-01-01T00:00:00Z",
      timestamp: new Date(),
    });
    expect(error).toBeUndefined();
  });
});

describe("AccessLogsValidation.createAccessLogsValidate", () => {
  const base = () => ({
    personName: "Alice",
    images: { face: "data:..." },
  });

  it("accepts a minimal valid body", () => {
    expect(
      AccessLogsValidation.createAccessLogsValidate(base()).error,
    ).toBeUndefined();
  });

  it("requires images.{face|person|frame}", () => {
    const body = base();
    body.images = {};
    expect(
      AccessLogsValidation.createAccessLogsValidate(body).error,
    ).toBeDefined();
  });

  it("requires images object", () => {
    const body = base();
    delete body.images;
    expect(
      AccessLogsValidation.createAccessLogsValidate(body).error,
    ).toBeDefined();
  });

  it("rejects empty-string image values (min(1))", () => {
    const { error } = AccessLogsValidation.createAccessLogsValidate({
      personName: "Alice",
      images: { face: "" },
    });
    expect(error).toBeDefined();
  });
});

describe("AccessLogsValidation.create", () => {
  it("accepts personName + images.face", () => {
    expect(
      AccessLogsValidation.create({
        personName: "Bob",
        images: { face: "url" },
      }).error,
    ).toBeUndefined();
  });

  it("requires images.face", () => {
    expect(
      AccessLogsValidation.create({
        personName: "Bob",
        images: {},
      }).error,
    ).toBeDefined();
  });

  it("requires personName", () => {
    expect(
      AccessLogsValidation.create({ images: { face: "u" } }).error,
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// admin.validate.js — UserValidation.createUser
// ---------------------------------------------------------------------------
describe("UserValidation.createUser (admin)", () => {
  const base = () => ({
    fullName: "Jane Smith",
    firstName: "Jane",
    lastName: "Smith",
  });

  it("accepts a minimal valid body and applies defaults", () => {
    const { error, value } = AdminValidation.createUser(base());
    expect(error).toBeUndefined();
    expect(value.age).toBe(0);
    expect(value.adminId).toBeNull();
    expect(value.roleId).toBeNull();
    expect(value.departmentId).toBeNull();
  });

  it("requires fullName / firstName / lastName", () => {
    for (const key of ["fullName", "firstName", "lastName"]) {
      const body = base();
      delete body[key];
      expect(AdminValidation.createUser(body).error).toBeDefined();
    }
  });

  it("lower-cases the email", () => {
    const { value } = AdminValidation.createUser({
      ...base(),
      email: "JANE@SMITH.COM",
    });
    expect(value.email).toBe("jane@smith.com");
  });

  it("accepts a string ObjectId for roleId / departmentId", () => {
    const { error } = AdminValidation.createUser({
      ...base(),
      roleId: hex24(),
      departmentId: hex24(),
    });
    expect(error).toBeUndefined();
  });

  it("rejects negative age", () => {
    const { error } = AdminValidation.createUser({
      ...base(),
      age: -3,
    });
    expect(error).toBeDefined();
  });

  it("rejects non-integer age", () => {
    const { error } = AdminValidation.createUser({
      ...base(),
      age: 1.5,
    });
    expect(error).toBeDefined();
  });
});
