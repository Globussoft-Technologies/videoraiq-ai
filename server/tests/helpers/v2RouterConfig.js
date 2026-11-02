/**
 * Config keys the full routes/v2/v2.js import graph needs, on top of the ones
 * tests/setup.js already provides.
 *
 * WHY THIS EXISTS. Importing the whole v2 router pulls in every v2 module, and
 * a few of them call a BARE `config.get(...)` at module scope — notably
 * messagingService/IncidentsSMSFunction/sms.incidentsFunction.js:4, reached via
 * core/v2/verifyRecipients/recipients.service.js:10. `config.get` throws on a
 * missing key, so without these the import fails before a single test runs.
 *
 * This is a pre-existing property of the codebase, not something X-ray
 * introduced: no test had ever imported the complete v2 router before.
 * tests/setup.js is shared by every suite, so these keys live here instead of
 * being added there — only the files that import the full router pay for them.
 *
 * USAGE — must run BEFORE any import of server code, so call it at module scope
 * in the test file, above the dynamic imports:
 *
 *   import { extendConfigForV2Router } from "../helpers/v2RouterConfig.js";
 *   extendConfigForV2Router();
 *   const { default: v2Routes } = await import("../../routes/v2/v2.js");
 *
 * The `config` package reads process.env.NODE_CONFIG the first time it is
 * imported, so mutating the variable before that first import is what makes
 * this work (same technique as
 * tests/integration/services/detectionLicense.onprem.test.js:18).
 *
 * Every value is an obvious placeholder. Nothing here reaches a network: the
 * modules that read these keys only construct clients at import time, and no
 * test in this directory calls them.
 */

/** Merge extra keys into NODE_CONFIG, preserving whatever setup.js put there. */
export const extendConfigForV2Router = (extra = {}) => {
  const base = JSON.parse(process.env.NODE_CONFIG || "{}");
  process.env.NODE_CONFIG = JSON.stringify({
    ...base,
    Twilio: {
      TWILIO_ACCOUNT_SID: "ACtest00000000000000000000000000",
      TWILIO_AUTH_TOKEN: "test-twilio-auth-token",
      TWILIO_PHONE_NUMBER: "+10000000000",
      ...(base.Twilio || {}),
    },
    ...extra,
  });
};

export default extendConfigForV2Router;
