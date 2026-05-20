/**
 * Recipient validation schemas — emailValidationSchema is static, while
 * phoneValidationSchema is a factory that receives a `selectedCountry`.
 */
import { describe, it, expect } from "vitest";
import {
  emailValidationSchema,
  phoneValidationSchema,
} from "../../../../src/components/NotificationRecipientModal/RecipientValidationSchema.jsx";

describe("emailValidationSchema", () => {
  it("accepts a valid uppercase-leading name and email", async () => {
    await expect(
      emailValidationSchema.validate({
        fullName: "Sumit Sharma",
        email: "user@example.com",
      })
    ).resolves.toBeDefined();
  });

  it("rejects a lowercase-leading name", async () => {
    await expect(
      emailValidationSchema.validate({
        fullName: "sumit sharma",
        email: "user@example.com",
      })
    ).rejects.toThrow(/uppercase/i);
  });

  it("rejects too-short full name", async () => {
    await expect(
      emailValidationSchema.validate({
        fullName: "Abc",
        email: "user@example.com",
      })
    ).rejects.toThrow(/at least 6 characters/i);
  });

  it("rejects too-long full name", async () => {
    await expect(
      emailValidationSchema.validate({
        fullName: "A" + "b".repeat(25),
        email: "user@example.com",
      })
    ).rejects.toThrow(/must not exceed/i);
  });

  it("rejects an invalid email format", async () => {
    await expect(
      emailValidationSchema.validate({
        fullName: "Sumit Sharma",
        email: "not-an-email",
      })
    ).rejects.toThrow(/Invalid email format/i);
  });

  it("requires email and fullName", async () => {
    await expect(emailValidationSchema.validate({})).rejects.toBeDefined();
  });
});

describe("phoneValidationSchema(selectedCountry)", () => {
  const india = { value: "91" };
  const schema = phoneValidationSchema(india);

  it("accepts a real Indian mobile number with the valid name", async () => {
    await expect(
      schema.validate({ fullName: "Sumit Sharma", phonenumber: "9876543210" })
    ).resolves.toBeDefined();
  });

  it("rejects an obviously bogus phone number", async () => {
    await expect(
      schema.validate({ fullName: "Sumit Sharma", phonenumber: "1" })
    ).rejects.toThrow(/Invalid phone number format/i);
  });

  it("rejects when phonenumber is missing", async () => {
    await expect(
      schema.validate({ fullName: "Sumit Sharma", phonenumber: "" })
    ).rejects.toThrow(/Phone number is required/i);
  });

  it("rejects when selectedCountry is missing (factory called with null)", async () => {
    const noCountry = phoneValidationSchema(null);
    await expect(
      noCountry.validate({ fullName: "Sumit Sharma", phonenumber: "9876543210" })
    ).rejects.toThrow(/Invalid phone number format/i);
  });

  it("rejects lowercase-leading fullName", async () => {
    await expect(
      schema.validate({ fullName: "sumit", phonenumber: "9876543210" })
    ).rejects.toThrow(/uppercase|at least 6/i);
  });
});
