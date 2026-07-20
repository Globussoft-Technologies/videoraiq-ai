import Response from "../../../utils/response.js";
import logger from "../../../utils/logger.js";
import planModel from "./plans.model.js";
import adminModel from "../admin/admin.model.js";
import clientService from "../client/client.service.js";
import { runWithConcurrency } from "../users/users.service.js";

// Editable fields. Anything else in the body is ignored, so a client sending
// back a whole plan object (including _id/createdAt) can't corrupt the doc.
const EDITABLE = [
  "name",
  "amemberProductId",
  "tagline",
  "priceLabel",
  "pricePeriod",
  "features",
  "isPopular",
  "sortOrder",
  "archived",
];

/** Normalise a plan/product name for comparison — aMember titles vary in case/spacing. */
const normalise = (v) => String(v ?? "").trim().toLowerCase();

const pickEditable = (body = {}) => {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue;
    if (key === "features") {
      // Accept an array or a newline/comma separated string from a textarea.
      const raw = Array.isArray(body[key]) ? body[key] : String(body[key]).split(/[\n,]/);
      out[key] = raw.map((f) => String(f).trim()).filter(Boolean);
    } else if (key === "isPopular" || key === "archived") {
      out[key] = Boolean(body[key]);
    } else if (key === "sortOrder") {
      out[key] = Number(body[key]) || 0;
    } else {
      out[key] = String(body[key]).trim();
    }
  }
  return out;
};

// ponytail: 60s in-process memo. Counting means one aMember round-trip per
// client, and the super admin reloads this screen often. Swap for Redis (or
// have aMember push) if this ever runs on more than one instance or the client
// list outgrows a single page of lookups.
const COUNT_TTL_MS = 60_000;
let countCache = { at: 0, byPlan: null };

/**
 * How many clients sit on each plan, keyed by normalised plan name.
 * Source of truth is aMember: a client's plan is their latest invoice's product
 * title. Never throws — a plan simply reports 0 if aMember can't be reached.
 */
async function clientCountsByPlan() {
  if (countCache.byPlan && Date.now() - countCache.at < COUNT_TTL_MS) {
    return countCache.byPlan;
  }

  const admins = await adminModel.find({}).select("user_id").lean();
  const names = await runWithConcurrency(
    admins.map((a) => () => clientService._getLatestInvoiceName(a.user_id)),
    10
  );

  const byPlan = {};
  for (const name of names) {
    if (!name) continue; // no invoice yet — counted against no plan
    const key = normalise(name);
    byPlan[key] = (byPlan[key] || 0) + 1;
  }

  countCache = { at: Date.now(), byPlan };
  return byPlan;
}

class PlansService {
  // GET /plans?includeArchived=true&withCounts=true
  async list(req, res) {
    try {
      const filter = req.query.includeArchived === "true" ? {} : { archived: false };
      const plans = await planModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

      // Counts are opt-in: they cost one aMember call per client, so the plain
      // list stays cheap for pickers and dropdowns.
      if (req.query.withCounts !== "true") {
        return res.send(Response.SuccessResp("Plans fetched", { plans }));
      }

      const byPlan = await clientCountsByPlan();
      const withCounts = plans.map((p) => ({
        ...p,
        clientCount: byPlan[normalise(p.name)] || 0,
      }));

      return res.send(Response.SuccessResp("Plans fetched", { plans: withCounts }));
    } catch (err) {
      logger.error(`plans list: ${err.message}`);
      return res.send(Response.userFailResp("Failed to fetch plans", err.message));
    }
  }

  // POST /plans
  async create(req, res) {
    try {
      const data = pickEditable(req.body);
      if (!data.name) {
        return res.send(Response.userFailResp("Plan name is required", "Validation Failed!"));
      }

      const plan = await planModel.create(data);
      return res.send(Response.SuccessResp("Plan created", { plan }));
    } catch (err) {
      // Unique index on name — report the clash rather than a raw driver error.
      if (err?.code === 11000) {
        return res.send(Response.userFailResp("A plan with that name already exists", "Validation Failed!"));
      }
      logger.error(`plans create: ${err.message}`);
      return res.send(Response.userFailResp("Failed to create plan", err.message));
    }
  }

  // PUT /plans/:id
  async update(req, res) {
    try {
      const data = pickEditable(req.body);
      if (data.name === "") {
        return res.send(Response.userFailResp("Plan name cannot be empty", "Validation Failed!"));
      }
      if (!Object.keys(data).length) {
        return res.send(Response.userFailResp(`Provide one of: ${EDITABLE.join(", ")}.`, "Validation Failed!"));
      }

      const plan = await planModel.findByIdAndUpdate(req.params.id, { $set: data }, { new: true });
      if (!plan) {
        return res.send(Response.userFailResp("Plan not found", "Validation Failed!"));
      }
      return res.send(Response.SuccessResp("Plan updated", { plan }));
    } catch (err) {
      if (err?.code === 11000) {
        return res.send(Response.userFailResp("A plan with that name already exists", "Validation Failed!"));
      }
      logger.error(`plans update: ${err.message}`);
      return res.send(Response.userFailResp("Failed to update plan", err.message));
    }
  }

  // DELETE /plans/:id — archives by default so client history stays readable;
  // ?hard=true removes the row outright.
  async remove(req, res) {
    try {
      if (req.query.hard === "true") {
        const plan = await planModel.findByIdAndDelete(req.params.id);
        if (!plan) return res.send(Response.userFailResp("Plan not found", "Validation Failed!"));
        return res.send(Response.SuccessResp("Plan deleted", { plan }));
      }

      const plan = await planModel.findByIdAndUpdate(
        req.params.id,
        { $set: { archived: true } },
        { new: true }
      );
      if (!plan) return res.send(Response.userFailResp("Plan not found", "Validation Failed!"));
      return res.send(Response.SuccessResp("Plan archived", { plan }));
    } catch (err) {
      logger.error(`plans remove: ${err.message}`);
      return res.send(Response.userFailResp("Failed to delete plan", err.message));
    }
  }
}

export { pickEditable, normalise };
export default new PlansService();
