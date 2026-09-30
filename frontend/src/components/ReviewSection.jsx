import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Star, Trash2, Edit2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ReviewSection = ({ itinerary, currentUserId, onReviewUpdate }) => {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const userReview = itinerary.reviews?.find(r => r.userId._id === currentUserId || r.userId === currentUserId);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/itinerary/${itinerary._id}/review`,
        { rating, comment }
      );

      if (response.data.success) {
        toast.success(userReview ? 'Đã cập nhật đánh giá' : 'Đã thêm đánh giá');
        setShowReviewForm(false);
        if (onReviewUpdate) onReviewUpdate();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể gửi đánh giá');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa đánh giá?')) return;

    try {
      const response = await axios.delete(`${API_URL}/itinerary/${itinerary._id}/review`);
      
      if (response.data.success) {
        toast.success('Đã xóa đánh giá');
        if (onReviewUpdate) onReviewUpdate();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa đánh giá');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4">
        Đánh giá ({itinerary.reviewsCount || 0})
      </h3>

      {itinerary.averageRating > 0 && (
        <div className="flex items-center mb-4">
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-5 h-5 ${
                  star <= Math.round(itinerary.averageRating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-gray-200 text-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="ml-3 text-lg font-semibold text-gray-900">
            {itinerary.averageRating.toFixed(1)}
          </span>
        </div>
      )}

      {!userReview && !showReviewForm && (
        <button
          onClick={() => setShowReviewForm(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors mb-4"
        >
          Viết đánh giá
        </button>
      )}

      {userReview && !showReviewForm && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${star <= userReview.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
                />
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setRating(userReview.rating);
                  setComment(userReview.comment || '');
                  setShowReviewForm(true);
                }}
                className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                <Edit2 className="w-4 h-4" />
                <span>Sửa</span>
              </button>
              <button
                onClick={handleDeleteReview}
                className="flex items-center space-x-1 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa</span>
              </button>
            </div>
          </div>
          {userReview.comment && <p className="text-gray-700 mt-2">{userReview.comment}</p>}
        </div>
      )}

      {showReviewForm && (
        <form onSubmit={handleSubmitReview} className="mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Đánh giá của bạn
            </label>
            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`focus:outline-none transition-transform hover:scale-110 ${
                    star <= rating ? '' : ''
                  }`}
                >
                  <Star className={`w-8 h-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nhận xét (tùy chọn)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Chia sẻ trải nghiệm của bạn..."
            />
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Đang gửi...' : 'Gửi đánh giá'}
            </button>
            <button
              type="button"
              onClick={() => setShowReviewForm(false)}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {itinerary.reviews && itinerary.reviews.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900">Tất cả đánh giá</h4>
          {itinerary.reviews.map((review) => (
            <div key={review._id} className="border-b border-gray-200 pb-4 last:border-b-0">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {review.userId?.name || 'Người dùng'}
                  </p>
                  <div className="flex items-center mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
                      />
                    ))}
                  </div>
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
              {review.comment && <p className="text-gray-700 text-sm">{review.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewSection;
