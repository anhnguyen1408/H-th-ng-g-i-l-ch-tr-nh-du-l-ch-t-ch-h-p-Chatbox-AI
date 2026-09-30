import Location from '../models/Location.js';

/**
 * Tìm kiếm địa điểm trong database dựa trên tên, địa chỉ và tọa độ
 * @param {Object} locationData - Dữ liệu địa điểm cần tìm
 * @param {string} locationData.name - Tên địa điểm
 * @param {string} locationData.address - Địa chỉ
 * @param {Object} locationData.coordinates - Tọa độ {lat, lng}
 * @returns {Object|null} - Location object nếu tìm thấy, null nếu không
 */
export const findExistingLocation = async (locationData) => {
  try {
    // 1. Ưu tiên tìm theo osmId + osmType (chính xác nhất)
    if (locationData.osmId && locationData.osmType) {
      const existingLocation = await Location.findOne({
        isActive: true,
        osmId: locationData.osmId,
        osmType: locationData.osmType,
      });

      if (existingLocation) {
        console.log(`✓ Found existing location by osmId: ${existingLocation.name} (${existingLocation._id})`);
        return existingLocation;
      }
    }

    // 2. Fallback: tìm theo placeId nếu có
    if (locationData.placeId) {
      const existingLocation = await Location.findOne({
        isActive: true,
        placeId: locationData.placeId,
      });

      if (existingLocation) {
        console.log(`✓ Found existing location by placeId: ${existingLocation.name} (${existingLocation._id})`);
        return existingLocation;
      }
    }

    // 3. Fallback cuối: tìm theo name + city + country (nếu không có osmId)
    if (locationData.name && locationData.city && locationData.country) {
      const existingLocation = await Location.findOne({
        isActive: true,
        name: locationData.name.trim(),
        city: locationData.city,
        country: locationData.country,
      });

      if (existingLocation) {
        console.log(`✓ Found existing location by name+city: ${existingLocation.name} (${existingLocation._id})`);
        return existingLocation;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding existing location:', error);
    return null;
  }
};

// Đã bỏ findNearbyLocation và calculateDistance (Haversine) - không cần nữa vì dùng osmId

/**
 * Tìm hoặc tạo địa điểm mới
 * Nếu địa điểm đã tồn tại (theo tên + địa chỉ hoặc tọa độ gần), trả về địa điểm đó
 * Nếu chưa tồn tại, tạo mới và trả về
 * @param {Object} locationData - Dữ liệu địa điểm
 * @param {string} userId - ID người dùng tạo (optional)
 * @param {string} destination - Điểm đến để tìm hình ảnh chính xác hơn (optional)
 * @returns {Object} - Location object
 */
export const findOrCreateLocation = async (locationData, userId = null, destination = '') => {
  try {
    // Validate dữ liệu đầu vào
    if (!locationData.name || locationData.name.trim() === '') {
      console.warn('Cannot create location without name');
      throw new Error('Location name is required');
    }

    // Bước 1: Tìm địa điểm đã tồn tại (ưu tiên theo osmId)
    let location = await findExistingLocation(locationData);

    // Bước 2: CHỈ TẠO MỚI NẾU CÓ OSMDID - không tạo địa điểm fake
    if (!location) {
      // KHÔNG CHO PHÉP tạo location không có OSM data
      if (!locationData.osmId || !locationData.osmType) {
        console.warn(`  KHÔNG TẠO LOCATION: "${locationData.name}" - Thiếu OSM data (osmId/osmType)`);
        console.warn(`   → Địa điểm này cần được thêm vào OSM hoặc admin phải thêm thủ công`);
        throw new Error(`Location "${locationData.name}" not found in OSM database. Please add to OSM first or contact admin.`);
      }
      
      console.log(` Creating new location from OSM data: ${locationData.name}`);
      
      // Đảm bảo tất cả các trường required đều có giá trị hợp lệ
      // CHỈ TẠO location có OSM data
      const newLocationData = {
        name: locationData.name.trim(),
        osmId: String(locationData.osmId),
        osmType: locationData.osmType,
        placeId: locationData.placeId || null,
        type: locationData.type || 'activity',
        city: locationData.city || 'Unknown',
        country: locationData.country || 'Vietnam',
        address: locationData.address || `${locationData.name}, ${locationData.city || 'Unknown'}, ${locationData.country || 'Vietnam'}`,
        coordinates: {
          lat: locationData.coordinates?.lat || 0,
          lng: locationData.coordinates?.lng || 0,
        },
        description: locationData.description || '',
        rating: locationData.rating || 0,
        ratingCount: 0,
        averageCost: locationData.averageCost || 0,
        priceRange: locationData.priceRange || 'mid-range',
        openingHours: locationData.openingHours || '',
        contact: locationData.contact || {},
        tags: locationData.tags || [],
        isActive: true,
        isPublic: true,
        isVerified: false,
        usageCount: 0,
        usedBy: [],
        reviews: [],
        stats: {
          totalItineraries: 0,
          totalUsers: 0,
          lastUsedAt: null,
        },
      };

      // Không tự động tìm ảnh nữa - chỉ dùng ảnh do admin upload
      newLocationData.images = [];

      // Đảm bảo coordinates có đúng format cho MongoDB geospatial
      if (newLocationData.coordinates) {
        // Location model đã có coordinates.lat và coordinates.lng
        // Không cần chuyển đổi vì schema đã định nghĩa đúng
      }

      try {
        console.log(`    Đang lưu location vào database...`);
        console.log(`    Location data:`, JSON.stringify({
          name: newLocationData.name,
          type: newLocationData.type,
          city: newLocationData.city,
          country: newLocationData.country,
          address: newLocationData.address,
          coordinates: newLocationData.coordinates,
        }, null, 2));
        
        // Đảm bảo lưu vào database trước khi tiếp tục
        location = await Location.create(newLocationData);
        
        // Verify location đã được lưu bằng cách query lại
        const savedLocation = await Location.findById(location._id);
        if (!savedLocation) {
          console.error(`    CRITICAL: Location được tạo nhưng không tìm thấy trong database!`);
          throw new Error('Location was not saved to database');
        }
        
        // Double check: Đếm số lượng locations trong database
        const totalLocations = await Location.countDocuments({});
        console.log(`   ✓ Verified: Location tồn tại trong database (Total locations in bảng tổng: ${totalLocations})`);
        
        // Tăng usage count cho location mới (lần đầu được sử dụng)
        try {
          await location.incrementUsage(userId);
        } catch (usageError) {
          console.warn(`     Failed to update usage count for new location:`, usageError.message);
        }
        
        console.log(`   ĐÃ LƯU location vào BẢNG LOCATION TỔNG (places): ${location.name}`);
        console.log(`   - Location ID: ${location._id}`);
        console.log(`   - Address: ${location.address}`);
        console.log(`   - Coordinates: (${location.coordinates.lat}, ${location.coordinates.lng})`);
        console.log(`   - City: ${location.city}, Country: ${location.country}`);
        console.log(`   - Type: ${location.type}`);
        console.log(`   - Database: ${location.constructor.db.name}`);
        console.log(`   - Collection: ${location.constructor.collection.name} (places - bảng location tổng)`);
        console.log(`   - Usage count: ${location.usageCount || 1} (lần sử dụng)`);
      } catch (createError) {
        console.error(`   LỖI KHI LƯU LOCATION "${locationData.name}" VÀO DATABASE:`);
        console.error(`   Error name: ${createError.name}`);
        console.error(`   Error message: ${createError.message}`);
        console.error(`   Full error:`, createError);
        
        // Log chi tiết location data để debug
        console.error(`   Location data đang cố lưu:`, JSON.stringify(newLocationData, null, 2));
        
        // Nếu là validation error, log chi tiết hơn
        if (createError.name === 'ValidationError') {
          console.error(`   Validation errors chi tiết:`);
          Object.keys(createError.errors || {}).forEach(key => {
            console.error(`     - ${key}: ${createError.errors[key].message}`);
          });
        }
        
        // Log stack trace để debug
        console.error(`   Stack trace:`, createError.stack);
        
        throw createError; // Re-throw để caller biết có lỗi
      }
    } else {
      // Địa điểm đã tồn tại - TÁI SỬ DỤNG VÀ CẬP NHẬT DỮ LIỆU MỚI
      console.log(`♻️  Reusing existing location: ${location.name} (${location._id})`);
      
      // Cập nhật các field nếu có dữ liệu mới hơn
      let updated = false;

      if (locationData.osmId && !location.osmId) {
        location.osmId = locationData.osmId;
        updated = true;
      }
      if (locationData.osmType && !location.osmType) {
        location.osmType = locationData.osmType;
        updated = true;
      }
      if (locationData.placeId && !location.placeId) {
        location.placeId = locationData.placeId;
        updated = true;
      }
      if (locationData.address && locationData.address !== location.address) {
        location.address = locationData.address;
        updated = true;
      }
      if (locationData.description && locationData.description !== location.description) {
        location.description = locationData.description;
        updated = true;
      }
      if (locationData.openingHours && locationData.openingHours !== location.openingHours) {
        location.openingHours = locationData.openingHours;
        updated = true;
      }
      if (locationData.contact && Object.keys(locationData.contact).length > 0) {
        location.contact = { ...location.contact, ...locationData.contact };
        updated = true;
      }
      if (Array.isArray(locationData.tags) && locationData.tags.length > 0) {
        const existingTags = location.tags || [];
        const newTags = Array.from(new Set([...existingTags, ...locationData.tags]));
        if (newTags.length > existingTags.length) {
          location.tags = newTags;
          updated = true;
        }
      }

      if (updated) {
        location.updatedAt = new Date();
        await location.save();
        console.log(`    Updated location with new data`);
      }

      // Tăng usage count
      try {
        await location.incrementUsage(userId);
        console.log(`   Usage count: ${location.usageCount} (${location.stats.totalUsers} users)`);
      } catch (usageError) {
        console.warn(`    Failed to update usage count:`, usageError.message);
      }
    }

    return location;
  } catch (error) {
    console.error('Error in findOrCreateLocation:', error);
    throw error;
  }
};

/**
 * Tìm nhiều địa điểm và tạo nếu chưa có
 * @param {Array} locationsData - Mảng dữ liệu địa điểm
 * @param {string} userId - ID người dùng tạo (optional)
 * @returns {Array} - Mảng Location objects
 */
export const findOrCreateLocations = async (locationsData, userId = null) => {
  try {
    const locations = await Promise.all(
      locationsData.map((locationData) => findOrCreateLocation(locationData, userId))
    );
    return locations;
  } catch (error) {
    console.error('Error in findOrCreateLocations:', error);
    throw error;
  }
};

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
        console.warn(` Skip "${place.name}" - thiếu osmId/osmType`);
        continue;
      }
      
      // Xác định city - ƯU TIÊN canonical city từ Nominatim (structured data)
      let city = canonicalCity || place.city || 'Unknown';
      
      // Validation: Nếu city có chứa số hoặc ký tự đặc biệt nhiều -> fallback to canonical
      if (city && city !== 'Unknown' && !canonicalCity) {
        // Reject nếu toàn số
        if (/^[0-9]+$/.test(city)) {
          city = 'Unknown';
        }
        // Reject nếu có chứa số kết hợp ký tự (VD: "18-20", "12 этажей + ресторан")
        else if (/[0-9]/.test(city) && city.split(/\s+/).length > 2) {
          city = 'Unknown';
        }
        // Reject nếu trùng với tên địa điểm (tránh city = tên quán)
        else if (city === place.name) {
          city = 'Unknown';
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
        city: city,
        country: 'Vietnam',
        rating: place.rating || 0,
        ratingCount: 0,
        averageCost: place.averageCost || 0,
        priceRange: 'mid-range',
        tags: contentTags,
        isActive: true,
        isPublic: true,
        isVerified: false,
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
    
    console.log(`   Lưu xong: ${newCount} mới, ${existingCount} đã có, tổng ${savedLocations.length} locations`);
    return savedLocations;
    
  } catch (error) {
    console.error(' Error saving OSM places to DB:', error);
    throw error;
  }
};

/**
 * Chuyển đổi activity location (embedded) thành reference đến Location trong bảng locations
 * Đảm bảo địa điểm được lưu riêng vào bảng locations và tái sử dụng nếu đã tồn tại
 * @param {Object} activity - Activity object có location embedded
 * @param {string} userId - ID người dùng (optional)
 * @param {string} destination - Điểm đến để tìm hình ảnh chính xác hơn (optional)
 * @returns {Object} - Activity với locationId tham chiếu đến Location trong database
 */
export const convertActivityToLocationReference = async (activity, userId = null, destination = '') => {
  try {
    // FLOW MỚI: Nếu activity ĐÃ có locationId (từ aiService matching) -> dùng luôn
    if (activity.locationId) {
      console.log(`   ✓ Activity "${activity.name}" đã có locationId: ${activity.locationId}`);
      
      // Verify location tồn tại
      const location = await Location.findById(activity.locationId);
      if (location) {
        // Increment usage count
        try {
          await location.incrementUsage(userId);
        } catch (usageError) {
          console.warn(`    Failed to update usage count:`, usageError.message);
        }
        
        return {
          ...activity,
          locationId: location._id,
          location: {
            address: location.address,
            coordinates: location.coordinates,
          },
          image: location.images && location.images.length > 0 ? location.images[0] : null,
        };
      }
    }

    // FALLBACK: Nếu không có locationId -> TÌM KIẾM trong DB theo name/address/coordinates
    console.log(`   Tìm kiếm location cho activity "${activity.name}" trong DB...`);
    
    // Normalize tên để match flexible
    const activityName = activity.name.toLowerCase().trim();
    
    // Tìm theo tên (exact hoặc partial)
    let location = await Location.findOne({
      isActive: true,
      $or: [
        { name: { $regex: new RegExp(`^${activity.name}$`, 'i') } }, // exact match
        { name: { $regex: new RegExp(activity.name, 'i') } }, // partial match
      ]
    });
    
    // Nếu không tìm thấy theo tên, thử tìm theo coordinates (nếu có)
    if (!location && activity.location?.coordinates?.lat && activity.location?.coordinates?.lng) {
      const DISTANCE_THRESHOLD = 100; // mét
      location = await Location.findOne({
        isActive: true,
        'coordinates.lat': {
          $gte: activity.location.coordinates.lat - 0.001,
          $lte: activity.location.coordinates.lat + 0.001,
        },
        'coordinates.lng': {
          $gte: activity.location.coordinates.lng - 0.001,
          $lte: activity.location.coordinates.lng + 0.001,
        },
      });
    }
    
    if (location) {
      console.log(`   ✓ Matched location: ${location.name} (${location._id})`);
      
      // Increment usage count
      try {
        await location.incrementUsage(userId);
      } catch (usageError) {
        console.warn(`    Failed to update usage count:`, usageError.message);
      }
      
      return {
        ...activity,
        locationId: location._id,
        osmId: location.osmId,
        osmType: location.osmType,
        location: {
          address: location.address,
          coordinates: location.coordinates,
        },
        image: location.images && location.images.length > 0 ? location.images[0] : null,
      };
    }
    
    // KHÔNG TÌM THẤY location phù hợp -> REJECT activity này
    console.warn(`    Activity "${activity.name}" không có locationId - skip`);
    return null; // Return null để filter sau này
    
  } catch (error) {
    console.error(` Error processing activity "${activity.name}":`, error.message);
    // Trả về activity gốc nếu có lỗi
    return activity;
  }
};

/**
 * Trích xuất tên thành phố từ địa chỉ (đơn giản)
 * @param {string} address - Địa chỉ
 * @returns {string} - Tên thành phố hoặc chuỗi rỗng
 */
const extractCityFromAddress = (address) => {
  if (!address) return '';
  
  // Các thành phố phổ biến ở Việt Nam
  const cities = ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế', 'Nha Trang', 'Đà Lạt', 'Vũng Tàu', 'Phú Quốc'];
  
  for (const city of cities) {
    if (address.includes(city)) {
      return city;
    }
  }
  
  return '';
};

/**
 * Trích xuất tên quốc gia từ địa chỉ (đơn giản)
 * @param {string} address - Địa chỉ
 * @returns {string} - Tên quốc gia, mặc định là 'Vietnam'
 */
const extractCountryFromAddress = (address) => {
  if (!address) return 'Vietnam';
  
  // Có thể mở rộng để nhận diện nhiều quốc gia hơn
  if (address.includes('Vietnam') || address.includes('Việt Nam')) {
    return 'Vietnam';
  }
  
  return 'Vietnam'; // Mặc định
};
