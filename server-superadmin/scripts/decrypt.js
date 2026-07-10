import fs from "fs";
import crypto from "crypto";

/**
 * Decrypt AES-256-GCM packed binary format
 * Format:
 *   [salt(32) | iv(12) | tag(16) | ciphertext(n)]
 */
export function decryptConfig(masterKey, encryptedPath) {
  // Read base64 packed buffer
  const packed = Buffer.from(
    fs.readFileSync(encryptedPath, "utf8"),
    "base64"
  );

  // Extract components
  const salt = packed.subarray(0, 32);         // 32 bytes
  const iv = packed.subarray(32, 44);          // 12 bytes
  const tag = packed.subarray(44, 60);         // 16 bytes
  const ciphertext = packed.subarray(60);      // remaining bytes

  // Derive key
  const key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, "sha512");

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, null, "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}
