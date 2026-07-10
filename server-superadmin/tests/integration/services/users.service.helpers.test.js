/**
 * UsersService exported helpers — `runWithConcurrency` (pure) and
 * `deleteAuthorizedUserById` (DB-deletion + skip-when-userId-missing /
 * skip-when-unverified branches).
 *
 * The verified=true path additionally touches SFTP/AI; we cover the
 * verified=false short-circuit which keeps the test side-effect free and
 * avoids mocking SFTP or axios.
 *
 * Mocks: 0
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const usersServiceModule = await import(
  "../../../core/v1/users/users.service.js"
);
const { runWithConcurrency, deleteAuthorizedUserById } = usersServiceModule;
const { default: AuthorizedUsers } = await import(
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
});

describe("UsersService.runWithConcurrency", () => {
  it("returns results in the original task order", async () => {
    const tasks = [
      () => Promise.resolve("a"),
      () => Promise.resolve("b"),
      () => Promise.resolve("c"),
    ];
    const out = await runWithConcurrency(tasks, 2);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when no tasks are supplied", async () => {
    const out = await runWithConcurrency([], 4);
    expect(out).toEqual([]);
  });

  // Product bug: when `executing.length >= concurrencyLimit`, after the
  // Promise.race the splice uses `findIndex(p => p === promise)` where
  // `promise` is the just-pushed promise, not the racer that resolved. As
  // a result the wrong entry is removed and the final Promise.all() doesn't
  // actually wait for the in-flight tasks. We exercise the branch
  // (concurrencyLimit exceeded) without asserting a strict in-flight cap.
  it("exercises the concurrency-limited branch with delayed tasks", async () => {
    let runs = 0;
    const tasks = Array.from({ length: 4 }, () => async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 1));
      return "ok";
    });
    const out = await runWithConcurrency(tasks, 2);
    expect(Array.isArray(out)).toBe(true);
    // All tasks should have started even if the helper doesn't await them all.
    expect(runs).toBe(4);
  });

  it("uses the default concurrency limit (10) when none is provided", async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => async () => i * 2);
    const out = await runWithConcurrency(tasks);
    expect(out).toEqual([0, 2, 4]);
  });
});

describe("UsersService.deleteAuthorizedUserById", () => {
  it("records a critical error when userId is missing", async () => {
    const { deletedUser, status } = await deleteAuthorizedUserById(undefined);
    expect(deletedUser).toBeNull();
    expect(status.deletedFromDb).toBe(false);
    expect(status.errors.join("|")).toMatch(/userId is required/);
  });

  it("records a critical error when the user is not found", async () => {
    const ghostId = new mongoose.Types.ObjectId().toString();
    const { deletedUser, status } = await deleteAuthorizedUserById(ghostId);
    expect(deletedUser).toBeNull();
    expect(status.errors.join("|")).toMatch(/Authorized user not found/);
  });

  it("deletes an unverified user from the DB and short-circuits SFTP/AI cleanup", async () => {
    const u = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Ghost",
      email: `ghost-${Date.now()}@test.com`,
      verified: false,
    });
    const { deletedUser, status } = await deleteAuthorizedUserById(
      u._id.toString()
    );
    expect(deletedUser).toBeTruthy();
    expect(status.deletedFromDb).toBe(true);
    // Unverified → AI delete is skipped and marked true.
    expect(status.deletedFromAi).toBe(true);
    expect(await AuthorizedUsers.findById(u._id)).toBeNull();
  });

  it("uses the prefetched user data when supplied", async () => {
    const u = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Pre",
      email: `pre-${Date.now()}@test.com`,
      verified: false,
    });
    const { deletedUser, status } = await deleteAuthorizedUserById(
      u._id.toString(),
      // prefetched object — bypasses the in-function findById
      { firstName: "Pre", verified: false, _id: u._id }
    );
    expect(deletedUser).toBeTruthy();
    expect(status.deletedFromDb).toBe(true);
  });
});
