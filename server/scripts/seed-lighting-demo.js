/** Development-only lighting fixtures. Never sends alerts or changes camera settings.
 * node scripts/seed-lighting-demo.js --admin pavank                 (inspect only)
 * node scripts/seed-lighting-demo.js --admin pavank --execute       (insert)
 * node scripts/seed-lighting-demo.js --admin pavank --remove <batch> (undo batch)
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
if (remove && !/^lighting-pavank-\d{14}$/.test(remove)) throw new Error('Invalid batch ID');
const manifestDir = path.join(root, '.demo-seeds');
const categories = ['lowVisibility', 'roadSurfaceDamage', 'weatherSiteHazard'];
const labels = ['Low Visibility (Fog / Rain / Poor Light)', 'Road Surface Damage', 'Weather-Related Site Hazard'];
const descriptions = [
  'DEMO: Poor lighting and fog obscure the road edges.',
  'DEMO: A pothole and broken road surface create a traffic hazard.',
  'DEMO: A scrap stack is leaning beside pooled rainwater.',
];
const svg = label => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#111827"/><path d="M350 110L150 470H810L610 110Z" fill="#475569"/><path d="M480 150V450" stroke="#fbbf24" stroke-width="8" stroke-dasharray="30 25"/><rect x="290" y="240" width="380" height="160" fill="none" stroke="#ef4444" stroke-width="6"/><text x="25" y="45" font-family="sans-serif" font-size="22" fill="white">DEMO - SYNTHETIC EVIDENCE - NOT A REAL CAMERA IMAGE</text><text x="25" y="510" font-family="sans-serif" font-size="22" fill="#fbbf24">${label}</text></svg>`;

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const { default: Admin } = await import('../core/v1/admin/admin.model.js');
  const { default: Channel } = await import('../core/v1/channels/channels.model.js');
  const { LightingVisibilitySiteConditionsDetectionIncident: Incident } = await import('../core/v1/incidents/incidents.model.js');
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
      const image = path.join(root, 'public', 'demo', 'lighting', remove, `${name}.svg`);
      if (fs.existsSync(image)) fs.unlinkSync(image);
    }
    manifest.removedAt = new Date().toISOString(); manifest.deletedCount = result.deletedCount;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ removed: result.deletedCount, batch: remove }));
  } else {
    const channels = await Channel.find({ userId, nvrId: { $ne: null } }).select('_id nvrId name customName').sort({ _id: 1 }).limit(3).lean();
    if (!channels.length) throw new Error('No existing cameras with NVR references for pavank');
    const existing = await Incident.countDocuments({ userId, conceptGroup: /^lighting-pavank-/ });
    console.log(JSON.stringify({ cameras: channels.map(c => ({ id: String(c._id), name: c.customName || c.name })), existingDemoIncidents: existing, execute: args.includes('--execute') }));
    if (args.includes('--execute')) {
      if (existing) throw new Error('A demo batch already exists. Remove it before reseeding.');
      const now = moment.tz(admin.timezone || 'Asia/Kolkata');
      const batch = `lighting-pavank-${now.clone().utc().format('YYYYMMDDHHmmss')}`;
      const imageDir = path.join(root, 'public', 'demo', 'lighting', batch);
      fs.mkdirSync(imageDir, { recursive: true });
      categories.forEach((name, i) => fs.writeFileSync(path.join(imageDir, `${name}.svg`), svg(labels[i], i)));
      const rows = [];
      for (let day = 2; day >= 0; day--) for (let ci = 0; ci < channels.length; ci++) {
        const channel = channels[ci];
        const daily = 3;
        for (let k = 0; k < daily; k++) {
          const at = now.clone().subtract(day, 'days').startOf('day').hour(6 + (k * 2 + ci + day) % 14).minute((k * 17 + day * 3) % 60).second(k * 7 % 60);
          if (at.isAfter(now)) continue;
          const category = (k + day + ci) % 3;
          const severity = (k + day) % 5 === 0 ? 'high' : (k % 3 ? 'moderate' : 'low');
          const violations = [{ category: categories[category], categoryName: labels[category], description: descriptions[category], confidence: +(0.64 + ((k * 13 + day * 7 + ci) % 35) / 100).toFixed(2), severity }];
          if (k % 5 === 0) { const extra = (category + 1) % 3; violations.push({ category: categories[extra], categoryName: labels[extra], description: descriptions[extra], confidence: .83, severity: 'moderate' }); }
          rows.push({ _id: new mongoose.Types.ObjectId(), incidentType: 'lightingVisibilitySiteConditionsDetection', incidentName: 'Lighting / Visibility / Site Conditions Detection', conceptGroup: batch,
            userId, adminId: admin._id, channelId: channel._id, cameraId: channel._id, nvrId: channel.nvrId, timeOfIncident: at.toDate(),
            zone: ['Access Road', 'Loading Road', 'Scrap Yard'][(ci + k % 2) % 3], type: 'gauge', severity, alertThreshold: 400,
            selectedCategories: [...categories], violationCount: violations.length, violations,
            description: `[DEMO ${batch}] ${descriptions[category]}`, Image: `data:image/svg+xml;base64,${Buffer.from(svg(labels[category], category)).toString('base64')}`,
            triggerNotification: false, resolved: day > 2 && k % 4 !== 0,
          });
        }
      }
      // Write a removal manifest BEFORE insertion, so partial insertions are reversible.
      fs.mkdirSync(manifestDir, { recursive: true });
      const manifestPath = path.join(manifestDir, `${batch}.json`);
      const manifest = { batch, fingerprint, userId, adminId: String(admin._id), config: 'development.json', createdAt: new Date().toISOString(), ids: rows.map(r => String(r._id)), imageDirectory: `public/demo/lighting/${batch}` };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
      await Incident.insertMany(rows, { ordered: true });
      console.log(JSON.stringify({ batch, inserted: rows.length, images: 3, manifest: path.relative(root, manifestPath), undo: `node scripts/seed-lighting-demo.js --admin pavank --remove ${batch}` }));
    }
  }
} finally { await mongoose.disconnect(); }
