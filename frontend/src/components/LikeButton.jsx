import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Heart } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const LikeButton = ({ itinerary, currentUserId }) => {
  const [liked, setLiked] = useState(
    itinerary.likes?.includes(currentUserId) || false
  );
  const [likesCount, setLikesCount] = useState(itinerary.likesCount || 0);
  const [loading, setLoading] = useState(false);

  const handleToggleLike = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/itinerary/${itinerary._id}/like`);

      if (response.data.success) {
        setLiked(response.data.liked);
        setLikesCount(response.data.likesCount);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể thích lịch trình');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggleLike}
      disabled={loading}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
        liked
          ? 'bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-200'
          : 'bg-white text-gray-600 hover:bg-gray-50 border-2 border-gray-200'
      } disabled:opacity-50`}
    >
      <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
      <span className="font-semibold">{likesCount}</span>
    </button>
  );
};

export default LikeButton;
