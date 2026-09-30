import axios from 'axios';
import { getPlaceImages } from './openTripMapService.js';

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

/**
 * Query Overpass API để lấy địa điểm từ OpenStreetMap
 * Lấy địa điểm OSM theo tên khu vực (city/province)
 * @param {string} areaName - Tên thành phố/tỉnh
 * @param {number} lat - Vĩ độ (dự phòng nếu không tìm được area)
 * @param {number} lng - Kinh độ (dự phòng nếu không tìm được area)
 * @param {Array} interests - Sở thích
 * @param {number} limit - Số lượng tối đa
 * @returns {Promise<Array>} - Danh sách địa điểm
 */
export const getOSMPlaces = async (areaName, lat, lng, interests = [], limit = 50) => {
  try {
    console.log(`  Querying OSM Overpass API for area: "${areaName}"...`);
    console.log(`   Fallback center: (${lat}, ${lng})`);

    // LUÔN bao gồm các tag cơ bản: attractions + restaurants + hotels
    const baseAttractionTags = [
      // Attractions
      'tourism=attraction',
      'tourism=museum',
      'tourism=viewpoint',
      'tourism=gallery',
      'tourism=artwork',
      'tourism=theme_park',
      'historic=monument',
      'historic=memorial',
      'historic=castle',
      'historic=archaeological_site',
      'leisure=park',
      'leisure=garden',
      'natural=beach',
      'natural=cave',
      'building=temple',
      'amenity=place_of_worship',
      
      // Restaurants & Dining (LUÔN query)
      'amenity=restaurant',
      'amenity=cafe',
      'amenity=fast_food',
      
      // Hotels (LUÔN query nhưng sẽ giới hạn số lượng sau)
      'tourism=hotel',
      'tourism=guest_house',
    ];

    // Map interests sang OSM tags bổ sung
    const interestTagsMap = {
      'culture': ['tourism=museum', 'tourism=gallery', 'historic=*', 'tourism=artwork'],
      'dining': ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food'],
      'resort': ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'],
      'check-in': ['tourism=attraction', 'tourism=viewpoint', 'leisure=park'],
      'adventure': ['leisure=sports_centre', 'sport=*', 'tourism=theme_park', 'leisure=water_park'],
      'shopping': ['shop=mall', 'shop=department_store', 'amenity=marketplace'],
      'nightlife': ['amenity=bar', 'amenity=pub', 'amenity=nightclub'],
    };

    // Xây dựng query tags: BẮT ĐẦU với base attractions
    let queryTags = [...baseAttractionTags];
    
    // Thêm tags dựa trên interests
    if (interests.length > 0) {
      interests.forEach(interest => {
        if (interestTagsMap[interest]) {
          queryTags.push(...interestTagsMap[interest]);
        }
      });
    }

    // Loại bỏ trùng lặp
    queryTags = [...new Set(queryTags)];

    // Chuẩn bị các biến thể tên để tìm area
    const areaNameVariants = [
      areaName,
      areaName.replace('Thành phố ', ''),
      areaName.replace('Tỉnh ', ''),
      areaName.replace('TP. ', ''),
    ];

    // Tạo Overpass query với area
    // Thử tìm area theo tên, nếu không có thì fallback về around:30km
    const queries = queryTags.map(tag => {
      const [key, value] = tag.split('=');
      const filter = value === '*' ? `["${key}"]` : `["${key}"="${value}"]`;
      return `
        node${filter}(area.searchArea);
        way${filter}(area.searchArea);
        relation${filter}(area.searchArea);
      `;
    });

    const overpassQuery = `
      [out:json][timeout:30];
      (
        ${areaNameVariants.map(name => `area["name"="${name}"]["admin_level"~"^(4|5|6|7|8)$"]->.searchArea;`).join('\n        ')}
      );
      (
        ${queries.join('')}
      );
      out body center 1000;
    `;

    console.log('   Trying area names:', areaNameVariants.join(', '));

    // Gọi Overpass API
    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      overpassQuery,
      {
        headers: {
          'Content-Type': 'text/plain',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.elements) {
      console.warn('   No data from Overpass API');
      return [];
    }

    const elements = response.data.elements;
    console.log(`   ✓ Received ${elements.length} raw elements from OSM`);

    // Parse và format data
    const places = elements
      .filter(el => el.tags && el.tags.name) // Chỉ lấy những địa điểm có tên
      .map(el => {
        const tags = el.tags || {};
        
        // Xác định tọa độ (node có lat/lon, way có center)
        const coordinates = el.lat && el.lon
          ? { lat: el.lat, lng: el.lon }
          : el.center
          ? { lat: el.center.lat, lng: el.center.lon }
          : null;

        if (!coordinates) return null;

        // Xác định type - ƯU TIÊN attraction trước
        let type = 'activity';
        
        // Kiểm tra ATTRACTION trước (để ưu tiên)
        if (
          tags.tourism === 'attraction' ||
          tags.tourism === 'museum' ||
          tags.tourism === 'viewpoint' ||
          tags.tourism === 'gallery' ||
          tags.tourism === 'artwork' ||
          tags.tourism === 'theme_park' ||
          tags.tourism === 'resort' ||          //  Bà Nà Hills, khu resort
          tags.historic === 'monument' ||
          tags.historic === 'memorial' ||
          tags.historic === 'castle' ||
          tags.historic === 'archaeological_site' ||
          tags.historic === 'ruins' ||
          tags.historic === 'building' ||
          tags.historic === 'wayside_shrine' ||
          tags.leisure === 'park' ||
          tags.leisure === 'garden' ||
          tags.leisure === 'water_park' ||
          tags.natural === 'beach' ||
          tags.natural === 'cave' ||
          tags.natural === 'hot_spring' ||      //  Núi Thần Tài (suối nước nóng)
          tags.building === 'temple' ||
          tags.amenity === 'place_of_worship' ||
          (tags.historic && tags.historic !== 'yes') // bất kỳ historic tag cụ thể
        ) {
          type = 'attraction';
        }
        // HOTEL
        else if (tags.tourism === 'hotel' || tags.tourism === 'guest_house' || tags.tourism === 'hostel') {
          type = 'hotel';
        }
        // RESTAURANT (chỉ khi không phải attraction)
        else if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food' || tags.amenity === 'bar' || tags.amenity === 'pub') {
          type = 'restaurant';
        }

        // Tạo description từ tags
        const descParts = [];
        if (tags.tourism) descParts.push(`Tourism: ${tags.tourism}`);
        if (tags.amenity) descParts.push(`Amenity: ${tags.amenity}`);
        if (tags.historic) descParts.push(`Historic: ${tags.historic}`);
        if (tags.cuisine) descParts.push(`Cuisine: ${tags.cuisine}`);
        if (tags.description) descParts.push(tags.description);

        // Address
        const addressParts = [];
        if (tags['addr:street']) addressParts.push(tags['addr:street']);
        if (tags['addr:housenumber']) addressParts.push(tags['addr:housenumber']);
        if (tags['addr:district']) addressParts.push(tags['addr:district']);
        if (tags['addr:city']) addressParts.push(tags['addr:city']);
        const address = addressParts.length > 0 ? addressParts.join(', ') : tags.name;

        // City từ OSM tags (ưu tiên addr:city > addr:town > addr:village > addr:municipality)
        const cityTag =
          tags['addr:city'] ||
          tags['addr:town'] ||
          tags['addr:village'] ||
          tags['addr:municipality'] ||
          null;

        return {
          xid: `osm_${el.type}_${el.id}`,
          name: tags.name,
          osmId: String(el.id),        //  GẮN OSM ID
          osmType: el.type,            //  GẮN OSM TYPE (node/way/relation)
          placeId: `osm_${el.type}_${el.id}`, // OSM place identifier
          type,
          description: descParts.join(' • '),
          address,
          city: cityTag,               // City từ OSM tags
          coordinates,
          rating: parseFloat(tags.stars || tags.rating || '0') || 4, // Default 4/5
          image: tags.image || tags.wikimedia_commons || null,
          website: tags.website || tags.url || null,
          openingHours: tags.opening_hours || '',
          averageCost: 0,
          kinds: Object.keys(tags).filter(k => !k.startsWith('addr:')).join(','),
          contentTags: osmTagsToContentTags(tags),
          tags, // Giữ lại tags gốc
        };
      })
      .filter(place => place !== null);

    // Loại bỏ trùng lặp theo tên và tọa độ gần nhau
    const uniquePlaces = [];
    const seen = new Set();

    places.forEach(place => {
      const key = `${place.name}_${Math.round(place.coordinates.lat * 1000)}_${Math.round(place.coordinates.lng * 1000)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePlaces.push(place);
      }
    });

    console.log(`   ✓ Parsed ${uniquePlaces.length} unique places`);

    // Phân loại theo type
    const attractions = uniquePlaces.filter(p => p.type === 'attraction');
    const restaurants = uniquePlaces.filter(p => p.type === 'restaurant');
    const hotels = uniquePlaces.filter(p => p.type === 'hotel');
    const activities = uniquePlaces.filter(p => p.type === 'activity');

    console.log(`   Distribution: ${attractions.length} attractions, ${restaurants.length} restaurants, ${hotels.length} hotels, ${activities.length} activities`);

    // Sort để ưu tiên địa điểm phổ biến (có rating cao, có website, có description)
    const sortByPopularity = (places) => {
      return places.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        
        // Có rating -> +rating
        if (a.rating) scoreA += a.rating;
        if (b.rating) scoreB += b.rating;
        
        // Có website -> +2
        if (a.website) scoreA += 2;
        if (b.website) scoreB += 2;
        
        // Có description -> +1
        if (a.description && a.description.length > 20) scoreA += 1;
        if (b.description && b.description.length > 20) scoreB += 1;
        
        // Có opening hours -> +1
        if (a.openingHours) scoreA += 1;
        if (b.openingHours) scoreB += 1;
        
        return scoreB - scoreA;
      });
    };

    // Sort mỗi nhóm theo popularity
    const sortedAttractions = sortByPopularity([...attractions]);
    const sortedRestaurants = sortByPopularity([...restaurants]);
    const sortedHotels = sortByPopularity([...hotels]);
    const sortedActivities = sortByPopularity([...activities]);

    // Tính quota linh hoạt dựa trên limit
    // Ưu tiên attraction & restaurants, giảm hotels
    const attractionQuota = Math.floor(limit * 0.65); // 65% attractions
    const restaurantQuota = Math.floor(limit * 0.25); // 25% restaurants
    const hotelQuota = Math.max(5, Math.floor(limit * 0.05)); // 5% hotels (tối thiểu 5, tối đa 10)
    const activityQuota = limit - attractionQuota - restaurantQuota - hotelQuota; // còn lại

    const selectedPlaces = [
      ...sortedAttractions.slice(0, attractionQuota),
      ...sortedRestaurants.slice(0, restaurantQuota),
      ...sortedHotels.slice(0, hotelQuota),
      ...sortedActivities.slice(0, activityQuota),
    ];

    const finalPlaces = selectedPlaces.slice(0, limit);
    
    return finalPlaces;
  } catch (error) {
    console.error('Error querying OSM:', error.message);
    return [];
  }
};

/**
 * Lấy địa điểm OSM theo destination và interests
 * @param {string} destination - Tên điểm đến
 * @param {Array} interests - Sở thích
 * @param {number} limit - Số lượng
 * @param {Object} coordinates - Tọa độ {lat, lng} (dự phòng nếu không tìm được area)
 * @returns {Promise<Array>} - Danh sách địa điểm
 */
export const getPlacesByInterests = async (destination, interests = [], limit = 50, coordinates = null) => {
  if (!coordinates) {
    console.warn('No coordinates provided for OSM query');
    return [];
  }

  const { lat, lng } = coordinates;
  
  // Gọi hàm getOSMPlaces với tên area (destination)
  return await getOSMPlaces(destination, lat, lng, interests, limit);
};

export default {
  getOSMPlaces,
  getPlacesByInterests,
};
