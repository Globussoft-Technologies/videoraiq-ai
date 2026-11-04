/**
 * Rename saved emotion configuration keys. Incident types stay unchanged.
 * Run from server/ with the deployment's normal NODE_ENV/NODE_CONFIG:
 *   node scripts/migrate-emotion-settings.js          (preview)
 *   node scripts/migrate-emotion-settings.js --apply  (apply)
 * Stop detection writes while applying. Conflicting canonical records are
 * reported before any writes; existing canonical values are never overwritten.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';

const LEGACY = 'emotionDetection';
const CANONICAL = 'emotionDetectionSettings';
const atPath = (doc, key) => key.split('.').reduce((value, part) => value?.[part], doc);

export async function migrateEmotionSettings(db, { apply = false } = {}) {
  const operations = [];
  const conflicts = [];
  const add = (collection, filter, update) => operations.push({ collection, filter, update });

  for (const [collection, uniqueFields] of [
    ['detectionsettings', []],
    ['clientdetectionallocations', ['adminId']],
    ['clientcameradetections', ['adminId', 'cameraId']],
  ]) {
    for await (const row of db.collection(collection).find({ settingType: LEGACY })) {
      const destination = uniqueFields.length && await db.collection(collection).findOne({
        settingType: CANONICAL, ...Object.fromEntries(uniqueFields.map(field => [field, row[field]])),
      });
      if (destination) conflicts.push({ collection, id: String(row._id), canonicalId: String(destination._id) });
      else add(collection, { _id: row._id, settingType: LEGACY }, { $set: { settingType: CANONICAL } });
    }
  }

  for (const [collection, prefix] of [
    ['channels', 'detections'], ['admins', 'detectionConfig'],
    ['livedemos', 'detections'], ['livedemos', 'sessionAnalytics.byDetection'],
  ]) {
    const from = `${prefix}.${LEGACY}`;
    const to = `${prefix}.${CANONICAL}`;
    for await (const row of db.collection(collection).find({ [from]: { $exists: true } })) {
      const destination = atPath(row, to);
      if (destination !== undefined) {
        if (isDeepStrictEqual(atPath(row, from), destination)) {
          add(collection, { _id: row._id, [from]: atPath(row, from), [to]: destination }, { $unset: { [from]: '' } });
        } else conflicts.push({ collection, id: String(row._id), path: to });
      } else add(collection, { _id: row._id, [from]: { $exists: true }, [to]: { $exists: false } }, { $rename: { [from]: to } });
    }
  }

  for await (const row of db.collection('globalschedules').find({ detectors: LEGACY })) {
    add('globalschedules', { _id: row._id, detectors: row.detectors }, {
      $set: { detectors: [...new Set(row.detectors.map(type => type === LEGACY ? CANONICAL : type))] },
    });
  }
  const catalog = db.collection('detectioncatalogs');
  const legacyCatalog = await catalog.findOne({ settingType: LEGACY });
  if (legacyCatalog) {
    if (await catalog.findOne({ settingType: CANONICAL })) {
      if (legacyCatalog.active !== false) add('detectioncatalogs', { _id: legacyCatalog._id }, { $set: { active: false } });
    } else add('detectioncatalogs', { _id: legacyCatalog._id, settingType: LEGACY }, { $set: { settingType: CANONICAL } });
  }

  const planned = operations.reduce((totals, op) => ({ ...totals, [op.collection]: (totals[op.collection] || 0) + 1 }), {});
  const result = { mode: apply ? 'apply' : 'preview', planned, conflicts, modified: 0 };
  if (apply && conflicts.length) throw new Error(`Rename has conflicts; no records changed. Preview to inspect ${conflicts.length} conflicting records.`);
  if (apply) for (const op of operations) {
    result.modified += (await db.collection(op.collection).updateOne(op.filter, op.update)).modifiedCount;
  }
  return result;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
  if (!process.env.NODE_CONFIG && process.env.MK) {
    const { decryptConfig } = await import('./decrypt.js');
    try {
      process.env.NODE_CONFIG = JSON.stringify(decryptConfig(process.env.MK, path.join(root, 'config', `${process.env.NODE_ENV || 'development'}.json.enc`)));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const { default: config } = await import('config');
  try {
    await mongoose.connect(config.get('mongodb_uri'));
    const result = await migrateEmotionSettings(mongoose.connection.db, { apply: process.argv.includes('--apply') });
    console.log(JSON.stringify({ database: mongoose.connection.db.databaseName, ...result }, null, 2));
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
