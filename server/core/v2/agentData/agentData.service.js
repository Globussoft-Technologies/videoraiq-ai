import crypto from "node:crypto";
import mongoose from "mongoose";
import { AgentOutage, AgentIncidentReview, AgentIncidentLifecycle, AgentEventGroup, AgentOperationalContext, AgentOneTimeSchedule, AgentEvidence, AgentRuntimeObservation } from "./agentData.model.js";
import { runtimeIsStale, RUNTIME_STALE_AFTER_SECONDS } from "./runtimeFreshness.js";
import { isAgentCredential } from "../agentActions/agentGateway.js";
import { Incident } from "../../v1/incidents/incidents.model.js";
import Channel from "../channels/channels.model.js";

const models = { outages: AgentOutage, reviews: AgentIncidentReview, lifecycles: AgentIncidentLifecycle, groups: AgentEventGroup, contexts: AgentOperationalContext, schedules: AgentOneTimeSchedule, evidence: AgentEvidence, runtime: AgentRuntimeObservation };
function accountId(req) { return String(req.verified?.userData?.adminId || ""); }
function subject(req) { const u = req.verified?.userData || {}; return { subject: String(u.memberId || u.userId || u.user_id || u.adminId || ""), memberId: u.memberId ? String(u.memberId) : undefined, adminId: u.adminId ? String(u.adminId) : undefined }; }
function permitted(req, mode) { const u = req.verified?.userData || {}; if (!u.memberId) return true; return Boolean(req.verified?.permissionConfig?.[0]?.permissionConfig?.channels?.[mode]); }
function oid(value) { return mongoose.Types.ObjectId.isValid(String(value || "")); }
function response(res, status, message, data, errorCode) { return res.status(status).json({ statusCode: status, body: { status: status < 400 ? "success" : "failed", message, ...(data === undefined ? {} : { data }), ...(errorCode ? { errorCode } : {}) } }); }
function requestId(req) { return String(req.header("x-request-id") || crypto.randomUUID()); }
function date(value, field) { const parsed = new Date(value); if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${field} must be an ISO-8601 timestamp.`); return parsed; }
function parseRange(req) { const filter = { accountId: accountId(req) }; if (req.query.from || req.query.to) filter.createdAt = { ...(req.query.from ? { $gte: date(req.query.from, "from") } : {}), ...(req.query.to ? { $lte: date(req.query.to, "to") } : {}) }; return filter; }
function metricRange(req, field) { const filter = { accountId: accountId(req) }; if (req.body?.from || req.body?.to || req.query.from || req.query.to) filter[field] = { ...((req.body?.from || req.query.from) ? { $gte: date(req.body?.from || req.query.from, "from") } : {}), ...((req.body?.to || req.query.to) ? { $lte: date(req.body?.to || req.query.to, "to") } : {}) }; dimensions(filter, req); if (req.verified?.userData?.memberId) { const allowed = (req.verified?.authorizedChannel?.channels || []).filter(oid); filter.channelId = filter.channelId ? { $eq: filter.channelId, $in: allowed } : { $in: allowed }; } return filter; }
function dimensions(filter, req) { const input = { ...(req.query || {}), ...(req.body || {}) }; if (input.detectionType) input.detectorType = input.detectionType; for (const key of ["channelId", "detectorType", "shiftId", "responsibleTeam", "slaStatus", "label"]) if (input[key] !== undefined && input[key] !== "") filter[key] = input[key]; return filter; }
function paging(req) { return { skip: Math.max(Number(req.query.skip) || 0, 0), limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 200) }; }
const metricGroupBy = { outage_duration: [], coverage: [], false_positive_rate: ["channelId", "detectorType", "shiftId", "label"], confirmed_rate: ["channelId", "detectorType", "shiftId", "label"], response_delay: [], overdue_response: [], deduplicated_events: ["channelId", "detectorType", "shiftId"] };
const metricFilters = { outage_duration: ["channelId"], coverage: ["channelId"], false_positive_rate: ["channelId", "detectorType", "shiftId", "label"], confirmed_rate: ["channelId", "detectorType", "shiftId", "label"], response_delay: ["channelId", "detectorType", "shiftId", "responsibleTeam", "slaStatus"], overdue_response: ["channelId", "detectorType", "shiftId", "responsibleTeam", "slaStatus"], deduplicated_events: ["channelId", "detectorType", "shiftId"] };
function groupBy(req) { const raw = req.body?.groupBy ?? req.query.groupBy ?? []; return (Array.isArray(raw) ? raw : String(raw).split(",").filter(Boolean)).map((value) => value === "detectionType" ? "detectorType" : value); }
function grouped(rows, fields, value) { if (!fields.length) return null; const buckets = new Map(); for (const row of rows) { const key = fields.map((field) => String(row[field] ?? 'unknown')).join('|'); const item = buckets.get(key) || { dimensions: Object.fromEntries(fields.map((field) => [field, row[field] ?? null])), sampleSize: 0 }; item.sampleSize += 1; if (value) item[value] = (item[value] || 0) + 1; buckets.set(key, item); } return [...buckets.values()]; }

class AgentDataService {
  async create(req, res, kind) {
    try {
      if (isAgentCredential(req)) return response(res, 403, "Agent credentials have read-only access to collected data.", undefined, "AGENT_DATA_WRITE_FORBIDDEN");
      if (!permitted(req, "edit")) return response(res, 403, "You do not have permission to write agent data.", undefined, "AGENT_DATA_EDIT_DENIED");
      const Model = models[kind]; const body = req.body || {};
      if (!oid(accountId(req))) return response(res, 401, "Authenticated account scope is required.", undefined, "AUTH_SCOPE_REQUIRED");
      if (kind !== "schedules" && !req.verified?.producer) return response(res, 403, "Collection records require a signed producer identity.", undefined, "PRODUCER_REQUIRED");
      const ownerId = req.verified?.userData?.user_id || req.verified?.userData?.userId;
      const allowed = req.verified?.authorizedChannel?.channels || [];
      if (body.channelId) {
        if (!oid(body.channelId) || !ownerId || (req.verified?.userData?.memberId && !allowed.some((id) => String(id) === String(body.channelId)))
          || !await Channel.exists({ _id: body.channelId, userId: String(ownerId) })) return response(res, 403, "Camera is unavailable in your scope.", undefined, "CHANNEL_OUT_OF_SCOPE");
      }
      const incidentIds = body.incidentIds || (body.incidentId ? [body.incidentId] : []);
      if (!Array.isArray(incidentIds) || incidentIds.some((id) => !oid(id))) return response(res, 400, "Invalid incident IDs.", undefined, "INVALID_INCIDENT");
      if (incidentIds.length) {
        const filter = { _id: { $in: incidentIds }, userId: String(ownerId || "") };
        if (body.channelId) filter.channelId = body.channelId;
        if (req.verified?.userData?.memberId) filter.channelId = { $in: allowed, ...(body.channelId ? { $eq: body.channelId } : {}) };
        if (await Incident.countDocuments(filter) !== new Set(incidentIds.map(String)).size) return response(res, 403, "Incident is unavailable in your scope.", undefined, "INCIDENT_OUT_OF_SCOPE");
      }
      let document;
      if (kind === "outages") {
        if (!oid(body.channelId)) return response(res, 400, "channelId is required.", undefined, "INVALID_CHANNEL");
        const startedAt = date(body.startedAt, "startedAt"); const endedAt = body.endedAt ? date(body.endedAt, "endedAt") : null;
        if (endedAt && endedAt < startedAt) return response(res, 400, "endedAt must be after startedAt.", undefined, "INVALID_INTERVAL");
        document = { accountId: accountId(req), channelId: body.channelId, startedAt, endedAt, reason: String(body.reason || "unknown"), source: String(body.source || "heartbeat"), monitoredSeconds: body.monitoredSeconds ?? (endedAt ? (endedAt - startedAt) / 1000 : null), coverageStart: body.coverageStart ? date(body.coverageStart, "coverageStart") : null, coverageEnd: body.coverageEnd ? date(body.coverageEnd, "coverageEnd") : null, correlationId: String(body.correlationId || requestId(req)) };
      } else if (kind === "reviews") {
        if (!oid(body.incidentId) || !["confirmed", "false_positive", "uncertain"].includes(body.label)) return response(res, 400, "incidentId and label (confirmed, false_positive, or uncertain) are required.", undefined, "INVALID_REVIEW");
        document = { accountId: accountId(req), incidentId: body.incidentId, channelId: oid(body.channelId) ? body.channelId : null, detectorType: body.detectorType || null, shiftId: body.shiftId || null, label: body.label, reviewer: subject(req), reviewedAt: body.reviewedAt ? date(body.reviewedAt, "reviewedAt") : new Date(), reason: String(body.reason || ""), sampleId: body.sampleId || null };
      } else if (kind === "lifecycles") {
        if (!oid(body.incidentId)) return response(res, 400, "incidentId is required.", undefined, "INVALID_INCIDENT");
        document = { accountId: accountId(req), incidentId: body.incidentId, channelId: oid(body.channelId) ? body.channelId : null, detectorType: body.detectorType || null, shiftId: body.shiftId || null, detectedAt: date(body.detectedAt, "detectedAt"), acknowledgedAt: body.acknowledgedAt ? date(body.acknowledgedAt, "acknowledgedAt") : null, assignedAt: body.assignedAt ? date(body.assignedAt, "assignedAt") : null, responseStartedAt: body.responseStartedAt ? date(body.responseStartedAt, "responseStartedAt") : null, resolvedAt: body.resolvedAt ? date(body.resolvedAt, "resolvedAt") : null, responsibleTeam: body.responsibleTeam || null, responseTargetSeconds: body.responseTargetSeconds ?? null, slaStatus: body.slaStatus || "unknown" };
      } else if (kind === "groups") {
        if (!body.groupId || !Array.isArray(body.incidentIds)) return response(res, 400, "groupId and incidentIds are required.", undefined, "INVALID_EVENT_GROUP");
        document = { accountId: accountId(req), groupId: String(body.groupId), channelId: oid(body.channelId) ? body.channelId : null, detectorType: body.detectorType || null, shiftId: body.shiftId || null, incidentIds: body.incidentIds.filter(oid), groupingRuleVersion: String(body.groupingRuleVersion || "1"), firstSeenAt: date(body.firstSeenAt, "firstSeenAt"), lastSeenAt: date(body.lastSeenAt, "lastSeenAt"), eventCount: Number(body.eventCount), rawEventCount: Number(body.rawEventCount), dedupeVersion: String(body.dedupeVersion || "1") };
        if (!Number.isFinite(document.eventCount) || !Number.isFinite(document.rawEventCount)) return response(res, 400, "eventCount and rawEventCount are required.", undefined, "INVALID_EVENT_COUNTS");
      } else if (kind === "contexts") {
        if (!["procedure", "zone_purpose", "operating_context", "layout_change"].includes(body.kind) || !body.title || !body.content) return response(res, 400, "kind, title, and content are required.", undefined, "INVALID_CONTEXT");
        document = { accountId: accountId(req), kind: body.kind, siteId: body.siteId || null, title: String(body.title), content: String(body.content), effectiveFrom: body.effectiveFrom ? date(body.effectiveFrom, "effectiveFrom") : null, effectiveTo: body.effectiveTo ? date(body.effectiveTo, "effectiveTo") : null, sourceRef: body.sourceRef || null, approvedBy: subject(req), changedAt: new Date() };
      } else if (kind === "schedules") {
        return response(res, 409, "One-time disable-and-restore must be created through an approved agent action.", undefined, "APPROVAL_REQUIRED");
      } else if (kind === "runtime") {
        if (!oid(body.channelId) || !body.detectionType || !["running", "starting", "stopped", "degraded", "failed", "unknown"].includes(body.runtimeState)) return response(res, 400, "channelId, detectionType, and a valid runtimeState are required.", undefined, "INVALID_RUNTIME_OBSERVATION");
        const observedAt = body.observedAt ? date(body.observedAt, "observedAt") : new Date();
        document = { accountId: accountId(req), channelId: body.channelId, detectionType: String(body.detectionType), runtimeState: body.runtimeState, observedAt, lastFrameAt: body.lastFrameAt ? date(body.lastFrameAt, "lastFrameAt") : null, lastInferenceAt: body.lastInferenceAt ? date(body.lastInferenceAt, "lastInferenceAt") : null, desiredConfigurationVersion: body.desiredConfigurationVersion ?? null, appliedConfigurationVersion: body.appliedConfigurationVersion ?? null, stale: runtimeIsStale(observedAt), lastError: body.lastError || null, observationSource: String(body.observationSource || "detection-service"), observationReachable: body.observationReachable !== false, correlationId: String(body.correlationId || requestId(req)) };
      } else if (kind === "evidence") {
        if (!oid(body.incidentId) || !body.evidenceId || !body.mediaPath || !body.mediaType || !body.occurrenceAt) return response(res, 400, "incidentId, evidenceId, mediaPath, mediaType, and occurrenceAt are required.", undefined, "INVALID_EVIDENCE");
        document = { accountId: accountId(req), incidentId: body.incidentId, evidenceId: String(body.evidenceId), mediaPath: String(body.mediaPath), mediaType: body.mediaType, occurrenceAt: date(body.occurrenceAt, "occurrenceAt"), uploadedAt: body.uploadedAt ? date(body.uploadedAt, "uploadedAt") : null, available: body.available === true, accessExpiresAt: body.accessExpiresAt ? date(body.accessExpiresAt, "accessExpiresAt") : null, retentionUntil: body.retentionUntil ? date(body.retentionUntil, "retentionUntil") : null, machineAccess: body.machineAccess === true, authorizationScope: String(body.authorizationScope || "account"), sourceTimestamp: body.sourceTimestamp ? date(body.sourceTimestamp, "sourceTimestamp") : null };
      }
      const uniqueFilter = ["reviews", "lifecycles"].includes(kind) ? { accountId: accountId(req), incidentId: document.incidentId }
        : kind === "groups" ? { accountId: accountId(req), groupId: document.groupId }
          : kind === "evidence" ? { accountId: accountId(req), incidentId: document.incidentId, evidenceId: document.evidenceId }
            : null;
      const created = uniqueFilter
        ? await Model.findOneAndUpdate(uniqueFilter, { $set: document }, { new: true, upsert: true, setDefaultsOnInsert: true })
        : await Model.create(document);
      return response(res, 201, `${kind} record stored.`, { record: created, requestId: requestId(req) });
    } catch (error) { return response(res, 400, error.message || "Invalid advanced data.", undefined, "INVALID_ADVANCED_DATA"); }
  }
  async list(req, res, kind) {
    try {
      if (!permitted(req, "view")) return response(res, 403, "You do not have permission to view agent data.", undefined, "AGENT_DATA_VIEW_DENIED");
      const Model = models[kind];
      const { skip, limit } = paging(req);
      const filter = parseRange(req);
      if (kind === "schedules" && req.query.actionId) {
        if (!oid(req.query.actionId)) return response(res, 400, "actionId must be an ObjectId.", undefined, "INVALID_FILTER");
        filter.actionId = req.query.actionId;
      }
      if (req.query.channelId) {
        if (!oid(req.query.channelId)) return response(res, 400, "channelId must be an ObjectId.", undefined, "INVALID_FILTER");
        filter.channelId = req.query.channelId;
      }
      if (req.query.incidentId && oid(req.query.incidentId)) filter.incidentId = req.query.incidentId;
      if (req.query.label) filter.label = String(req.query.label);
      if (req.query.detectorType || req.query.detectionType) filter.detectorType = String(req.query.detectionType || req.query.detectorType);
      if (req.query.shiftId) filter.shiftId = String(req.query.shiftId);
      if (req.verified?.userData?.memberId && Object.prototype.hasOwnProperty.call(Model.schema.paths, "channelId")) {
        const allowed = (req.verified?.authorizedChannel?.channels || []).filter(oid);
        filter.channelId = filter.channelId ? { $eq: filter.channelId, $in: allowed } : { $in: allowed };
      }
      // Evidence is keyed by incidentId rather than channelId. Resolve the
      // incident camera first so a member cannot enumerate another camera's
      // media metadata (or use it to discover a media path).
      if (kind === "evidence" && req.verified?.userData?.memberId) {
        const allowed = (req.verified?.authorizedChannel?.channels || []).filter(oid);
        const visibleIncidents = await Incident.find({
          userId: String(req.verified?.userData?.user_id || req.verified?.userData?.userId || ""),
          channelId: { $in: allowed },
        }).distinct("_id");
        filter.incidentId = filter.incidentId
          ? { $eq: filter.incidentId, $in: visibleIncidents }
          : { $in: visibleIncidents };
      }
      const [items, total] = await Promise.all([Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Model.countDocuments(filter)]);
      const visibleItems = kind === "runtime" ? items.map((item) => ({ ...item, stale: runtimeIsStale(item.observedAt) })) : items;
      return response(res, 200, `${kind} records retrieved.`, { items: visibleItems, total, hasMore: skip + items.length < total, skip, limit, ...(kind === "runtime" ? { staleAfterSeconds: RUNTIME_STALE_AFTER_SECONDS } : {}), sort: "createdAt desc, _id desc", appliedFilters: req.query, dataFreshAt: new Date().toISOString(), requestId: requestId(req) });
    } catch (error) { return response(res, 400, error.message, undefined, "INVALID_QUERY"); }
  }
  async analytics(req, res) {
    if (!permitted(req, "view")) return response(res, 403, "You do not have permission to view agent analytics.", undefined, "AGENT_ANALYTICS_VIEW_DENIED");
    const metric = String(req.body?.metric || req.query.metric || "");
    const supported = ["outage_duration", "coverage", "false_positive_rate", "confirmed_rate", "response_delay", "overdue_response", "deduplicated_events"];
    if (!supported.includes(metric)) return response(res, 400, `metric must be one of: ${supported.join(", ")}.`, undefined, "UNSUPPORTED_METRIC");
    const input = { ...(req.query || {}), ...(req.body || {}) };
    const acceptedKeys = new Set(["metric", "from", "to", "groupBy", ...metricFilters[metric], "detectionType"]);
    if (Object.keys(input).some((key) => !acceptedKeys.has(key) || (key === "detectionType" && !metricFilters[metric].includes("detectorType")))) return response(res, 400, `Unsupported filter for ${metric}. Allowed: ${metricFilters[metric].join(", ") || "none"}.`, undefined, "UNSUPPORTED_FILTER");
    if (input.detectionType && input.detectorType && input.detectionType !== input.detectorType) return response(res, 400, "detectionType and detectorType disagree.", undefined, "INVALID_FILTER");
    if (input.channelId && !oid(input.channelId)) return response(res, 400, "channelId must be an ObjectId.", undefined, "INVALID_FILTER");
    const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    for (const key of ["from", "to"]) if (input[key] && (!timestampPattern.test(String(input[key])) || Number.isNaN(Date.parse(input[key])))) return response(res, 400, `${key} must be an ISO-8601 timestamp with a timezone offset.`, undefined, "INVALID_DATE_RANGE");
    if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to)) return response(res, 400, "from must precede to.", undefined, "INVALID_DATE_RANGE");
    const requestedGroups = groupBy(req);
    if (requestedGroups.length > 4 || new Set(requestedGroups).size !== requestedGroups.length || requestedGroups.some((value) => !metricGroupBy[metric].includes(value))) return response(res, 400, `Unsupported groupBy for ${metric}. Allowed: ${metricGroupBy[metric].join(", ") || "none"}.`, undefined, "UNSUPPORTED_GROUP_BY");
    if (metric === "outage_duration" || metric === "coverage") { const filter = metricRange(req, "startedAt"); const rows = await AgentOutage.find(filter).lean(); const outageSeconds = rows.reduce((sum, row) => sum + (row.endedAt ? (new Date(row.endedAt) - new Date(row.startedAt)) / 1000 : 0), 0); const monitoredSeconds = rows.reduce((sum, row) => sum + Number(row.monitoredSeconds || 0), 0); return response(res, 200, "Availability analytics retrieved.", { metric, sampleSize: rows.length, outageSeconds, monitoredSeconds, coverageSeconds: Math.max(monitoredSeconds - outageSeconds, 0), coverageStart: rows.map((row) => row.coverageStart).filter(Boolean).sort()[0] || null, coverageEnd: rows.map((row) => row.coverageEnd).filter(Boolean).sort().at(-1) || null, source: "agent_outages", complete: rows.length > 0 && rows.every((row) => row.endedAt && row.monitoredSeconds !== null), dataFreshAt: new Date().toISOString() }); }
    if (["false_positive_rate", "confirmed_rate"].includes(metric)) { const rows = await AgentIncidentReview.find(metricRange(req, "reviewedAt")).lean(); const confirmed = rows.filter((row) => row.label === "confirmed").length; const falsePositives = rows.filter((row) => row.label === "false_positive").length; const reviewed = rows.length; const dimensions = groupBy(req); return response(res, 200, "Reviewed incident analytics retrieved.", { metric, reviewedSampleSize: reviewed, confirmedCount: confirmed, falsePositiveCount: falsePositives, rate: reviewed ? (metric === "false_positive_rate" ? falsePositives : confirmed) / reviewed : null, groups: grouped(rows, dimensions, 'reviewedCount'), supportedGroupBy: ['channelId', 'detectorType', 'shiftId', 'label'], appliedFilters: { ...req.query, ...(req.body || {}), groupBy: dimensions }, complete: reviewed > 0, dataFreshAt: new Date().toISOString() }); }
    if (metric === "response_delay" || metric === "overdue_response") { const rows = await AgentIncidentLifecycle.find(metricRange(req, "detectedAt")).lean(); const valid = rows.filter((row) => row.acknowledgedAt); const delays = valid.map((row) => (new Date(row.acknowledgedAt) - new Date(row.detectedAt)) / 1000); return response(res, 200, "Response analytics retrieved.", { metric, sampleSize: valid.length, averageAcknowledgementSeconds: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null, overdueCount: rows.filter((row) => row.slaStatus === "overdue").length, complete: rows.length > 0 && rows.every((row) => row.responseTargetSeconds !== null), dataFreshAt: new Date().toISOString() }); }
    const groups = await AgentEventGroup.find(metricRange(req, "firstSeenAt")).lean(); const dimensions = groupBy(req); return response(res, 200, "Deduplicated event analytics retrieved.", { metric, groupCount: groups.length, rawEventCount: groups.reduce((sum, row) => sum + row.rawEventCount, 0), deduplicatedEventCount: groups.reduce((sum, row) => sum + row.eventCount, 0), groupingRuleVersions: [...new Set(groups.map((row) => row.groupingRuleVersion))], groups: dimensions.length ? grouped(groups, dimensions, 'groupCount') : undefined, supportedGroupBy: ['channelId', 'detectorType', 'shiftId'], appliedFilters: { ...req.query, ...(req.body || {}), groupBy: dimensions }, complete: groups.length > 0, dataFreshAt: new Date().toISOString() });
  }
}
export default new AgentDataService();
