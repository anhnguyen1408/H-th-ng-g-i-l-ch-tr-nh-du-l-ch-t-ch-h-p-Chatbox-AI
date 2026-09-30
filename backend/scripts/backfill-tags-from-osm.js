import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Location from '../models/Location.js';

dotenv.config();

const normalizeTag = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

const osmTagsToContentTags = (osmTags = {}) => {
  const out = new Set();
  const amenity = normalizeTag(osmTags.amenity);
  const tourism = normalizeTag(osmTags.tourism);
  const historic = normalizeTag(osmTags.historic);
  const leisure = normalizeTag(osmTags.leisure);
  const natural = normalizeTag(osmTags.natural);
  const shop = normalizeTag(osmTags.shop);
  const sport = normalizeTag(osmTags.sport);
  const building = normalizeTag(osmTags.building);
  const religion = normalizeTag(osmTags.religion);

  if (amenity && ['restaurant', 'cafe', 'fast_food', 'food_court'].includes(amenity)) out.add('dining');
  if (amenity && ['bar', 'pub', 'nightclub'].includes(amenity)) out.add('nightlife');
  if (tourism && ['hotel', 'guest_house', 'hostel', 'resort'].includes(tourism)) out.add('resort');
  if (shop || amenity === 'marketplace') out.add('shopping');
  if (
    (tourism && ['museum', 'gallery', 'artwork', 'attraction', 'theme_park'].includes(tourism)) ||
    (historic && historic !== 'yes') ||
    religion ||
    building === 'temple' ||
    amenity === 'place_of_worship'
  ) {
    out.add('culture');
  }
  if (
    (tourism && ['viewpoint', 'attraction', 'artwork', 'gallery', 'theme_park'].includes(tourism)) ||
    (leisure && ['park', 'garden', 'water_park'].includes(leisure))
  ) {
    out.add('check-in');
  }
  if (
    sport ||
    (leisure && ['sports_centre', 'water_park'].includes(leisure)) ||
    tourism === 'theme_park' ||
    (natural && ['beach', 'cave', 'hot_spring'].includes(natural))
  ) {
    out.add('adventure');
  }

  const addRaw = (k, v) => {
    const vv = normalizeTag(v);
    if (!k || !vv) return;
    out.add(`${k}:${vv.replace(/\s+/g, '_')}`);
  };

  addRaw('amenity', osmTags.amenity);
  addRaw('tourism', osmTags.tourism);
  addRaw('historic', osmTags.historic);
  addRaw('leisure', osmTags.leisure);
  addRaw('natural', osmTags.natural);
  addRaw('shop', osmTags.shop);
  addRaw('sport', osmTags.sport);

  const cuisine = normalizeTag(osmTags.cuisine);
  if (cuisine) {
    cuisine
      .split(/[;,]/)
      .map((x) => normalizeTag(x))
      .filter(Boolean)
      .forEach((c) => addRaw('cuisine', c));
  }

  return Array.from(out);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchOsmElementTags = async ({ osmType, osmId }) => {
  const t = normalizeTag(osmType);
  const id = String(osmId || '').trim();
  if (!t || !id) return null;
  if (!['node', 'way', 'relation'].includes(t)) return null;

  const query = `[out:json][timeout:25];\n${t}(${id});\nout body;`;
  const resp = await axios.post('https://overpass-api.de/api/interpreter', query, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 30000,
  });

  const el = resp?.data?.elements?.[0];
  const tags = el?.tags && typeof el.tags === 'object' ? el.tags : null;
  return tags;
};

const main = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-travel-planner';
  console.log(`[backfill-tags] Connecting MongoDB: ${mongoUri}`);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });
  console.log('[backfill-tags] MongoDB connected');

  const batchSize = Math.min(Math.max(parseInt(process.env.BACKFILL_BATCH_SIZE || '200', 10), 1), 2000);
  const delayMs = Math.min(Math.max(parseInt(process.env.BACKFILL_DELAY_MS || '350', 10), 0), 5000);

  const eligibilityQuery = {
    osmId: { $exists: true, $ne: null },
    osmType: { $in: ['node', 'way', 'relation'] },
    $or: [{ tags: { $exists: false } }, { tags: { $size: 0 } }],
  };

  const eligible = await Location.countDocuments(eligibilityQuery);
  console.log(`[backfill-tags] Eligible docs: ${eligible} (will process up to ${batchSize})`);

  const cursor = Location.find(eligibilityQuery)
    .select('_id osmId osmType name city type tags')
    .limit(batchSize)
    .cursor();

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for await (const loc of cursor) {
    processed += 1;
    if (processed === 1 || processed % 25 === 0) {
      console.log(`[backfill-tags] Progress: processed=${processed}, updated=${updated}, skipped=${skipped}, failed=${failed}`);
    }
    try {
      const tags = await fetchOsmElementTags({ osmType: loc.osmType, osmId: loc.osmId });
      if (!tags) {
        skipped += 1;
        continue;
      }

      const contentTags = osmTagsToContentTags(tags);
      if (!contentTags.length) {
        skipped += 1;
        continue;
      }

      await Location.updateOne(
        { _id: loc._id, $or: [{ tags: { $exists: false } }, { tags: { $size: 0 } }] },
        { $set: { tags: contentTags } }
      );

      updated += 1;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (e) {
      failed += 1;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        processed,
        updated,
        skipped,
        failed,
        batchSize,
        delayMs,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
