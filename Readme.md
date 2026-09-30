Tính năng chính

Người dùng
Tạo kế hoạch chuyến đi thông minh với AI
Tùy chỉnh lịch trình (thêm/bớt địa điểm, điều chỉnh thời gian)
Xuất PDF và chia sẻ lịch trình
Lưu lịch trình vào tài khoản
Đánh giá & feedback sau chuyến đi
Xem bản đồ các địa điểm trong lịch trình

Admin
Xem thống kê lượt dùng, lượt lưu lịch trình
Quản lý người dùng

Công nghệ sử dụng

Frontend
React.js 18
TailwindCSS
React Router DOM
Leaflet (Maps)
jsPDF (Export PDF)
Axios
React DatePicker

Backend
Node.js + Express
MongoDB + Mongoose
JWT Authentication
Google Gemini AI
Cài đặt

Yêu cầu
Node.js >= 16.x
MongoDB (local hoặc MongoDB Atlas)
API Key của Google Gemini AI

Backend Setup

Di chuyển vào thư mục backend:
cd backend

Cài đặt dependencies:
npm install

Tạo file .env từ .env.example:
cp .env.example .env

Cấu hình .env:
env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-travel-planner
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRE=7d
GEMINI_API_KEY=your-gemini-api-key-here
NODE_ENV=development

Chạy backend:
npm run dev
Backend sẽ chạy tại http://localhost:5000
mongod

Frontend Setup

Di chuyển vào thư mục frontend:
cd frontend
Cài đặt dependencies:
npm install
Tạo file .env:
env
VITE_API_URL=http://localhost:5000/api

Chạy frontend:
npm run dev
Frontend sẽ chạy tại http://localhost:3000

Sử dụng

Đăng ký/Đăng nhập tài khoản
Nhấn "Tạo lịch trình" và điền thông tin:
Điểm đến
Ngày đi/ngày về
Số người
Ngân sách
Sở thích 
AI sẽ tạo lịch trình chi tiết
Tùy chỉnh lịch trình theo nhu cầu
Xuất PDF hoặc chia sẻ link với bạn bè

Lấy Gemini API Key

Truy cập [Google AI Studio]https://aistudio.google.com/app/api-keys
Đăng nhập bằng tài khoản Google
Tạo API key mới
Copy API key vào file .env của backend

Tạo tài khoản Admin

Sau khi đăng ký tài khoản thường, bạn có thể chỉnh sửa role trong MongoDB





