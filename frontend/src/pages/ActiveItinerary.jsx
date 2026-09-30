import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { MapPin, Camera, FileText, CheckCircle, Upload, X, Loader, Calendar, Users, DollarSign, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ActiveItinerary = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState({});
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const fileInputRefs = useRef({});

  useEffect(() => {
    if (id) {
      fetchItinerary();
    } else {
      fetchActiveItinerary();
    }
  }, [id]);

  const fetchItinerary = async () => {
    try {
      const response = await axios.get(`${API_URL}/itinerary/${id}`);
      setItinerary(response.data.itinerary);
    } catch (error) {
      toast.error('Không thể tải lịch trình');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveItinerary = async () => {
    try {
      const response = await axios.get(`${API_URL}/itinerary/active`);
      if (response.data.itinerary) {
        setItinerary(response.data.itinerary);
      } else {
        toast.info('Bạn chưa có lịch trình đang thực hiện');
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error('Không thể tải lịch trình');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleStartItinerary = async () => {
    try {
      const response = await axios.post(`${API_URL}/itinerary/${itinerary._id}/start`);
      if (response.data.success) {
        toast.success('Đã bắt đầu lịch trình!');
        setItinerary(response.data.itinerary);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể bắt đầu lịch trình');
    }
  };

  const handleFileSelect = async (dayIndex, activityIndex, e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const key = `${dayIndex}-${activityIndex}`;
    setUploading({ ...uploading, [key]: true });

    try {
      const base64Images = [];

      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} không phải là file hình ảnh`);
          continue;
        }

        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} quá lớn (tối đa 5MB)`);
          continue;
        }

        // Resize image
        const resizedBlob = await resizeImage(file);
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(resizedBlob);
        });

        const base64Url = await base64Promise;
        base64Images.push(base64Url);
      }

      if (base64Images.length > 0) {
        await contributeToActivity(dayIndex, activityIndex, { images: base64Images });
      }
    } catch (error) {
      toast.error('Lỗi xử lý ảnh');
    } finally {
      setUploading({ ...uploading, [key]: false });
      if (fileInputRefs.current[key]) {
        fileInputRefs.current[key].value = '';
      }
    }
  };

  const resizeImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const contributeToActivity = async (dayIndex, activityIndex, data) => {
    try {
      const response = await axios.post(
        `${API_URL}/itinerary/${itinerary._id}/activities/${dayIndex}/${activityIndex}/contribute`,
        data
      );

      if (response.data.success) {
        // Refresh lại toàn bộ itinerary để đảm bảo có dữ liệu mới nhất
        if (id) {
          await fetchItinerary();
        } else {
          await fetchActiveItinerary();
        }
        toast.success('Đã cập nhật đóng góp!');
      }
    } catch (error) {
      console.error('Error contributing to activity:', error);
      toast.error(error.response?.data?.message || 'Không thể cập nhật đóng góp');
    }
  };

  const handleExperienceSubmit = async (dayIndex, activityIndex, experience) => {
    await contributeToActivity(dayIndex, activityIndex, { experience });
  };

  const handleMarkVisited = async (dayIndex, activityIndex, visited) => {
    await contributeToActivity(dayIndex, activityIndex, { visited });
  };

  const handleDeleteImage = async (dayIndex, activityIndex, imageIndex) => {
    if (!window.confirm('Xóa ảnh này?')) return;

    try {
      const response = await axios.delete(
        `${API_URL}/itinerary/${itinerary._id}/activities/${dayIndex}/${activityIndex}/images/${imageIndex}`
      );

      if (response.data.success) {
        toast.success('Đã xóa ảnh!');
        if (id) {
          await fetchItinerary();
        } else {
          await fetchActiveItinerary();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa ảnh');
    }
  };

  const handleDeleteExperience = async (dayIndex, activityIndex) => {
    if (!window.confirm('Xóa trải nghiệm này?')) return;

    console.log('Deleting experience:', { 
      itineraryId: itinerary._id, 
      dayIndex, 
      activityIndex,
      url: `${API_URL}/itinerary/${itinerary._id}/activities/${dayIndex}/${activityIndex}/experience`
    });

    try {
      const response = await axios.delete(
        `${API_URL}/itinerary/${itinerary._id}/activities/${dayIndex}/${activityIndex}/experience`
      );

      console.log('Delete response:', response.data);

      if (response.data.success) {
        toast.success('Đã xóa trải nghiệm!');
        if (id) {
          await fetchItinerary();
        } else {
          await fetchActiveItinerary();
        }
      }
    } catch (error) {
      console.error('Delete error:', error.response?.data || error);
      toast.error(error.response?.data?.message || 'Không thể xóa trải nghiệm');
    }
  };

  const handleComplete = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn hoàn tất lịch trình này?')) {
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/itinerary/${itinerary._id}/complete`);
      if (response.data.success) {
        toast.success('Chúc mừng! Bạn đã hoàn thành lịch trình!');
        navigate('/completed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể hoàn tất lịch trình');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="animate-spin h-12 w-12 text-primary-600" />
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Không tìm thấy lịch trình</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg"
          >
            Về Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Nếu chưa bắt đầu, hiển thị nút bắt đầu
  if (itinerary.status === 'draft') {
    return (
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{itinerary.title}</h1>
            <p className="text-gray-600 mb-6">Sẵn sàng bắt đầu chuyến đi của bạn?</p>
            <button
              onClick={handleStartItinerary}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
            >
              Bắt Đầu Lịch Trình
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{itinerary.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {itinerary.destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {itinerary.numberOfPeople} người
                </span>
              </div>
            </div>
            <button
              onClick={handleComplete}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Hoàn Tất Lịch Trình
            </button>
          </div>
        </div>

        {/* Days Tabs */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {itinerary.days.map((day, index) => (
              <button
                key={index}
                onClick={() => setSelectedDay(index)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  selectedDay === index
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Ngày {index + 1} - {formatDate(day.date)}
              </button>
            ))}
          </div>
        </div>

        {/* Activities */}
        <div className="space-y-4">
          {itinerary.days[selectedDay]?.activities.map((activity, actIndex) => (
            <ActivityCard
              key={actIndex}
              activity={activity}
              dayIndex={selectedDay}
              activityIndex={actIndex}
              onFileSelect={handleFileSelect}
              onExperienceSubmit={handleExperienceSubmit}
              onMarkVisited={handleMarkVisited}
              onDeleteImage={handleDeleteImage}
              onDeleteExperience={handleDeleteExperience}
              uploading={uploading[`${selectedDay}-${actIndex}`]}
              fileInputRef={(ref) => {
                fileInputRefs.current[`${selectedDay}-${actIndex}`] = ref;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const ActivityCard = ({
  activity,
  dayIndex,
  activityIndex,
  onFileSelect,
  onExperienceSubmit,
  onMarkVisited,
  onDeleteImage,
  onDeleteExperience,
  uploading,
  fileInputRef,
}) => {
  const [showExperienceInput, setShowExperienceInput] = useState(false);
  const [experience, setExperience] = useState(activity.userContributions?.experience?.text || '');
  const [isVisited, setIsVisited] = useState(activity.userContributions?.visited || false);

  // Sync state khi activity thay đổi (sau khi refresh)
  useEffect(() => {
    setExperience(activity.userContributions?.experience?.text || '');
    setIsVisited(activity.userContributions?.visited || false);
  }, [activity.userContributions?.experience?.text, activity.userContributions?.visited]);

  const handleExperienceSave = () => {
    if (experience.trim()) {
      onExperienceSubmit(dayIndex, activityIndex, experience);
      setShowExperienceInput(false);
    }
  };

  const handleVisitedToggle = () => {
    const newVisited = !isVisited;
    setIsVisited(newVisited);
    onMarkVisited(dayIndex, activityIndex, newVisited);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex gap-4 mb-4">
        {/* Ảnh thumbnail Google Maps style */}
        {activity.userContributions?.images && activity.userContributions.images.length > 0 && (
          <div className="flex-shrink-0">
            <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-gray-200 group cursor-pointer">
              <img
                src={activity.userContributions.images[0].url || activity.userContributions.images[0]}
                alt="Ảnh đóng góp"
                className="w-full h-full object-cover"
              />
              {activity.userContributions.images.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs py-1 px-2 text-center font-medium">
                  Hơn {activity.userContributions.images.length} ảnh
                </div>
              )}
              <button
                onClick={() => onDeleteImage(dayIndex, activityIndex, 0)}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                title="Xóa ảnh"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Thông tin địa điểm */}
        <div className="flex-1 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-lg font-semibold text-gray-900">{activity.name}</span>
              <span className="text-sm text-gray-500">{activity.time}</span>
              <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs">
                {activity.type}
              </span>
            </div>
            <p className="text-gray-600 text-sm">{activity.description}</p>
            {activity.location?.address && (
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {activity.location.address}
              </p>
            )}
          </div>
          <button
            onClick={handleVisitedToggle}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isVisited
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isVisited ? '✓ Đã thăm' : 'Đánh dấu đã thăm'}
          </button>
        </div>
      </div>

      {/* Upload Images */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onFileSelect(dayIndex, activityIndex, e)}
          className="hidden"
          id={`upload-${dayIndex}-${activityIndex}`}
        />
        <label
          htmlFor={`upload-${dayIndex}-${activityIndex}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700 transition-colors"
        >
          {uploading ? (
            <>
              <Loader className="animate-spin h-4 w-4" />
              Đang upload...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              Tải ảnh đóng góp
            </>
          )}
        </label>
      </div>

      {/* Experience Form */}
      {!showExperienceInput ? (
        <div className="flex gap-2">
          <button
            onClick={() => setShowExperienceInput(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <FileText className="h-4 w-4" />
            {activity.userContributions?.experience?.text ? 'Chỉnh sửa trải nghiệm' : 'Viết trải nghiệm'}
          </button>
          {activity.userContributions?.experience?.text && (
            <button
              onClick={() => onDeleteExperience(dayIndex, activityIndex)}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="Xóa trải nghiệm"
            >
              <Trash2 className="h-4 w-4" />
              Xóa
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Chia sẻ trải nghiệm của bạn về địa điểm này..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows="4"
          />
          <div className="flex gap-2">
            <button
              onClick={handleExperienceSave}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Lưu
            </button>
            <button
              onClick={() => {
                setShowExperienceInput(false);
                setExperience(activity.userContributions?.experience?.text || '');
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActiveItinerary;

