// Runnable self-check for the expiry-derivation logic.
// Run: NODE_ENV=development node core/v1/client/client.check.js
import assert from "node:assert";
import { pickLatestExpiry } from "./client.service.js";

assert.strictEqual(pickLatestExpiry({}), null, "empty → null");
assert.strictEqual(pickLatestExpiry({ a: null }), null, "no valid dates → null");
assert.strictEqual(pickLatestExpiry({ a: "not-a-date" }), null, "invalid date ignored → null");

const latest = pickLatestExpiry({ a: "2025-01-01", b: "2030-06-15", c: "2028-01-01" });
assert.strictEqual(latest.toISOString().slice(0, 10), "2030-06-15", "picks the max expiry");

console.log("client pickLatestExpiry check: OK");
