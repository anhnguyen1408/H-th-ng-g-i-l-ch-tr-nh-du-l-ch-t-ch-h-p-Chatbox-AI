import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, MapPin, Save, Trash2, Upload, XCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Danh sách tags gợi ý
const SUGGESTED_TAGS = [
  'du lịch', 'văn hóa', 'ẩm thực', 'lịch sử', 'thiên nhiên',
  'biển', 'núi', 'thành phố', 'làng quê', 'miền bắc', 'miền nam',
  'miền trung', 'gia đình', 'cặp đôi', 'bạn bè', 'một mình',
  'sang trọng', 'bình dân', 'phiêu lưu', 'thư giãn', 'mua sắm',
  'nghệ thuật', 'kiến trúc', 'tôn giáo', 'lễ hội', 'thể thao'
];

const LocationModal = ({ locationId, onClose, onUpdate, mode = 'view' }) => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(mode === 'create');
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'attraction',
    city: '',
    country: '',
    address: '',
    coordinates: { lat: 0, lng: 0 },
    description: '',
    rating: 0,
    priceRange: 'mid-range',
    averageCost: 0,
    openingHours: '',
    contact: { phone: '', website: '', email: '' },
    images: [],
    tags: [],
    isActive: true,
    isVerified: false,
    isPublic: true,
  });

  useEffect(() => {
    if (mode === 'create') {
      setLoading(false);
      setEditing(true);
    } else if (locationId) {
      fetchLocation();
    }
  }, [locationId, mode]);

  const fetchLocation = async () => {
    try {
      let locationData = null;

      try {
        const response = await axios.get(`${API_URL}/admin/locations/${locationId}`);
        locationData = response.data.location;
      } catch (adminErr) {
        const status = adminErr?.response?.status;
        if (status === 401 || status === 403 || status === 404) {
          const response = await axios.get(`${API_URL}/locations/${locationId}`);
          locationData = response.data.location;
        } else {
          throw adminErr;
        }
      }

      setLocation(locationData);

      setFormData({
        name: locationData?.name || '',
        type: locationData?.type || 'attraction',
        city: locationData?.city || '',
        country: locationData?.country || '',
        address: locationData?.address || '',
        coordinates: locationData?.coordinates || { lat: 0, lng: 0 },
        description: locationData?.description || '',
        rating: locationData?.rating || 0,
        priceRange: locationData?.priceRange || 'mid-range',
        averageCost: locationData?.averageCost || 0,
        openingHours: locationData?.openingHours || '',
        contact: locationData?.contact || { phone: '', website: '', email: '' },
        images: locationData?.images || [],
        tags: locationData?.tags || [],
        isActive: locationData?.isActive !== undefined ? locationData.isActive : true,
        isVerified: locationData?.isVerified || false,
        isPublic: locationData?.isPublic !== undefined ? locationData.isPublic : true,
      });
    } catch (error) {
      toast.error('Không thể tải thông tin địa điểm');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: type === 'number' ? parseFloat(value) || 0 : value,
        },
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) || 0 : value,
      }));
    }
  };

  // Resize image to standard size (800x600)
  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls = [];
      
      for (const file of files) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} không phải là file hình ảnh`);
          continue;
        }

        // Validate file size (max 5MB original)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} quá lớn (tối đa 5MB)`);
          continue;
        }

        // Resize image
        const resizedBlob = await resizeImage(file);
        const resizedFile = new File([resizedBlob], file.name, { type: 'image/jpeg' });

        // Upload to server (assuming you have an upload endpoint)
        const formData = new FormData();
        formData.append('image', resizedFile);

        try {
          // TODO: Replace with your actual upload endpoint
          // For now, we'll convert to base64 as a temporary solution
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(resizedFile);
          });
          
          const base64Url = await base64Promise;
          uploadedUrls.push(base64Url);
        } catch (uploadError) {
          toast.error(`Lỗi upload ${file.name}`);
        }
      }

      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, ...uploadedUrls]
        }));
        toast.success(`Đã thêm ${uploadedUrls.length} ảnh`);
      }
    } catch (error) {
      toast.error('Lỗi xử lý ảnh');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleAddTag = (tag) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const getFilteredTagSuggestions = () => {
    if (!tagInput) return SUGGESTED_TAGS;
    return SUGGESTED_TAGS.filter(tag => 
      tag.toLowerCase().includes(tagInput.toLowerCase()) &&
      !formData.tags.includes(tag)
    );
  };

  const handleSave = async () => {
    try {
      if (!formData.name || !formData.city || !formData.country || !formData.address) {
        toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
        return;
      }

      if (mode === 'create') {
        await axios.post(`${API_URL}/admin/locations`, formData);
        toast.success('Tạo địa điểm thành công');
      } else {
        await axios.put(`${API_URL}/admin/locations/${locationId}`, formData);
        toast.success('Cập nhật địa điểm thành công');
      }
      
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể lưu địa điểm');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa địa điểm này?')) return;

    try {
      await axios.delete(`${API_URL}/admin/locations/${locationId}`);
      toast.success('Đã xóa địa điểm');
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      toast.error('Không thể xóa địa điểm');
    }
  };

  const handleDeleteCommunityImage = async (imageId) => {
    if (!window.confirm('Xóa ảnh này khỏi cộng đồng?')) return;

    try {
      await axios.delete(`${API_URL}/admin/locations/${locationId}/community-images/${imageId}`);
      toast.success('Đã xóa ảnh');
      fetchLocation(); // Refresh
    } catch (error) {
      toast.error('Không thể xóa ảnh');
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Xóa đánh giá này?')) return;

    try {
      await axios.delete(`${API_URL}/admin/locations/${locationId}/reviews/${reviewId}`);
      toast.success('Đã xóa đánh giá');
      fetchLocation(); // Refresh
    } catch (error) {
      toast.error('Không thể xóa đánh giá');
    }
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <MapPin className="h-6 w-6 text-primary-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'create' ? 'Tạo địa điểm mới' : editing ? 'Chỉnh sửa địa điểm' : 'Chi tiết địa điểm'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tên địa điểm */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên địa điểm <span className="text-red-500">*</span>
              </label>
              {editing ? (
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              ) : (
                <p className="text-gray-900">{location?.name}</p>
              )}
            </div>

            {/* Loại */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Loại địa điểm <span className="text-red-500">*</span>
              </label>
              {editing ? (
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="attraction">Điểm tham quan</option>
                  <option value="restaurant">Nhà hàng</option>
                  <option value="hotel">Khách sạn</option>
                  <option value="activity">Hoạt động</option>
                </select>
              ) : (
                <p className="text-gray-900">
                  {location?.type === 'attraction' && 'Điểm tham quan'}
                  {location?.type === 'restaurant' && 'Nhà hàng'}
                  {location?.type === 'hotel' && 'Khách sạn'}
                  {location?.type === 'activity' && 'Hoạt động'}
                </p>
              )}
            </div>

            {/* Thành phố */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thành phố <span className="text-red-500">*</span>
              </label>
              {editing ? (
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              ) : (
                <p className="text-gray-900">{location?.city}</p>
              )}
            </div>

            {/* Quốc gia */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quốc gia <span className="text-red-500">*</span>
              </label>
              {editing ? (
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              ) : (
                <p className="text-gray-900">{location?.country}</p>
              )}
            </div>

            {/* Địa chỉ */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Địa chỉ <span className="text-red-500">*</span>
              </label>
              {editing ? (
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                />
              ) : (
                <p className="text-gray-900">{location?.address}</p>
              )}
            </div>

            {/* Tọa độ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vĩ độ (Latitude)</label>
              {editing ? (
                <input
                  type="number"
                  step="0.000001"
                  name="coordinates.lat"
                  value={formData.coordinates.lat}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.coordinates?.lat}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kinh độ (Longitude)</label>
              {editing ? (
                <input
                  type="number"
                  step="0.000001"
                  name="coordinates.lng"
                  value={formData.coordinates.lng}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.coordinates?.lng}</p>
              )}
            </div>

            {/* Mô tả */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Mô tả</label>
              {editing ? (
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.description || 'Không có mô tả'}</p>
              )}
            </div>

            {/* Giá */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mức giá</label>
              {editing ? (
                <select
                  name="priceRange"
                  value={formData.priceRange}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="budget">Tiết kiệm</option>
                  <option value="mid-range">Trung bình</option>
                  <option value="luxury">Cao cấp</option>
                </select>
              ) : (
                <p className="text-gray-900">
                  {location?.priceRange === 'budget' && 'Tiết kiệm'}
                  {location?.priceRange === 'mid-range' && 'Trung bình'}
                  {location?.priceRange === 'luxury' && 'Cao cấp'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chi phí trung bình (VNĐ)</label>
              {editing ? (
                <input
                  type="number"
                  name="averageCost"
                  value={formData.averageCost}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.averageCost?.toLocaleString('vi-VN')} đ</p>
              )}
            </div>

            {/* Giờ mở cửa */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Giờ mở cửa</label>
              {editing ? (
                <input
                  type="text"
                  name="openingHours"
                  value={formData.openingHours}
                  onChange={handleInputChange}
                  placeholder="VD: 8:00 - 22:00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.openingHours || 'Không có thông tin'}</p>
              )}
            </div>

            {/* Liên hệ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Số điện thoại</label>
              {editing ? (
                <input
                  type="text"
                  name="contact.phone"
                  value={formData.contact.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.contact?.phone || 'Không có'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
              {editing ? (
                <input
                  type="text"
                  name="contact.website"
                  value={formData.contact.website}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.contact?.website || 'Không có'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              {editing ? (
                <input
                  type="email"
                  name="contact.email"
                  value={formData.contact.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <p className="text-gray-900">{location?.contact?.email || 'Không có'}</p>
              )}
            </div>

            {/* Hình ảnh */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hình ảnh {editing && <span className="text-xs text-gray-500">(tự động resize về 800x600, JPEG)</span>}
              </label>
              {editing ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      <Upload className="h-4 w-4" />
                      <span>{uploading ? 'Đang xử lý...' : 'Tải ảnh lên'}</span>
                    </button>
                    <span className="text-sm text-gray-500">Tối đa 5MB/ảnh</span>
                  </div>
                  
                  {formData.images.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {formData.images.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt="" className="h-24 w-24 object-cover rounded-lg border-2 border-gray-200" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {location?.images?.length > 0 ? (
                    location.images.map((img, idx) => (
                      <img key={idx} src={img} alt="" className="h-24 w-24 object-cover rounded-lg border-2 border-gray-200" />
                    ))
                  ) : (
                    <p className="text-gray-500">Chưa có hình ảnh</p>
                  )}
                </div>
              )}
            </div>

            {/* Ảnh đóng góp từ cộng đồng (chỉ hiển thị ở view mode) */}
            {!editing && location?.communityImages && location.communityImages.length > 0 && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ảnh đóng góp từ cộng đồng ({location.communityImages.length})
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {location.communityImages.map((img) => (
                    <div key={img._id} className="relative group">
                      <img 
                        src={img.url} 
                        alt="Community"
                        className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 rounded-lg">
                        <button
                          onClick={() => handleDeleteCommunityImage(img._id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs mb-1"
                        >
                          Xóa
                        </button>
                        <p className="text-xs text-white text-center mt-1">
                          {img.userId?.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-300">
                          {new Date(img.uploadedAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews/Đánh giá từ cộng đồng (chỉ hiển thị ở view mode) */}
            {!editing && location?.reviews && location.reviews.length > 0 && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Đánh giá từ người dùng ({location.reviews.length})
                </label>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {location.reviews.map((review) => (
                    <div key={review._id} className="bg-gray-50 p-3 rounded-lg flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{review.userId?.name || 'Unknown'}</span>
                          <span className="text-yellow-500 text-sm">{'★'.repeat(review.rating)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">{review.comment}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteReview(review._id)}
                        className="text-red-500 hover:text-red-700 text-sm ml-3 px-2 py-1 hover:bg-red-50 rounded"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>
              {editing ? (
                <div className="space-y-2">
                  {/* Selected tags */}
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag, idx) => (
                        <span key={idx} className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 text-blue-600 hover:text-blue-900"
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Tag input with suggestions */}
                  <div className="relative">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                        setShowTagSuggestions(true);
                      }}
                      onFocus={() => setShowTagSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (tagInput.trim()) {
                            handleAddTag(tagInput.trim());
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="Nhập tag hoặc chọn từ gợi ý..."
                    />
                    
                    {/* Suggestions dropdown */}
                    {showTagSuggestions && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredTagSuggestions().length > 0 ? (
                          getFilteredTagSuggestions().map((tag, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAddTag(tag)}
                              className="w-full px-4 py-2 text-left hover:bg-blue-50 text-sm"
                            >
                              {tag}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-2 text-sm text-gray-500">
                            {tagInput ? 'Nhấn Enter để thêm tag mới' : 'Không có gợi ý'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {location?.tags?.length > 0 ? (
                    location.tags.map((tag, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-gray-500">Chưa có tags</p>
                  )}
                </div>
              )}
            </div>

            {/* Trạng thái */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái hoạt động</label>
              {editing ? (
                <select
                  name="isActive"
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.value === 'active' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngưng hoạt động</option>
                </select>
              ) : (
                <span className={`inline-block px-3 py-1 rounded text-sm ${location?.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {location?.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái xác minh</label>
              {editing ? (
                <select
                  name="isVerified"
                  value={formData.isVerified ? 'verified' : 'unverified'}
                  onChange={(e) => setFormData(prev => ({ ...prev, isVerified: e.target.value === 'verified' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="verified">Đã xác minh</option>
                  <option value="unverified">Chưa xác minh</option>
                </select>
              ) : (
                <span className={`inline-block px-3 py-1 rounded text-sm ${location?.isVerified ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                  {location?.isVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quyền truy cập</label>
              {editing ? (
                <select
                  name="isPublic"
                  value={formData.isPublic ? 'public' : 'private'}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.value === 'public' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="public">Công khai</option>
                  <option value="private">Riêng tư</option>
                </select>
              ) : (
                <span className={`inline-block px-3 py-1 rounded text-sm ${location?.isPublic ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                  {location?.isPublic ? 'Công khai' : 'Riêng tư'}
                </span>
              )}
            </div>

            {/* Thống kê (chỉ hiện khi xem) */}
            {!editing && location && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Đánh giá</label>
                  <p className="text-gray-900">
                    {location.rating?.toFixed(1)} / 5.0 ({location.ratingCount || 0} đánh giá)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Số lần sử dụng</label>
                  <p className="text-gray-900">{location.usageCount || 0}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Số lịch trình</label>
                  <p className="text-gray-900">{location.stats?.totalItineraries || 0}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Số người dùng</label>
                  <p className="text-gray-900">{location.stats?.totalUsers || 0}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t">
          <div>
            {mode !== 'create' && !editing && (
              <button
                onClick={handleDelete}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" />
                <span>Xóa</span>
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {editing ? 'Hủy' : 'Đóng'}
            </button>
            {editing ? (
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                <Save className="h-4 w-4" />
                <span>Lưu</span>
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Chỉnh sửa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationModal;
