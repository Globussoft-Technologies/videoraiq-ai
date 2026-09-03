/**
 * EmpExitSync — hourly suspend-on-exit sweep.
 *
 * Covers: active user with a date_of_exit gets suspended; a null/missing
 * date_of_exit is left alone; an already-suspended user is a no-op (status
 * filter keeps repeat runs idempotent); no VideoRDB match is a no-op;
 * email matching is case-insensitive; one admin's EmpMonitor failure doesn't
 * stop the sweep for the rest; pagination keeps walking while pages are full
 * even when EmpMonitor under-reports `count`.
 *
 * Mocks: 1 — axios.
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

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import axios from "axios";

const { runEmpExitSync } = await import(
  "../../../services/empExitSync.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: AuthorizedUser } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
});

async function makeAdmin(empData) {
  return Admin.create({
    user_id: `u-${Math.random()}`,
    login: `login-${Math.random()}`,
    email: `admin-${Math.random()}@test.com`,
    empData,
  });
}

describe("runEmpExitSync", () => {
  it("suspends an active VideoRDB user whose EmpMonitor record has a date_of_exit", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "velmathi@globussoft.in",
      status: "active",
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [
            {
              email: "velmathi@globussoft.in",
              status: 0,
              date_of_exit: "2026-07-03",
              full_name: "A Velmathi",
            },
          ],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();

    expect(totals.matched).toBe(1);
    expect(totals.suspended).toBe(1);
    const user = await AuthorizedUser.findOne({ adminId: admin._id });
    expect(user.status).toBe("suspended");
  });

  it("leaves the user active when date_of_exit is null", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "still@x.com",
      status: "active",
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [{ email: "still@x.com", date_of_exit: null }],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();

    expect(totals.suspended).toBe(0);
    const user = await AuthorizedUser.findOne({ adminId: admin._id });
    expect(user.status).toBe("active");
  });

  it("is a no-op for a user already suspended (idempotent repeat run)", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "gone@x.com",
      status: "suspended",
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [{ email: "gone@x.com", date_of_exit: "2026-07-03" }],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();

    expect(totals.matched).toBe(0);
    expect(totals.suspended).toBe(0);
  });

  it("suspends a legacy user with no status field stored at all", async () => {
    // Real rows found via Compass predate the status field / were inserted
    // outside Mongoose, so they carry no status key whatsoever — not even
    // the schema's declared default. Insert via the raw driver, bypassing
    // Mongoose document construction, to reproduce that exactly.
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.collection.insertOne({
      adminId: admin._id,
      email: "legacy@x.com",
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [{ email: "legacy@x.com", date_of_exit: "2026-07-03" }],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();

    expect(totals.matched).toBe(1);
    expect(totals.suspended).toBe(1);
    const user = await AuthorizedUser.findOne({ adminId: admin._id });
    expect(user.status).toBe("suspended");
  });

  it("is a no-op when no VideoRDB user exists for that email", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [{ email: "nobody@x.com", date_of_exit: "2026-07-03" }],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();

    expect(totals.processed).toBe(1);
    expect(totals.matched).toBe(0);
    expect(totals.suspended).toBe(0);
  });

  it("matches email case-insensitively", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "Jane.Smith@X.com",
      status: "active",
    });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          users: [{ email: "jane.smith@x.com", date_of_exit: "2026-07-03" }],
          count: 1,
        },
      },
    });

    const totals = await runEmpExitSync();
    expect(totals.suspended).toBe(1);
  });

  it("skips an admin with no empData entries — no EmpMonitor call made", async () => {
    await makeAdmin([]);

    const totals = await runEmpExitSync();

    expect(axios.post).not.toHaveBeenCalled();
    expect(totals.processed).toBe(0);
  });

  it("keeps syncing the rest when one admin's EmpMonitor call fails", async () => {
    const failing = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    const ok = await makeAdmin([{ email: "org2@x.com", orgId: "222" }]);
    await AuthorizedUser.create({
      adminId: ok._id,
      email: "survivor@x.com",
      status: "active",
    });

    // Order admins are visited follows insertion, so `failing` (created
    // first) is processed before `ok`.
    axios.post
      .mockRejectedValueOnce(new Error("EmpMonitor is down"))
      .mockResolvedValueOnce({
        data: {
          data: {
            users: [{ email: "survivor@x.com", date_of_exit: "2026-07-03" }],
            count: 1,
          },
        },
      });

    const totals = await runEmpExitSync();

    expect(totals.admins).toBe(2);
    expect(totals.suspended).toBe(1);
    const user = await AuthorizedUser.findOne({ adminId: ok._id });
    expect(user.status).toBe("suspended");
  });

  it("walks every full page even when EmpMonitor under-reports count", async () => {
    const admin = await makeAdmin([{ email: "org@x.com", orgId: "111" }]);
    await AuthorizedUser.create({
      adminId: admin._id,
      email: "page2@x.com",
      status: "active",
    });

    const page1Users = Array.from({ length: 200 }, (_, i) => ({
      email: `filler${i}@x.com`,
      date_of_exit: null,
    }));
    axios.post
      .mockResolvedValueOnce({ data: { data: { users: page1Users, count: 1 } } })
      .mockResolvedValueOnce({
        data: {
          data: {
            users: [{ email: "page2@x.com", date_of_exit: "2026-07-03" }],
            count: 1,
          },
        },
      });

    const totals = await runEmpExitSync();

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][1].skip).toBe(0);
    expect(axios.post.mock.calls[1][1].skip).toBe(200);
    expect(totals.processed).toBe(201);
    expect(totals.suspended).toBe(1);
  });
});
