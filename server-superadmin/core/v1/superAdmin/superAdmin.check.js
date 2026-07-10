// Runnable self-check for the password security path.
// Run: NODE_ENV=development node core/v1/superAdmin/superAdmin.check.js
import assert from "node:assert";
import { hashPassword, verifyPassword } from "../../../utils/cryptoUtils.js";

const stored = hashPassword("s3cret-pass");
assert.ok(stored.includes(":"), "hash must be salt:hash");
assert.strictEqual(verifyPassword("s3cret-pass", stored), true, "correct password verifies");
assert.strictEqual(verifyPassword("wrong-pass", stored), false, "wrong password rejected");
assert.strictEqual(verifyPassword("s3cret-pass", null), false, "null hash rejected");
assert.notStrictEqual(hashPassword("s3cret-pass"), stored, "salt makes each hash unique");

console.log("superAdmin password check: OK");
