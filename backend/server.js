import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { initSocket } from './utils/socket.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import adminCommunityRoutes from './routes/adminCommunity.js';
import itineraryRoutes from './routes/itinerary.js';
import locationRoutes from './routes/location.js';
import notificationRoutes from './routes/notification.js';
import placesRoutes from './routes/places.js';
import recommendationsRoutes from './routes/recommendations.js';
import evaluationRoutes from './routes/evaluation.js';
import { startNotificationScheduler } from './services/notificationService.js';
import { checkUpcomingTrips, checkTodayTrips } from './services/tripReminderService.js';

// Lấy đường dẫn file hiện tại cho ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Nạp file .env từ thư mục backend
dotenv.config({ path: join(__dirname, '.env') });

// Debug: Kiểm tra GEMINI_API_KEY đã được nạp (chỉ hiển thị vài ký tự đầu để đảm bảo bảo mật)
if (process.env.GEMINI_API_KEY) {
  console.log('- GEMINI_API_KEY:', 'Set');
} else {
  console.warn('GEMINI_API_KEY not found in environment variables');
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Tăng limit để upload ảnh base64
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Kết nối cơ sở dữ liệu
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-travel-planner')
.then(() => {
  console.log('MongoDB connected');
  // Khởi động bộ lập lịch thông báo
  startNotificationScheduler();
  
  // Khởi động bộ nhắc nhở chuyến đi - chạy mỗi ngày lúc 8:00 sáng
  console.log('[Server] Starting trip reminder scheduler...');
  
  // Chạy ngay lần đầu để test
  setTimeout(async () => {
    await checkTodayTrips();
    await checkUpcomingTrips();
  }, 5000); // Sau 5 giây khi server khởi động
  
  // Sau đó chạy mỗi ngày lúc 8:00 sáng
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
      await checkTodayTrips();
      await checkUpcomingTrips();
    }
  }, 60000); // Check mỗi phút
  
  console.log('[Server] Trip reminder scheduler started (runs daily at 8:00 AM)');
})
.catch(err => console.error('MongoDB connection error:', err));

// Đăng ký các route API chính
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/community', adminCommunityRoutes);
app.use('/api/itinerary', itineraryRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/evaluation', evaluationRoutes);

// Simple cache cho OSRM routing để giảm calls
const osrmCache = new Map();
const OSRM_CACHE_TTL = 5 * 60 * 1000; // 5 phút

// Proxy OSRM để tránh CORS và giới hạn demo phía frontend
app.get('/osrm/route/v1/:profile/:coords', async (req, res) => {
  const { profile, coords } = req.params;
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex !== -1 ? req.originalUrl.substring(queryIndex) : '';

  const targetUrl = `https://router.project-osrm.org/route/v1/${profile}/${coords}${query}`;
  
  // ✅ Kiểm tra cache trước
  const cacheKey = `${profile}_${coords}_${query}`;
  const cached = osrmCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < OSRM_CACHE_TTL) {
    // console.log('OSRM cache hit:', cacheKey);
    return res.json(cached.data);
  }

  try {
    const maxAttempts = 2;
    let response;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await axios.get(targetUrl, {
          timeout: 30000, // Tăng timeout lên 30 giây
        });
        break;
      } catch (err) {
        const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
        const status = err.response?.status;
        const isTransient = isTimeout || (status && status >= 500);

        if (!isTransient || attempt === maxAttempts) {
          throw err;
        }

        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    
    // Lưu vào cache
    osrmCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });
    
    // Cleanup cache nếu quá lớn (giữ tối đa 100 entries)
    if (osrmCache.size > 100) {
      const firstKey = osrmCache.keys().next().value;
      osrmCache.delete(firstKey);
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(response.data);
  } catch (error) {
    const isTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
    const status = isTimeout ? 504 : (error.response?.status || 500);
    // Chỉ log error nghiêm trọng, không spam console
    if (status !== 502 && status !== 504) {
      console.error('OSRM proxy error:', status, error.message);
    }
    res.status(status).json({
      success: false,
      message: 'Failed to fetch route from OSRM demo server',
      status,
    });
  }
});

// Endpoint kiểm tra tình trạng server (health check)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'AI Travel Planner API is running' });
});

// Middleware xử lý lỗi chung
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

const PORT = process.env.PORT || 5000;

// Tạo HTTP server bao quanh Express
const server = createServer(app);

// Khởi tạo Socket.io
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Lưu io vào utils/socket để sử dụng ở các nơi khác
initSocket(io);

// Lắng nghe kết nối Socket.io
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  // Client có thể join room theo userId để nhận thông báo riêng
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`User ${userId} joined room`);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io ready for connections`);
});

