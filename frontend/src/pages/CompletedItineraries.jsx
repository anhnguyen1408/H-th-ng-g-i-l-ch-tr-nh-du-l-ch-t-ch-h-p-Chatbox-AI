import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { CheckCircle, MapPin, Calendar, Users, Eye, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CompletedItineraries = () => {
  const [itineraries, setItineraries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompletedItineraries();
  }, []);

  const fetchCompletedItineraries = async () => {
    try {
      const response = await axios.get(`${API_URL}/itinerary/completed`);
      if (response.data.success) {
        setItineraries(response.data.itineraries || []);
      } else {
        toast.error(response.data.message || 'Không thể tải danh sách lịch trình đã hoàn thành');
      }
    } catch (error) {
      console.error('Error fetching completed itineraries:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Không thể tải danh sách lịch trình đã hoàn thành';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lịch Trình Đã Hoàn Thành</h1>
          <p className="text-gray-600">
            Xem lại những chuyến đi tuyệt vời bạn đã hoàn thành
          </p>
        </div>

        {itineraries.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-lg">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Chưa có lịch trình đã hoàn thành
              </h3>
              <p className="text-gray-600 mb-6">
                Bắt đầu một lịch trình và hoàn thành nó để xem ở đây!
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Xem Lịch Trình Của Tôi
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {itineraries.map((itinerary) => (
              <CompletedItineraryCard key={itinerary._id} itinerary={itinerary} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CompletedItineraryCard = ({ itinerary }) => {
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

  const completedDate = itinerary.completedAt
    ? new Date(itinerary.completedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  return (
    <div className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-transform duration-200 transform hover:-translate-y-1 hover:scale-105 overflow-hidden relative">
      {/* Header với badge hoàn thành */}
      <div className="h-28 bg-gradient-to-r from-green-500 to-green-700 relative">
        <div className="absolute top-2 right-2 z-10 px-3 py-1 bg-white/90 rounded-full">
          <div className="flex items-center gap-1 text-green-700 text-sm font-medium">
            <CheckCircle className="h-4 w-4" />
            <span>Đã hoàn thành</span>
          </div>
        </div>

        <div className="absolute bottom-3 left-4 right-16 text-white">
          <p className="text-xs text-green-100 mb-1">
            <span className="truncate">{itinerary.destination}</span>
          </p>
          <h3 className="text-lg font-semibold truncate">{itinerary.title}</h3>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{itinerary.numberOfPeople} người</span>
          </div>
          <div>
            <span className="font-medium text-gray-800">{formatCurrency(itinerary.totalEstimatedCost || 0)}</span>
          </div>
        </div>
        {completedDate && (
          <div className="text-xs text-gray-500">
            Hoàn thành: {completedDate}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 pt-2 border-t border-gray-100 bg-gray-50/60">
        <Link
          to={`/itinerary/${itinerary._id}`}
          className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          <span>Xem chi tiết</span>
        </Link>
      </div>
    </div>
  );
};

export default CompletedItineraries;

