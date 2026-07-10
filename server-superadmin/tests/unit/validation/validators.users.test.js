/**
 * Pure-Joi validator tests for authorizedUsers + profiles modules:
 *   - authorizedUsers.validate.js (createAuthUser, updateAuthUser, createAuthUserBulk)
 *   - profiles.validate.js (createProfileValidator, editProfileValidator)
 *
 * No DB, no mocks. Pure schema validation.
 */
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import AuthUsersValidator from "../../../core/v1/authorizedUsers/authorizedUsers.validate.js";
import {
  createProfileValidator,
  editProfileValidator,
} from "../../../core/v1/profiles/profiles.validate.js";

const hex24 = () => new mongoose.Types.ObjectId().toString();

// ---------------------------------------------------------------------------
// authorizedUsers.validate.js
// ---------------------------------------------------------------------------
describe("AuthUsersValidator.createAuthUser", () => {
  const base = () => ({
    firstName: "John",
    lastName: "Doe",
    email: "john@doe.com",
    profilePics: ["http://image.test/1.jpg"],
    password: "secret",
  });

  it("accepts a minimal valid body", () => {
    expect(AuthUsersValidator.createAuthUser(base()).error).toBeUndefined();
  });

  it("requires profilePics array (min 1)", () => {
    const body = base();
    body.profilePics = [];
    expect(AuthUsersValidator.createAuthUser(body).error).toBeDefined();
  });

  it("requires password", () => {
    const body = base();
    delete body.password;
    expect(AuthUsersValidator.createAuthUser(body).error).toBeDefined();
  });

  it("requires profilePics", () => {
    const body = base();
    delete body.profilePics;
    expect(AuthUsersValidator.createAuthUser(body).error).toBeDefined();
  });

  it("rejects invalid email", () => {
    const body = base();
    body.email = "not-an-email";
    expect(AuthUsersValidator.createAuthUser(body).error).toBeDefined();
  });

  it("rejects too-long firstName/lastName (>50)", () => {
    const long = "a".repeat(51);
    expect(
      AuthUsersValidator.createAuthUser({
        ...base(),
        firstName: long,
      }).error,
    ).toBeDefined();
  });

  it("accepts roleIds as an array + a hex24 departmentId", () => {
    const { error } = AuthUsersValidator.createAuthUser({
      ...base(),
      roleIds: [hex24()],
      departmentId: hex24(),
    });
    expect(error).toBeUndefined();
  });
});

describe("AuthUsersValidator.updateAuthUser", () => {
  it("accepts an empty body (all optional)", () => {
    expect(AuthUsersValidator.updateAuthUser({}).error).toBeUndefined();
  });

  it("rejects invalid email when supplied", () => {
    expect(
      AuthUsersValidator.updateAuthUser({ email: "bad" }).error,
    ).toBeDefined();
  });

  it("rejects empty firstName when supplied", () => {
    expect(
      AuthUsersValidator.updateAuthUser({ firstName: "" }).error,
    ).toBeDefined();
  });

  it("accepts partial updates", () => {
    const { error } = AuthUsersValidator.updateAuthUser({
      firstName: "New",
      designation: "Manager",
      branch: "HQ",
      roleIds: [hex24()],
    });
    expect(error).toBeUndefined();
  });
});

describe("AuthUsersValidator.createAuthUserBulk", () => {
  it("accepts an empty users array", () => {
    expect(
      AuthUsersValidator.createAuthUserBulk({ users: [] }).error,
    ).toBeUndefined();
  });

  it("accepts a populated users array", () => {
    const { error } = AuthUsersValidator.createAuthUserBulk({
      users: [
        {
          firstName: "John",
          lastName: "Doe",
          userName: "jdoe",
          email: "john@doe.com",
        },
      ],
    });
    expect(error).toBeUndefined();
  });

  it("rejects when users[].email is invalid", () => {
    const { error } = AuthUsersValidator.createAuthUserBulk({
      users: [
        {
          firstName: "John",
          lastName: "Doe",
          userName: "jdoe",
          email: "bad",
        },
      ],
    });
    expect(error).toBeDefined();
  });

  it("rejects when users[].firstName is empty", () => {
    const { error } = AuthUsersValidator.createAuthUserBulk({
      users: [
        {
          firstName: "",
          lastName: "Doe",
          userName: "jdoe",
        },
      ],
    });
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// profiles.validate.js — createProfileValidator
// ---------------------------------------------------------------------------
describe("createProfileValidator", () => {
  const validTimeSlot = { startTime: "09:00", endTime: "17:00" };
  const baseDays = {
    monday: [validTimeSlot],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  const baseBasics = {
    profileName: "Default",
    timeZone: "Asia/Kolkata",
    days: baseDays,
  };
  const baseNotification = {
    notify: "Digest",
    digestEveryMinutes: 10,
    channels: { email: true },
  };
  const baseEvidence = { evidenceType: "Snapshot", time: 30 };
  const baseDDS = {
    objects: {
      personalProtectiveEquipment: [],
      crowdDetection: [],
    },
  };

  const base = () => ({
    userType: "Admin",
    user: hex24(),
    createdBy: hex24(),
    basics: baseBasics,
    notification: baseNotification,
    evidenceSeverity: baseEvidence,
    defaultDetectionSettings: baseDDS,
  });

  it("accepts a minimal valid profile", () => {
    const { error } = createProfileValidator.validate(base());
    expect(error).toBeUndefined();
  });

  it("rejects an invalid userType", () => {
    const body = base();
    body.userType = "guest";
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects a non-IANA timezone", () => {
    const body = base();
    body.basics = { ...baseBasics, timeZone: "Mars/Olympus" };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects malformed time slot (missing colon)", () => {
    const body = base();
    body.basics = {
      ...baseBasics,
      days: {
        ...baseDays,
        monday: [{ startTime: "9am", endTime: "5pm" }],
      },
    };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects non-hex24 user / createdBy", () => {
    const body = base();
    body.user = "abc";
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects an invalid webhooks url", () => {
    const body = base();
    body.notification = {
      ...baseNotification,
      webhooks: [{ url: "not a uri", method: "POST" }],
    };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects an invalid HTTP method on webhooks", () => {
    const body = base();
    body.notification = {
      ...baseNotification,
      webhooks: [{ url: "http://x.test", method: "PATCH" }],
    };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects an invalid evidenceType", () => {
    const body = base();
    body.evidenceSeverity = { evidenceType: "Hologram", time: 5 };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("rejects time < 1 on evidenceSeverity", () => {
    const body = base();
    body.evidenceSeverity = { evidenceType: "Snapshot", time: 0 };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("requires defaultDetectionSettings.objects", () => {
    const body = base();
    body.defaultDetectionSettings = {};
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });

  it("accepts when defaultDetectionSettings is omitted (optional)", () => {
    const body = base();
    delete body.defaultDetectionSettings;
    expect(createProfileValidator.validate(body).error).toBeUndefined();
  });

  it("rejects invalid notify enum", () => {
    const body = base();
    body.notification = { ...baseNotification, notify: "Loud" };
    expect(createProfileValidator.validate(body).error).toBeDefined();
  });
});

describe("editProfileValidator", () => {
  it("accepts an empty body (all optional)", () => {
    const { error } = editProfileValidator.validate({});
    expect(error).toBeUndefined();
  });

  it("rejects an invalid userType when supplied", () => {
    const { error } = editProfileValidator.validate({ userType: "guest" });
    expect(error).toBeDefined();
  });

  it("rejects non-hex24 user", () => {
    const { error } = editProfileValidator.validate({ user: "abc" });
    expect(error).toBeDefined();
  });
});
