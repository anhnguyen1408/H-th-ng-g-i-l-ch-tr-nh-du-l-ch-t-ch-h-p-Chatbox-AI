import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, MapPin, Calendar, DollarSign, Users } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ItineraryModal = ({ itineraryId, onClose }) => {
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (itineraryId) {
      fetchItinerary();
    }
  }, [itineraryId]);

  const fetchItinerary = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/itineraries/${itineraryId}`);
      setItinerary(response.data.itinerary);
    } catch (error) {
      toast.error('Không thể tải lịch trình');
      onClose();
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-lg">
          <h2 className="text-2xl font-bold">Chi tiết lịch trình</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Info */}
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">{itinerary.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center text-gray-700">
                <MapPin className="h-5 w-5 mr-2 text-primary-600" />
                <span>{itinerary.destination}</span>
              </div>
              <div className="flex items-center text-gray-700">
                <Calendar className="h-5 w-5 mr-2 text-primary-600" />
                <span>
                  {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
                </span>
              </div>
              <div className="flex items-center text-gray-700">
                <Users className="h-5 w-5 mr-2 text-primary-600" />
                <span>{itinerary.numberOfPeople} người</span>
              </div>
              <div className="flex items-center text-gray-700">
                <DollarSign className="h-5 w-5 mr-2 text-primary-600" />
                <span className="font-semibold">
                  {formatCurrency(itinerary.totalEstimatedCost || 0)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Người tạo: <span className="font-medium">{itinerary.userId?.name}</span>
              </span>
              <span className="text-sm text-gray-600">
                Ngày tạo: <span className="font-medium">{new Date(itinerary.createdAt).toLocaleString('vi-VN')}</span>
              </span>
              {itinerary.isShared && (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  Đang chia sẻ
                </span>
              )}
            </div>
          </div>

          {/* Days */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900">Lịch trình chi tiết</h3>
            {itinerary.days?.map((day, dayIndex) => (
              <div key={dayIndex} className="border rounded-lg overflow-hidden">
                <div className="bg-primary-600 text-white px-4 py-3">
                  <h4 className="font-bold">
                    Ngày {dayIndex + 1} - {formatDate(day.date)}
                  </h4>
                  <p className="text-sm text-primary-100">
                    Chi phí: {formatCurrency(day.estimatedCost || 0)}
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {day.activities?.map((activity, actIndex) => (
                    <div
                      key={actIndex}
                      className="flex items-start p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-semibold text-primary-600">
                            {activity.time}
                          </span>
                          <h5 className="font-semibold text-gray-900">{activity.name}</h5>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {activity.description}
                        </p>
                        {activity.location?.address && (
                          <p className="text-xs text-gray-500 flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {activity.location.address}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 text-right">
                        <span className="text-sm font-semibold text-primary-600">
                          {formatCurrency(activity.cost || 0)}
                        </span>
                        <p className="text-xs text-gray-500">{activity.duration} phút</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Reviews */}
          {itinerary.reviews && itinerary.reviews.length > 0 && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Đánh giá</h3>
              <div className="space-y-3">
                {itinerary.reviews.map((review, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{review.userId?.name || 'Anonymous'}</span>
                      <span className="text-yellow-500">{'⭐'.repeat(review.rating)}</span>
                    </div>
                    {review.comment && (
                      <p className="text-gray-600 text-sm">{review.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItineraryModal;
