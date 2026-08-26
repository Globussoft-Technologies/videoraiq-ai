/**
 * Schema coverage for AttendanceAutoEmailReport's `history` field — added so
 * admins can see what was actually delivered (when, to whom, which stored
 * files) for a report, since delivery now uploads files to storage and
 * emails a link instead of attaching them (nothing else records that a send
 * happened, beyond lastSentAt/lastError which don't carry file references).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Report } = await import(
  "../../../core/v2/attendanceAutoEmailReport/attendanceAutoEmailReport.model.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

async function seedAdmin() {
  return Admin.create({ user_id: "1", login: "a", email: "a@test.com" });
}

describe("AttendanceAutoEmailReport model — history", () => {
  it("defaults to an empty array on a fresh report", async () => {
    const admin = await seedAdmin();
    const report = await Report.create({
      title: "Report A",
      adminId: admin._id,
      recipients: ["a@test.com"],
      timezone: "Asia/Kolkata",
      schedule: { frequency: "daily" },
      formats: ["pdf"],
    });
    expect(report.history).toEqual([]);
  });

  it("stores a delivery entry with sentAt, period, rowCount, recipients, and file paths", async () => {
    const admin = await seedAdmin();
    const report = await Report.create({
      title: "Report B",
      adminId: admin._id,
      recipients: ["a@test.com"],
      timezone: "Asia/Kolkata",
      schedule: { frequency: "daily" },
      formats: ["pdf", "csv"],
    });

    await Report.updateOne(
      { _id: report._id },
      {
        $push: {
          history: {
            $each: [{
              sentAt: new Date(),
              period: "01 Aug 2026 – 26 Aug 2026",
              rowCount: 1716,
              recipients: ["a@test.com"],
              files: [
                { format: "pdf", path: "/uploads/reports/abc/report.pdf" },
                { format: "csv", path: "/uploads/reports/abc/report.csv" },
              ],
            }],
            $position: 0,
            $slice: 50,
          },
        },
      }
    );

    const reloaded = await Report.findById(report._id).lean();
    expect(reloaded.history).toHaveLength(1);
    const entry = reloaded.history[0];
    expect(entry.rowCount).toBe(1716);
    expect(entry.period).toBe("01 Aug 2026 – 26 Aug 2026");
    expect(entry.recipients).toEqual(["a@test.com"]);
    expect(entry.files.map((f) => f.format).sort()).toEqual(["csv", "pdf"]);
  });

  it("keeps only the most recent HISTORY_LIMIT (50) entries, newest first", async () => {
    const admin = await seedAdmin();
    const report = await Report.create({
      title: "Report C",
      adminId: admin._id,
      recipients: ["a@test.com"],
      timezone: "Asia/Kolkata",
      schedule: { frequency: "daily" },
      formats: ["pdf"],
    });

    for (let i = 0; i < 55; i++) {
      await Report.updateOne(
        { _id: report._id },
        {
          $push: {
            history: {
              $each: [{ sentAt: new Date(), period: `run-${i}`, rowCount: i, recipients: ["a@test.com"], files: [] }],
              $position: 0,
              $slice: 50,
            },
          },
        }
      );
    }

    const reloaded = await Report.findById(report._id).lean();
    expect(reloaded.history).toHaveLength(50);
    // Most recent push (run-54) should be first since $position: 0 puts new entries at the front.
    expect(reloaded.history[0].period).toBe("run-54");
  });
});
