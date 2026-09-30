import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const formatStars = (rating) => {
  const r = Number.isFinite(rating) ? rating : 0;
  return r > 0 ? r.toFixed(1) : '0.0';
};

const safeArr = (x) => (Array.isArray(x) ? x : []);

const RecommendedLocationsPanel = ({
  title = 'Gợi ý địa điểm',
  city,
  interests = [],
  limit = 12,
  candidateLimit = 200,
  onSelectLocation,
  onAddToItinerary,
  actionLabel = 'Thêm vào lịch trình',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const interestsCsv = useMemo(() => safeArr(interests).filter(Boolean).join(','), [interests]);
  const cityValue = typeof city === 'string' ? city.trim() : '';

  const fetchRecommendations = useCallback(async () => {
    if (!cityValue) {
      setItems([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.get(`${API_URL}/recommendations/locations`, {
        params: {
          city: cityValue,
          interests: interestsCsv,
          limit,
          candidateLimit,
          debug: false,
        },
      });

      if (response.data?.success) {
        const recs = Array.isArray(response.data.recommendations) ? response.data.recommendations : [];
        setItems(recs);
      } else {
        setItems([]);
        setError(response.data?.message || 'Không thể lấy gợi ý địa điểm');
      }
    } catch (e) {
      setItems([]);
      setError(e?.response?.data?.message || e?.message || 'Không thể lấy gợi ý địa điểm');
    } finally {
      setLoading(false);
    }
  }, [candidateLimit, cityValue, interestsCsv, limit]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            Thành phố: <span className="font-medium">{cityValue || '—'}</span>
            {interestsCsv ? (
              <>
                {' '}| Sở thích: <span className="font-medium">{interestsCsv}</span>
              </>
            ) : null}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRecommendations}
          disabled={loading || !cityValue}
          className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {!cityValue && (
        <div className="text-sm text-gray-500">
          Nhập/chọn thành phố để xem gợi ý địa điểm.
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {cityValue && !loading && !error && items.length === 0 && (
        <div className="text-sm text-gray-500">Không có gợi ý phù hợp.</div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((loc) => {
            const img = Array.isArray(loc.images) && loc.images.length > 0 ? loc.images[0] : null;
            const imageUrl =
              (typeof loc.primaryImage === 'string' && loc.primaryImage ? loc.primaryImage : null) ||
              (typeof img === 'string' ? img : img?.url);
            const canAdd = typeof onAddToItinerary === 'function';
            const isActionLoading = actionLoadingId === loc._id;
            return (
              <div
                key={loc._id}
                className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-28 bg-gray-100 overflow-hidden">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={loc.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>

                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{loc.name}</h3>
                    <span className="text-xs text-gray-500">#{loc.rank}</span>
                  </div>

                  <div className="mt-1 text-xs text-gray-600 line-clamp-2">{loc.address || ''}</div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-yellow-600">
                      ⭐ {formatStars(loc.rating)} ({loc.ratingCount || 0})
                    </div>
                    <div className="text-xs text-gray-500">Score: {(Number.isFinite(loc.score) ? loc.score : 0).toFixed(3)}</div>
                  </div>

                  <div className="mt-3">
                    <div className="grid grid-cols-1 gap-2">
                      {canAdd ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setActionLoadingId(loc._id);
                              await onAddToItinerary(loc);
                            } finally {
                              setActionLoadingId(null);
                            }
                          }}
                          disabled={loading || isActionLoading}
                          className="w-full px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
                        >
                          {isActionLoading ? 'Đang thêm...' : actionLabel}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={async () => {
                          onSelectLocation && onSelectLocation(loc._id);
                        }}
                        className="w-full px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800"
                      >
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecommendedLocationsPanel;
