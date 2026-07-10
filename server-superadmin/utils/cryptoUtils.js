import crypto from "crypto";
import config from "config";

const algorithm = "aes-256-cbc";
const ENCRYPTION_KEY = Buffer.from(config.get("ENCRYPTION_KEY"), "hex"); // 32 bytes (64 hex chars)
const IV = Buffer.from(config.get("IV"), "hex"); // 16 bytes (32 hex chars)

export function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decrypt(encryptedText) {
  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, IV);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const generateOTP = () => {
  const otp = crypto.randomInt(100000, 1000000); // Generates a number between 100000 and 999999
  return otp.toString();
};

export const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex"); // returns a hex string of length * 2
};

// Password hashing via scrypt (Node stdlib) — no bcrypt dependency needed.
// Stored format: "salt:hash" (both hex).
export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const hashBuffer = Buffer.from(hash, "hex");
  const derived = crypto.scryptSync(password, salt, 64);
  return hashBuffer.length === derived.length && crypto.timingSafeEqual(hashBuffer, derived);
};

export function encryptJSON(obj) {
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, IV);

  const jsonString = JSON.stringify(obj);
  let encrypted = cipher.update(jsonString, "utf8", "base64");
  encrypted += cipher.final("base64");

  return encrypted; // just base64 string of ciphertext
}

export function decryptJSON(encryptedBase64) {
  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, IV);

  let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

// Encrypt objects
// utils/cryptoUtils.js

export function encryptData(data) {
  const iv = crypto.randomBytes(16); // number, not Buffer
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(JSON.stringify(data));
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptData(encrypted) {
  const [ivHex, encryptedText] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedBuffer = Buffer.from(encryptedText, "hex");

  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, iv);

  let decrypted = decipher.update(encryptedBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString());
}
