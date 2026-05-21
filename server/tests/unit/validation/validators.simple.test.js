/**
 * Pure-Joi validator tests for several small modules:
 *   - incidents.validate.js
 *   - departments.validate.js
 *   - location.validation.js
 *   - shift.validate.js
 *   - domain.validate.js
 *   - recipients.validate.js   (verifyRecipients)
 *
 * No mocks, no DB. Each module exports either a default class instance with
 * methods or a named Joi schema object. We exercise required / optional /
 * branch paths.
 */
import { describe, it, expect } from "vitest";

import IncidentsValidator from "../../../core/v1/incidents/incidents.validate.js";
import DepartmentValidator from "../../../core/v1/departments/departments.validate.js";
import LocationValidator from "../../../core/v1/locations/location.validation.js";
import {
  createShiftValidator,
  updateShiftValidator,
} from "../../../core/v1/shifts/shift.validate.js";
import DomainValidation from "../../../core/v1/domain/domain.validate.js";
import RecipientValidation from "../../../core/v1/verifyRecipients/recipients.validate.js";

// ---------------------------------------------------------------------------
// incidents.validate.js — getChannel
// ---------------------------------------------------------------------------
describe("IncidentsValidator.getChannel", () => {
  it("accepts a valid channelId string", () => {
    const { error } = IncidentsValidator.getChannel({ channelId: "abc123" });
    expect(error).toBeUndefined();
  });

  it("rejects when channelId missing", () => {
    const { error } = IncidentsValidator.getChannel({});
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain("channelId");
  });

  it("rejects when channelId is not a string", () => {
    const { error } = IncidentsValidator.getChannel({ channelId: 1234 });
    expect(error).toBeDefined();
  });

  it("rejects unknown keys", () => {
    const { error } = IncidentsValidator.getChannel({
      channelId: "abc",
      foo: "bar",
    });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// departments.validate.js — create / update
// ---------------------------------------------------------------------------
describe("DepartmentValidator.createDepartment", () => {
  it("accepts a minimal valid body", () => {
    const { error, value } = DepartmentValidator.createDepartment({
      departmentName: "Engineering",
    });
    expect(error).toBeUndefined();
    expect(value.isActive).toBe(true); // default
    expect(value.softDelete).toBe(false); // default
  });

  it("requires departmentName", () => {
    const { error } = DepartmentValidator.createDepartment({});
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain("departmentName");
  });

  it("rejects non-string departmentName", () => {
    const { error } = DepartmentValidator.createDepartment({
      departmentName: 42,
    });
    expect(error).toBeDefined();
  });

  it("rejects non-integer empDepartmentId", () => {
    const { error } = DepartmentValidator.createDepartment({
      departmentName: "Eng",
      empDepartmentId: "abc",
    });
    expect(error).toBeDefined();
  });

  it("allows null description / empDepartmentId", () => {
    const { error } = DepartmentValidator.createDepartment({
      departmentName: "Eng",
      description: null,
      empDepartmentId: null,
    });
    expect(error).toBeUndefined();
  });

  it("rejects non-boolean isActive", () => {
    const { error } = DepartmentValidator.createDepartment({
      departmentName: "Eng",
      isActive: "yes",
    });
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/isActive/);
  });
});

describe("DepartmentValidator.updateDepartment", () => {
  it("accepts an update with the required departmentName", () => {
    const { error } = DepartmentValidator.updateDepartment({
      departmentName: "Sales",
    });
    expect(error).toBeUndefined();
  });

  it("still requires departmentName on update", () => {
    const { error } = DepartmentValidator.updateDepartment({ orgId: "org1" });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// locations.validation.js — create / update
// ---------------------------------------------------------------------------
describe("LocationValidator.createLocation", () => {
  it("accepts a valid locationName", () => {
    const { error } = LocationValidator.createLocation({
      locationName: "HQ",
    });
    expect(error).toBeUndefined();
  });

  it("rejects when locationName missing", () => {
    const { error } = LocationValidator.createLocation({});
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/Location Name is required/);
  });

  it("rejects empty locationName", () => {
    const { error } = LocationValidator.createLocation({ locationName: "" });
    expect(error).toBeDefined();
  });

  it("accepts empLocationId = '' (treated as undefined)", () => {
    const { error, value } = LocationValidator.createLocation({
      locationName: "HQ",
      empLocationId: "",
    });
    expect(error).toBeUndefined();
    expect(value.empLocationId).toBeUndefined();
  });
});

describe("LocationValidator.updateLocation", () => {
  it("requires at least one field (min(1))", () => {
    const { error } = LocationValidator.updateLocation({});
    expect(error).toBeDefined();
  });

  it("accepts a partial update with just locationName", () => {
    const { error } = LocationValidator.updateLocation({
      locationName: "Branch 1",
    });
    expect(error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// shift.validate.js — create / update
// ---------------------------------------------------------------------------
describe("createShiftValidator", () => {
  const validTimings = {
    monday: { enabled: true, start: "09:00", end: "17:00" },
    tuesday: { enabled: false },
    wednesday: { enabled: false },
    thursday: { enabled: false },
    friday: { enabled: false },
    saturday: { enabled: false },
    sunday: { enabled: false },
  };

  it("accepts a valid shift body", () => {
    const { error } = createShiftValidator.validate({
      name: "Morning",
      color: "#fff",
      timings: validTimings,
    });
    expect(error).toBeUndefined();
  });

  it("requires name with min length 3", () => {
    const { error } = createShiftValidator.validate({
      name: "ab",
      color: "#fff",
      timings: validTimings,
    });
    expect(error).toBeDefined();
  });

  it("requires color", () => {
    const { error } = createShiftValidator.validate({
      name: "Night",
      timings: validTimings,
    });
    expect(error).toBeDefined();
  });

  it("requires start/end on enabled days", () => {
    const { error } = createShiftValidator.validate({
      name: "Late",
      color: "red",
      timings: { ...validTimings, monday: { enabled: true } },
    });
    expect(error).toBeDefined();
  });

  it("permits omitting start/end on disabled days", () => {
    const { error } = createShiftValidator.validate({
      name: "Late",
      color: "red",
      timings: { ...validTimings, monday: { enabled: false } },
    });
    expect(error).toBeUndefined();
  });

  it("accepts optional settings + note", () => {
    const { error } = createShiftValidator.validate({
      name: "Morning",
      color: "blue",
      timings: validTimings,
      settings: { lateLogin: 5, earlyLogout: 0 },
      note: "",
    });
    expect(error).toBeUndefined();
  });
});

describe("updateShiftValidator", () => {
  it("allows an empty body (all keys optional)", () => {
    const { error } = updateShiftValidator.validate({});
    expect(error).toBeUndefined();
  });

  it("still enforces min length on name when supplied", () => {
    const { error } = updateShiftValidator.validate({ name: "ab" });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// domain.validate.js — registerDomain
// ---------------------------------------------------------------------------
describe("DomainValidation.registerDomain", () => {
  const base = {
    domainName: "https://example.com",
    ip: "192.168.1.10",
    port: 8080,
  };

  it("accepts a valid http/https domain + IPv4", () => {
    expect(DomainValidation.registerDomain(base).error).toBeUndefined();
  });

  it("accepts an IPv6 address", () => {
    const { error } = DomainValidation.registerDomain({
      ...base,
      ip: "::1",
    });
    expect(error).toBeUndefined();
  });

  it("rejects CIDR notation in ip", () => {
    const { error } = DomainValidation.registerDomain({
      ...base,
      ip: "192.168.1.0/24",
    });
    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/ip/);
  });

  it("rejects a non-http scheme", () => {
    const { error } = DomainValidation.registerDomain({
      ...base,
      domainName: "ftp://example.com",
    });
    expect(error).toBeDefined();
  });

  it("rejects port out of range", () => {
    expect(
      DomainValidation.registerDomain({ ...base, port: 0 }).error,
    ).toBeDefined();
    expect(
      DomainValidation.registerDomain({ ...base, port: 70000 }).error,
    ).toBeDefined();
  });

  it("requires all three fields", () => {
    for (const key of ["domainName", "ip", "port"]) {
      const body = { ...base };
      delete body[key];
      expect(DomainValidation.registerDomain(body).error).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// recipients.validate.js — createRecipient / recentRecipient / updateRecipient
// ---------------------------------------------------------------------------
describe("RecipientValidation.createRecipient", () => {
  it("accepts email-only", () => {
    expect(
      RecipientValidation.createRecipient({ email: "a@b.com" }).error,
    ).toBeUndefined();
  });

  it("accepts phoneNumber-only with E.164-ish digits", () => {
    expect(
      RecipientValidation.createRecipient({ phoneNumber: "+15555550000" })
        .error,
    ).toBeUndefined();
  });

  it("rejects a malformed phoneNumber", () => {
    const { error } = RecipientValidation.createRecipient({
      phoneNumber: "abc",
    });
    expect(error).toBeDefined();
  });

  it("rejects a non-email string", () => {
    const { error } = RecipientValidation.createRecipient({
      email: "not-an-email",
    });
    expect(error).toBeDefined();
  });

  it("accepts incidentTypes array", () => {
    const { error } = RecipientValidation.createRecipient({
      email: "a@b.com",
      incidentTypes: ["motionDetection", "lineCrossing"],
    });
    expect(error).toBeUndefined();
  });
});

describe("RecipientValidation.recentRecipient", () => {
  it("accepts an empty body (both nullable)", () => {
    const { error } = RecipientValidation.recentRecipient({});
    expect(error).toBeUndefined();
  });

  it("rejects invalid email", () => {
    const { error } = RecipientValidation.recentRecipient({
      email: "bad",
    });
    expect(error).toBeDefined();
  });
});

describe("RecipientValidation.updateRecipient", () => {
  it("accepts an empty body", () => {
    expect(RecipientValidation.updateRecipient({}).error).toBeUndefined();
  });

  it("accepts incidentTypes string array", () => {
    expect(
      RecipientValidation.updateRecipient({
        incidentTypes: ["x"],
      }).error,
    ).toBeUndefined();
  });

  it("rejects non-string incidentTypes element", () => {
    const { error } = RecipientValidation.updateRecipient({
      incidentTypes: [123],
    });
    expect(error).toBeDefined();
  });
});
