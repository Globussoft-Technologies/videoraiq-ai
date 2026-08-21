import authorizedUsersModel from "../core/v1/authorizedUsers/authorizedUsers.model.js";

/**
 * Vehicle-number → registered-user tagging.
 *
 * Detections (ANPR logs, vehicleDetection incidents) only ever carry a plate
 * string. The owner is resolved at read time by matching that plate against
 * `authorizedUsers.vehicleNumber`, so tagging a plate once immediately names
 * the owner on every past AND future detection of the same vehicle — nothing
 * is denormalised onto the incident documents.
 */

// Fields the UI needs to render "Tagged User" beside a plate. Deliberately
// narrow: this rides along on every incident/log row.
export const TAGGED_USER_FIELDS =
  "firstName lastName userName email designation location profilePics vehicleNumber";

// Characters that show up between the blocks of a plate depending on who typed
// it (or which OCR read it). Both the JS normaliser below and the aggregation
// expression further down strip exactly this set, so a plate filtered in Mongo
// and a plate matched in Node can never disagree.
const PLATE_SEPARATORS = [
  " ", "\t", "\n", "-", "–", "—", "_", ".", ",", "/", "\\",
  ":", ";", "'", "\"", "|", "*", "+", "(", ")", "[", "]", "#",
];

const PLATE_SEPARATOR_RE = new RegExp(
  `[${PLATE_SEPARATORS.map((c) => `\\${c}`).join("")}]`,
  "g",
);

/** Uppercase and strip separators so "ka-02 mp 9657" === "KA02MP9657". */
export function normalizePlate(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(PLATE_SEPARATOR_RE, "");
}

/**
 * The same normalisation as an aggregation expression over `$vehicleNumber`,
 * for queries that have to filter or search on the tagged/untagged state
 * inside Mongo rather than after the fact.
 */
export const NORMALIZED_PLATE_EXPR = {
  $reduce: {
    input: PLATE_SEPARATORS,
    initialValue: { $toUpper: { $ifNull: ["$vehicleNumber", ""] } },
    in: { $replaceAll: { input: "$$value", find: "$$this", replacement: "" } },
  },
};

/** Field name the pipeline stages below expose; stripped before responding. */
export const NORM_PLATE_FIELD = "_normPlate";

/** Escape a user-typed term for safe use inside a $regex match. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every normalised plate currently tagged for this admin. With `search`, only
 * the plates of users whose name/email matches — that's what lets a log search
 * find a detection by its owner's name rather than its number.
 */
export async function findTaggedPlates(adminId, { search } = {}) {
  if (!adminId) return [];

  const filter = { adminId, vehicleNumber: { $nin: [null, ""] } };
  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), "i");
    filter.$or = [
      { userName: rx },
      { firstName: rx },
      { lastName: rx },
      { email: rx },
    ];
  }

  const users = await authorizedUsersModel.find(filter, "vehicleNumber").lean();
  return [
    ...new Set(users.map((u) => normalizePlate(u.vehicleNumber)).filter(Boolean)),
  ];
}

/**
 * Pipeline stages exposing `_normPlate` and narrowing to tagged / not-tagged
 * rows. `tagStatus` of anything else (including "all") only exposes the field.
 *
 * A detection whose plate was never read normalises to "" and so counts as
 * not tagged, which is what the Not Tagged filter is asking for.
 */
export function vehicleTagStages(tagStatus, taggedPlates = []) {
  const stages = [{ $addFields: { [NORM_PLATE_FIELD]: NORMALIZED_PLATE_EXPR } }];

  if (tagStatus === "tagged") {
    stages.push({ $match: { [NORM_PLATE_FIELD]: { $in: taggedPlates } } });
  } else if (tagStatus === "untagged") {
    stages.push({ $match: { [NORM_PLATE_FIELD]: { $nin: taggedPlates } } });
  }

  return stages;
}

/** Drops the helper field so the response shape is unchanged. */
export const stripNormPlateStage = { $project: { [NORM_PLATE_FIELD]: 0 } };

/**
 * Match a normalised plate against however it happens to be stored — plates
 * get typed with spaces, hyphens or neither, and the detector emits its own
 * format. `normalized` is [A-Z0-9] only, so nothing needs escaping.
 */
function plateRegex(normalized) {
  const sep = "[^A-Za-z0-9]*";
  return new RegExp(`^${sep}${normalized.split("").join(sep)}${sep}$`, "i");
}

// Past this many distinct plates a regex $in costs more than simply reading
// every tagged user for the admin and matching in memory. A log page asks for
// 10–100 plates; only the "export everything" path (limit 10000) goes wide.
const PLATE_IN_LIMIT = 200;

/**
 * Resolve the registered user each plate belongs to.
 *
 * @returns {Promise<Map<string, object>>} normalised plate → user (only tagged plates are keys)
 */
export async function findVehicleOwners(plates, adminId) {
  const owners = new Map();
  if (!adminId) return owners;

  const normalized = new Set(
    (plates || []).map(normalizePlate).filter(Boolean),
  );
  if (!normalized.size) return owners;

  const wanted =
    normalized.size > PLATE_IN_LIMIT
      ? { $nin: [null, ""] }
      : { $in: [...normalized].map(plateRegex) };

  const users = await authorizedUsersModel
    .find({ adminId, vehicleNumber: wanted }, TAGGED_USER_FIELDS)
    // Oldest tag wins if two users somehow ended up on one plate, so the name
    // shown for a plate stays stable across requests instead of flip-flopping.
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  for (const user of users) {
    const key = normalizePlate(user.vehicleNumber);
    // The wide path returns every tagged user, so drop the ones nobody asked
    // about — callers must only ever see plates they passed in.
    if (!key || !normalized.has(key) || owners.has(key)) continue;
    owners.set(key, user);
  }
  return owners;
}

/**
 * Attach `taggedUser` to every doc that carries a readable plate. Docs with no
 * plate are left untouched — there is nothing to tag a user to, so the UI must
 * not offer the action for them.
 *
 * Mutates in place (callers pass aggregate/lean output) and returns `docs`.
 */
export async function attachTaggedUsers(docs, adminId) {
  const list = Array.isArray(docs) ? docs : docs ? [docs] : [];
  if (!list.length) return docs;

  const withPlate = list.filter(
    (doc) => doc && typeof doc === "object" && normalizePlate(doc.vehicleNumber),
  );
  if (!withPlate.length) return docs;

  const owners = await findVehicleOwners(
    withPlate.map((doc) => doc.vehicleNumber),
    adminId,
  );

  for (const doc of withPlate) {
    doc.taggedUser = owners.get(normalizePlate(doc.vehicleNumber)) || null;
  }
  return docs;
}

export default {
  normalizePlate,
  findVehicleOwners,
  findTaggedPlates,
  attachTaggedUsers,
  vehicleTagStages,
  stripNormPlateStage,
  NORMALIZED_PLATE_EXPR,
  NORM_PLATE_FIELD,
  TAGGED_USER_FIELDS,
};
