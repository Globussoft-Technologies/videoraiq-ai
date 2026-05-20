/**
 * The profile-create form uses a multi-step Yup schema array. We exercise
 * the required-field gates for steps 0 (basics) and 1 (notifications), plus
 * the conditional `digestEvery` / `webhook*` / `quiet*` rules.
 */
import { describe, it, expect } from "vitest";
import { validationSchema } from "../../../src/schema/profille/profilecreate.jsx";

const [step0, step1] = validationSchema;

const baseStep0 = {
  profileName: "My Profile",
  timezone: "UTC",
  startFrom: "9:00",
  startFromPeriod: "AM",
  endTo: "5:00",
  endToPeriod: "PM",
};

const baseStep1 = {
  notify: "Instant",
  recipients: ["a@b.com"],
  channels: { email: true },
};

describe("profile-create schema — step 0 (basics)", () => {
  it("passes for a complete basics body", async () => {
    await expect(step0.validate(baseStep0)).resolves.toBeTruthy();
  });

  it("requires profileName", async () => {
    await expect(
      step0.validate({ ...baseStep0, profileName: "" })
    ).rejects.toThrow(/Profile name is required/);
  });

  it("caps profileName at 50 characters", async () => {
    await expect(
      step0.validate({ ...baseStep0, profileName: "x".repeat(51) })
    ).rejects.toThrow(/at most 50 characters/);
  });

  it("requires timezone", async () => {
    await expect(
      step0.validate({ ...baseStep0, timezone: undefined })
    ).rejects.toThrow(/Timezone is required/);
  });

  it("requires both start and end times with their periods", async () => {
    const { startFrom: _s, ...noStart } = baseStep0;
    await expect(step0.validate(noStart)).rejects.toThrow(
      /Start time is required/
    );
    const { endTo: _e, ...noEnd } = baseStep0;
    await expect(step0.validate(noEnd)).rejects.toThrow(/End time is required/);
  });
});

describe("profile-create schema — step 1 (notifications)", () => {
  it("passes for an Instant notification with email channel and one recipient", async () => {
    await expect(step1.validate(baseStep1)).resolves.toBeTruthy();
  });

  it("requires notify", async () => {
    const { notify: _n, ...rest } = baseStep1;
    await expect(step1.validate(rest)).rejects.toThrow(/Notify is required/);
  });

  it("requires at least one recipient", async () => {
    await expect(
      step1.validate({ ...baseStep1, recipients: [] })
    ).rejects.toThrow(/At least one recipient/);
  });

  it("requires at least one channel to be selected", async () => {
    await expect(
      step1.validate({ ...baseStep1, channels: { email: false } })
    ).rejects.toThrow(/At least one channel/);
  });

  it("requires digestEvery only when notify is Digest", async () => {
    await expect(
      step1.validate({ ...baseStep1, notify: "Digest" })
    ).rejects.toThrow(/Digest Every \(Minute\) is required/);

    await expect(
      step1.validate({ ...baseStep1, notify: "Digest", digestEvery: "15" })
    ).resolves.toBeTruthy();
  });

  it("requires webhook URL/method/body only when the webhook channel is enabled", async () => {
    const body = { ...baseStep1, channels: { email: true, webhook: true } };
    // Yup may surface any of the three required-webhook errors first.
    await expect(step1.validate(body)).rejects.toThrow(
      /Webhook (URL|Method|Body) is required/
    );
    await expect(
      step1.validate({
        ...body,
        webhookUrl: "https://hook.example",
        webhookMethod: "POST",
        webhookBody: "{}",
      })
    ).resolves.toBeTruthy();
  });

  it("requires quietFrom / quietTo only when enableQuiet is true", async () => {
    await expect(
      step1.validate({ ...baseStep1, enableQuiet: true })
    ).rejects.toThrow(/Quiet From is required|Quiet To is required/);

    await expect(
      step1.validate({
        ...baseStep1,
        enableQuiet: true,
        quietFrom: "22:00",
        quietTo: "06:00",
      })
    ).resolves.toBeTruthy();
  });
});
