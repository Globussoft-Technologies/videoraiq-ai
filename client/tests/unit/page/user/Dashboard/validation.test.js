/**
 * src/page/user/Dashboard/validation.jsx — Yup schema used by the user-create
 * form on the Dashboard. Pure schema, no mocks. Cover required fields, the
 * alphabet regex, length bounds, and a happy path.
 */
import { describe, it, expect } from "vitest";
import { validationSchema } from "../../../../../src/page/user/Dashboard/validation.jsx";

const validInput = {
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
};

describe("page/Dashboard validationSchema", () => {
  it("accepts a fully valid payload", async () => {
    await expect(validationSchema.validate(validInput)).resolves.toEqual(
      validInput
    );
  });

  it("rejects when firstName is missing", async () => {
    // Yup runs the alphabet regex first and rejects "" with that message,
    // so we drop the key entirely to exercise the required() rule.
    const { firstName: _drop, ...rest } = validInput;
    await expect(validationSchema.validate(rest)).rejects.toThrow(
      /First name is required/
    );
  });

  it("rejects firstName with digits or punctuation", async () => {
    await expect(
      validationSchema.validate({ ...validInput, firstName: "Alice1" })
    ).rejects.toThrow(/Only alphabets and spaces allowed/);
  });

  it("rejects firstName shorter than 2 characters", async () => {
    await expect(
      validationSchema.validate({ ...validInput, firstName: "A" })
    ).rejects.toThrow(/at least 2 characters/);
  });

  it("rejects firstName longer than 30 characters", async () => {
    await expect(
      validationSchema.validate({
        ...validInput,
        firstName: "A".repeat(31),
      })
    ).rejects.toThrow(/cannot exceed 30 characters/);
  });

  it("rejects when lastName is missing", async () => {
    // Same as firstName: empty string trips the alphabet regex first.
    const { lastName: _drop, ...rest } = validInput;
    await expect(validationSchema.validate(rest)).rejects.toThrow(
      /Last name is required/
    );
  });

  it("rejects lastName longer than 30 characters", async () => {
    await expect(
      validationSchema.validate({
        ...validInput,
        lastName: "Z".repeat(31),
      })
    ).rejects.toThrow(/cannot exceed 30 characters/);
  });

  it("rejects when email is missing", async () => {
    await expect(
      validationSchema.validate({ ...validInput, email: "" })
    ).rejects.toThrow(/Email is required/);
  });

  it("rejects malformed email values", async () => {
    await expect(
      validationSchema.validate({ ...validInput, email: "not-an-email" })
    ).rejects.toThrow(/Invalid email/);
  });

  it("accepts a single-character last name (boundary)", async () => {
    await expect(
      validationSchema.validate({ ...validInput, lastName: "K" })
    ).resolves.toBeTruthy();
  });
});
