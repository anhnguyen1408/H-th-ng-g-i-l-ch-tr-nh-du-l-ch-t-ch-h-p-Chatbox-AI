import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENTRIPMAP_API_KEY = process.env.OPENTRIPMAP_API_KEY;
const OPENTRIPMAP_ENABLED = process.env.OPENTRIPMAP_ENABLED === 'true';

/**
 * Lấy ảnh từ OpenTripMap cho một địa điểm
 * @param {string} name - Tên địa điểm
 * @param {number} lat - Vĩ độ
 * @param {number} lng - Kinh độ
 * @returns {Promise<string|null>} - URL ảnh hoặc null
 */
export const getPlaceImage = async (name, lat, lng) => {
  // Check nếu service không enabled hoặc không có API key
  if (!OPENTRIPMAP_ENABLED || !OPENTRIPMAP_API_KEY) {
    return null;
  }
  
  try {
    // 1. Tìm địa điểm gần nhất trên OpenTripMap
    const radiusUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=500&lon=${lng}&lat=${lat}&rate=2&format=json&apikey=${OPENTRIPMAP_API_KEY}`;
    
    const radiusResponse = await axios.get(radiusUrl, { timeout: 5000 });
    
    if (!radiusResponse.data || radiusResponse.data.length === 0) {
      return null;
    }

    // Tìm địa điểm match với tên (hoặc lấy địa điểm đầu tiên nếu không match)
    let matchedPlace = radiusResponse.data.find(p => 
      p.name && name && p.name.toLowerCase().includes(name.toLowerCase().substring(0, 10))
    );
    
    if (!matchedPlace) {
      matchedPlace = radiusResponse.data[0];
    }

    // 2. Lấy chi tiết địa điểm để có ảnh
    const detailUrl = `https://api.opentripmap.com/0.1/en/places/xid/${matchedPlace.xid}?apikey=${OPENTRIPMAP_API_KEY}`;
    
    const detailResponse = await axios.get(detailUrl, { timeout: 5000 });
    
    if (detailResponse.data && detailResponse.data.preview) {
      return detailResponse.data.preview.source;
    }
    
    if (detailResponse.data && detailResponse.data.image) {
      return detailResponse.data.image;
    }

    return null;
  } catch (error) {
    // Không log error quá nhiều vì sẽ có nhiều địa điểm không có ảnh
    return null;
  }
};

/**
 * Lấy ảnh cho nhiều địa điểm (batch)
 * Giới hạn số lượng request đồng thời để tránh rate limit
 */
export const getPlaceImages = async (places, maxConcurrent = 3) => {
  // Check nếu service không enabled
  if (!OPENTRIPMAP_ENABLED || !OPENTRIPMAP_API_KEY) {
    console.log('   OpenTripMap service disabled or no API key - skipping image fetch');
    return places.map(place => ({ ...place, imageUrl: null }));
  }
  
  const results = [];
  
  for (let i = 0; i < places.length; i += maxConcurrent) {
    const batch = places.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(place => 
      getPlaceImage(place.name, place.coordinates.lat, place.coordinates.lng)
        .then(imageUrl => {
          if (imageUrl) {
            console.log(`      Found image for: ${place.name}`);
          }
          return { ...place, imageUrl };
        })
        .catch(() => ({ ...place, imageUrl: null }))
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
};
