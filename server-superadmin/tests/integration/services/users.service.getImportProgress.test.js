/**
 * UsersService.getImportProgress — pure helper that reads the module-scope
 * `importJobs` Map. Branches:
 *   - missing adminId → 400
 *   - no job for the adminId → 400
 *   - job present → 200 with the job payload
 *
 * Mocks: 0 — no DB, no network, no fs side effects.
 */
import { describe, it, expect } from "vitest";

const usersServiceModule = await import(
  "../../../core/v1/users/users.service.js"
);
const { default: UsersService, importJobs } = usersServiceModule;

function ctx({ adminId } = {}) {
  return {
    req: { verified: { userData: { adminId } } },
    res: {
      statusCode: 200,
      _body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this._body = payload;
        return this;
      },
    },
  };
}

describe("UsersService.getImportProgress", () => {
  it("returns 400 when adminId is missing on the verified token", async () => {
    const { req, res } = ctx({});
    await UsersService.getImportProgress(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body?.body?.status).toBe("failed");
  });

  it("returns 400 when no import job exists for the admin", async () => {
    const { req, res } = ctx({ adminId: "no-job-admin-id" });
    // Ensure no stale entry from a previous run.
    importJobs.delete("no-job-admin-id");
    await UsersService.getImportProgress(req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body?.body?.status).toBe("failed");
  });

  it("returns the job payload when one is present", async () => {
    const adminId = "import-progress-admin";
    importJobs.set(adminId, {
      status: "running",
      processed: 3,
      total: 10,
      percentage: 30,
    });
    try {
      const { req, res } = ctx({ adminId });
      await UsersService.getImportProgress(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._body?.body?.status).toBe("success");
      expect(res._body?.body?.data?.processed).toBe(3);
      expect(res._body?.body?.data?.total).toBe(10);
    } finally {
      importJobs.delete(adminId);
    }
  });
});
