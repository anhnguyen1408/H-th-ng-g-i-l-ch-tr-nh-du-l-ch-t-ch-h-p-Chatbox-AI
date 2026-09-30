import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [publicItineraries, setPublicItineraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [selectedItineraryId, setSelectedItineraryId] = useState(null);
  const [cloneStartDate, setCloneStartDate] = useState(null);

  useEffect(() => {
    fetchPublicItineraries();
  }, []);

  const fetchPublicItineraries = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/itinerary/public`, {
        params: {
          page: 1,
          limit: 6,
          sortBy: 'createdAt',
          order: 'desc',
        },
      });
      if (response.data.success) {
        setPublicItineraries(response.data.itineraries);
      }
    } catch (error) {
      console.error('Error fetching public itineraries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItinerary = (itineraryId) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    // Mở modal chọn ngày
    setSelectedItineraryId(itineraryId);
    setCloneStartDate(null);
    setCloneModalOpen(true);
  };

  const handleCloneConfirm = async () => {
    if (!cloneStartDate) {
      alert('Vui lòng chọn ngày bắt đầu');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/itinerary/clone/${selectedItineraryId}`,
        { startDate: cloneStartDate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        alert('Đã lưu lịch trình vào tài khoản của bạn!');
        setCloneModalOpen(false);
        navigate(`/itinerary/${response.data.itinerary._id}`);
      }
    } catch (error) {
      console.error('Error saving itinerary:', error);
      alert(error.response?.data?.message || 'Có lỗi xảy ra khi lưu lịch trình');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg?auto=compress&cs=tinysrgb&w=1600"
            alt="Cảnh du lịch"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-700/80 to-primary-500/70" />
        </div>
        <div className="relative py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 md:grid-cols-2 items-center animate-fade-in-up">
              <div className="text-left md:text-left text-white">
                <p className="inline-flex items-center px-4 py-1 rounded-full bg-white/10 border border-white/20 text-sm mb-4">
                  Trợ lý AI lập kế hoạch du lịch
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                  Lập Kế Hoạch Du Lịch
                  <span className="block text-primary-100">Thông Minh với AI</span>
                </h1>
                <p className="text-lg md:text-xl mb-8 text-primary-100 max-w-xl">
                  Nhập điểm đến, ngày đi và sở thích, hệ thống sẽ tự động gợi ý lịch trình chi tiết,
                  chi phí dự kiến và gợi ý ăn uống, vui chơi cho bạn.
                </p>
                {isAuthenticated ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <Link
                      to="/create"
                      className="inline-flex items-center justify-center bg-white text-primary-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors transform hover:scale-105 active:scale-95 shadow-lg"
                    >
                      Tạo Lịch Trình Ngay
                    </Link>
                    <Link
                      to="/dashboard"
                      className="inline-flex items-center justify-center border border-white/70 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors transform hover:scale-105 active:scale-95"
                    >
                      Xem lịch trình của tôi
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    <Link
                      to="/register"
                      className="inline-flex items-center justify-center bg-white text-primary-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors transform hover:scale-105 active:scale-95 shadow-lg"
                    >
                      Bắt Đầu Miễn Phí
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center bg-primary-500/90 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-primary-400 transition-colors border border-white/70 transform hover:scale-105 active:scale-95"
                    >
                      Đăng Nhập
                    </Link>
                  </div>
                )}
              </div>
              <div className="hidden md:block">
                <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-6 space-y-4 transform transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide">
                        Hành trình mẫu
                      </p>
                      <p className="text-lg font-semibold text-gray-900">
                        3 ngày khám phá Đà Nẵng
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <span className="font-medium text-gray-600">Địa điểm:</span> Ngũ Hành Sơn, Bà Nà Hills, Cầu Rồng
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Thời gian:</span> 3 ngày 2 đêm • 2 người
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Ngân sách:</span> ~5.000.000đ
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tùy chỉnh:</span> Cá nhân hóa theo sở thích của bạn
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gradient-to-b from-slate-50 via-white to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Tính Năng Nổi Bật
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              title="AI Thông Minh"
              description="Sử dụng công nghệ AI tiên tiến để tạo lịch trình phù hợp với sở thích và ngân sách của bạn"
            />
            <FeatureCard
              title="Điểm Tham Quan"
              description="Khám phá các địa điểm du lịch nổi tiếng và ẩn danh được đề xuất bởi AI"
            />
            <FeatureCard
              title="Gợi Ý Ẩm Thực"
              description="Tìm kiếm các nhà hàng và món ăn đặc sản phù hợp với khẩu vị của bạn"
            />
            <FeatureCard
              title="Khách Sạn & Lưu Trú"
              description="Đề xuất khách sạn và homestay phù hợp với ngân sách và vị trí"
            />
            <FeatureCard
              title="Tính Chi Phí"
              description="Ước tính chi phí chi tiết cho toàn bộ chuyến đi của bạn"
            />
            <FeatureCard
              title="Tùy Chỉnh Linh Hoạt"
              description="Dễ dàng chỉnh sửa và điều chỉnh lịch trình theo nhu cầu cá nhân"
            />
          </div>
        </div>
      </section>

      {/* Public Itineraries Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">
              Khám Phá Lịch Trình Từ Cộng Đồng
            </h2>
            <p className="text-lg text-gray-600">
              Tham khảo và lưu các lịch trình du lịch được chia sẻ bởi cộng đồng
            </p>
            <div className="mt-4">
              <Link
                to="/explore"
                className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
              >
                Xem tất cả
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600">Đang tải lịch trình...</p>
            </div>
          ) : publicItineraries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicItineraries.map((itinerary) => (
                <ItineraryCard
                  key={itinerary._id}
                  itinerary={itinerary}
                  onSave={handleSaveItinerary}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Chưa có lịch trình nào được chia sẻ</p>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Cách Thức Hoạt Động
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StepCard
              number="1"
              title="Nhập Thông Tin"
              description="Cho chúng tôi biết điểm đến, ngày đi/ về, số người, ngân sách và sở thích của bạn"
            />
            <StepCard
              number="2"
              title="AI Tạo Lịch Trình"
              description="Trí tuệ nhân tạo sẽ phân tích và tạo lịch trình chi tiết phù hợp nhất cho bạn"
            />
            <StepCard
              number="3"
              title="Tùy Chỉnh & Chia Sẻ"
              description="Xem lại, chỉnh sửa và chia sẻ lịch trình với bạn bè hoặc xuất ra PDF"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-16 bg-primary-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Sẵn Sàng Bắt Đầu Chuyến Đi Của Bạn?
            </h2>
            <p className="text-xl mb-8 text-primary-100">
              Đăng ký miễn phí và tạo lịch trình du lịch đầu tiên của bạn ngay hôm nay
            </p>
            <Link
              to="/register"
              className="inline-block bg-white text-primary-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Đăng Ký Ngay
            </Link>
          </div>
        </section>
      )}

      {/* Clone Modal */}
      {cloneModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Chọn ngày cho lịch trình</h3>
              <button
                onClick={() => setCloneModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            
            <p className="text-gray-600 mb-6">
              Vui lòng chọn ngày đi và ngày về cho lịch trình của bạn
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chọn ngày bắt đầu chuyến đi
                </label>
                <DatePicker
                  selected={cloneStartDate}
                  onChange={(date) => setCloneStartDate(date)}
                  minDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholderText="Chọn ngày bắt đầu"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ Số ngày của lịch trình sẽ giữ nguyên như bản gốc. Chỉ cần chọn ngày bắt đầu.
                </p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCloneConfirm}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold transition-colors"
              >
                Xác nhận
              </button>
              <button
                onClick={() => setCloneModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const ItineraryCard = ({ itinerary, onSave }) => {
  const totalDays = itinerary.days?.length || 0;
  const totalActivities = itinerary.days?.reduce((sum, day) => sum + (day.activities?.length || 0), 0) || 0;
  
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all transform hover:-translate-y-1 overflow-hidden">
      {/* Header với ảnh nền */}
      <div className="relative h-40 bg-gradient-to-r from-primary-500 to-primary-600">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative p-4 h-full flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold text-white line-clamp-2">
              {itinerary.title}
            </h3>
          </div>
          <div className="text-white/90 text-sm">
            {itinerary.destination}
          </div>
        </div>
      </div>

      {/* Nội dung */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <span className="font-medium">{totalDays}</span> ngày
          </div>
          <div>
            <span className="font-medium">{itinerary.numberOfPeople}</span> người
          </div>
        </div>

        <div className="text-sm text-gray-600">
          <span className="font-medium">{itinerary.totalEstimatedCost?.toLocaleString('vi-VN')}</span>đ
        </div>

        {itinerary.interests && itinerary.interests.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {itinerary.interests.slice(0, 3).map((interest, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
              >
                {interest}
              </span>
            ))}
            {itinerary.interests.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{itinerary.interests.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500">
          <span>{totalActivities} hoạt động</span>
          {itinerary.userId && (
            <span className="ml-2">• Bởi {itinerary.userId.name}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Link
            to={`/itinerary/${itinerary._id}`}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Xem chi tiết
          </Link>
          <button
            onClick={() => onSave(itinerary._id)}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Lưu lịch trình
          </button>
        </div>
      </div>
    </div>
  );
};

const FeatureCard = ({ title, description }) => (
  <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-all transform hover:-translate-y-1">
    <h3 className="text-xl font-semibold mb-3 text-gray-900">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

const StepCard = ({ number, title, description }) => (
  <div className="text-center transition-transform duration-200 hover:-translate-y-1">
    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 text-white rounded-full text-2xl font-bold mb-4">
      {number}
    </div>
    <h3 className="text-xl font-semibold mb-2 text-gray-900">{title}</h3>
    <p className="text-gray-600">{description}</p>
  </div>
);

export default Home;



