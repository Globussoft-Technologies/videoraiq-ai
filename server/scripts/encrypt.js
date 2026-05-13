// encrypt.js
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Master key (DO NOT bundle in docker)
const MASTER_KEY = process.env.MK;

const configPath = path.join(
  __dirname,
  "../config",
  `${process.env.NODE_ENV}.json`
);

// Read plain config
const data = fs.readFileSync(configPath, "utf8");

// --- Generate crypto values ---
const salt = crypto.randomBytes(32);       // 32 bytes
const iv = crypto.randomBytes(12);         // 12 bytes (GCM recommended)
const key = crypto.pbkdf2Sync(MASTER_KEY, salt, 100000, 32, "sha512");

const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

// Encrypt
let ciphertext = cipher.update(data, "utf8");
ciphertext = Buffer.concat([ciphertext, cipher.final()]);

// Tag (16 bytes)
const authTag = cipher.getAuthTag();

// --- PACK INTO SINGLE BINARY BUFFER ---
// [salt | iv | tag | ciphertext]
const packed = Buffer.concat([salt, iv, authTag, ciphertext]);

// Base64 encode
const base64Packed = packed.toString("base64");

// Save output
fs.writeFileSync(
  `./config/${process.env.NODE_ENV}.json.enc`,
  base64Packed,
  "utf8"
);

console.log("✔ Strong encryption complete! Packed format written.");
