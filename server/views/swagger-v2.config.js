import swaggerAutogen from "swagger-autogen";
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
