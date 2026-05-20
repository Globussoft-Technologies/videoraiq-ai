import { describe, it, expect } from "vitest";

// SKIPPED — the source file `src/helpers/decriptNvr.js` imports `crypto-js`,
// which is not declared in client/package.json dependencies. Importing the
// module here fails to resolve. Tracked in:
//   https://github.com/Globussoft-Technologies/videoraiq-ai/issues/22
// Unskip once the dependency gap is fixed in product code.

describe.skip("decriptNvr (encrypt / decrypt)", () => {
  it("round-trips a plaintext string", async () => {
    const { encrypt, decrypt } = await import(
      "../../../src/helpers/decriptNvr.js"
    );
    const cipher = encrypt("rtsp://user:pass@host/stream");
    expect(decrypt(cipher)).toBe("rtsp://user:pass@host/stream");
  });

  it("passes non-string input straight through", async () => {
    const { encrypt } = await import("../../../src/helpers/decriptNvr.js");
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeUndefined();
    expect(encrypt(123)).toBe(123);
  });

  it("returns the original text when decryption fails", async () => {
    const { decrypt } = await import("../../../src/helpers/decriptNvr.js");
    expect(decrypt("not-valid-hex")).toBe("not-valid-hex");
  });

  it("produces hex-encoded ciphertext", async () => {
    const { encrypt } = await import("../../../src/helpers/decriptNvr.js");
    expect(encrypt("hello")).toMatch(/^[0-9a-f]+$/i);
  });
});
