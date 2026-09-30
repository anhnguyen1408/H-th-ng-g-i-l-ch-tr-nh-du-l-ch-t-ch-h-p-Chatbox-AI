/**
 * Script migration: Xóa các trường createdBy và createdAt khỏi collection "places"
 * 
 * Chạy: node scripts/remove-createdby-createdat.js
 * 
 * LƯU Ý: Backup database trước khi chạy script này!
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Nạp .env
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-travel-planner';

async function removeFields() {
  try {
    console.log('🔌 Đang kết nối database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối database:', mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    const collection = db.collection('places');

    // Đếm số documents
    const total = await collection.countDocuments();
    console.log(`\n📊 Tổng số documents trong collection "places": ${total}`);

    if (total === 0) {
      console.log('\n✅ Collection rỗng. Không cần xóa trường.');
      await mongoose.disconnect();
      return;
    }

    // Xóa các trường createdBy và createdAt
    console.log('\n🗑️  Đang xóa các trường createdBy và createdAt...');
    
    const result = await collection.updateMany(
      {},
      {
        $unset: {
          createdBy: '',
          createdAt: ''
        }
      }
    );

    console.log(`\n✅ Đã xóa thành công:`);
    console.log(`   - Documents được cập nhật: ${result.modifiedCount}`);
    console.log(`   - Documents khớp: ${result.matchedCount}`);

    // Verify: Kiểm tra xem còn trường nào không
    const sample = await collection.findOne({});
    if (sample) {
      const hasCreatedBy = 'createdBy' in sample;
      const hasCreatedAt = 'createdAt' in sample;
      
      console.log('\n📋 Kiểm tra kết quả:');
      console.log(`   - Còn trường createdBy: ${hasCreatedBy ? 'CÓ ❌' : 'KHÔNG ✅'}`);
      console.log(`   - Còn trường createdAt: ${hasCreatedAt ? 'CÓ ❌' : 'KHÔNG ✅'}`);
      
      if (!hasCreatedBy && !hasCreatedAt) {
        console.log('\n✅ Migration hoàn tất! Tất cả các trường đã được xóa.');
      } else {
        console.log('\n⚠️  Vẫn còn một số trường. Có thể cần chạy lại script.');
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Chạy migration
removeFields();
