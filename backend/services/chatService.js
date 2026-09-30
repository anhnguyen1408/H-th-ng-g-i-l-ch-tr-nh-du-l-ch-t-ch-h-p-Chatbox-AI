import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPlacesByInterests } from './osmPlacesService.js';
import { saveOSMPlacesToDB } from './locationService.js';
import Location from '../models/Location.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

export const chatWithItinerary = async (itinerary, userMessage, chatHistory = []) => {
  if (!GEMINI_API_KEY || !genAI) {
    throw new Error('Gemini API key is not configured.');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // THỐNG NHẤT VỚI aiService: Query DB + OSM → merge (reuse curated data)
  const queryCity = itinerary.destinationCity || itinerary.destination;
  console.log(`\n  [CHAT] Fetching places for ${itinerary.destination} (city: ${queryCity})...`);
  
  // Bước 1: Query DB locations (curated data) theo canonical city
  let dbPlaces = [];
  try { // try catch để tránh lỗi khi query DB
    const dbLocations = await Location.find({
      isActive: true,
      isPublic: true,
      osmId: { $ne: null },
      osmType: { $ne: null },
      $or: [
        { city: { $regex: new RegExp(queryCity, 'i') } },
        { address: { $regex: new RegExp(queryCity, 'i') } }
      ]
    }).limit(300).lean();
    // convert DB locations sang format giống OSM places
    dbPlaces = dbLocations.map(loc => ({
      xid: `osm_${loc.osmType}_${loc.osmId}`,
      name: loc.name,
      osmId: loc.osmId,
      osmType: loc.osmType,
      type: loc.type,
      description: loc.description || '',
      address: loc.address,
      city: loc.city,
      coordinates: loc.coordinates,
      rating: loc.rating || 0,
      images: loc.images || [],
      website: loc.contact?.website || '',
      openingHours: loc.openingHours || '',
      tags: loc.tags || [],
      _dbEnriched: true,
      _dbId: loc._id,
    }));
    
    console.log(`   ✓ Found ${dbPlaces.length} locations from DB`);
  } catch (dbError) {
    console.error(`     DB query error: ${dbError.message}`);
  }

  // Bước 2: Fetch OSM places
  let osmPlaces = [];
  if (itinerary.destinationCoordinates && itinerary.destinationCoordinates.lat) {
    try {  
      osmPlaces = await getPlacesByInterests(
        itinerary.destination,
        itinerary.interests || [],
        200,
        itinerary.destinationCoordinates
      );
      console.log(`   ✓ Found ${osmPlaces.length} places from OSM`);

      // Bước 2B: Persist OSM → DB (upsert), để recommend dùng được về sau
      // Lưu ý: Bước 1 đã query DB trước đó, nên các place mới lưu lần này sẽ chưa nằm trong dbPlaces (nhưng vẫn có trong osmPlaces/realPlaces)
      try {
        await saveOSMPlacesToDB(osmPlaces, null, queryCity);
      } catch (persistError) {
        console.error(`     Failed to persist OSM places to DB: ${persistError.message}`);
      }
    } catch (error) {
      console.error(`    OSM query error: ${error.message}`);
    }
  }
  
  // Bước 3: Merge DB + OSM (dedupe theo osmId+osmType, ưu tiên DB data)
  const placeMap = new Map();
  
  let osmNewCount = 0;
  let osmUpdateCount = 0;
  // Thêm DB places vào map
  dbPlaces.forEach(dbPlace => {
    const key = `${dbPlace.osmType}_${dbPlace.osmId}`;
    placeMap.set(key, { ...dbPlace, _source: 'db' });
  });
  // Thêm OSM places vào map
  osmPlaces.forEach(osmPlace => {
    const key = `${osmPlace.osmType}_${osmPlace.osmId}`;
    // Nếu đã có trong map → merge: OSM refresh data, DB curated fields preserved
    if (placeMap.has(key)) {
      // Merge: OSM refresh data, DB curated fields preserved
      const dbPlace = placeMap.get(key);
      placeMap.set(key, {
        name: osmPlace.name,
        address: osmPlace.address,
        coordinates: osmPlace.coordinates,
        openingHours: osmPlace.openingHours,
        website: osmPlace.website,
        description: osmPlace.description || dbPlace.description,
        images: dbPlace.images, // DB curated
        tags: dbPlace.tags, // DB curated
        rating: dbPlace.rating, // DB curated
        osmId: osmPlace.osmId,
        osmType: osmPlace.osmType,
        type: osmPlace.type || dbPlace.type,
        city: osmPlace.city || dbPlace.city,
        _dbEnriched: true,
        _dbId: dbPlace._dbId,
        _source: 'merged'
      });

      osmUpdateCount++;
    } else {
      placeMap.set(key, { ...osmPlace, _source: 'osm' });

      osmNewCount++;
    }
  });
  
  const realPlaces = Array.from(placeMap.values());
  console.log(`   ✓ Merged: ${realPlaces.length} total places`);
  console.log(`     - ${dbPlaces.length} from DB (curated)`);
  console.log(`     - ${osmNewCount} new from OSM`);
  console.log(`     - ${osmUpdateCount} merged (DB + OSM)`);

  // Xây dựng ngữ cảnh chi tiết về lịch trình
  const itineraryContext = `
Lịch trình hiện tại:
- Điểm đến: ${itinerary.destination}
- Ngày: ${new Date(itinerary.startDate).toLocaleDateString('vi-VN')} - ${new Date(itinerary.endDate).toLocaleDateString('vi-VN')}
- Số người: ${itinerary.numberOfPeople}
- Ngân sách: ${itinerary.budget.toLocaleString('vi-VN')} VNĐ
- Tổng chi phí dự kiến: ${itinerary.totalEstimatedCost?.toLocaleString('vi-VN')} VNĐ

Chi tiết các ngày:
${itinerary.days.map((day, index) => `
Ngày ${index + 1} (${new Date(day.date).toLocaleDateString('vi-VN')}):
${day.activities.map((act, actIndex) => `  ${actIndex}: ${act.time} - ${act.name} (${act.type}) - ${act.cost?.toLocaleString('vi-VN')} VNĐ`).join('\n')}
Tổng chi phí: ${day.estimatedCost?.toLocaleString('vi-VN')} VNĐ
`).join('\n')}
`;

  // Thêm context về địa điểm từ OSM
  const osmPlacesContext = realPlaces.length > 0 ? `

**DANH SÁCH ĐỊA ĐIỂM THỰC TẾ TỪ OPENSTREETMAP (${realPlaces.length} địa điểm):**
${realPlaces.map((place, idx) => `
${idx + 1}. **${place.name}**
   - Loại: ${place.type}
   - Địa chỉ: ${place.address}
   - Tọa độ: (${place.coordinates.lat}, ${place.coordinates.lng})
   ${place.description ? `- Mô tả: ${place.description.substring(0, 150)}` : ''}
`).join('\n')}

**QUY TẮC NGHIÊM NGẶT - BẮT BUỘC PHẢI TUÂN THỦ:**

TUYỆT ĐỐI KHÔNG ĐƯỢC:
- Tự nghĩ ra tên địa điểm mới
- Sửa đổi/thêm bớt chữ trong tên địa điểm
- Bịa tọa độ hoặc địa chỉ
- Dùng địa điểm không có trong danh sách trên

CHỈ ĐƯỢC PHÉP:
- Copy CHÍNH XÁC 100% tên địa điểm từ danh sách (bao gồm cả dấu, viết hoa/thường)
- Copy CHÍNH XÁC tọa độ lat/lng từ danh sách
- Copy CHÍNH XÁC địa chỉ từ danh sách
- Nếu user yêu cầu địa điểm không có trong danh sách → TỪ CHỐI và gợi ý địa điểm thay thế TRONG DANH SÁCH

VÍ DỤ ĐÚNG:
- User: "Thêm bãi biển vào lịch trình"
- AI tìm trong danh sách → thấy "Bãi biển Mỹ Khê" (index 15)
- AI copy CHÍNH XÁC: name="Bãi biển Mỹ Khê", address="...", lat=16.0544, lng=108.2425

VÍ DỤ SAI (TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM):
- AI tự nghĩ "My Khe Beach" (sai vì không copy y hệt)
- AI sửa thành "Bãi biển Mỹ Khê đẹp" (sai vì thêm chữ)
- AI bịa tọa độ 16.05, 108.24 (sai vì không chính xác)

NẾU KHÔNG TÌM ĐƯỢC địa điểm phù hợp trong danh sách:
→ Trả lời: "Xin lỗi, địa điểm đó chưa có trong hệ thống. Tôi gợi ý [tên địa điểm tương tự TRONG DANH SÁCH] thay thế nhé!"
` : '';

  const systemPrompt = itineraryContext + osmPlacesContext + `

Vai trò của bạn:
1. Trò chuyện tự nhiên, thân thiện với người dùng về lịch trình
2. Trả lời các câu hỏi về lịch trình hiện tại
3. Đưa ra gợi ý cải thiện, bổ sung địa điểm, hoạt động
4. Tư vấn về chi phí, thời gian, địa điểm phù hợp
5. Giúp tối ưu lịch trình theo yêu cầu của người dùng

Phong cách trả lời:
- Trò chuyện tự nhiên, ngắn gọn, dễ hiểu, hữu ích
- Nhiệt tình và tích cực, sử dụng emoji 😊
- Đưa ra gợi ý cụ thể với tên địa điểm, thời gian, chi phí

**QUAN TRỌNG - Khi người dùng YÊU CẦU THAY ĐỔI lịch trình:**

Nếu user nói THÊM/SỬA/XOÁ hoạt động HOẶC ĐỔI TÊN/NGÂN SÁCH/ĐIỂM ĐẾN, BẠN PHẢI:
1. Trả lời văn bản thân thiện TRƯỚC
2. SAU ĐÓ thêm JSON code block với ba dấu ngoặc kép ngược + json

Format JSON - BẮT BUỘC phải có mảng "operations" (có thể chứa 1 hoặc NHIỀU thay đổi):
{
  "operations": [
    {
      "action": "add" hoặc "update" hoặc "delete" hoặc "updateMetadata",
      "dayIndex": số (0 = ngày 1, 1 = ngày 2...) - CHỈ cho add/update/delete activity,
      "activityIndex": số thứ tự (cho update/delete) hoặc null (cho add),
      "activity": {
        "time": "HH:mm" (BẮT BUỘC),
        "type": "attraction|restaurant|hotel|activity" (BẮT BUỘC),
        "name": "Tên địa điểm" (BẮT BUỘC),
        "description": "Mô tả chi tiết" (BẮT BUỘC),
        "location": {
          "address": "Địa chỉ đầy đủ" (BẮT BUỘC),
          "coordinates": {
            "lat": số thực (BẮT BUỘC),
            "lng": số thực (BẮT BUỘC)
          }
        },
        "duration": số phút (BẮT BUỘC),
        "cost": số tiền VNĐ (BẮT BUỘC),
        "rating": 1-5 (BẮT BUỘC)
      },
      "metadata": {
        // CHỈ dùng khi action = "updateMetadata"
        "title": "Tên lịch trình mới" (optional),
        "destination": "Điểm đến mới" (optional),
        "budget": số tiền VNĐ (optional),
        "startDate": "YYYY-MM-DD" (optional),
        "endDate": "YYYY-MM-DD" (optional),
        "numberOfPeople": số (optional)
      }
    }
  ]
}

CHÚ Ý:
- Nếu user yêu cầu NHIỀU thay đổi cùng lúc, hãy đưa TẤT CẢ vào mảng "operations"
- Mỗi activity PHẢI có ĐỦ tất cả fields (time, type, name, description, location.address, location.coordinates.lat, location.coordinates.lng, duration, cost, rating)
- Nếu không biết tọa độ chính xác, hãy ước lượng dựa trên địa điểm
- Với "delete", activity có thể là null
- Với "updateMetadata", gửi các field cần thay đổi trong object "metadata" 

VÍ DỤ THỰC TẾ:

User: "Đổi tên lịch trình thành 'Khám phá Hà Nội'"
AI: Đã đổi tên lịch trình thành "Khám phá Hà Nội" rồi nhé! 

\`\`\`json
{"operations":[{"action":"updateMetadata","metadata":{"title":"Khám phá Hà Nội"}}]}
\`\`\`

User: "Tăng ngân sách lên 2 triệu"
AI: OK! Tôi đã tăng ngân sách lên 2.000.000 VNĐ 

\`\`\`json
{"operations":[{"action":"updateMetadata","metadata":{"budget":2000000}}]}
\`\`\`

User: "Thêm quán cà phê vào buổi chiều ngày 1"
AI: Tuyệt vời! Tôi gợi ý Cà phê Giảng lúc 15:00 - nơi nổi tiếng với cà phê trứng Hà Nội 😊

\`\`\`json
{"operations":[{"action":"add","dayIndex":0,"activityIndex":null,"activity":{"time":"15:00","type":"restaurant","name":"Cà phê Giảng","description":"Quán cà phê trứng nổi tiếng nhất Hà Nội, được thành lập từ năm 1946","location":{"address":"39 Nguyễn Hữu Huân, Hoàn Kiếm, Hà Nội","coordinates":{"lat":21.0285,"lng":105.8542}},"duration":60,"cost":50000,"rating":4.5}}]}
\`\`\`

User: "Xoá hoạt động thứ 2 ngày 1 và thêm chùa Một Cột vào sáng ngày 2"
AI: Được rồi! Tôi sẽ xoá hoạt động số 1 trong ngày 1 và thêm Chùa Một Cột vào lịch trình ngày 2 👍

\`\`\`json
{"operations":[{"action":"delete","dayIndex":0,"activityIndex":1,"activity":null},{"action":"add","dayIndex":1,"activityIndex":null,"activity":{"time":"08:30","type":"attraction","name":"Chùa Một Cột","description":"Kiến trúc độc đáo của Phật giáo Việt Nam, được xây dựng năm 1049","location":{"address":"Chùa Một Cột, Đội Cấn, Ba Đình, Hà Nội","coordinates":{"lat":21.0358,"lng":105.8342}},"duration":45,"cost":0,"rating":4.7}}]}
\`\`\`

User: "Sửa hoạt động đầu tiên ngày 2 thành Hồ Gươm"
AI: Đã cập nhật! 

\`\`\`json
{"operations":[{"action":"update","dayIndex":1,"activityIndex":0,"activity":{"time":"08:00","type":"attraction","name":"Hồ Hoàn Kiếm","description":"Trái tim của Hà Nội với Tháp Rùa và Đền Ngọc Sơn cổ kính","location":{"address":"Hoàn Kiếm, Hà Nội","coordinates":{"lat":21.0285,"lng":105.8522}},"duration":90,"cost":0,"rating":5}}]}
\`\`\`

CHỈ trả JSON khi user YÊU CẦU THAY ĐỔI. Câu hỏi thông thường chỉ trả văn bản.`;
  
  try {  // try catch để tránh lỗi khi chat
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'Xin chào!  Tôi là trợ lý du lịch AI. Tôi đã xem lịch trình - trông thú vị đấy! Bạn muốn hỏi gì hoặc thay đổi gì không? 😊' }],
        },
        ...chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
      ],
    });
    
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    const text = response.text();

    // Phân tích các thay đổi nếu AI đề xuất chỉnh sửa
    let changes = null;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        
        // Kiểm tra cấu trúc - mong đợi dạng {operations: [...]}
        if (parsed.operations && Array.isArray(parsed.operations) && parsed.operations.length > 0) {
          // Kiểm tra từng thao tác
          const validOperations = parsed.operations.filter(op => {
            if (!op.action || !['add', 'update', 'delete', 'updateMetadata'].includes(op.action)) {
              return false;
            }
            // updateMetadata không cần dayIndex
            if (op.action === 'updateMetadata') {
              return op.metadata && typeof op.metadata === 'object';
            }
            // Các hành động khác phải có dayIndex
            return typeof op.dayIndex === 'number';
          });
          // Nếu có thao tác hợp lệ
          if (validOperations.length > 0) {
            changes = {
              operations: validOperations.map(op => ({
                action: op.action,
                dayIndex: op.dayIndex,
                activityIndex: op.activityIndex !== undefined ? op.activityIndex : null,
                activity: op.activity || null,
                metadata: op.metadata || null,
              })),
            };
            
            console.log(`Parsed ${validOperations.length} operation(s) from AI:`, JSON.stringify(changes, null, 2));
          }
        }
      } catch (e) {
        console.error('Failed to parse changes JSON:', e.message);
      }
    }

    // Ẩn phần JSON trong nội dung hiển thị cho người dùng
    const displayText = text.replace(/```json[\s\S]*?```/g, '').trim();

    return {
      text: displayText,
      changes,
    };
  } catch (error) {
    console.error('Error in chat:', error);
    
    // Handle rate limiting errors specifically
    if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
      throw new Error('Dịch vụ AI đang quá tải. Vui lòng thử lại sau vài giây.');
    }
    
    throw new Error(`Failed to process chat: ${error.message}`);
  }
};
