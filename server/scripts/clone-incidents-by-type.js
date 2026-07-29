import path from "path";
import { fileURLToPath } from "url";

import dotenv from "dotenv";
import mongoose from "mongoose";

import { decryptConfig } from "./decrypt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(serverRoot, ".env") });

const DEFAULT_LIMIT_PER_TYPE = 20;
const DEFAULT_TARGET_USER_ID = "21";
const DEFAULT_TARGET_NVR_ID = "6a6a07fbbdf2291e4f1ddfbc";
const DEFAULT_TARGET_CHANNEL_ID = "6a6a07fbbdf2291e4f1ddfea";

function parseArgs(argv) {
  const options = {
    execute: false,
    limit: DEFAULT_LIMIT_PER_TYPE,
    targetUserId: DEFAULT_TARGET_USER_ID,
    targetNvrId: DEFAULT_TARGET_NVR_ID,
    targetChannelId: DEFAULT_TARGET_CHANNEL_ID,
    incidentTypes: [],
    includeTargetSource: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--execute") {
      options.execute = true;
    } else if (arg === "--include-target-source") {
      options.includeTargetSource = true;
    } else if (arg === "--limit") {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--targetUserId") {
      options.targetUserId = next;
      index += 1;
    } else if (arg === "--targetNvrId") {
      options.targetNvrId = next;
      index += 1;
    } else if (arg === "--targetChannelId") {
      options.targetChannelId = next;
      index += 1;
    } else if (arg === "--types") {
      options.incidentTypes = next
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Clone incidents by incidentType.

By default this is a dry run. Add --execute to insert copied incidents.

Usage:
  node scripts/clone-incidents-by-type.js [options]

Options:
  --execute                    Insert cloned incidents. Without this, only prints a summary.
  --limit <number>             Max incidents per incidentType. Default: ${DEFAULT_LIMIT_PER_TYPE}
  --types <a,b,c>              Only clone these incidentType values. Default: all available types.
  --targetUserId <id>          New userId. Default: ${DEFAULT_TARGET_USER_ID}
  --targetNvrId <objectId>     New nvrId. Default: ${DEFAULT_TARGET_NVR_ID}
  --targetChannelId <objectId> New channelId. Default: ${DEFAULT_TARGET_CHANNEL_ID}
  --include-target-source      Allow incidents already owned by targetUserId to be cloned too.
  --help                       Show this help.
`);
}

function loadEncryptedConfigIfPresent() {
  if (process.env.NODE_CONFIG) return;

  const nodeEnv = process.env.NODE_ENV || "development";
  const encryptedConfigPath = path.join(serverRoot, "config", `${nodeEnv}.json.enc`);

  if (!process.env.MK) return;

  try {
    const decryptedConfig = decryptConfig(process.env.MK, encryptedConfigPath);
    process.env.NODE_CONFIG = JSON.stringify(decryptedConfig);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Failed to decrypt ${encryptedConfigPath}: ${error.message}`);
    }
  }
}

function validateOptions(options) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 20) {
    throw new Error("--limit must be an integer from 1 to 20");
  }

  if (!mongoose.Types.ObjectId.isValid(options.targetNvrId)) {
    throw new Error("--targetNvrId must be a valid MongoDB ObjectId");
  }

  if (!mongoose.Types.ObjectId.isValid(options.targetChannelId)) {
    throw new Error("--targetChannelId must be a valid MongoDB ObjectId");
  }
}

function buildSourceMatch(options) {
  const match = {
    incidentType: { $exists: true, $ne: null },
  };

  if (options.incidentTypes.length > 0) {
    match.incidentType = { $in: options.incidentTypes };
  }

  if (!options.includeTargetSource) {
    match.userId = { $ne: options.targetUserId };
  }

  return match;
}

function cloneIncident(source, options) {
  const clone = { ...source };

  delete clone._id;

  clone.userId = options.targetUserId;
  clone.nvrId = new mongoose.Types.ObjectId(options.targetNvrId);
  clone.channelId = new mongoose.Types.ObjectId(options.targetChannelId);

  return clone;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  validateOptions(options);
  loadEncryptedConfigIfPresent();

  const config = await import("config");
  const mongodbUri = config.default.get("mongodb_uri");

  await mongoose.connect(mongodbUri);

  const incidentsCollection = mongoose.connection.collection("incidents");
  const sourceMatch = buildSourceMatch(options);
  const incidentTypes = await incidentsCollection.distinct("incidentType", sourceMatch);
  const selectedTypes = incidentTypes.filter(Boolean).sort();
  const clones = [];
  const summary = [];

  for (const incidentType of selectedTypes) {
    const incidents = await incidentsCollection
      .find({ ...sourceMatch, incidentType })
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit)
      .toArray();

    summary.push({
      incidentType,
      selected: incidents.length,
    });

    clones.push(...incidents.map((incident) => cloneIncident(incident, options)));
  }

  console.table(summary);
  console.log(`Total incidents selected for cloning: ${clones.length}`);
  console.log(
    `Target fields: userId=${options.targetUserId}, nvrId=${options.targetNvrId}, channelId=${options.targetChannelId}`,
  );

  if (!options.execute) {
    console.log("Dry run only. Re-run with --execute to insert these cloned incidents.");
    return;
  }

  if (clones.length === 0) {
    console.log("No incidents found to clone.");
    return;
  }

  const result = await incidentsCollection.insertMany(clones, { ordered: true });
  console.log(`Inserted cloned incidents: ${result.insertedCount}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
