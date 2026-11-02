/**
 * X-Ray routes — URLs and middleware only, no logic. Contract §5.
 *
 * All six endpoints sit behind the router-level `verifyToken` applied where this
 * router is mounted in routes/v2/v2.js, so `req.verified` is always populated by
 * the time a handler runs.
 *
 *
 * WHY THE CONTROLLER IS IMPORTED PER REQUEST AND NOT AT THE TOP
 *
 * This file IS imported statically by routes/v2/v2.js — a router has to exist
 * synchronously to be mounted, and top-level `await` in v2.js would make that
 * shared, build-processed file an async module for the sake of one feature.
 *
 * So the flag guard is kept honest further down the chain. The static import
 * graph from v2.js stops here: express, Joi, and two side-effect-free files
 * (xray.config.js, xray.errors.js). The controller — and through it the service
 * and the Mongoose model — loads on the first X-ray request and never before.
 *
 * That matters for one concrete reason: compiling a Mongoose model registers it
 * and lets Mongoose build its indexes against the live database. A statically
 * imported model would do that at boot on every deployment, including ones with
 * XRAY_ENABLED=false, which contract §3 forbids ("off must be byte-identical to
 * today"). ESM caches the module after the first import, so the cost is one
 * resolved-promise lookup per request on a route that runs at most a few times
 * a minute.
 *
 * The belt to that braces: v2.js does not mount this router at all when the
 * flag is off, so these handlers are unreachable rather than merely unused.
 */
import express from "express";
import validation, { validateBody, validateParams } from "./xray.validate.js";

const router = express.Router();

/**
 * Call a controller method, importing the controller on first use.
 *
 * `next` is forwarded so an unexpected throw still reaches the global error
 * handler rather than hanging the request — though the controller catches its
 * own errors and answers with the contract §10 body, so this is the backstop
 * for a failure in the import itself.
 */
const controller = (method) => async (req, res, next) => {
  try {
    const { default: XrayController } = await import("./xray.controller.js");
    return await XrayController[method](req, res, next);
  } catch (error) {
    return next(error);
  }
};

// Contract §5, in the order the frontend uses them.

// Open a session. 200 means frames are flowing and clicking may be enabled.
router.post("/sessions", validateBody(validation.createSessionSchema), controller("createSession"));

// Seed a track from a click.
router.post(
  "/sessions/:sessionId/prompt",
  validateParams(validation.sessionParamsSchema),
  validateBody(validation.promptSchema),
  controller("addPrompt"),
);

// Keep the session alive. Called every 10s per open session — declared before
// the bare "/sessions/:sessionId" routes purely for readability; Express matches
// on the full path, so the order of these three is not significant.
router.post(
  "/sessions/:sessionId/heartbeat",
  validateParams(validation.sessionParamsSchema),
  controller("heartbeat"),
);

// Stop tracking one object, leaving the session open. Idempotent.
router.delete(
  "/sessions/:sessionId/objects/:objId",
  validateParams(validation.objectParamsSchema),
  controller("removeObject"),
);

// Current state: preparing | ready | tracking | lost | ended.
router.get(
  "/sessions/:sessionId",
  validateParams(validation.sessionParamsSchema),
  controller("getSession"),
);

// Close the session and free the GPU slot. Idempotent 200.
router.delete(
  "/sessions/:sessionId",
  validateParams(validation.sessionParamsSchema),
  controller("closeSession"),
);

export default router;
