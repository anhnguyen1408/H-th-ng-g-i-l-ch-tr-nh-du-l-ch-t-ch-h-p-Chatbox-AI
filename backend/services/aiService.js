import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPlacesByInterests } from './osmPlacesService.js';
import { saveOSMPlacesToDB } from './locationService.js';
import Location from '../models/Location.js';

// Lấy thư mục hiện tại cho ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Nạp file .env để đảm bảo các biến môi trường sẵn sàng
dotenv.config({ path: join(__dirname, '..', '.env') });

// Kiểm tra xem API key đã được cấu hình chưa
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(' Warning: GEMINI_API_KEY is not set. AI features will not work.');
  console.warn('   Make sure .env file exists in backend directory with GEMINI_API_KEY');
} else {
  console.log('GEMINI_API_KEY loaded in aiService:', GEMINI_API_KEY.substring(0, 20) + '...');
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Helper function để retry với exponential backoff cho lỗi 503
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 2000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Kiểm tra xem có phải lỗi 503 (retryable) không
      const isRetryable = 
        error.message?.includes('503') || 
        error.message?.includes('Service Unavailable') ||
        error.message?.includes('overloaded') ||
        error.status === 503 ||
        (error.error && error.error.message?.includes('503'));

      // Nếu không phải lỗi retryable hoặc đã hết số lần retry, throw error
      if (!isRetryable || attempt === maxRetries - 1) {
        throw new Error('Dịch vụ AI đang bận xử lý quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.');
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  Lỗi 503 - Retry attempt ${attempt + 1}/${maxRetries} sau ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export const generateItinerary = async (params) => {
  // Kiểm tra xem API key đã được cấu hình chưa
  if (!GEMINI_API_KEY || !genAI) {
    throw new Error('Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.');
  }
  const {
    destination,
    destinationCity, // ← Canonical city từ Nominatim (structured data, không hardcode regex)
    destinationCoordinates,
    startDate,
    endDate,
    numberOfPeople,
    budget,
    interests = [],
    pickedLocationIds = [],
  } = params;

  // Tính số ngày của chuyến đi
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  // Dùng destinationCity từ Nominatim (thông minh), fallback to destination
  const canonicalCity = destinationCity || destination;
  console.log(` Canonical city: "${canonicalCity}" (from Nominatim structured data)`);


  // BƯỚC 1A: Query DB locations (đã có cập nhật admin/user) theo canonical city
  console.log(`\n Bước 1A: Query DB locations for ${destination} (city: ${canonicalCity})...`);
  let dbPlaces = [];
  try {
    const dbLocations = await Location.find({
      isActive: true,
      isPublic: true,
      osmId: { $ne: null },
      osmType: { $ne: null },
      $or: [
        { city: { $regex: new RegExp(canonicalCity, 'i') } },
        { address: { $regex: new RegExp(canonicalCity, 'i') } }
      ]
    }).limit(300).lean();
    
    // Convert DB locations sang format giống OSM places
    dbPlaces = dbLocations.map(loc => ({
      xid: `osm_${loc.osmType}_${loc.osmId}`,
      name: loc.name,
      osmId: loc.osmId,
      osmType: loc.osmType,
      placeId: loc.placeId,
      type: loc.type,
      description: loc.description || '',
      address: loc.address,
      city: loc.city,
      coordinates: loc.coordinates,
      rating: loc.rating || 0,
      image: loc.images?.[0] || null,
      images: loc.images || [],
      communityImages: loc.communityImages || [],
      website: loc.contact?.website || '',
      openingHours: loc.openingHours || '',
      averageCost: loc.averageCost || 0,
      tags: loc.tags || [],
      // DB metadata
      _dbEnriched: true,
      _dbId: loc._id,
      _usageCount: loc.usageCount || 0,
      _ratingCount: loc.ratingCount || 0,
    }));
    
    console.log(`   ✓ Found ${dbPlaces.length} locations from DB`);
  } catch (dbError) {
    console.error(`     DB query error: ${dbError.message}`);
  }

  // BƯỚC 1B: Lấy danh sách địa điểm từ OpenStreetMap
  console.log(`\n Bước 1B: Fetching places from OSM for ${destination}...`);
  if (destinationCoordinates) {
    console.log(`   Coordinates: (${destinationCoordinates.lat}, ${destinationCoordinates.lng})`);
  }
  
  let osmPlaces = [];
  
  try {
    if (!destinationCoordinates) {
      console.warn(`   No coordinates provided, cannot query OSM`);
    } else {
      // Dùng OSM area theo tên destination
      osmPlaces = await getPlacesByInterests(destination, interests, 800, destinationCoordinates);
      console.log(`   ✓ Found ${osmPlaces.length} places from OpenStreetMap`);
    }
  } catch (error) {
    console.error(`   OSM query error: ${error.message}`);
  }
  
  // BƯỚC 1C: Merge DB + OSM places (dedupe theo osmId+osmType)
  console.log(`\n Bước 1C: Merging DB + OSM places...`);
  const placeMap = new Map();
  
  // Bước 1: Thêm DB places vào map
  dbPlaces.forEach(dbPlace => {
    const key = `${dbPlace.osmType}_${dbPlace.osmId}`;
    placeMap.set(key, { ...dbPlace, _source: 'db' });
  });
  
  // Bước 2: Merge OSM places (update OSM fields, giữ DB fields)
  let osmNewCount = 0;
  let osmUpdateCount = 0;
  
  osmPlaces.forEach(osmPlace => {
    const key = `${osmPlace.osmType}_${osmPlace.osmId}`;
    
    if (placeMap.has(key)) {
      // Đã có trong DB → merge: OSM fields refresh, DB fields giữ nguyên
      const dbPlace = placeMap.get(key);
      placeMap.set(key, {
        // OSM fields (luôn update)
        name: osmPlace.name,
        address: osmPlace.address,
        coordinates: osmPlace.coordinates,
        openingHours: osmPlace.openingHours,
        website: osmPlace.website,
        description: osmPlace.description || dbPlace.description,
        
        // DB fields (ưu tiên giữ)
        images: dbPlace.images,
        communityImages: dbPlace.communityImages,
        tags: dbPlace.tags,
        rating: dbPlace.rating,
        averageCost: dbPlace.averageCost || osmPlace.averageCost,
        
        // Metadata
        osmId: osmPlace.osmId,
        osmType: osmPlace.osmType,
        xid: osmPlace.xid,
        placeId: osmPlace.placeId || dbPlace.placeId,
        type: osmPlace.type || dbPlace.type,
        city: osmPlace.city || dbPlace.city,
        
        _dbEnriched: true,
        _dbId: dbPlace._dbId,
        _usageCount: dbPlace._usageCount,
        _ratingCount: dbPlace._ratingCount,
        _source: 'merged'
      });
      osmUpdateCount++;
    } else {
      // Chưa có trong DB → thêm mới từ OSM
      placeMap.set(key, { ...osmPlace, _source: 'osm' });
      osmNewCount++;
    }
  });
  
  const realPlaces = Array.from(placeMap.values());
  // limit số địa điểm để đưa vào prompt
  const PROMPT_PLACE_LIMIT = 250;
  const placesForPrompt = (() => {
    const merged = realPlaces.filter((p) => p && p._source === 'merged');
    const db = realPlaces.filter((p) => p && p._source === 'db');
    const osm = realPlaces.filter((p) => p && p._source === 'osm');
    return [...merged, ...db, ...osm].slice(0, PROMPT_PLACE_LIMIT);
  })();
  
  console.log(`   ✓ Merged: ${realPlaces.length} total places`);
  console.log(`     - ${dbPlaces.length} from DB (curated)`);
  console.log(`     - ${osmNewCount} new from OSM`);
  console.log(`     - ${osmUpdateCount} merged (DB + OSM)`);
  
  // log sample
  if (realPlaces.length > 0) {
    console.log('\n Sample merged places:');
    realPlaces.slice(0, 10).forEach((p, idx) => {
      const source = p._source === 'db' ? ' DB' : p._source === 'merged' ? '🔀 DB+OSM' : '🌐 OSM';
      const hasImages = p.images?.length > 0 ? '' : '';
      const hasTags = p.tags?.length > 0 ? '' : '';
      console.log(`   ${idx + 1}. ${source} ${p.name} (${p.type}) ${hasImages}${hasTags}`);
    });
    if (realPlaces.length > 10) {
      console.log(`   ... và ${realPlaces.length - 10} địa điểm khác\n`);
    }
  }
  
  //  THÀNH THẬT: Nếu không đủ dữ liệu OSM -> KHÔNG cho phép tạo lịch trình
  const MIN_REQUIRED_PLACES = 5;
  if (realPlaces.length < MIN_REQUIRED_PLACES) {
    const errorMsg = realPlaces.length === 0 
      ? `Hệ thống không tìm thấy dữ liệu địa điểm thực tế tại "${destination}". 
         Điều này có thể do khu vực này chưa có dữ liệu trên OpenStreetMap hoặc lỗi kết nối. 
         Vui lòng thử lại với một địa danh phổ biến hơn.`
      : `Chỉ tìm thấy ${realPlaces.length} địa điểm từ OSM (cần tối thiểu ${MIN_REQUIRED_PLACES}). Khu vực này chưa đủ dữ liệu để tạo lịch trình.`;
    
    console.error(` ${errorMsg}`);
    throw new Error(errorMsg);
  }

  //  LƯU TẤT CẢ địa điểm OSM vào DB TRƯỚC KHI gọi Gemini
  console.log(`\n Bước 1.5: Lưu ${realPlaces.length} địa điểm OSM vào DB...`);
  let savedLocations = [];
  try {
    savedLocations = await saveOSMPlacesToDB(realPlaces, null, canonicalCity);
    console.log(` Đã lưu ${savedLocations.length} locations vào DB`);
  } catch (saveError) {
    console.error(` Lỗi khi lưu OSM places vào DB:`, saveError.message);
    throw new Error(`Không thể lưu dữ liệu địa điểm vào hệ thống. Vui lòng thử lại.`);
  }
  // load các địa điểm người dùng đã chọn
  let pickedLocations = [];
  const pickedIds = Array.isArray(pickedLocationIds) ? pickedLocationIds.map((x) => String(x)) : [];
  if (pickedIds.length > 0) {
    try {
      pickedLocations = await Location.find({ _id: { $in: pickedIds }, isActive: true }).lean();
      console.log(`✓ Picked locations: ${pickedLocations.length}/${pickedIds.length}`);
    } catch (e) {
      console.warn(`  Failed to load picked locations: ${e.message}`);
    }
  }
  // tạo context cho các địa điểm người dùng đã chọn
  const pickedLocationsContext = pickedLocations.length > 0
    ? `\n\n**ĐỊA ĐIỂM NGƯỜI DÙNG ĐÃ CHỌN (BẮT BUỘC PHẢI CÓ TRONG LỊCH TRÌNH - ít nhất 1 lần mỗi địa điểm):**\n${pickedLocations
        .map((loc, idx) => {
          return `${idx + 1}. ${loc.name} | ${loc.type} | ${loc.address} | (${loc.coordinates?.lat}, ${loc.coordinates?.lng})`;
        })
        .join('\n')}`
    : '';

  // Sử dụng gemini-2.5-flash - model mới nhất tương thích với API key hiện tại
  // Các model khác có thể dùng: gemini-2.5-pro, gemini-2.0-flash
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // BƯỚC 2: Format danh sách địa điểm thực (đã enriched từ DB + OSM) để đưa vào prompt
  const realPlacesContext = placesForPrompt.length > 0 ? `
//
**DANH SÁCH ĐỊA ĐIỂM THỰC TẾ (${placesForPrompt.length} địa điểm - đã xác thực từ DB & OSM):**
${placesForPrompt.map((place, idx) => {
  const source = place._source === 'db' ? ' [Đã curate]' : 
                 place._source === 'merged' ? ' [DB+OSM]' : 
                 ' [OSM mới]';
  const hasImage = place.images?.length > 0 ? ' Có ảnh' : '';
  const hasTags = place.tags?.length > 0 ? ` Tags: ${place.tags.slice(0, 3).join(', ')}` : '';
  const communityRating = place._ratingCount > 0 ? ` ${place.rating.toFixed(1)}/5 (${place._ratingCount} đánh giá)` : '';
  const usageInfo = place._usageCount > 0 ? ` Đã dùng ${place._usageCount} lần` : '';
  
  return `
${idx + 1}. **${place.name}** ${source}
   - Loại: ${place.type}
   - Địa chỉ: ${place.address}
   - Tọa độ: (${place.coordinates.lat}, ${place.coordinates.lng})
   ${communityRating || `- Đánh giá: ${place.rating}/5`}
   ${place.description ? `- Mô tả: ${place.description.substring(0, 200)}${place.description.length > 200 ? '...' : ''}` : ''}
   ${place.openingHours ? `- Giờ mở cửa: ${place.openingHours}` : ''}
   ${place.website ? `- Website: ${place.website}` : ''}
   ${hasImage}
   ${hasTags}
   ${usageInfo}`;
}).join('\n')}

**Lưu ý:**
-  [Đã curate]: Địa điểm đã được admin/user xác minh, có ảnh/tags/đánh giá
-  [DB+OSM]: Địa điểm đã có trong hệ thống và được cập nhật từ OSM
-  [OSM mới]: Địa điểm mới từ OpenStreetMap, chưa được xác minh
` : '';

  const prompt = `Bạn là một chuyên gia tư vấn du lịch. Hãy tạo một lịch trình du lịch chi tiết với các yêu cầu sau:

**Điểm đến:** ${destination}
**Ngày đi:** ${startDate}
**Ngày về:** ${endDate}
**Số ngày:** ${days}
**Số người:** ${numberOfPeople}
**Ngân sách:** ${budget.toLocaleString('vi-VN')} VNĐ (tổng cộng)
**Sở thích:** ${interests.join(', ') || 'không có sở thích cụ thể'}
${realPlacesContext}
${pickedLocationsContext}

**QUY TẮC NGHIÊM NGẶT - BẮT BUỘC TUÂN THỦ:**

0. Nếu có danh sách **ĐỊA ĐIỂM NGƯỜI DÙNG ĐÃ CHỌN** thì **BẮT BUỘC** phải đưa TẤT CẢ các địa điểm đó vào lịch trình (mỗi địa điểm ít nhất 1 lần). Không được bỏ sót.

1. **CHỈ ĐƯỢC DÙNG ĐÚNG TÊN** từ DANH SÁCH ĐỊA ĐIỂM THỰC TẾ bên trên
   - VÍ DỤ SAI: "Quán ăn Phố Cổ (Bún Chả/Phở)" 
   - VÍ DỤ ĐÚNG: "Highlands Coffee" (nếu có trong danh sách) 
   
2. **KHÔNG ĐƯỢC** tự đặt tên chung chung như:
    "Quán phở địa phương"
    "Nhà hàng Phố Cổ" 
    "Khách sạn gần trung tâm"
    "Cà phê view hồ"
   
3. **BẮT BUỘC** copy CHÍNH XÁC:
   - Tên (name) từ danh sách
   - Địa chỉ (address) từ danh sách
   - Tọa độ (lat, lng) từ danh sách
   
4. Nếu trong danh sách KHÔNG CÓ địa điểm phù hợp cho activity:
   - Bỏ activity đó ĐI
   - HOẶC dùng địa điểm gần nhất có trong danh sách
   
5. Chỉ được ước lượng: giá (cost), giờ mở cửa, mô tả chi tiết

Yêu cầu chi tiết:
1. Tạo lịch trình chi tiết cho từng ngày
2. **MỖI ACTIVITY PHẢI DÙNG ĐÚNG TÊN TỪ DANH SÁCH OPENSTREETMAP:**
   - Điểm tham quan (attraction): Chọn từ danh sách, copy chính xác tên
   - Quán ăn/cà phê (restaurant): Chọn từ danh sách, copy chính xác tên (VD: "KFC", "Highlands Coffee")
   - Khách sạn (hotel): Chọn từ danh sách, copy chính xác tên
   - Hoạt động khác (activity): Nếu không có trong danh sách thì bỏ qua
   
3. **VÍ DỤ ĐÚNG:**
   {
     "name": "Highlands Coffee",
     "type": "restaurant",
     "location": {
       "address": "21 Lý Quốc Sư, Hoàn Kiếm",
       "coordinates": { "lat": 21.0285, "lng": 105.8522 }
     }
   }
   
4. **VÍ DỤ SAI:**
   {
     "name": "Quán cà phê Phố Cổ",  TỰ ĐẶT TÊN
     "name": "Nhà hàng địa phương",  TÊN CHUNG CHUNG
     "name": "Khách sạn 3 sao gần hồ"  KHÔNG CÓ TRONG DANH SÁCH
   }
4. Phân bổ thời gian hợp lý trong ngày
5. Ước tính chi phí cho từng hoạt động và tổng chi phí phù hợp ngân sách
6. KHÔNG được tạo **2 hoạt động liên tiếp trong cùng một ngày** có:
   - Cùng tên địa điểm (name) VÀ cùng địa chỉ (location.address)
   - Nếu muốn ở lâu tại một địa điểm, TĂNG duration thay vì tạo activity trùng
7. Nếu cần quay lại cùng một địa điểm:
   - Để cách ra bởi hoạt động khác hoặc ngày khác
   - Mô tả rõ lý do quay lại

Trả về kết quả dưới dạng JSON với cấu trúc sau:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "time": "HH:mm",
          "type": "attraction|restaurant|hotel|activity",
          "name": "Tên địa điểm",
          "description": "Mô tả chi tiết",
          "location": {
            "address": "Địa chỉ",
            "coordinates": {
              "lat": số,
              "lng": số
            }
          },
          "duration": số phút,
          "cost": số tiền,
          "rating": 1-5
        }
      ],
      "estimatedCost": tổng chi phí ngày
    }
  ],
  "totalEstimatedCost": tổng chi phí toàn bộ
}

Chỉ trả về JSON, không có text thêm.`;

  try {
    // Wrap generateContent với retry mechanism để xử lý lỗi 503
    const result = await retryWithBackoff(async () => {
      return await model.generateContent(prompt);
    });
    
    const response = await result.response;
    const text = response.text();
    
    // Tách phần JSON từ phản hồi (đôi khi AI thêm định dạng markdown)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }
    
    const itinerary = JSON.parse(jsonText);
    
    // BƯỚC 3: GẮN OSM ID cho activities + LỌC BỎ activities không match OSM
    console.log('\n Matching activities với OSM places và gắn osmId...');
    
    // Helper: normalize tên để match chính xác hơn
    const normalizeName = (name) => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' '); // Normalize spaces
    };
    // tạo map cho các địa điểm đã có trong DB
    const osmPlaceMap = new Map();
    const matchableLocationsMap = new Map();
    [...savedLocations, ...pickedLocations].forEach((loc) => {
      if (!loc?._id) return;
      matchableLocationsMap.set(String(loc._id), loc);
    });
    Array.from(matchableLocationsMap.values()).forEach((loc) => {
      const normName = normalizeName(loc.name);
      osmPlaceMap.set(normName, loc);
    });
    // đếm tổng số activities và số activities match được
    let totalActivities = 0;
    let matchedActivities = 0;
    let removedActivities = 0;
    
    // Lọc và gắn OSM data cho từng activity
    itinerary.days.forEach((day, dayIdx) => {
      const filteredActivities = [];
      
      day.activities?.forEach((activity, actIdx) => {
        totalActivities++;
        const activityName = normalizeName(activity.name);
        
        // Tìm OSM location match (exact hoặc partial)
        let matchedLocation = null;
        
        // 1. Exact match (normalized)
        if (osmPlaceMap.has(activityName)) {
          matchedLocation = osmPlaceMap.get(activityName);
        }
        
        // 2. Partial match (activity name chứa OSM name hoặc ngược lại)
        if (!matchedLocation) {
          for (const [osmName, loc] of osmPlaceMap.entries()) {
            if (activityName.includes(osmName) || osmName.includes(activityName)) {
              matchedLocation = loc;
              break;
            }
          }
        }
        
        if (matchedLocation) {
          //  Match được -> gắn OSM data vào activity
          activity.osmId = matchedLocation.osmId;
          activity.osmType = matchedLocation.osmType;
          activity.locationId = matchedLocation._id;
          // Cập nhật location từ DB (chuẩn nhất)
          activity.location = {
            address: matchedLocation.address,
            coordinates: {
              lat: matchedLocation.coordinates.lat,
              lng: matchedLocation.coordinates.lng,
            },
          };
          filteredActivities.push(activity);
          matchedActivities++;
        } else {
          //  KHÔNG match -> BỎ QUA activity này
          console.warn(`    Loại bỏ: Day ${dayIdx + 1}, Activity ${actIdx + 1} "${activity.name}" - không tìm thấy trong OSM`);
          removedActivities++;
        }
      });
      
      // Cập nhật lại danh sách activities (chỉ giữ matched)
      day.activities = filteredActivities;
    });
    
    console.log(`    Matched: ${matchedActivities}/${totalActivities} activities`);
    console.log(`    Removed: ${removedActivities} activities không có trong OSM`);
    
    // Nếu sau khi lọc, không còn activity nào -> throw error
    const remainingActivities = itinerary.days.reduce((sum, day) => sum + (day.activities?.length || 0), 0);
    if (remainingActivities === 0) {
      throw new Error('Không thể tạo lịch trình: tất cả activities đều không khớp với dữ liệu OSM. Vui lòng thử lại.');
    }
    // lọc danh sách địa điểm cần thêm
    const pickedNeedInclude = pickedLocations.filter((l) => l && l._id);
    if (pickedNeedInclude.length > 0) {
      const presentIds = new Set();  // tập hợp các địa điẻm đã có trong lịch trình
      itinerary.days.forEach((day) => {
        (day.activities || []).forEach((act) => {
          if (act.locationId) presentIds.add(String(act.locationId));
        });
      });
      // hàm chọn ngày ít hoạt động nhất
      const ensureDayIndex = () => {
        let bestIdx = 0;
        let bestCount = Number.POSITIVE_INFINITY;
        for (let i = 0; i < itinerary.days.length; i += 1) {
          const c = Array.isArray(itinerary.days[i].activities) ? itinerary.days[i].activities.length : 0;
          if (c < bestCount) {
            bestCount = c;
            bestIdx = i;
          }
        }
        return bestIdx;
      };
      // thời lượng mặc định theo loại địa điểm
      const defaultDurationByType = {
        attraction: 90,
        restaurant: 60,
        hotel: 120,
        activity: 90,
      };
      // chèn địa điểm vào lịch trình
      for (const loc of pickedNeedInclude) {
        if (presentIds.has(String(loc._id))) continue;
        const dayIdx = ensureDayIndex();
        const acts = itinerary.days[dayIdx].activities || [];
        const activityIndexInDay = acts.length;
        const baseHour = 9;
        const hour = Math.min(baseHour + (activityIndexInDay * 2), 20);
        const time = `${String(hour).padStart(2, '0')}:00`;

        const injected = {
          time,
          type: loc.type,
          name: loc.name,
          description: loc.description || '',
          duration: defaultDurationByType[loc.type] || 90,
          cost: loc.averageCost || 0,
          rating: 5,
          osmId: loc.osmId,
          osmType: loc.osmType,
          locationId: loc._id,
          location: {
            address: loc.address,
            coordinates: {
              lat: loc.coordinates?.lat,
              lng: loc.coordinates?.lng,
            },
          },
        };
        // thêm hoạt động vào ngày đã chọn và đánh dấu để tránh trùng
        itinerary.days[dayIdx].activities = acts.concat([injected]);
        presentIds.add(String(loc._id));
      }
    }
    // tính lại chi phí cho mỗi ngày và tổng chi phí
    itinerary.days.forEach((day) => {
      day.estimatedCost = (day.activities || []).reduce((sum, act) => sum + (act.cost || 0), 0);
    });
    itinerary.totalEstimatedCost = itinerary.days.reduce((sum, d) => sum + (d.estimatedCost || 0), 0);
    
    // Tính lại ngày cụ thể cho từng phần tử trong mảng days
    const itineraryWithDates = {
      ...itinerary,
      days: itinerary.days.map((day, index) => {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + index);
        return {
          ...day,
          date: dayDate.toISOString().split('T')[0],
        };
      }),
    };
    // trả về lịch trình
    return itineraryWithDates;
  } catch (error) {
    console.error('Lỗi tạo lịch trình:', error);
    
    // Xử lý và trả về thông báo lỗi cụ thể hơn
    if (error.message?.includes('API key') || error.message?.includes('403')) {
      throw new Error('Gemini API key không hợp lệ hoặc chưa được cấu hình. Hãy kiểm tra GEMINI_API_KEY trong file .env của bạn.');
    }
    
    if (error.message?.includes('429')) {
      throw new Error('Hạn chế tốc độ API đã đạt mức tối đa. Hãy thử lại sau.');
    }
    
    // Xử lý lỗi 503 Service Unavailable (sau khi đã retry)
    if (error.message?.includes('503') || 
        error.message?.includes('Service Unavailable') || 
        error.message?.includes('overloaded')) {
      throw new Error('Dịch vụ AI đang quá tải. Vui lòng thử lại sau vài phút.');
    }
    
    throw new Error(`Failed to generate itinerary: ${error.message || 'Unknown error'}. Please try again.`);
  }
};
