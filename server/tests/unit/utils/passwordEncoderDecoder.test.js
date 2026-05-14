import { describe, it, expect } from "vitest";
import crypto from "crypto";
import PED from "../../../utils/passwordEncoderDecoder.js";

const KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes for AES-256

describe("PasswordEncoderDecoder", () => {
  describe("encryptText / decryptText (AES-256-CBC, random IV)", () => {
    it("round-trips arbitrary text", async () => {
      const samples = ["", "p", "long-password-123!@#", "non-ascii: ñá🚀"];
      for (const text of samples) {
        const cipher = await PED.encryptText(text, KEY);
        expect(await PED.decryptText(cipher, KEY)).toBe(text);
      }
    });

    it("produces different ciphertext for the same input (random IV)", async () => {
      const a = await PED.encryptText("same", KEY);
      const b = await PED.encryptText("same", KEY);
      expect(a).not.toBe(b);
    });

    it("output format is iv:ciphertext (hex:hex)", async () => {
      const cipher = await PED.encryptText("hello", KEY);
      const [iv, body] = cipher.split(":");
      expect(iv).toMatch(/^[0-9a-f]{32}$/);
      expect(body).toMatch(/^[0-9a-f]+$/);
    });

    it("decryptText with wrong key does not return plaintext", async () => {
      const cipher = await PED.encryptText("secret", KEY);
      const wrong = crypto.randomBytes(32).toString("hex").slice(0, 32);
      let outcome;
      try {
        outcome = await PED.decryptText(cipher, wrong);
      } catch {
        outcome = null;
      }
      expect(outcome).not.toBe("secret");
    });
  });

  describe("encryptPassword / decryptPassword (base64 + key suffix)", () => {
    it("round-trips a password", () => {
      const cipher = PED.encryptPassword("p4ss", "k3y");
      expect(PED.decryptPassword(cipher, "k3y")).toBe("p4ss");
    });

    it("is not cryptographically secure — only base64 obfuscation", () => {
      // Documents the (weak) current behavior so anyone refactoring sees the gap.
      const cipher = PED.encryptPassword("hello", "world");
      // The key is appended in plaintext after base64 decoding.
      const decoded = Buffer.from(cipher, "base64").toString();
      expect(decoded).toBe("helloworld");
    });
  });
});
