/**
 * Who an incident's alert goes to (recipients.model.js, used by alert.events.js
 * v1 and v2). Verified recipients only, two ways:
 * - selectedRecipientsQuery: ticked on the detection; Detection Types empty or
 *   include the incident's type.
 * - subscribedRecipientsQuery: Detection Types include the type, email only.
 * Both honour per-type severities; an empty setting means no limit.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Recipient, selectedRecipientsQuery, subscribedRecipientsQuery, normalizeSeverity } = await import(
  "../../../core/v2/verifyRecipients/recipients.model.js"
);

const adminId = new mongoose.Types.ObjectId();
const make = (value, extra = {}) => Recipient.create({ adminId, type: "email", value, verified: true, ...extra });
// Inserted raw, so the row has none of the optional fields: an old recipient.
const legacy = async (value) =>
  (await Recipient.collection.insertOne({ adminId, type: "email", value, verified: true })).insertedId;
const idsOf = (rows) => rows.map((r) => r._id ?? r);
const values = (rows) => rows.map((r) => r.value).sort();

// The detection's Select Recipients list for the test at hand.
let ticked = [];
const selected = async (filter = {}) =>
  values(await Recipient.find(selectedRecipientsQuery({ ids: ticked, detectionType: "crowdDetection", ...filter })).lean());
const subscribed = async (filter = {}) =>
  values(await Recipient.find(subscribedRecipientsQuery({ adminId, detectionType: "crowdDetection", ...filter })).lean());

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  ticked = [];
});

describe("selected on the detection", () => {
  it("only verified, ticked recipients", async () => {
    ticked = idsOf(await Promise.all([make("ticked@x.com"), make("unverified@x.com", { verified: false })]));
    await make("notTicked@x.com");
    expect(await selected()).toEqual(["ticked@x.com"]);
  });

  it("Detection Types empty means any type; otherwise the incident's type must be picked", async () => {
    ticked = idsOf(await Promise.all([
      make("anyType@x.com"),
      make("crowd@x.com", { incidentTypes: ["crowdDetection"] }),
      make("fireOnly@x.com", { incidentTypes: ["fireSmokeDetection"] }),
    ]));
    ticked.push(await legacy("legacy@x.com"));
    expect(await selected()).toEqual(["anyType@x.com", "crowd@x.com", "legacy@x.com"]);
  });

  it("keeps email and phone recipients apart", async () => {
    ticked = idsOf(await Promise.all([make("mail@x.com"), make("+911234567890", { type: "phone" })]));
    expect(await selected()).toEqual(["mail@x.com"]);
    expect(await selected({ type: "phone" })).toEqual(["+911234567890"]);
  });
});

describe("subscribed by Detection Types", () => {
  it("verified recipients of this admin who picked the type, ticked or not", async () => {
    await Promise.all([
      make("crowd@x.com", { incidentTypes: ["crowdDetection"] }),
      make("unverified@x.com", { incidentTypes: ["crowdDetection"], verified: false }),
      make("fireOnly@x.com", { incidentTypes: ["fireSmokeDetection"] }),
      make("noTypes@x.com"),
      make("+911234567890", { type: "phone", incidentTypes: ["crowdDetection"] }),
      Recipient.create({ adminId: new mongoose.Types.ObjectId(), type: "email", value: "otherAdmin@x.com", verified: true, incidentTypes: ["crowdDetection"] }),
    ]);
    expect(await subscribed()).toEqual(["crowd@x.com"]);
  });

  it("still honours the old PPE key the form used to save", async () => {
    await make("oldPpe@x.com", { incidentTypes: ["personProtectiveEquipment"] });
    expect(await subscribed({ detectionType: "personalProtectiveEquipment" })).toEqual(["oldPpe@x.com"]);
  });
});

describe("severities per detection type, both ways", () => {
  beforeEach(async () => {
    const both = ["crowdDetection", "fireSmoke"];
    ticked = idsOf(await Promise.all([
      make("any@x.com", { incidentTypes: both }),
      // High only for crowd; fire/smoke left at every severity.
      make("crowdHigh@x.com", { incidentTypes: both, severityByType: { crowdDetection: ["high"] } }),
      make("lowModerate@x.com", { incidentTypes: both, severityByType: { crowdDetection: ["low", "moderate"], fireSmoke: [] } }),
    ]));
  });

  it("a high crowd incident reaches unrestricted and crowd-high recipients", async () => {
    const expected = ["any@x.com", "crowdHigh@x.com"];
    expect(await selected({ severity: "high" })).toEqual(expected);
    expect(await subscribed({ severity: "high" })).toEqual(expected);
  });

  it("a moderate crowd incident skips the crowd-high recipient", async () => {
    const expected = ["any@x.com", "lowModerate@x.com"];
    expect(await selected({ severity: "moderate" })).toEqual(expected);
    expect(await subscribed({ severity: "moderate" })).toEqual(expected);
  });

  it("one detection's severity choice does not limit another detection", async () => {
    expect(await subscribed({ detectionType: "fireSmoke", severity: "low" })).toEqual(["any@x.com", "crowdHigh@x.com", "lowModerate@x.com"]);
  });

  it("an incident of unknown severity reaches everyone", async () => {
    const expected = ["any@x.com", "crowdHigh@x.com", "lowModerate@x.com"];
    expect(await selected({ severity: null })).toEqual(expected);
    expect(await subscribed({ severity: null })).toEqual(expected);
  });

  it("normalizes legacy spellings", () => {
    expect(["Medium", "HIGH", " low ", "critical", null].map(normalizeSeverity)).toEqual(["moderate", "high", "low", null, null]);
  });
});
