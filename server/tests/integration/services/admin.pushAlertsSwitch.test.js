import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import adminModel from "../../../core/v2/admin/admin.model.js";
import adminService from "../../../core/v2/admin/admin.service.js";

const mockRes = () => {
  const res = {};
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (payload) => ((res.payload = payload), res);
  return res;
};
const call = async (method, adminId, body) => {
  const res = mockRes();
  let nextErr;
  await adminService[method]({ verified: { userData: { adminId } }, body }, res, (e) => (nextErr = e));
  if (nextErr) throw nextErr;
  return res;
};

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("Push alerts switch (Settings ▸ Alert Channels)", () => {
  it("is on by default, including admins created before the field existed", async () => {
    const { insertedId: _id } = await adminModel.collection.insertOne({ email: "old@x.com", user_id: 1 }); // raw insert: no schema defaults
    const res = await call("getAlertSwitches", _id.toString());
    expect(res.statusCode).toBe(200);
    expect(res.payload.body.data.pushAlertsEnabled).toBe(true);
  });

  it("turns push off and back on", async () => {
    const { insertedId: _id } = await adminModel.collection.insertOne({ email: "a@x.com", user_id: 2 });
    const adminId = _id.toString();

    const off = await call("updatePushAlertsEnabled", adminId, { pushAlertsEnabled: false });
    expect(off.statusCode).toBe(200);
    expect((await call("getAlertSwitches", adminId)).payload.body.data.pushAlertsEnabled).toBe(false);

    await call("updatePushAlertsEnabled", adminId, { pushAlertsEnabled: true });
    expect((await call("getAlertSwitches", adminId)).payload.body.data.pushAlertsEnabled).toBe(true);
  });

  it("rejects a non-boolean value without changing anything", async () => {
    const { insertedId: _id } = await adminModel.collection.insertOne({ email: "b@x.com", user_id: 3, pushAlertsEnabled: true });
    const res = await call("updatePushAlertsEnabled", _id.toString(), { pushAlertsEnabled: "no" });
    expect(res.statusCode).toBe(400);
    expect((await adminModel.findById(_id).lean()).pushAlertsEnabled).toBe(true);
  });
});
