import mongoose from 'mongoose';
import moment from 'moment-timezone';
import { HygieneSanitationFoodSafetyDetectionIncident as Incident } from './incidents.model.js';
import Channel from '../channels/channels.model.js';
import { HYGIENE_CATEGORIES } from '../../../constants/hygieneDetection.js';
import { getRequestTimezone } from '../../../utils/timezone.js';
import Response from '../../../utils/response.js';

const objectId = value => new mongoose.Types.ObjectId(value);
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

export async function getHygieneLogFilters(req, res, next) {
  try {
    if (req?.verified?.userData?.memberId) {
      const logs = req.verified.permissionConfig?.[0]?.permissionConfig?.logs;
      if (!(logs?.hygieneSanitationFoodSafetyLogs?.view || logs?.global?.view || logs?.view)) return res.status(403).send(Response.accessDeniedResp('Hygiene logs access denied.'));
    }
    const userId = req?.verified?.userData?.user_id?.toString();
    if (!userId) return res.status(401).send(Response.userFailResp('Authentication required'));
    const match = { userId, incidentType: 'hygieneSanitationFoodSafetyDetection' };
    const authorized = req?.verified?.authorizedChannel?.channels;
    if (Array.isArray(authorized)) match.channelId = { $in: authorized.map(String).filter(validId).map(objectId) };
    // Derive filter choices from the entire authorized log history, so even
    // inactive cameras and periods with no incidents retain usable filters.
    const rows = await Incident.aggregate([
      { $match: match }, { $group: { _id: { camera: '$channelId', nvr: '$nvrId' } } },
      { $lookup: { from: 'channels', localField: '_id.camera', foreignField: '_id', as: 'camera' } },
      { $lookup: { from: 'nvrs', localField: '_id.nvr', foreignField: '_id', as: 'nvr' } },
      { $project: { _id: 1, camera: { $arrayElemAt: ['$camera', 0] }, nvr: { $arrayElemAt: ['$nvr', 0] } } },
    ]);
    const nvrs = new Map(), cameras = new Map();
    rows.forEach(row => {
      if (row._id.nvr) nvrs.set(String(row._id.nvr), { _id: String(row._id.nvr), nvrName: row.nvr?.nvrName || 'Historical NVR' });
      if (row._id.camera) cameras.set(String(row._id.camera), { _id: String(row._id.camera), nvrId: String(row._id.nvr || ''), name: row.camera?.customName || row.camera?.name || 'Historical camera' });
    });
    return res.send(Response.userSuccessResp('Hygiene log filters fetched', { nvrs: [...nvrs.values()], cameras: [...cameras.values()] }));
  } catch (error) { next(error); }
}

export function hygieneQuery(req) {
  const userId = req?.verified?.userData?.user_id?.toString();
  if (!userId) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const timezone = getRequestTimezone(req);
  const today = moment.tz(timezone).format('YYYY-MM-DD');
  const { startDate = today, endDate = startDate, camera = '', zone = '', category = '', severity = '', status = '', page = '1' } = req.query || {};
  if (typeof startDate !== 'string' || typeof endDate !== 'string') throw invalid('Invalid dates.');
  const start = moment.tz(startDate, 'YYYY-MM-DD', true, timezone);
  const end = moment.tz(endDate, 'YYYY-MM-DD', true, timezone);
  if (!start.isValid() || !end.isValid() || end.isBefore(start) || end.diff(start, 'days') > 365) throw invalid('Choose a valid date range of up to 366 days.');
  if (camera && !validId(camera)) throw invalid('Invalid camera.');
  if (typeof zone !== 'string' || zone.length > 200) throw invalid('Invalid zone.');
  if (category && !HYGIENE_CATEGORIES.includes(category)) throw invalid('Invalid category.');
  if (severity && !['low', 'moderate', 'high'].includes(severity)) throw invalid('Invalid severity.');
  if (status && !['open', 'resolved'].includes(status)) throw invalid('Invalid status.');
  if (!/^\d+$/.test(String(page)) || Number(page) < 1 || Number(page) > 100000) throw invalid('Invalid page.');
  const base = { userId, incidentType: 'hygieneSanitationFoodSafetyDetection', timeOfIncident: { $gte: start.startOf('day').toDate(), $lte: end.endOf('day').toDate() } };
  const authorized = req?.verified?.authorizedChannel?.channels;
  if (Array.isArray(authorized)) base.channelId = { $in: authorized.map(String).filter(validId).map(objectId) };
  // Keep the authorization predicate even when a caller chooses a camera.
  const match = { ...base, ...(camera && { $and: [{ channelId: objectId(camera) }] }), ...(zone && { zone }), ...(severity && { severity }), ...(status && { resolved: status === 'resolved' }), ...(category && { 'violations.category': category }) };
  return { base, match, timezone, page: Number(page), category };
}

export function hygienePipeline({ match, timezone, page, category }) {
  const group = key => [
    { $group: { _id: key, incidents: { $sum: 1 }, violations: { $sum: '$_violationCount' }, open: { $sum: { $cond: [{ $eq: ['$resolved', true] }, 0, 1] } }, high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } } } },
    { $sort: { incidents: -1, _id: 1 } },
  ];
  return [
    { $match: match },
    { $set: { _violationCount: category
      ? { $size: { $filter: { input: { $ifNull: ['$violations', []] }, as: 'violation', cond: { $eq: ['$$violation.category', category] } } } }
      : { $ifNull: ['$violationCount', { $size: { $ifNull: ['$violations', []] } }] } } },
    { $facet: {
      summary: [
        { $group: { _id: null, incidents: { $sum: 1 }, violations: { $sum: '$_violationCount' }, open: { $sum: { $cond: [{ $eq: ['$resolved', true] }, 0, 1] } }, high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } }, cameras: { $addToSet: '$channelId' } } },
        { $set: { cameras: { $size: '$cameras' } } },
      ],
      categories: [
        { $unwind: '$violations' },
        ...(category ? [{ $match: { 'violations.category': category } }] : []),
        { $group: { _id: '$violations.category', violations: { $sum: 1 }, confidence: { $avg: '$violations.confidence' }, confidenceSamples: { $sum: { $cond: [{ $isNumber: '$violations.confidence' }, 1, 0] } }, high: { $sum: { $cond: [{ $eq: ['$violations.severity', 'high'] }, 1, 0] } } } },
        { $sort: { violations: -1, _id: 1 } },
      ],
      trend: [...group({ $dateToString: { format: '%Y-%m-%d', date: '$timeOfIncident', timezone } }), { $sort: { _id: 1 } }],
      hours: [...group({ $hour: { date: '$timeOfIncident', timezone } }), { $sort: { _id: 1 } }],
      categoryHours: [
        { $unwind: '$violations' },
        ...(category ? [{ $match: { 'violations.category': category } }] : []),
        { $group: { _id: { category: '$violations.category', hour: { $hour: { date: '$timeOfIncident', timezone } } }, violations: { $sum: 1 } } },
        { $sort: { '_id.hour': 1 } },
      ],
      categoryZones: [
        { $unwind: '$violations' },
        ...(category ? [{ $match: { 'violations.category': category } }] : []),
        { $group: { _id: { camera: '$channelId', zone: { $ifNull: ['$zone', 'Unassigned'] }, category: '$violations.category' }, violations: { $sum: 1 }, incidentIds: { $addToSet: '$_id' }, lastSeen: { $max: '$timeOfIncident' } } },
        { $project: { violations: 1, incidents: { $size: '$incidentIds' }, lastSeen: 1 } },
        { $sort: { violations: -1, '_id.zone': 1 } },
      ],
      zones: group({ camera: '$channelId', zone: { $ifNull: ['$zone', 'Unassigned'] } }),
      cameras: group('$channelId'),
      events: [
        { $sort: { timeOfIncident: -1, _id: -1 } }, { $skip: (page - 1) * 25 }, { $limit: 25 },
        { $project: { timeOfIncident: 1, channelId: 1, zone: 1, severity: 1, resolved: 1, description: 1, Image: 1, videoLink: 1, violationCount: '$_violationCount', violations: category ? { $filter: { input: { $ifNull: ['$violations', []] }, as: 'violation', cond: { $eq: ['$$violation.category', category] } } } : 1, selectedCategories: 1 } },
      ],
    } },
  ];
}

export async function getHygieneAnalytics(req, res, next) {
  try {
    // viewAccessCheck currently leaves member checks to services.
    if (req?.verified?.userData?.memberId) {
      const logs = req.verified.permissionConfig?.[0]?.permissionConfig?.logs;
      if (!(logs?.hygieneSanitationFoodSafetyLogs?.view || logs?.global?.view || logs?.view)) return res.status(403).send(Response.accessDeniedResp('Hygiene analytics access denied.'));
    }
    const query = hygieneQuery(req);
    // Category tiles are navigation/comparison controls. Preserve their context
    // while the detailed analytics use the selected category.
    const comparisonMatch = { ...query.match };
    delete comparisonMatch['violations.category'];
    const comparisonFacets = hygienePipeline({ ...query, category: '', match: comparisonMatch }).at(-1).$facet;
    const [result, options, comparison] = await Promise.all([
      Incident.aggregate(hygienePipeline(query)).allowDiskUse(true),
      Incident.aggregate([{ $match: query.base }, { $group: { _id: null, cameras: { $addToSet: '$channelId' }, zones: { $addToSet: '$zone' } } }]),
      query.category ? Incident.aggregate([{ $match: comparisonMatch }, { $facet: { categories: comparisonFacets.categories, categoryHours: comparisonFacets.categoryHours } }]) : Promise.resolve(null),
    ]);
    const cameras = await Channel.find({ userId: query.base.userId, _id: { $in: options[0]?.cameras || [] } }).setOptions({ includeInactive: true }).select('name customName').lean();
    return res.status(200).send(Response.userSuccessResp('Hygiene analytics fetched', {
      ...result[0], summary: result[0]?.summary?.[0] || { incidents: 0, violations: 0, open: 0, high: 0, cameras: 0 },
      categoryOverview: comparison?.[0] || { categories: result[0]?.categories || [], categoryHours: result[0]?.categoryHours || [] },
      timezone: query.timezone, page: query.page, pageSize: 25,
      options: { cameras: cameras.map(c => ({ id: String(c._id), name: c.customName || c.name || 'Camera' })), zones: (options[0]?.zones || []).filter(Boolean).sort() },
    }));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).send(Response.validationFailResp(error.message, 'Invalid request'));
    next(error);
  }
}
