import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Globe, Lock, Trash2, Eye, MapPin, Play, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const Dashboard = () => {
  const [itineraries, setItineraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' or 'favorites'

  useEffect(() => {
    fetchItineraries();
  }, []);

  const fetchItineraries = async () => {
    try {
      const response = await axios.get(`${API_URL}/itinerary/my-itineraries`);
      setItineraries(response.data.itineraries);
    } catch (error) {
      toast.error('Không thể tải danh sách lịch trình');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa lịch trình này?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/itinerary/${id}`);
      toast.success('Xóa lịch trình thành công');
      fetchItineraries();
    } catch (error) {
      toast.error('Không thể xóa lịch trình');
    }
  };

  const handleToggleFavorite = async (id) => {
    try {
      const response = await axios.post(`${API_URL}/itinerary/${id}/favorite`);
      toast.success(response.data.message);
      fetchItineraries();
    } catch (error) {
      toast.error('Không thể cập nhật yêu thích');
    }
  };

  const handleTogglePublic = async (id, currentStatus) => {
    try {
      await axios.put(`${API_URL}/itinerary/${id}`, { isPublic: !currentStatus });
      toast.success(currentStatus ? 'Đã chuyển sang riêng tư' : 'Đã công khai lịch trình');
      fetchItineraries();
    } catch (error) {
      toast.error('Không thể cập nhật trạng thái');
    }
  };

  const filteredItineraries = filter === 'favorites' 
    ? itineraries.filter(it => it.isFavorite)
    : itineraries;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
        <p className="text-gray-600 font-medium">Đang tải lịch trình...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lịch Trình Của Tôi</h1>
            <p className="mt-1 text-sm text-gray-500">
              Danh sách các chuyến đi bạn đã tạo với trợ lý AI, dễ dàng xem lại và chỉnh sửa.
            </p>
          </div>
          <Link
            to="/create"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors transform hover:scale-105 active:scale-95 shadow-sm"
          >
            + Tạo Lịch Trình Mới
          </Link>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Tất cả ({itineraries.length})
          </button>
          <button
            onClick={() => setFilter('favorites')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              filter === 'favorites'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Yêu thích ({itineraries.filter(it => it.isFavorite).length})
          </button>
          <Link
            to="/completed"
            className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 bg-white text-gray-700 hover:bg-gray-100"
          >
            <CheckCircle className="h-4 w-4" />
            Đã hoàn thành ({itineraries.filter(it => it.status === 'completed').length})
          </Link>
        </div>

        {filteredItineraries.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-lg">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {filter === 'favorites' 
                  ? 'Chưa có lịch trình yêu thích' 
                  : 'Chưa có lịch trình nào'}
              </h3>
              <p className="text-gray-600 mb-6">
                {filter === 'favorites'
                  ? 'Hãy đánh dấu các lịch trình yêu thích để dễ dàng tìm lại'
                  : 'Bắt đầu tạo lịch trình đầu tiên với AI'}
              </p>
              {filter === 'all' && (
                <Link
                  to="/create"
                  className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  + Tạo Lịch Trình Đầu Tiên
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            {filteredItineraries.map((itinerary) => (
              <ItineraryCard
                key={itinerary._id}
                itinerary={itinerary}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                onTogglePublic={handleTogglePublic}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ItineraryCard = ({ itinerary, onDelete, onToggleFavorite, onTogglePublic }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };
  const nightsText = `${Math.max(1, ((new Date(itinerary.endDate) - new Date(itinerary.startDate)) / (1000 * 60 * 60 * 24)))} đêm`;

  return (
    <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-transform duration-200 transform hover:-translate-y-1 hover:scale-105 overflow-hidden relative">
      {/* Header giả lập ảnh / banner */}
      <div className="h-28 bg-gradient-to-r from-primary-500 to-primary-700 relative">
        {/* Nút yêu thích ở góc phải */}
        <button
          onClick={() => onToggleFavorite(itinerary._id)}
          className={`absolute top-2 right-2 z-10 px-3 py-1 rounded-full transition-colors text-sm font-medium ${
            itinerary.isFavorite
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-white/90 text-gray-700 hover:bg-white'
          }`}
          title={itinerary.isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
        >
          {itinerary.isFavorite ? 'Đã thích' : 'Thích'}
        </button>

        <div className="absolute bottom-3 left-4 right-16 text-white">
          <p className="text-xs text-primary-100 mb-1">
            <span className="truncate">{itinerary.destination}</span>
          </p>
          <h3 className="text-lg font-semibold truncate">{itinerary.title}</h3>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <span className="font-medium">Thời gian:</span> {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <span className="font-medium">Số người:</span> {itinerary.numberOfPeople}
          </div>
          <div>
            <span className="font-medium text-gray-800">{formatCurrency(itinerary.totalEstimatedCost || 0)}</span>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4 pt-2 border-t border-gray-100 bg-gray-50/60 space-y-2">
        {/* Status badge */}
        {itinerary.status && (
          <div className="mb-2">
            {itinerary.status === 'in_progress' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                <Play className="h-3 w-3" />
                Đang thực hiện
              </span>
            )}
            {itinerary.status === 'completed' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                <CheckCircle className="h-3 w-3" />
                Đã hoàn thành
              </span>
            )}
            {itinerary.status === 'draft' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                Nháp
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Link
            to={`/itinerary/${itinerary._id}`}
            className="flex-1 inline-flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Eye className="w-4 h-4" />
            <span>Xem chi tiết</span>
          </Link>
          {itinerary.status === 'draft' && (
            <Link
              to={`/active/${itinerary._id}`}
              className="inline-flex items-center justify-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Bắt đầu lịch trình"
            >
              <Play className="w-4 h-4" />
            </Link>
          )}
          {itinerary.status === 'in_progress' && (
            <Link
              to="/active"
              className="inline-flex items-center justify-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="Tiếp tục lịch trình"
            >
              <Play className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={() => onDelete(itinerary._id)}
            className="inline-flex items-center justify-center space-x-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-100"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">Xóa</span>
          </button>
        </div>
        <button
          onClick={() => onTogglePublic(itinerary._id, itinerary.isPublic)}
          className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            itinerary.isPublic
              ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          {itinerary.isPublic ? (
            <>
              <Globe className="w-4 h-4" />
              <span>Công khai</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Riêng tư</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;



