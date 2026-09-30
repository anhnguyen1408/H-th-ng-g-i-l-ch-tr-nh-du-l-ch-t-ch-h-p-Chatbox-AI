import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

/**
 * Tự động sắp xếp và tối ưu lịch trình dựa trên layout do người dùng chọn
 * Gemini chỉ sắp xếp thứ tự + gán time/duration/cost, KHÔNG đổi địa điểm/ngày
 */
export const autoScheduleItinerary = async (userLayout) => {
  if (!GEMINI_API_KEY || !genAI) {
    throw new Error('Gemini API key is not configured.');
  }

  const {
    destination,
    startDate,
    endDate,
    numberOfPeople,
    budget,
    days, // Mảng { date, activities: [{ type, name, location }] }
  } = userLayout;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build context về các địa điểm user đã chọn từng ngày
  const daysContext = days.map((day, dayIndex) => `
**Ngày ${dayIndex + 1} (${day.date}):**
Người dùng đã chọn ${day.activities.length} địa điểm:
${day.activities.map((act, idx) => `
${idx + 1}. [${act.type}] **${act.name}**
   - Địa chỉ: ${act.location.address}
   - Tọa độ: (${act.location.coordinates.lat}, ${act.location.coordinates.lng})
`).join('')}
`).join('\n');
  // 
  const prompt = `Bạn là chuyên gia tư vấn du lịch. Người dùng đã chọn sẵn các địa điểm cho từng ngày, giờ bạn cần sắp xếp lại thứ tự trong ngày và gán thời gian/chi phí hợp lý dựa trên kiến thức và kinh nghiệm du lịch của bạn.

**THÔNG TIN CHUYẾN ĐI:**
- Điểm đến: ${destination}
- Ngày đi: ${startDate}
- Ngày về: ${endDate}
- Số người: ${numberOfPeople}
- Ngân sách tổng: ${budget.toLocaleString('vi-VN')} VNĐ

${daysContext}

**QUY TẮC NGHIÊM NGẶT - TUYỆT ĐỐI PHẢI TUÂN THỦ:**

1. **KHÔNG ĐƯỢC:**
   - Thêm địa điểm mới
   - Xoá bất kỳ địa điểm nào
   - Chuyển địa điểm sang ngày khác
   - Đổi tên (name), địa chỉ (address), hoặc tọa độ (coordinates) của bất kỳ địa điểm nào

2. **CHỈ ĐƯỢC:**
   - Sắp xếp lại thứ tự các địa điểm TRONG CÙNG MỘT NGÀY cho hợp lý
   - Gán thời gian bắt đầu (time) cho mỗi địa điểm
   - Gán thời lượng (duration) phù hợp
   - Ước lượng chi phí (cost) hợp lý
   - Gán rating (1-5) dựa trên độ hấp dẫn
   - Viết mô tả (description) chi tiết bằng tiếng Việt

**YÊU CẦU:**
- Dựa vào kiến thức và kinh nghiệm du lịch của bạn để sắp xếp thứ tự, thời gian, thời lượng, chi phí một cách hợp lý nhất
- Tối ưu di chuyển dựa trên vị trí địa lý (tọa độ)
- Đảm bảo lịch trình phù hợp với thực tế du lịch (thời gian ăn uống, nghỉ ngơi, di chuyển...)
- Mỗi ngày PHẢI có đầy đủ số địa điểm mà người dùng đã chọn, không được bỏ sót
- Tổng chi phí phải phù hợp với ngân sách

Trả về JSON với cấu trúc sau:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "time": "HH:mm",
          "type": "attraction|restaurant|hotel|activity",
          "name": "Tên địa điểm (PHẢI CHÍNH XÁC như danh sách)",
          "description": "Mô tả chi tiết bằng tiếng Việt",
          "location": {
            "address": "Địa chỉ (PHẢI CHÍNH XÁC như danh sách)",
            "coordinates": {
              "lat": số (PHẢI CHÍNH XÁC như danh sách),
              "lng": số (PHẢI CHÍNH XÁC như danh sách)
            }
          },
          "duration": số phút,
          "cost": số tiền VNĐ,
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
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Tách JSON - Extract JSON object từ response
    let jsonText = text.trim();
    
    // Remove markdown code blocks
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    // Tìm JSON object đầu tiên (từ { đến } cuối cùng match)
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      console.error(' No JSON object found in response');
      console.error('Response preview:', text.substring(0, 500));
      throw new Error('No valid JSON found in AI response');
    }

    jsonText = jsonText.substring(firstBrace, lastBrace + 1);

    // Parse JSON
    let scheduledItinerary;
    try {
      scheduledItinerary = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(' JSON parse error:', parseError.message);
      console.error('JSON text length:', jsonText.length);
      console.error('JSON preview (first 500 chars):', jsonText.substring(0, 500));
      console.error('JSON preview (last 500 chars):', jsonText.substring(jsonText.length - 500));
      throw new Error(`Invalid JSON from AI: ${parseError.message}`);
    }

    // Validate: số ngày và số activity mỗi ngày phải khớp
    if (scheduledItinerary.days.length !== days.length) {
      throw new Error('AI returned different number of days than provided');
    }
    // Kiểm tra số activity mỗi ngày
    scheduledItinerary.days.forEach((day, dayIndex) => {
      if (day.activities.length !== days[dayIndex].activities.length) {
        console.warn(`  Day ${dayIndex + 1}: AI returned ${day.activities.length} activities, expected ${days[dayIndex].activities.length}. Will auto-fix.`);
        // Auto-fix: cắt hoặc thêm từ input
        if (day.activities.length > days[dayIndex].activities.length) {
          day.activities = day.activities.slice(0, days[dayIndex].activities.length);
        } else {
          const missing = days[dayIndex].activities.slice(day.activities.length);
          day.activities.push(...missing.map(act => ({
            time: '12:00',
            type: act.type,
            name: act.name,
            description: '',
            location: act.location,
            duration: 60,
            cost: 0,
            rating: 3,
          })));
        }
      }
    });

    console.log('✓ Auto-schedule completed successfully');
    return scheduledItinerary;
  } catch (error) {
    console.error('Error in auto-schedule:', error);
    throw new Error(`Failed to auto-schedule itinerary: ${error.message}`);
  }
};
