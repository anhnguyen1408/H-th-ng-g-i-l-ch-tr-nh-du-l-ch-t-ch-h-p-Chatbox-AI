/**
 * Script migration: Đổi tên collection từ "locations" sang "places"
 * 
 * Chạy: node scripts/migrate-locations-to-places.js
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

async function migrate() {
  try {
    console.log('🔌 Đang kết nối database...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối database:', mongoose.connection.db.databaseName);

    const db = mongoose.connection.db;
    const dbName = db.databaseName;

    // Kiểm tra collection "locations" có tồn tại không
    const collections = await db.listCollections().toArray();
    const hasLocations = collections.some(c => c.name === 'locations');
    const hasPlaces = collections.some(c => c.name === 'places');

    console.log('\n📊 Trạng thái collections:');
    console.log(`   - Collection "locations": ${hasLocations ? 'CÓ' : 'KHÔNG'}`);
    console.log(`   - Collection "places": ${hasPlaces ? 'CÓ' : 'KHÔNG'}`);

    if (!hasLocations && !hasPlaces) {
      console.log('\n✅ Không có collection nào. Hệ thống sẽ tạo collection "places" khi có dữ liệu mới.');
      await mongoose.disconnect();
      return;
    }

    if (hasPlaces && !hasLocations) {
      console.log('\n✅ Collection "places" đã tồn tại. Không cần migration.');
      await mongoose.disconnect();
      return;
    }

    if (hasLocations && hasPlaces) {
      console.log('\n⚠️  Cả 2 collections đều tồn tại. Đang kiểm tra...');
      const locationsCount = await db.collection('locations').countDocuments();
      const placesCount = await db.collection('places').countDocuments();
      
      console.log(`   - locations: ${locationsCount} documents`);
      console.log(`   - places: ${placesCount} documents`);
      
      if (locationsCount > 0 && placesCount === 0) {
        console.log('\n📦 Đang copy dữ liệu từ "locations" sang "places"...');
        const locations = await db.collection('locations').find().toArray();
        if (locations.length > 0) {
          await db.collection('places').insertMany(locations);
          console.log(`✅ Đã copy ${locations.length} documents sang "places"`);
        }
      }
      
      console.log('\n💡 Bạn có thể xóa collection "locations" cũ nếu muốn:');
      console.log('   db.locations.drop()');
    }

    if (hasLocations && !hasPlaces) {
      console.log('\n🔄 Đang đổi tên collection "locations" → "places"...');
      
      const locationsCount = await db.collection('locations').countDocuments();
      console.log(`   - Số documents trong "locations": ${locationsCount}`);
      
      if (locationsCount > 0) {
        // Đổi tên collection
        await db.collection('locations').rename('places');
        console.log('✅ Đã đổi tên collection thành công!');
      } else {
        // Collection rỗng, chỉ cần drop và tạo mới
        await db.collection('locations').drop();
        console.log('✅ Đã xóa collection "locations" rỗng');
      }
    }

    // Verify
    const finalCollections = await db.listCollections().toArray();
    const finalHasPlaces = finalCollections.some(c => c.name === 'places');
    const placesCount = finalHasPlaces ? await db.collection('places').countDocuments() : 0;

    console.log('\n📊 Kết quả:');
    console.log(`   - Collection "places": ${finalHasPlaces ? 'CÓ' : 'KHÔNG'}`);
    console.log(`   - Số documents: ${placesCount}`);

    console.log('\n✅ Migration hoàn tất!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi migration:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Chạy migration
migrate();

