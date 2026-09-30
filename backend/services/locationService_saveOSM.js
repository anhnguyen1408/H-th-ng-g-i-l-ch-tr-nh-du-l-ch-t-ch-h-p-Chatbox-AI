import Location from '../models/Location.js';

/**
 * Lưu danh sách địa điểm từ OSM vào database
 * Upsert: update OSM fields, giữ nguyên admin/user curated fields
 * @param {Array} osmPlaces - Danh sách địa điểm từ OSM
 * @param {string} userId - ID người dùng (optional)
 * @param {string} canonicalCity - City chuẩn hành chính từ Nominatim (optional)
 * @returns {Array} - Danh sách locations đã lưu
 */
export const saveOSMPlacesToDB = async (osmPlaces, userId = null, canonicalCity = null) => {
  try {
    console.log(`\n Lưu ${osmPlaces.length} địa điểm từ OSM vào DB...`);
    
    const savedLocations = [];
    let newCount = 0;
    let existingCount = 0;
    
    for (const place of osmPlaces) {
      // Validate OSM data
      if (!place.osmId || !place.osmType) {
        console.warn(`     Skip "${place.name}" - thiếu osmId/osmType`);
        continue;
      }
      
      // Xác định city - ƯU TIÊN canonical city từ Nominatim
      let city = canonicalCity || place.city || 'Unknown';
      
      // Validation: Nếu city có chứa số hoặc ký tự đặc biệt nhiều -> reject
      if (city && city !== 'Unknown') {
        // Reject nếu toàn số
        if (/^[0-9]+$/.test(city)) {
          city = canonicalCity || 'Unknown'; // fallback to canonical
        }
        // Reject nếu có chứa số kết hợp ký tự (VD: "18-20", "12 этажей + ресторан")
        else if (/[0-9]/.test(city) && city.split(/\s+/).length > 2) {
          city = canonicalCity || 'Unknown';
        }
        // Reject nếu trùng với tên địa điểm (tránh city = tên quán)
        else if (city === place.name) {
          city = canonicalCity || 'Unknown';
        }
      }
      
      // UPSERT: update OSM fields, giữ nguyên admin/user fields
      const filter = { osmId: place.osmId, osmType: place.osmType };

      const contentTags = Array.isArray(place.contentTags)
        ? place.contentTags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
        : [];
      
      const osmUpdate = {
        name: place.name,
        address: place.address || place.name,
        coordinates: {
          lat: place.coordinates.lat,
          lng: place.coordinates.lng,
        },
        description: place.description || '',
        openingHours: place.openingHours || '',
        'contact.website': place.website || '',
        placeId: place.placeId || place.xid || null,
        updatedAt: new Date(),
      };
      
      // Policy A (chuẩn hành chính): chỉ update city khi document đã tồn tại và city đang Unknown
      const existingLoc = await Location.findOne(filter);
      if (existingLoc && existingLoc.city === 'Unknown' && city !== 'Unknown') {
        osmUpdate.city = city;
      }

      // Policy tags (B1): chỉ update tags nếu document đã tồn tại nhưng tags đang rỗng
      if (existingLoc && Array.isArray(existingLoc.tags) && existingLoc.tags.length === 0 && contentTags.length > 0) {
        osmUpdate.tags = contentTags;
      }
      
      const onInsert = {
        osmId: place.osmId,
        osmType: place.osmType,
        type: place.type || 'activity',
        city: city, // City canonical khi insert
        country: 'Vietnam',
        rating: place.rating || 0,
        ratingCount: 0,
        averageCost: place.averageCost || 0,
        priceRange: 'mid-range',
        tags: contentTags,
        isActive: true,
        isPublic: true,
        isVerified: true, // OSM -> verified
        usageCount: 0,
        usedBy: [],
        reviews: [],
        communityImages: [], // Ảnh đóng góp từ user
        stats: {
          totalItineraries: 0,
          totalUsers: 0,
          lastUsedAt: null,
        },
        images: place.imageUrl ? [place.imageUrl] : [],
      };
      
      const location = await Location.findOneAndUpdate(
        filter,
        {
          $set: osmUpdate,
          $setOnInsert: onInsert,
        },
        { upsert: true, new: true }
      );
      
      if (existingLoc) {
        existingCount++;
      } else {
        newCount++;
      }
      
      savedLocations.push(location);
    }
    
    console.log(`    Lưu xong: ${newCount} mới, ${existingCount} đã có, tổng ${savedLocations.length} locations`);
    return savedLocations;
    
  } catch (error) {
    console.error(' Error saving OSM places to DB:', error);
    throw error;
  }
};
