/** Extend an existing development fixture; its original removal command undoes
 * these records too. Usage: node scripts/expand-hygiene-demo.js <batch>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import moment from 'moment-timezone';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/development.json'), 'utf8'));
const batch = process.argv[2];
if (!/^hygiene-pavank-\d{14}$/.test(batch || '')) throw new Error('Provide the existing pavank batch ID');
const manifestPath = path.join(root, '.demo-seeds', `${batch}.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.fingerprint !== crypto.createHash('sha256').update(config.mongodb_uri).digest('hex') || manifest.removedAt) throw new Error('Manifest/database mismatch or removed batch');
if (manifest.expandedAt) throw new Error('This batch has already been expanded');
const categoryIds = ['handHygieneBypass', 'productContact', 'contaminationRisk'];
const labels = ['Hand Hygiene Bypass', 'Product on Floor / Unclean Surface', 'Contamination Risk / Spillage'];
const descriptions = ['Worker bypassed the hand-hygiene entry station before entering the preparation area.', 'Product tray observed on a floor or an unclean preparation surface.', 'Spillage observed beside an exposed food preparation area.'];

try {
  await mongoose.connect(config.mongodb_uri, { serverSelectionTimeoutMS: 15000 });
  const { default: Admin } = await import('../core/v1/admin/admin.model.js');
  const { default: Channel } = await import('../core/v1/channels/channels.model.js');
  const { HygieneSanitationFoodSafetyDetectionIncident: Incident } = await import('../core/v1/incidents/incidents.model.js');
  const admin = await Admin.findOne({ _id: manifest.adminId, user_id: manifest.userId, login: /^pavank$/i }).lean();
  if (!admin) throw new Error('Expected pavank account not found');
  const existing = await Incident.find({ userId: manifest.userId, conceptGroup: batch, _id: { $in: manifest.ids } }).select('channelId Image').lean();
  if (!existing.length) throw new Error('Original batch is missing');
  const channels = await Channel.find({ userId: manifest.userId, _id: { $in: [...new Set(existing.map(e => String(e.channelId)))] } }).lean();
  if (!channels.length) throw new Error('No existing authorized fixture cameras');
  const images = categoryIds.map(name => `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'public/demo/hygiene', batch, `${name}.svg`)).toString('base64')}`);
  const now = moment.tz(admin.timezone || 'Asia/Kolkata');
  const rows = [];
  function add(at, index, scenario) {
    const ci = index % channels.length, channel = channels[ci], category = index % 3;
    const severity = ['low', 'moderate', 'high'][Math.floor(index / 3) % 3];
    let violations = [{ category: categoryIds[category], categoryName: labels[category], description: descriptions[category], severity }];
    const confidence = index % 7 === 0 ? undefined : index % 7 === 1 ? 1 : index % 7 === 2 ? 0 : Number((.6 + index % 39 / 100).toFixed(2));
    if (confidence !== undefined) violations[0].confidence = confidence;
    if (index % 6 === 0) violations = categoryIds.map((id, i) => ({ category: id, categoryName: labels[i], description: descriptions[i], confidence: .76 + i * .1, severity: i === 1 ? 'medium' : severity }));
    if (index % 17 === 0) violations = [];
    rows.push({ _id: new mongoose.Types.ObjectId(), userId: manifest.userId, adminId: admin._id, nvrId: channel.nvrId, channelId: channel._id, cameraId: channel._id,
      incidentType: 'hygieneSanitationFoodSafetyDetection', incidentName: 'Hygiene, Sanitation & Food Safety Detection', conceptGroup: batch,
      timeOfIncident: at.toDate(), zone: scenario === 'single' ? 'One-off receiving bay' : index % 13 === 0 ? '' : ['Hand Hygiene Entry', 'Preparation Counter', 'Packing & Wash Area'][Math.floor(index / 3) % 3],
      selectedCategories: index % 2 ? [categoryIds[category]] : [...categoryIds],
      // Missing optional violationCount deliberately exercises the list-length fallback.
      ...(index % 11 !== 0 ? { violationCount: violations.length || 2 } : {}), violations,
      description: `[DEMO ${batch}] ${scenario}: ${violations.length ? descriptions[category] : 'Summary-only event; detailed violations were not supplied.'}`,
      severity, resolved: index % 2 === 0, triggerNotification: false, type: 'gauge', alertThreshold: 400,
      Image: index % 5 === 0 ? null : images[category],
    });
  }
  // Older daily samples exercise month boundaries and custom date ranges.
  for (let day = 21; day <= 50; day++) add(now.clone().subtract(day, 'days').startOf('day').hour(8 + day % 10), day, 'Historical day');
  // Every clock hour is represented without creating future records.
  for (let hour = 0; hour < 24; hour++) add(now.clone().subtract(1, 'day').startOf('day').hour(hour).minute(25), hour + 100, 'Hourly coverage');
  // Recent samples make optional fields, resolution and each severity easy to inspect.
  for (let i = 0; i < 72; i++) add(now.clone().subtract(i + 1, 'minutes'), i + 200, 'Recent payload variation');
  add(now.clone().subtract(2, 'hours'), 500, 'single');
  // Record IDs before writing, preserving rollback even after partial insertion.
  manifest.ids.push(...rows.map(r => String(r._id)));
  manifest.expandedAt = new Date().toISOString();
  manifest.expansion = { records: rows.length, scenarios: ['all categories', 'all severities', 'resolved and unresolved', 'three violations per incident', 'summary-only events', 'missing confidence', 'confidence 0 and 1', 'missing evidence', 'single-category selection', 'unassigned zone', 'single alert zone', '24 hours', '50-day history', 'missing optional violationCount'] };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  await Incident.insertMany(rows);
  const result = await Incident.aggregate([{ $match: { userId: manifest.userId, conceptGroup: batch } }, { $facet: {
    total: [{ $count: 'count' }], severity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }], status: [{ $group: { _id: '$resolved', count: { $sum: 1 } } }],
    missingImages: [{ $match: { Image: null } }, { $count: 'count' }],
    confidence: [{ $unwind: '$violations' }, { $group: { _id: null, min: { $min: '$violations.confidence' }, max: { $max: '$violations.confidence' }, missing: { $sum: { $cond: [{ $isNumber: '$violations.confidence' }, 0, 1] } } } }],
  } }]);
  console.log(JSON.stringify({ config: 'config/development.json', login: admin.login, batch, inserted: rows.length, coverage: result[0], undo: `node scripts/seed-hygiene-demo.js --admin pavank --remove ${batch}` }));
} finally { await mongoose.disconnect(); }
