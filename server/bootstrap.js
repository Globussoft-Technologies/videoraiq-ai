import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { decryptConfig } from "./scripts/decrypt.js";
import { mustRunInsideContainer } from "./scripts/check.js";

mustRunInsideContainer();

// 1. Decrypt configuration
const masterKey = process.env.MK;
const configPath = path.join(
  process.cwd(),
  "config",
  `${process.env.NODE_ENV}.json.enc`
);

const decryptedConfig = decryptConfig(masterKey, configPath);

// 2. Inject decrypted config BEFORE any config import
process.env.NODE_CONFIG = JSON.stringify(decryptedConfig);

console.log("🔓 Config decrypted and injected");

// Swagger must be generated from source before obfuscation, never at startup.
for (const name of ["swagger-api-view.json", "swagger-api-v2-view.json"]) {
  const spec = JSON.parse(fs.readFileSync(path.join("views", name), "utf8"));
  if (!Object.keys(spec.paths || {}).length) {
    throw new Error(`Packaged Swagger spec ${name} has no API routes. Rebuild the image.`);
  }
}

// 4. NOW start the app (ONLY AFTER config & swagger)
import("./server.js");
