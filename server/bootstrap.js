import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { execSync } from "child_process";
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

// 3. Run Swagger generation BEFORE loading the rest of the app
try {
  console.log("📄 Generating Swagger documentation...");
  execSync("npm run swagger", { stdio: "inherit" });
  console.log("✅ Swagger generation completed");
} catch (error) {
  console.error("❌ Failed to generate Swagger docs:", error);
  process.exit(1);
}

// 4. NOW start the app (ONLY AFTER config & swagger)
import("./server.js");
