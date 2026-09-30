import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'react-toastify';
import { Sparkles, MapPin, Calendar, Users, DollarSign, Loader, Search } from 'lucide-react';
import LocationModal from '../components/LocationModal';
import RecommendedLocationsPanel from '../components/RecommendedLocationsPanel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const INTERESTS = [
  { id: 'check-in', label: 'Check-in' },
  { id: 'dining', label: 'Ẩm thực' },
  { id: 'resort', label: 'Nghỉ dưỡng' },
  { id: 'adventure', label: 'Mạo hiểm' },
  { id: 'culture', label: 'Văn hóa' },
  { id: 'shopping', label: 'Mua sắm' },
  { id: 'nightlife', label: 'Đêm' },
];

const CreateItinerary = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [recommendedLocationId, setRecommendedLocationId] = useState(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [formData, setFormData] = useState({
    destination: '',
    destinationCity: '',
    destinationCoordinates: null,
    startDate: null,
    endDate: null,
    numberOfPeople: 1,
    budget: '',
    interests: [],
  });

  // Autocomplete state
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
      // Clear coordinates và destinationCity khi user nhập tay (bắt buộc phải chọn lại từ dropdown)
      ...(name === 'destination' && { 
        destinationCoordinates: null,
        destinationCity: ''
      }),
    });

    // Clear suggestions khi user xóa hoặc thay đổi text
    if (name === 'destination') {
      if (value.trim().length === 0) {
        setDestinationSuggestions([]);
        setShowSuggestions(false);
      }
    }
  };

  // Handle Enter key để tìm kiếm địa điểm
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.name === 'destination') {
      e.preventDefault(); // Ngăn form submit
      const query = e.target.value.trim();
      if (query.length > 1) {
        searchDestinations(query);
      } else {
        toast.warning('Vui lòng nhập ít nhất 2 ký tự để tìm kiếm');
      }
    }
  };

  // Search destinations using Nominatim
  const searchDestinations = async (query) => {
    try {
      setSearchingPlaces(true);
      const response = await axios.get(`${API_URL}/places/search`, {
        params: { q: query, limit: 5 },
      });
      
      if (response.data.success && response.data.places) {
        setDestinationSuggestions(response.data.places);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching destinations:', error);
    } finally {
      setSearchingPlaces(false);
    }
  };

  // Handle destination selection
  const handleDestinationSelect = (place) => {
    // Backend đã normalize canonical city (bỏ tiền tố "Thành phố", "TP.", "Tỉnh")
    const canonicalCity = place.city || place.name;
    
    setFormData({
      ...formData,
      destination: place.name,
      destinationCity: canonicalCity, // ← Canonical city chuẩn hành chính
      destinationCoordinates: {
        lat: place.lat,
        lng: place.lng,
        osmId: place.osmId,
        osmType: place.osmType,
        placeId: place.placeId,
      },
    });
    setShowSuggestions(false);
    setDestinationSuggestions([]);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDateForApi = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // tháng 1–12
    const day = String(date.getDate()).padStart(2, '0');        // ngày 01–31
    return `${year}-${month}-${day}`; // dạng YYYY-MM-DD
  };

  const handleInterestToggle = (interestId) => {
    setFormData({
      ...formData,
      interests: formData.interests.includes(interestId)
        ? formData.interests.filter((id) => id !== interestId)
        : [...formData.interests, interestId],
    });
  };

  const handleSelectRecommendedLocation = (location) => {
    if (!location?._id) return;
    setSelectedLocationIds((prev) => {
      if (prev.includes(location._id)) return prev;
      return [...prev, location._id];
    });
    toast.success('Đã thêm vào danh sách địa điểm đã chọn');
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();

    const destinationText = String(formData.destination || '').trim();
    const startDate = formData.startDate ? new Date(formData.startDate) : null;
    const endDate = formData.endDate ? new Date(formData.endDate) : null;
    const budgetRaw = formData.budget;
    const budgetNum = typeof budgetRaw === 'number'
      ? budgetRaw
      : parseFloat(String(budgetRaw || '').replace(/,/g, ''));

    if (!destinationText) {
      toast.error('Vui lòng nhập điểm đến');
      return;
    }

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      toast.error('Vui lòng chọn ngày đi và ngày về');
      return;
    }

    if (budgetRaw === '' || budgetRaw === null || budgetRaw === undefined || Number.isNaN(budgetNum)) {
      toast.error('Vui lòng nhập ngân sách');
      return;
    }

    if (!formData.destinationCoordinates) {
      toast.error('Vui lòng chọn điểm đến từ danh sách gợi ý');
      return;
    }

    if (endDate <= startDate) {
      toast.error('Ngày về phải sau ngày đi');
      return;
    }

    setLoading(true);

    try {
      const basePayload = {
        destination: formData.destination,
        destinationCity: formData.destinationCity,
        destinationCoordinates: formData.destinationCoordinates,
        startDate: formatDateForApi(startDate),
        endDate: formatDateForApi(endDate),
        numberOfPeople: parseInt(formData.numberOfPeople),
        budget: budgetNum,
        interests: formData.interests,
      };

      const usePickedLocations = Array.isArray(selectedLocationIds) && selectedLocationIds.length > 0;

      const response = await axios.post(
        `${API_URL}/itinerary/generate`,
        usePickedLocations ? { ...basePayload, locationIds: selectedLocationIds } : basePayload
      );

      toast.success('Tạo lịch trình thành công!');
      navigate(`/itinerary/${response.data.itinerary._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tạo lịch trình. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in-up">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center mb-6">
            <Sparkles className="h-8 w-8 text-primary-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Tạo Lịch Trình Mới</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Destination with Autocomplete */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="h-5 w-5 inline mr-2" />
                Điểm đến
                <span className="ml-2 text-xs text-gray-500 font-normal">(Nhấn Enter để tìm kiếm)</span>
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  name="destination"
                  value={formData.destination}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (destinationSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  placeholder="Nhập tên thành phố hoặc địa điểm, sau đó nhấn Enter để tìm kiếm..."
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                {searchingPlaces && (
                  <Loader className="absolute right-3 top-3 h-5 w-5 animate-spin text-gray-400" />
                )}
                {!searchingPlaces && formData.destination && (
                  <Search className="absolute right-3 top-3 h-5 w-5 text-gray-400" />
                )}
              </div>
              
              {/* Autocomplete Suggestions */}
              {showSuggestions && destinationSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {destinationSuggestions.map((place, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleDestinationSelect(place)}
                      className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-start">
                        <MapPin className="h-5 w-5 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{place.name}</p>
                          <p className="text-sm text-gray-500 truncate">{place.displayName}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="h-5 w-5 inline mr-2" />
                  Ngày đi
                </label>
                <DatePicker
                  selected={formData.startDate}
                  onChange={(date) => setFormData({ ...formData, startDate: date })}
                  selectsStart
                  startDate={formData.startDate}
                  endDate={formData.endDate}
                  minDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholderText="Chọn ngày đi"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="h-5 w-5 inline mr-2" />
                  Ngày về
                </label>
                <DatePicker
                  selected={formData.endDate}
                  onChange={(date) => setFormData({ ...formData, endDate: date })}
                  selectsEnd
                  startDate={formData.startDate}
                  endDate={formData.endDate}
                  minDate={formData.startDate || new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholderText="Chọn ngày về"
                  required
                />
              </div>
            </div>

            {/* Number of People */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="h-5 w-5 inline mr-2" />
                Số người
              </label>
              <input
                type="number"
                name="numberOfPeople"
                value={formData.numberOfPeople}
                onChange={handleChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <DollarSign className="h-5 w-5 inline mr-2" />
                Ngân sách (VNĐ)
              </label>
              <input
                type="number"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                placeholder="Ví dụ: 5000000"
                min="0"
                step="1000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Tổng ngân sách cho toàn bộ chuyến đi
              </p>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sở thích (chọn nhiều)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {INTERESTS.map((interest) => (
                  <button
                    key={interest.id}
                    type="button"
                    onClick={() => handleInterestToggle(interest.id)}
                    className={`p-3 border-2 rounded-lg text-center transition-colors ${
                      formData.interests.includes(interest.id)
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-300 hover:border-primary-300'
                    }`}
                  >
                    <span className="text-2xl block mb-1">{interest.icon}</span>
                    <span className="text-sm font-medium">{interest.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedLocationIds.length > 0 && (
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-primary-800">
                    Đã chọn <span className="font-semibold">{selectedLocationIds.length}</span> địa điểm.
                    AI sẽ tạo lịch trình đầy đủ và ưu tiên đưa các địa điểm này vào.
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLocationIds([])}
                    className="px-3 py-2 text-sm bg-white border border-primary-200 rounded-lg hover:bg-primary-100"
                  >
                    Xóa chọn
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedLocationIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedLocationIds((prev) => prev.filter((x) => x !== id))}
                      className="text-xs px-2 py-1 bg-white border border-primary-200 rounded-full hover:bg-primary-100"
                      title="Bỏ chọn"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <RecommendedLocationsPanel
              title="Gợi ý địa điểm theo điểm đến & sở thích"
              city={formData.destinationCity || formData.destination}
              interests={formData.interests}
              limit={12}
              onSelectLocation={(locationId) => setRecommendedLocationId(locationId)}
              onAddToItinerary={handleSelectRecommendedLocation}
              actionLabel="Chọn địa điểm"
            />

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transform transition-transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Đang tạo lịch trình...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Tạo Lịch Trình với AI
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {recommendedLocationId && (
        <LocationModal
          locationId={recommendedLocationId}
          onClose={() => setRecommendedLocationId(null)}
          onUpdate={() => {}}
          mode="view"
        />
      )}
    </div>
  );
};

export default CreateItinerary;
