/** Development-only hygiene fixtures. Never sends alerts or changes camera settings.
 * node scripts/seed-hygiene-demo.js --admin pavank                 (inspect only)
 * node scripts/seed-hygiene-demo.js --admin pavank --execute       (insert)
 * node scripts/seed-hygiene-demo.js --admin pavank --remove <batch> (undo batch)
 * The manifest records every inserted ID. Removal intersects IDs, account and marker.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import moment from 'moment-timezone';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Deliberately bypass NODE_ENV, NODE_CONFIG and encrypted deployment settings.
const configPath = path.join(root, 'config', 'development.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const uri = config.mongodb_uri;
if (!uri) throw new Error('development.json does not define mongodb_uri');
const target = new URL(uri);
const fingerprint = crypto.createHash('sha256').update(uri).digest('hex');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const login = option('--admin');
if (login !== 'pavank') throw new Error('This fixture is scoped to --admin pavank.');
const remove = option('--remove');
if (remove && !/^hygiene-pavank-\d{14}$/.test(remove)) throw new Error('Invalid batch ID');
const manifestDir = path.join(root, '.demo-seeds');
const categories = ['handHygieneBypass', 'productContact', 'contaminationRisk'];
const labels = ['Hand Hygiene Bypass', 'Product on Floor / Unclean Surface', 'Contamination Risk / Spillage'];
const descriptions = [
  'A worker passed the hand-hygiene station and entered the preparation area without an observed hygiene step.',
  'A food product tray was observed in contact with the floor or an unclean preparation surface.',
  'Spillage was observed beside the food preparation counter, presenting a contamination risk.',
];
const svg = (category, index) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#111827"/><path d="M0 100H960M0 200H960M0 300H960M0 400H960M120 0V540M240 0V540M360 0V540M480 0V540M600 0V540M720 0V540M840 0V540" stroke="#243244"/><rect x="100" y="120" width="400" height="100" rx="12" fill="#64748b"/><rect x="120" y="130" width="120" height="75" rx="8" fill="#cbd5e1"/><ellipse cx="180" cy="167" rx="38" ry="24" fill="#334155"/><rect x="560" y="120" width="270" height="100" rx="12" fill="#94a3b8"/><rect x="590" y="140" width="100" height="55" fill="#e2e8f0"/><circle cx="390" cy="310" r="24" fill="#fbbf24"/><rect x="360" y="337" width="62" height="90" rx="14" fill="#60a5fa"/>${index === 0 ? '<path d="M320 430L520 270" stroke="#f97316" stroke-width="7" stroke-dasharray="12 8"/><rect x="315" y="270" width="145" height="180" fill="none" stroke="#f97316" stroke-width="4"/>' : index === 1 ? '<rect x="650" y="325" width="100" height="65" rx="7" fill="#fbbf24"/><rect x="630" y="305" width="140" height="105" fill="none" stroke="#ef4444" stroke-width="4"/>' : '<ellipse cx="660" cy="345" rx="80" ry="35" fill="#38bdf8" opacity=".7"/><rect x="560" y="290" width="200" height="110" fill="none" stroke="#ef4444" stroke-width="4"/>'}<rect width="960" height="62" fill="#0f172a"/><text x="25" y="39" font-family="sans-serif" font-size="23" fill="#f8fafc">DEMO - SYNTHETIC EVIDENCE - NOT A REAL CAMERA IMAGE</text><rect y="465" width="960" height="75" fill="#0f172a"/><text x="25" y="497" font-family="sans-serif" font-size="22" fill="#fbbf24">${category.replace(/&/g, '&amp;')}</text><text x="25" y="523" font-family="sans-serif" font-size="15" fill="#94a3b8">Illustrative food-preparation scene for development analytics only</text></svg>`;

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const { default: Admin } = await import('../core/v1/admin/admin.model.js');
  const { default: Channel } = await import('../core/v1/channels/channels.model.js');
  const { HygieneSanitationFoodSafetyDetectionIncident: Incident } = await import('../core/v1/incidents/incidents.model.js');
  const admins = await Admin.find({ login: /^pavank$/i }).select('user_id login timezone').lean();
  if (admins.length !== 1) throw new Error(`Expected one pavank admin; found ${admins.length}`);
  const admin = admins[0];
  const userId = String(admin.user_id);
  console.log(JSON.stringify({ config: 'config/development.json', host: target.hostname, database: mongoose.connection.name, login: admin.login, userId, adminId: String(admin._id) }));

  if (remove) {
    const manifestPath = path.join(manifestDir, `${remove}.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.fingerprint !== fingerprint || manifest.userId !== userId || manifest.batch !== remove) throw new Error('Manifest does not match development database/account');
    const result = await Incident.deleteMany({ userId, conceptGroup: remove, _id: { $in: manifest.ids.map(id => new mongoose.Types.ObjectId(id)) } });
    for (const name of categories) {
      const image = path.join(root, 'public', 'demo', 'hygiene', remove, `${name}.svg`);
      if (fs.existsSync(image)) fs.unlinkSync(image);
    }
    manifest.removedAt = new Date().toISOString(); manifest.deletedCount = result.deletedCount;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ removed: result.deletedCount, batch: remove }));
  } else {
    const channels = await Channel.find({ userId, nvrId: { $ne: null } }).select('_id nvrId name customName').sort({ _id: 1 }).limit(3).lean();
    if (!channels.length) throw new Error('No existing cameras with NVR references for pavank');
    const existing = await Incident.countDocuments({ userId, conceptGroup: /^hygiene-pavank-/ });
    console.log(JSON.stringify({ cameras: channels.map(c => ({ id: String(c._id), name: c.customName || c.name })), existingDemoIncidents: existing, execute: args.includes('--execute') }));
    if (args.includes('--execute')) {
      if (existing) throw new Error('A demo batch already exists. Remove it before reseeding.');
      const now = moment.tz(admin.timezone || 'Asia/Kolkata');
      const batch = `hygiene-pavank-${now.clone().utc().format('YYYYMMDDHHmmss')}`;
      const imageDir = path.join(root, 'public', 'demo', 'hygiene', batch);
      fs.mkdirSync(imageDir, { recursive: true });
      categories.forEach((name, i) => fs.writeFileSync(path.join(imageDir, `${name}.svg`), svg(labels[i], i)));
      const rows = [];
      for (let day = 20; day >= 0; day--) for (let ci = 0; ci < channels.length; ci++) {
        const channel = channels[ci];
        const daily = 7 + ((day * 7 + ci * 3) % 9);
        for (let k = 0; k < daily; k++) {
          const at = now.clone().subtract(day, 'days').startOf('day').hour(6 + (k * 2 + ci + day) % 14).minute((k * 17 + day * 3) % 60).second(k * 7 % 60);
          if (at.isAfter(now)) continue;
          const category = (k + day + ci) % 3;
          const severity = (k + day) % 5 === 0 ? 'high' : (k % 3 ? 'moderate' : 'low');
          const violations = [{ category: categories[category], categoryName: labels[category], description: descriptions[category], confidence: +(0.64 + ((k * 13 + day * 7 + ci) % 35) / 100).toFixed(2), severity }];
          if (k % 5 === 0) { const extra = (category + 1) % 3; violations.push({ category: categories[extra], categoryName: labels[extra], description: descriptions[extra], confidence: .83, severity: 'moderate' }); }
          rows.push({ _id: new mongoose.Types.ObjectId(), incidentType: 'hygieneSanitationFoodSafetyDetection', incidentName: 'Hygiene, Sanitation & Food Safety Detection', conceptGroup: batch,
            userId, adminId: admin._id, channelId: channel._id, cameraId: channel._id, nvrId: channel.nvrId, timeOfIncident: at.toDate(),
            zone: ['Hand Hygiene Entry', 'Preparation Counter', 'Packing & Wash Area'][(ci + k % 2) % 3], type: 'gauge', severity, alertThreshold: 400,
            selectedCategories: [...categories], violationCount: violations.length, violations,
            description: `[DEMO ${batch}] ${descriptions[category]}`, Image: `data:image/svg+xml;base64,${Buffer.from(svg(labels[category], category)).toString('base64')}`,
            triggerNotification: false, resolved: day > 2 && k % 4 !== 0,
          });
        }
      }
      // Write a removal manifest BEFORE insertion, so partial insertions are reversible.
      fs.mkdirSync(manifestDir, { recursive: true });
      const manifestPath = path.join(manifestDir, `${batch}.json`);
      const manifest = { batch, fingerprint, userId, adminId: String(admin._id), config: 'development.json', createdAt: new Date().toISOString(), ids: rows.map(r => String(r._id)), imageDirectory: `public/demo/hygiene/${batch}` };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
      await Incident.insertMany(rows, { ordered: true });
      console.log(JSON.stringify({ batch, inserted: rows.length, images: 3, manifest: path.relative(root, manifestPath), undo: `node scripts/seed-hygiene-demo.js --admin pavank --remove ${batch}` }));
    }
  }
} finally { await mongoose.disconnect(); }
