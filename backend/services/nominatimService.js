import axios from 'axios';

/**
 * Tìm kiếm địa điểm bằng Nominatim (OpenStreetMap)
 * @param {string} query - Từ khóa tìm kiếm
 * @param {number} limit - Số lượng kết quả tối đa
 * @returns {Promise<Array>} - Mảng các địa điểm tìm được
 */
export const searchPlaces = async (query, limit = 10) => {
  try {
    if (!query || query.trim() === '') {
      return [];
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        addressdetails: 1,
        limit,
        countrycodes: 'vn', // Ưu tiên Việt Nam
        'accept-language': 'vi',
      },
      headers: {
        'User-Agent': 'AI-Travel-Planner',
        'Accept-Language': 'vi',
      },
      timeout: 5000,
    });

    if (response.data && Array.isArray(response.data)) {
      return response.data.map(place => {
        // Extract canonical city name (chuẩn hành chính, bỏ tiền tố)
        const rawCity = place.address?.city || place.address?.town || place.address?.village || place.name || '';
        const canonicalCity = rawCity
          .trim()
          .replace(/^(thành phố|tp\.?\s*|tỉnh)\s+/i, '') // Bỏ tiền tố Thành phố/TP./Tỉnh
          .replace(/\s+/g, ' '); // Normalize spacing
        
        // Extract place name (ưu tiên name ngắn, fallback to first part of display_name)
        const placeName = place.name || place.display_name.split(',')[0].trim();
        
        return {
          displayName: place.display_name,
          name: placeName,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
          type: place.type,
          city: canonicalCity, //  Canonical city chuẩn hành chính
          country: place.address?.country || 'Vietnam',
          address: place.display_name,
          osmId: place.osm_id ? String(place.osm_id) : null,
          osmType: place.osm_type || null,
          placeId: place.place_id ? String(place.place_id) : null,
          //  Thêm boundingbox để tính radius động
          boundingbox: place.boundingbox ? place.boundingbox.map(parseFloat) : null,
          // boundingbox format: [south, north, west, east]
          //  Thêm raw address object để frontend có thể extract chi tiết nếu cần
          rawAddress: place.address || {},
        };
      });
    }

    return [];
  } catch (error) {
    console.error(`Error searching places with Nominatim for query "${query}":`, error.message);
    return [];
  }
};

/**
 * Reverse geocoding - lấy thông tin địa điểm từ tọa độ
 * @param {number} lat - Vĩ độ
 * @param {number} lng - Kinh độ
 * @returns {Promise<Object|null>} - Thông tin địa điểm hoặc null
 */
export const reverseGeocode = async (lat, lng) => {
  try {
    if (!lat || !lng || lat === 0 || lng === 0) {
      return null;
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat,
        lon: lng,
        format: 'json',
        addressdetails: 1,
        'accept-language': 'vi',
      },
      headers: {
        'User-Agent': 'AI-Travel-Planner/1.0',
        'Accept-Language': 'vi',
      },
      timeout: 3000,
    });

    if (response.data && response.data.address) {
      const addr = response.data.address;
      return {
        displayName: response.data.display_name,
        name: response.data.name || addr.tourism || addr.amenity || addr.building || addr.road || '',
        city: addr.city || addr.town || addr.village || '',
        country: addr.country || 'Vietnam',
        address: response.data.display_name,
        osmId: response.data.osm_id ? String(response.data.osm_id) : null,
        osmType: response.data.osm_type || null,
        placeId: response.data.place_id ? String(response.data.place_id) : null,
      };
    }

    return null;
  } catch (error) {
    console.warn(`Reverse geocoding failed for (${lat}, ${lng}):`, error.message);
    return null;
  }
};

/**
 * Tính bán kính tìm kiếm phù hợp dựa trên boundingbox của city
 * @param {Array} boundingbox - [south, north, west, east]
 * @param {number} lat - Vĩ độ trung tâm
 * @param {number} lng - Kinh độ trung tâm
 * @returns {number} - Bán kính tính bằng mét
 */
export const calculateSearchRadius = (boundingbox, lat, lng) => {
  // Nếu không có boundingbox, dùng mặc định 25km
  if (!boundingbox || boundingbox.length !== 4) {
    return 25000;
  }

  const [south, north, west, east] = boundingbox;

  // Hàm tính khoảng cách giữa 2 điểm (Haversine formula)
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Bán kính Trái Đất (mét)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Khoảng cách tính bằng mét
  };

  // Tính khoảng cách từ tâm đến 4 góc của bbox
  const distToNorth = haversineDistance(lat, lng, north, lng);
  const distToSouth = haversineDistance(lat, lng, south, lng);
  const distToEast = haversineDistance(lat, lng, lat, east);
  const distToWest = haversineDistance(lat, lng, lat, west);

  // Lấy khoảng cách lớn nhất
  const maxDistance = Math.max(distToNorth, distToSouth, distToEast, distToWest);

  // Nhân với factor 1.5 để ôm cả khu vực ngoại ô (Bà Nà, Núi Thần Tài...)
  const radius = Math.round(maxDistance * 1.5);

  // Giới hạn trong khoảng [10km, 80km]
  const MIN_RADIUS = 10000;
  const MAX_RADIUS = 80000;
  const clampedRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius));

  console.log(` Calculated search radius for city:`);
  console.log(`   - Boundingbox: [${south.toFixed(3)}, ${north.toFixed(3)}, ${west.toFixed(3)}, ${east.toFixed(3)}]`);
  console.log(`   - Max distance to bbox edge: ${(maxDistance / 1000).toFixed(1)}km`);
  console.log(`   - Calculated radius (with 1.5x factor): ${(radius / 1000).toFixed(1)}km`);
  console.log(`   - Final radius (clamped): ${(clampedRadius / 1000).toFixed(1)}km`);

  return clampedRadius;
};

export default {
  searchPlaces,
  reverseGeocode,
  calculateSearchRadius,
};
