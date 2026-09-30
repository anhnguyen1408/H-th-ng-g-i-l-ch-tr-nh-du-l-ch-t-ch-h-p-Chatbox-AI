import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Heart, Star, User, Search, Filter, MapPin, DollarSign, SortAsc } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const Explore = () => {
  const [itineraries, setItineraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    destination: '',
    minBudget: '',
    maxBudget: '',
    sortBy: 'createdAt',
    order: 'desc',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
  });

  useEffect(() => {
    fetchPublicItineraries();
  }, [filters.destination, filters.minBudget, filters.maxBudget, filters.sortBy, filters.order, pagination.page]);

  const fetchPublicItineraries = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      };

      const response = await axios.get(`${API_URL}/itinerary/public`, { params });

      if (response.data.success) {
        setItineraries(response.data.itineraries);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          pages: response.data.pagination.pages,
        }));
      }
    } catch (error) {
      toast.error('Không thể tải danh sách lịch trình');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'sortBy') {
      if (value === 'oldest') {
        setFilters(prev => ({ ...prev, sortBy: 'createdAt', order: 'asc' }));
      } else if (value === 'createdAt') {
        setFilters(prev => ({ ...prev, sortBy: 'createdAt', order: 'desc' }));
      } else if (value === 'likesCount') {
        setFilters(prev => ({ ...prev, sortBy: 'likesCount', order: 'desc' }));
      } else if (value === 'budget') {
        setFilters(prev => ({ ...prev, sortBy: 'budget', order: prev.order || 'desc' }));
      } else {
        setFilters(prev => ({ ...prev, sortBy: value, order: 'desc' }));
      }
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const sortSelectValue =
    filters.sortBy === 'createdAt' && filters.order === 'asc' ? 'oldest' : filters.sortBy;

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Khám phá lịch trình</h1>
          <p className="text-gray-600">Tìm kiếm và lấy cảm hứng từ các lịch trình của cộng đồng</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Bộ lọc</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>Điểm đến</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  name="destination"
                  value={filters.destination}
                  onChange={handleFilterChange}
                  placeholder="Tìm theo điểm đến..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                <DollarSign className="w-4 h-4" />
                <span>Ngân sách tối thiểu</span>
              </label>
              <input
                type="number"
                name="minBudget"
                value={filters.minBudget}
                onChange={handleFilterChange}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                <DollarSign className="w-4 h-4" />
                <span>Ngân sách tối đa</span>
              </label>
              <input
                type="number"
                name="maxBudget"
                value={filters.maxBudget}
                onChange={handleFilterChange}
                placeholder="∞"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-1">
                <SortAsc className="w-4 h-4" />
                <span>Sắp xếp</span>
              </label>
              <select
                name="sortBy"
                value={sortSelectValue}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                <option value="createdAt">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="likesCount">Được yêu thích</option>
                <option value="budget">Ngân sách</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex flex-col justify-center items-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 border-t-primary-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Đang tải lịch trình...</p>
          </div>
        ) : itineraries.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-16 text-center">
            <div className="max-w-md mx-auto">
              <Search className="w-20 h-20 mx-auto text-gray-300 mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Không tìm thấy lịch trình</h3>
              <p className="text-gray-600 mb-6">Thử điều chỉnh bộ lọc hoặc tìm kiếm với từ khóa khác</p>
              <button
                onClick={() => {
                  setFilters({
                    destination: '',
                    minBudget: '',
                    maxBudget: '',
                    sortBy: 'createdAt',
                    order: 'desc',
                  });
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {itineraries.map((itinerary) => (
                <ItineraryCard
                  key={itinerary._id}
                  itinerary={itinerary}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex justify-center items-center space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Trước
                </button>

                {[...Array(pagination.pages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => handlePageChange(i + 1)}
                    className={`px-4 py-2 rounded-lg ${
                      pagination.page === i + 1
                        ? 'bg-primary-600 text-white'
                        : 'bg-white border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}

                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sau
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const ItineraryCard = ({ itinerary, formatCurrency, formatDate }) => {
  const dayCount = Math.ceil((new Date(itinerary.endDate) - new Date(itinerary.startDate)) / (1000 * 60 * 60 * 24));

  return (
    <Link
      to={`/itinerary/${itinerary._id}`}
      className="group bg-white rounded-xl shadow-md overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100"
    >
      {/* Header với gradient */}
      <div className="h-32 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute bottom-4 left-4 right-4">
          <h3 className="text-xl font-bold text-white mb-1 line-clamp-1 drop-shadow-md">
            {itinerary.title}
          </h3>
          <div className="flex items-center text-white/90 text-sm">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            <span className="font-medium">{itinerary.destination}</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3 pb-3 border-b border-gray-100">
          <div className="flex items-center space-x-1">
            <span className="font-medium">{dayCount} ngày</span>
          </div>
          <span className="font-bold text-primary-600">
            {formatCurrency(itinerary.totalEstimatedCost)}
          </span>
        </div>

        {itinerary.averageRating > 0 && (
          <div className="flex items-center mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= Math.round(itinerary.averageRating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-gray-200 text-gray-200'
                }`}
              />
            ))}
            <span className="ml-2 text-sm text-gray-600 font-medium">
              {itinerary.averageRating.toFixed(1)} ({itinerary.reviewsCount || 0})
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-3">
          <div className="flex items-center space-x-1.5">
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span className="text-gray-700 font-medium">{itinerary.likesCount || 0}</span>
          </div>

          {itinerary.userId && (
            <div className="flex items-center space-x-2">
              {itinerary.userId.avatar ? (
                <img
                  src={itinerary.userId.avatar}
                  alt={itinerary.userId.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              <span className="text-gray-700 text-xs font-medium">{itinerary.userId.name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default Explore;
