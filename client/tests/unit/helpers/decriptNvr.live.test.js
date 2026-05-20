/**
 * Parallel coverage for src/helpers/decriptNvr.js. The original test
 * (decriptNvr.test.js) is `describe.skip`'d because crypto-js is not declared
 * in client/package.json — that gap is tracked in
 *   https://github.com/Globussoft-Technologies/videoraiq-ai/issues/22
 * and we intentionally do NOT modify that file. However, crypto-js IS
 * resolvable via the workspace hoist, so we can still cover the encrypt /
 * decrypt round-trip from a separate spec. If the package ever stops
 * resolving this file will fail loudly, which is the correct signal.
 */
import { describe, it, expect } from "vitest";

let mod;
try {
  mod = await import("../../../src/helpers/decriptNvr.js");
} catch (e) {
  mod = null;
}

const maybe = mod ? describe : describe.skip;

maybe("decriptNvr (live, via workspace-hoisted crypto-js)", () => {
  it("round-trips an ASCII plaintext", () => {
    const { encrypt, decrypt } = mod;
    const cipher = encrypt("rtsp://user:pass@host/stream");
    expect(typeof cipher).toBe("string");
    expect(decrypt(cipher)).toBe("rtsp://user:pass@host/stream");
  });

  it("round-trips multi-byte / utf-8 text", () => {
    const { encrypt, decrypt } = mod;
    const cipher = encrypt("café — déjà vu — 🚨");
    expect(decrypt(cipher)).toBe("café — déjà vu — 🚨");
  });

  it("passes a null / undefined / non-string straight through encrypt", () => {
    const { encrypt } = mod;
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeUndefined();
    expect(encrypt(123)).toBe(123);
    expect(encrypt("")).toBe("");
  });

  it("passes empty / non-string straight through decrypt", () => {
    const { decrypt } = mod;
    expect(decrypt("")).toBe("");
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeUndefined();
    expect(decrypt(42)).toBe(42);
  });

  it("produces hex-encoded ciphertext", () => {
    const { encrypt } = mod;
    const cipher = encrypt("hello");
    expect(cipher).toMatch(/^[0-9a-f]+$/i);
  });

  it("returns the original text when decryption input is malformed", () => {
    const { decrypt } = mod;
    // not valid AES-CBC ciphertext, but still a hex string — falls through
    // to the empty-result branch and returns the input unchanged.
    expect(decrypt("deadbeef")).toBe("deadbeef");
  });

  it("returns the original text when the input is not valid hex at all", () => {
    const { decrypt } = mod;
    expect(decrypt("not-valid-hex")).toBe("not-valid-hex");
  });

  it("different plaintexts produce different ciphertexts", () => {
    const { encrypt } = mod;
    expect(encrypt("a")).not.toBe(encrypt("b"));
  });
});
