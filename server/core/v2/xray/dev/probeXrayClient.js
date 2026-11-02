/**
 * Phase 2 exit gate — drive xray.client.js through a whole session and print
 * every response.
 *
 * This is the "show the user three responses" the plan asks for, and it uses
 * the REAL client: the same credential minting, the same timeout, the same
 * error handling the request path will use. Nothing is mocked. The only fake
 * thing is the service at the far end.
 *
 * Run the fake service first, in another terminal:
 *   node core/v2/xray/dev/fakeXrayService.js --port 8130 --api-key dev-key --jwt-secret dev-secret
 *
 * Then:
 *   node core/v2/xray/dev/probeXrayClient.js
 *
 * Both default to the same key and secret, so no arguments are needed. Override
 * with the normal environment variables if you point it at something else:
 *   XRAY_SERVICE_URL, XRAY_API_KEY, XRAY_JWT_SECRET
 *
 * To watch a failure path instead, restart the fake with a fault flag:
 *   node core/v2/xray/dev/fakeXrayService.js --fail-create stream_not_ready
 *   node core/v2/xray/dev/fakeXrayService.js --hang-ms 20000     (timeout)
 *   node core/v2/xray/dev/fakeXrayService.js --garbage           (non-contract body)
 */

// The `config` package reads this at first import and several modules call
// config.get at module scope, so it must be set before anything is imported.
// Only the keys the X-ray path touches — this script boots no server.
process.env.NODE_ENV ||= "test";
process.env.NODE_CONFIG ||= JSON.stringify({
  APP_ENV: "local",
  LICENSING_ENABLED: false,
  jwt: { secretKey: "probe-not-used" },
  Backend: { token: "probe-not-used" },
  logger: { level: "error" },
});

process.env.XRAY_ENABLED ||= "true";
process.env.XRAY_SERVICE_URL ||= "http://127.0.0.1:8130";
process.env.XRAY_API_KEY ||= "dev-key";
process.env.XRAY_JWT_SECRET ||= "dev-secret";

const { default: client } = await import("../xray.client.js");
const { xrayConfigSummary } = await import("../xray.config.js");

const line = (char = "─") => console.log(char.repeat(74));

/** Print a result in a shape a non-JS reader can check at a glance. */
const show = (title, result) => {
  line();
  console.log(title);
  line();
  if (result.ok) {
    console.log(`  OK  HTTP ${result.status}`);
    console.log(
      JSON.stringify(result.data, null, 2)
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n"),
    );
  } else {
    console.log(`  FAILED  HTTP ${result.status}`);
    console.log(`      error:     ${result.code}`);
    console.log(`      message:   ${result.message}`);
    console.log(`      retryable: ${result.retryable}`);
  }
  console.log();
  return result;
};

console.log();
console.log("X-ray service client probe");
console.log(`  service:  ${xrayConfigSummary().serviceUrl}`);
console.log(`  api key:  ${xrayConfigSummary().apiKey}`);
console.log(`  jwt:      ${xrayConfigSummary().jwtSecret}, ttl ${xrayConfigSummary().jwtTtlSec}s`);
console.log(`  timeout:  ${xrayConfigSummary().serviceTimeoutMs}ms`);
console.log();

show("0. GET /health/ready", await client.health());

const created = show(
  "1. POST /sessions          (open a session on a camera)",
  await client.createSession({
    cameraId: "507f1f77bcf86cd799439011",
    nvrId: "507f1f77bcf86cd799439012",
    adminId: "507f1f77bcf86cd799439013",
    userId: "tenant-42",
    streamUrl: "http://127.0.0.1:8119/stream/507f1f77bcf86cd799439012-507f1f77bcf86cd799439011/playlist.m3u8",
  }),
);

if (!created.ok) {
  console.log("Session was not created, so there is nothing to prompt or close.");
  console.log("That is the correct outcome for a forced failure — a 503 means no");
  console.log("session exists on the far side and nothing needs cleaning up.\n");
  process.exit(0);
}

const sessionId = created.data.sessionId;

const prompted = show(
  "2. POST /sessions/:id/prompt   (the user clicked at 0.431, 0.662)",
  await client.addPrompt(sessionId, { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 }),
);

if (prompted.ok) {
  const delta = Math.abs(prompted.data.resolvedOffset - 1.24);
  console.log(`   note: asked for offset 1.24, got ${prompted.data.resolvedOffset} (delta ${delta.toFixed(2)}s).`);
  console.log("   Contract §5 — the frontend may show the delta but must not reject it.\n");
}

show("3. GET /sessions/:id/status", await client.getStatus(sessionId));

// Contract §13.4: one object per session in v1, so a second click is refused.
show(
  "4. POST /sessions/:id/prompt again   (expect 409 max_objects_reached)",
  await client.addPrompt(sessionId, { xNorm: 0.2, yNorm: 0.3, seq: 12346, offset: 0.5 }),
);

show("5. DELETE /sessions/:id    (close it)", await client.closeSession(sessionId));

// Contract §5 and §6: both DELETEs are idempotent. A frontend closing twice, or
// closing a session the service already ended, is the normal case.
show("6. DELETE /sessions/:id again   (idempotent — expect OK, not 404)", await client.closeSession(sessionId));

line("═");
console.log("Done. Steps 1, 2 and 5 are the three the plan asks to see.");
console.log("Steps 4 and 6 prove the two contract rules that are easy to get");
console.log("wrong: one object per session, and delete is idempotent.");
line("═");
console.log();
