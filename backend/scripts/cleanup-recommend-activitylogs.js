import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join } from 'path';
import ActivityLog from '../models/ActivityLog.js';

dotenv.config({ path: join(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-travel-planner';
const shouldDelete = process.argv.includes('--yes');

const filter = {
  action: {
    $regex: '^recommend_',
  },
};

try {
  await mongoose.connect(uri);

  const count = await ActivityLog.countDocuments(filter);
  console.log(`[cleanup] MONGODB_URI: ${uri}`);
  console.log(`[cleanup] Filter: action /^recommend_/`);
  console.log(`[cleanup] Matching docs: ${count}`);

  if (!shouldDelete) {
    console.log('[cleanup] Dry-run only. Re-run with --yes to delete.');
    process.exit(0);
  }

  const result = await ActivityLog.deleteMany(filter);
  console.log(`[cleanup] Deleted: ${result.deletedCount}`);
} catch (err) {
  console.error('[cleanup] Failed:', err);
  process.exitCode = 1;
} finally {
  try {
    await mongoose.disconnect();
  } catch (e) {
    // ignore
  }
}
