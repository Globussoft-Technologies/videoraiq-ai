import swaggerAutogen from "swagger-autogen";
import { readFile, writeFile } from "node:fs/promises";
const swagger = swaggerAutogen();
import config from "config";
// v2 controllers reference the same $ref definitions as v1 (login, createUser,
// etc.). Reuse the shared shorthand definitions so swagger-autogen expands them
// the same way it does for v1, instead of re-declaring ~100 schemas.
import { definitions as v1Definitions } from "./swagger-definitions.js";
console.log(config.get("swagger_host_url"),"HOST2")
const doc = {
  info: {
    version: "2.0.0",
    title: "EMP Surveillance API's — v2",
    description: "API Documentation for v2 endpoints",
  },
  host: config.get("swagger_host_url"),
  // Entry file already mounts routes under /api/v2, so paths are prefixed.
  // Keep basePath "/" (like v1) to avoid a doubled /api/v2/api/v2 URL.
  basePath: "/",
  schemes: ["http", "https"],
  consumes: ["application/json", "application/x-www-form-urlencoded"],
  produces: ["application/json"],
  tags: [
    // Add v2 module tags here as you add modules, e.g.:
    // { name: "Incidents", description: "Incidents v2 endpoints" },
  ],

  securityDefinitions: {
    EncryptedAuthToken: {
      type: "apiKey",
      in: "header",
      name: "x-access-token",
      description:
        "Please provide the valid access token. Login to get the token.",
    },
  },
  security: [
    {
      EncryptedAuthToken: [],
    },
  ],

  // Reused from v1; v2-only schemas (not present in v1) added after the spread.
  definitions: {
    ...v1Definitions,
    deleteIncidentsByAdminAndDateRange: {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
    DeskAbsenceLogsFilter: {
      nvrId: "string",
      channelId: "string",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      skip: 0,
      limit: 10,
    },
    // No dedicated validator; permissive object so the $ref resolves.
    updateStorage: {
      $name: "string",
      storageType: "string",
    },
  },
};

const outputFile = "./views/swagger-api-v2-view.json";

// Dedicated entry file — only /api/v2/* routes are scanned
const endpointsFiles = ["./views/swagger-v2-entry.js"];

await swagger(outputFile, endpointsFiles, doc);

// swagger-autogen follows the same routes file through three mounts. It can
// incorrectly copy /agent-actions operations under /audit-events and
// /channel/detection-status. Keep only the endpoints actually mounted there.
const generated = JSON.parse(await readFile(outputFile, "utf8"));
for (const prefix of ["/api/v2/audit-events", "/api/v2/channel/detection-status"]) {
  for (const path of Object.keys(generated.paths)) {
    if (path.startsWith(`${prefix}/`)) delete generated.paths[path];
  }
}
generated.paths["/api/v2/audit-events"] = {
  get: { tags: ["Agent Actions"], description: "List scoped agent and product audit events.", security: [{ EncryptedAuthToken: [] }], responses: { 200: { description: "Audit events and pagination" } } },
};
generated.paths["/api/v2/channel/detection-status"] = {
  get: { tags: ["Agent Actions"], description: "List camera detector configuration and runtime observations.", security: [{ EncryptedAuthToken: [] }], responses: { 200: { description: "Detector statuses and pagination" } } },
};
const targetFailure = {
  type: "object",
  required: ["status", "errorCode", "message", "retryStatus", "reconciliationStatus"],
  properties: {
    status: { type: "string", enum: ["failed", "invalidated"] },
    errorCode: { type: "string", example: "STALE_CONFIGURATION" },
    message: { type: "string" },
    retryStatus: { type: "string" },
    reconciliationStatus: { type: "string" },
    desiredState: { type: "object", description: "Optional on failure" },
    observedState: { type: "object", description: "Optional on failure" },
    desiredVersion: { type: "string", description: "Optional on failure" },
    observedVersion: { type: "string", description: "Optional on failure" },
    verifiedAt: { type: "string", format: "date-time", description: "Optional on failure" },
  },
};
const execute = generated.paths["/api/v2/agent-actions/{actionId}/execute"]?.post;
if (execute) {
  execute.tags = ["Agent Actions"];
  execute.description = "Execute an approved action. Failed and invalidated target results may omit desired/observed state, versions, and verifiedAt.";
  execute.security = [{ EncryptedAuthToken: [] }];
  execute.responses = { 200: { description: "Action result; individual targets may fail", schema: { type: "object", properties: { statusCode: { type: "integer" }, body: { type: "object", properties: { status: { type: "string" }, data: { type: "object", properties: { targets: { type: "array", items: { type: "object", properties: { result: targetFailure } } } } } } } } } } };
}
await writeFile(outputFile, `${JSON.stringify(generated, null, 2)}\n`);
