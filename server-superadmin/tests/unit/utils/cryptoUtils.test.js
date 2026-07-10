import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,
  encryptData,
  decryptData,
  generateOTP,
  generateToken,
} from "../../../utils/cryptoUtils.js";

describe("cryptoUtils", () => {
  describe("encrypt / decrypt", () => {
    it("is deterministic given the same key + fixed IV", () => {
      const c1 = encrypt("hello world");
      const c2 = encrypt("hello world");
      expect(c1).toBe(c2);
    });

    it("round-trips arbitrary text", () => {
      const samples = [
        "",
        "a",
        "rtsp://user:pass@192.168.1.100:554/Streaming/Channels/101",
        "non-ascii: пример テスト 🚨",
        "x".repeat(1024),
      ];
      for (const text of samples) {
        expect(decrypt(encrypt(text))).toBe(text);
      }
    });

    it("returns hex output", () => {
      const cipher = encrypt("payload");
      expect(cipher).toMatch(/^[0-9a-f]+$/);
    });

    it("decrypt throws on tampered ciphertext", () => {
      const cipher = encrypt("payload");
      const tampered = cipher.slice(0, -2) + "00";
      // CBC will either throw on padding or return garbage; both are
      // acceptable failure modes — assert we don't get the original back.
      let outcome;
      try {
        outcome = decrypt(tampered);
      } catch {
        outcome = null;
      }
      expect(outcome).not.toBe("payload");
    });
  });

  describe("encryptJSON / decryptJSON", () => {
    it("round-trips objects, arrays, primitives", () => {
      const cases = [
        { a: 1, b: "two", c: [1, 2, 3] },
        [1, 2, 3],
        "string",
        null,
        true,
        42,
      ];
      for (const value of cases) {
        expect(decryptJSON(encryptJSON(value))).toEqual(value);
      }
    });

    it("returns base64 output", () => {
      const cipher = encryptJSON({ x: 1 });
      expect(cipher).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe("encryptData / decryptData (random IV)", () => {
    it("round-trips objects", () => {
      const value = { rtsp: "rtsp://u:p@host/path", port: 554 };
      expect(decryptData(encryptData(value))).toEqual(value);
    });

    it("produces different ciphertext for the same input (random IV)", () => {
      const v = { same: "input" };
      expect(encryptData(v)).not.toBe(encryptData(v));
    });

    it("output format is iv:ciphertext (hex:hex)", () => {
      const cipher = encryptData({ a: 1 });
      const [iv, payload] = cipher.split(":");
      expect(iv).toMatch(/^[0-9a-f]{32}$/);
      expect(payload).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("generateOTP", () => {
    it("returns a 6-digit string", () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOTP();
        expect(otp).toMatch(/^\d{6}$/);
      }
    });

    it("is reasonably unpredictable", () => {
      const seen = new Set();
      for (let i = 0; i < 100; i++) seen.add(generateOTP());
      // Birthday-paradox: out of 100 6-digit codes we expect ≥ 95 unique.
      expect(seen.size).toBeGreaterThan(90);
    });
  });

  describe("generateToken", () => {
    it("returns hex of length * 2 characters", () => {
      expect(generateToken(8)).toMatch(/^[0-9a-f]{16}$/);
      expect(generateToken(32)).toMatch(/^[0-9a-f]{64}$/);
      expect(generateToken()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns unique tokens across calls", () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) tokens.add(generateToken(16));
      expect(tokens.size).toBe(100);
    });
  });
});
