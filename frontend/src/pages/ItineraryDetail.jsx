import { useEffect, useState } from 'react';
import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import MapView from '../components/MapView';
import ChatBox from '../components/ChatBox';
import EditItineraryMode from '../components/EditItineraryMode';
import LikeButton from '../components/LikeButton';
import ReviewSection from '../components/ReviewSection';
import LocationModal from '../components/LocationModal';
import RecommendedLocationsPanel from '../components/RecommendedLocationsPanel';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ItineraryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [editingReview, setEditingReview] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneStartDate, setCloneStartDate] = useState(null);
  const [cloneEndDate, setCloneEndDate] = useState(null);
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryLocationId, setGalleryLocationId] = useState(null);
  const [recommendedLocationId, setRecommendedLocationId] = useState(null);

  useEffect(() => {
    fetchItinerary();
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

  const handleShare = async () => {
    try {
      const response = await axios.post(`${API_URL}/itinerary/${id}/share`);
      setShareLink(`${window.location.origin}/shared/${response.data.shareLink}`);
      toast.success('Đã tạo link chia sẻ!');
    } catch (error) {
      toast.error('Không thể tạo link chia sẻ');
    }
  };

  const handleSaveChanges = async () => {
    try {
      await axios.put(`${API_URL}/itinerary/${id}`, itinerary);
      toast.success('Đã lưu thay đổi!');
      setEditing(false);
    } catch (error) {
      toast.error('Không thể lưu thay đổi');
    }
  };

  const handleCloneClick = () => {
    // Mở modal để chọn ngày bắt đầu
    setCloneStartDate(null);
    setCloneEndDate(null);
    setCloneModalOpen(true);
  };

  const handleCloneConfirm = async () => {
    if (!cloneStartDate) {
      toast.warning('Vui lòng chọn ngày bắt đầu');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/itinerary/clone/${id}`, {
        startDate: cloneStartDate,
      });
      if (response.data.success) {
        toast.success('Đã lưu lịch trình vào tài khoản của bạn!');
        setCloneModalOpen(false);
        navigate(`/itinerary/${response.data.itinerary._id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể lưu lịch trình');
    }
  };

  const handleOpenImageGallery = (images, locationId) => {
    setGalleryImages(images);
    setGalleryLocationId(locationId);
    setImageGalleryOpen(true);
  };


  const handleDeleteCommunityImage = async (imageId) => {
    if (!galleryLocationId) return;
    
    try {
      await axios.delete(`${API_URL}/locations/${galleryLocationId}/community-images/${imageId}`);
      toast.success('Đã xóa ảnh!');
      setGalleryImages(prev => prev.filter(img => img._id !== imageId));
      fetchItinerary(); // Refresh itinerary
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa ảnh');
    }
  };

  const handleDeleteLocationReview = async (locationId, reviewId) => {
    try {
      await axios.delete(`${API_URL}/locations/${locationId}/reviews/${reviewId}`);
      toast.success('Đã xóa đánh giá!');
      fetchItinerary();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa đánh giá');
    }
  };

  const handleUpsertLocationReview = async (locationId, rating, comment) => {
    if (!locationId) {
      toast.error('Thiếu thông tin địa điểm');
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      toast.error('Vui lòng chọn đánh giá từ 1 đến 5 sao');
      return;
    }

    try {
      await axios.post(`${API_URL}/locations/${locationId}/review`, {
        rating,
        comment,
      });
      toast.success('Đã lưu đánh giá địa điểm!');
      fetchItinerary();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể lưu đánh giá địa điểm');
    }
  };

  const handleAutoSchedule = async () => {
    if (!itinerary || !itinerary.days) {
      toast.error('Lịch trình không hợp lệ');
      return;
    }

    setAutoScheduling(true);
    try {
      // Chuẩn bị payload: chỉ gửi type, name, location
      const payload = {
        days: itinerary.days.map(day => ({
          date: day.date,
          activities: day.activities.map(act => ({
            type: act.type,
            name: act.name,
            location: {
              address: act.location?.address || '',
              coordinates: {
                lat: act.location?.coordinates?.lat || 0,
                lng: act.location?.coordinates?.lng || 0
              }
            }
          }))
        }))
      };

      const response = await axios.post(`${API_URL}/itinerary/${id}/auto-schedule`, payload);
      
      setItinerary(response.data.itinerary);
      toast.success('Đã tối ưu lịch trình thành công!');
      setEditing(false);
    } catch (error) {
      console.error('Auto-schedule error:', error);
      toast.error(error.response?.data?.message || 'Không thể tối ưu lịch trình. Vui lòng thử lại.');
    } finally {
      setAutoScheduling(false);
    }
  };

  const handleExportPDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Load custom font for Vietnamese support
    try {
      const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
      const response = await fetch(fontUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      
      await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          doc.addFileToVFS("Roboto-Regular.ttf", base64data);
          doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
          doc.setFont("Roboto");
          resolve();
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      // Silent fail - font load optional
    }

    let yPos = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftMargin = 14;
    const rightMargin = pageWidth - 14;
    const maxWidth = rightMargin - leftMargin;

    // Helper function to add text with word wrap
    const addText = (text, x, y, options = {}) => {
      const fontSize = options.fontSize || 11;
      const fontStyle = options.fontStyle || 'normal';
      const maxW = options.maxWidth || maxWidth;
      
      doc.setFontSize(fontSize);
      // Ensure font is set (if custom font loaded)
      try {
         doc.setFont("Roboto", fontStyle === 'bold' ? 'normal' : 'normal'); // Roboto Regular only for now, can add Bold if needed
      } catch (e) {
         doc.setFont(undefined, fontStyle);
      }
      
      // Split text to handle word wrap
      const lines = doc.splitTextToSize(text, maxW);
      lines.forEach((line, index) => {
        if (y + (index * 6) > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, x, y + (index * 6));
      });
      
      return y + (lines.length * 6);
    };

    // Title
    yPos = addText(itinerary.title, leftMargin, yPos, { fontSize: 18, fontStyle: 'bold' });
    yPos += 5;

    // Destination and dates
    yPos = addText(`Điểm đến: ${itinerary.destination}`, leftMargin, yPos, { fontSize: 12 });
    yPos = addText(
      `Từ ${formatDate(itinerary.startDate)} đến ${formatDate(itinerary.endDate)}`,
      leftMargin,
      yPos,
      { fontSize: 11 }
    );
    yPos = addText(`Số người: ${itinerary.numberOfPeople}`, leftMargin, yPos, { fontSize: 11 });
    yPos = addText(
      `Tổng chi phí: ${formatCurrency(itinerary.totalEstimatedCost)}`,
      leftMargin,
      yPos,
      { fontSize: 11, fontStyle: 'bold' }
    );
    yPos += 5;

    // Days
    itinerary.days.forEach((day, dayIndex) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // Day header
      yPos = addText(`Ngày ${dayIndex + 1} - ${formatDate(day.date)}`, leftMargin, yPos, {
        fontSize: 14,
        fontStyle: 'bold',
      });
      yPos += 3;

      day.activities.forEach((activity, actIndex) => {
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }

        // Activity time and name
        yPos = addText(`${activity.time} - ${activity.name}`, leftMargin + 3, yPos, {
          fontSize: 11,
          fontStyle: 'bold',
        });

        // Description
        if (activity.description) {
          yPos = addText(`  ${activity.description}`, leftMargin + 5, yPos, {
            fontSize: 10,
            maxWidth: maxWidth - 5,
          });
        }

        // Location
        if (activity.location?.address) {
          yPos = addText(`  Địa chỉ: ${activity.location.address}`, leftMargin + 5, yPos, {
            fontSize: 9,
          });
        }

        // Cost and duration
        const details = [];
        if (activity.cost) details.push(`Chi phí: ${formatCurrency(activity.cost)}`);
        if (activity.duration) details.push(`Thời gian: ${activity.duration} phút`);
        if (activity.rating) details.push(`Đánh giá: ${activity.rating}/5`);
        
        if (details.length > 0) {
          yPos = addText(`  ${details.join(' | ')}`, leftMargin + 5, yPos, {
            fontSize: 9,
          });
        }

        yPos += 3;
      });

      // Day total cost
      yPos = addText(
        `Tổng chi phí ngày: ${formatCurrency(day.estimatedCost || 0)}`,
        leftMargin,
        yPos,
        { fontSize: 11, fontStyle: 'bold' }
      );
      yPos += 8;
    });

    // Save with clean filename
    const filename = itinerary.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    doc.save(`${filename}.pdf`);
    toast.success('Đã xuất PDF thành công!');
  };

  const handleAddReview = async () => {
    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      toast.error('Vui lòng chọn đánh giá từ 1 đến 5 sao');
      return;
    }

    try {
      await axios.post(`${API_URL}/itinerary/${id}/review`, {
        rating: reviewRating,
        comment: reviewComment,
      });
      toast.success(editingReview ? 'Đã cập nhật đánh giá!' : 'Đã thêm đánh giá!');
      setReviewRating(0);
      setReviewComment('');
      setEditingReview(null);
      fetchItinerary();
    } catch (error) {
      toast.error('Không thể thêm đánh giá');
    }
  };

  const handleEditReview = (review) => {
    setEditingReview(review);
    setReviewRating(review.rating);
    setReviewComment(review.comment || '');
    // Scroll to review form
    document.querySelector('.review-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCancelEditReview = () => {
    setEditingReview(null);
    setReviewRating(0);
    setReviewComment('');
  };

  const handleDeleteReview = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa đánh giá này?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/itinerary/${id}/review`);
      toast.success('Đã xóa đánh giá!');
      setReviewRating(0);
      setReviewComment('');
      setEditingReview(null);
      fetchItinerary();
    } catch (error) {
      toast.error('Không thể xóa đánh giá');
    }
  };

  const getUserId = (userObj) => {
    if (!userObj) return null;
    if (typeof userObj === 'string') return userObj;
    return userObj._id || userObj.id || userObj;
  };

  const isOwner = user && itinerary && 
    String(getUserId(itinerary.userId)) === String(getUserId(user));

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!itinerary) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-fade-in-up">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {editing ? (
                  <input
                    type="text"
                    value={itinerary.title}
                    onChange={(e) =>
                      setItinerary({ ...itinerary, title: e.target.value })
                    }
                    className="border border-gray-300 rounded px-2 py-1"
                  />
                ) : (
                  itinerary.title
                )}
              </h1>
              <div className="flex flex-wrap gap-4 text-gray-600">
                <span>
                  <span className="font-medium">Điểm đến:</span> {itinerary.destination}
                </span>
                <span>
                  {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
                </span>
                <span>{itinerary.numberOfPeople} người</span>
                <span className="font-semibold text-primary-600">
                  {formatCurrency(itinerary.totalEstimatedCost)}
                </span>
              </div>
            </div>
            {/* Action Buttons - CHỈ OWNER được edit */}
            {user && isOwner && (
              <div className="flex flex-col gap-2">
                {/* Status và nút bắt đầu */}
                {itinerary.status === 'draft' && (
                  <Link
                    to={`/active/${itinerary._id}`}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-colors"
                  >
                    <span>Bắt Đầu Lịch Trình</span>
                  </Link>
                )}
                {itinerary.status === 'in_progress' && (
                  <Link
                    to="/active"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
                  >
                    <span>Tiếp Tục Lịch Trình</span>
                  </Link>
                )}
                {itinerary.status === 'completed' && (
                  <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg flex items-center space-x-2">
                    <span>Đã Hoàn Thành</span>
                  </div>
                )}
                <div className="flex space-x-2">
                {editing ? (
                  <>
                    <button
                      onClick={handleAutoSchedule}
                      disabled={autoScheduling}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {autoScheduling ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></span>
                          <span>Đang tối ưu...</span>
                        </>
                      ) : (
                        <>
                          <span>Tối ưu AI</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleSaveChanges}
                      disabled={autoScheduling}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span>Lưu</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        fetchItinerary();
                      }}
                      disabled={autoScheduling}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span>Hủy</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center space-x-2 transition-colors"
                    >
                      <span>Chỉnh sửa</span>
                    </button>
                    <button
                      onClick={handleShare}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
                    >
                      <span>Chia sẻ</span>
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-colors"
                    >
                      <span>Xuất PDF</span>
                    </button>
                  </>
                )}
                </div>
              </div>
            )}
          </div>

          {shareLink && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-2">Link chia sẻ:</p>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="flex-1 px-3 py-2 border border-blue-300 rounded bg-white text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    toast.success('Đã sao chép link!');
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Like & Clone Buttons */}
          {user && (
            <div className="mt-4 flex flex-wrap gap-3">
              <LikeButton itinerary={itinerary} currentUserId={user.id} />
              
              {/* Clone Button - chỉ hiện khi xem lịch trình người khác */}
              {!isOwner && (
                <button
                  onClick={handleCloneClick}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all border-2 border-primary-700 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  <span className="font-semibold">Lưu & Chỉnh sửa</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Days */}
        <div className="space-y-6">
          {editing ? (
            <EditItineraryMode
              itinerary={itinerary}
              setItinerary={setItinerary}
              formatCurrency={formatCurrency}
            />
          ) : (
            itinerary.days.map((day, dayIndex) => (
              <DayCard
                key={dayIndex}
                day={day}
                dayIndex={dayIndex}
                editing={editing}
                itinerary={itinerary}
                setItinerary={setItinerary}
                formatDate={formatDate}
                formatCurrency={formatCurrency}
                handleOpenImageGallery={handleOpenImageGallery}
                isOwner={isOwner}
                currentUserId={getUserId(user)}
                onUpsertLocationReview={handleUpsertLocationReview}
                onDeleteLocationReview={handleDeleteLocationReview}
              />
            ))
          )}
        </div>

        <div className="mt-8">
          <RecommendedLocationsPanel
            title="Gợi ý địa điểm theo lịch trình"
            city={itinerary?.destinationCity || itinerary?.destination}
            interests={itinerary?.interests || []}
            limit={8}
            onSelectLocation={(locationId) => setRecommendedLocationId(locationId)}
          />
        </div>

        {/* Reviews Section */}
        {user && (
          <ReviewSection
            itinerary={itinerary}
            currentUserId={user.id}
          />
        )}

        {recommendedLocationId && (
          <LocationModal
            locationId={recommendedLocationId}
            onClose={() => setRecommendedLocationId(null)}
            onUpdate={fetchItinerary}
            mode="view"
          />
        )}

      {/* Floating Chat Button - CHỈ OWNER */}
      {isOwner && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-primary-600 to-primary-700 text-white p-4 rounded-full shadow-xl hover:shadow-2xl transition-all hover:scale-110 z-40 group"
          title="Chat với AI"
        >
          <span>Chat AI</span>
        </button>
      )}

      {/* Chat Box - CHỈ OWNER */}
      {isOwner && (
        <ChatBox 
          itineraryId={id} 
          isOpen={chatOpen} 
          onClose={() => setChatOpen(false)}
          onItineraryUpdate={fetchItinerary}
        />
      )}

      {/* Image Gallery Modal */}
      {imageGalleryOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white pb-4 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                Ảnh từ cộng đồng ({galleryImages.length})
              </h3>
              <button
                onClick={() => setImageGalleryOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span>✕</span>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
              {galleryImages.map((image, idx) => {
                const imageObj = typeof image === 'string' ? { url: image, userId: null, _id: null } : image;
                const isOwner = user && imageObj.userId && (
                  (typeof imageObj.userId === 'object' && imageObj.userId._id === user.id) ||
                  (typeof imageObj.userId === 'string' && imageObj.userId === user.id)
                );

                return (
                  <div key={idx} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-200">
                      <img
                        src={imageObj.url}
                        alt={`Community ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 rounded-b-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-xs font-medium truncate">
                          {imageObj.userId && typeof imageObj.userId === 'object'
                            ? imageObj.userId.name || 'Người dùng'
                            : 'Người dùng'}
                        </span>
                        {isOwner && imageObj._id && (
                          <button
                            onClick={() => {
                              if (window.confirm('Xóa ảnh này?')) {
                                handleDeleteCommunityImage(imageObj._id);
                              }
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition-colors"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {cloneModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Chọn ngày cho lịch trình</h3>
              <button
                onClick={() => setCloneModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span>✕</span>
              </button>
            </div>
            
            <p className="text-gray-600 mb-6">
              Vui lòng chọn ngày đi và ngày về cho lịch trình của bạn
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chọn ngày bắt đầu chuyến đi
                </label>
                <DatePicker
                  selected={cloneStartDate}
                  onChange={(date) => setCloneStartDate(date)}
                  minDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholderText="Chọn ngày bắt đầu"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ Số ngày của lịch trình sẽ giữ nguyên như bản gốc. Chỉ cần chọn ngày bắt đầu.
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCloneConfirm}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold transition-colors"
              >
                Xác nhận
              </button>
              <button
                onClick={() => setCloneModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

const DayCard = ({
  day,
  dayIndex,
  editing,
  itinerary,
  setItinerary,
  formatDate,
  formatCurrency,
  handleOpenImageGallery,
  isOwner,
  currentUserId,
  onUpsertLocationReview,
  onDeleteLocationReview,
}) => {
  const [selectedLocation, setSelectedLocation] = React.useState(null);
  
  const activities = day.activities || [];
  const locations = activities
    .filter((a) => a.location?.coordinates?.lat && a.location?.coordinates?.lng)
    .map((a, index) => ({
      lat: a.location.coordinates.lat,
      lng: a.location.coordinates.lng,
      name: a.name,
      time: a.time,
      activityIndex: index,
    }));

  const handleActivityClick = (actIndex) => {
    const activity = activities[actIndex];
    if (activity.location?.coordinates?.lat && activity.location?.coordinates?.lng) {
      setSelectedLocation({
        lat: activity.location.coordinates.lat,
        lng: activity.location.coordinates.lng,
        name: activity.name,
        time: activity.time,
      });
    }
  };

  const handleMapReset = () => {
    setSelectedLocation(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:scale-105 hover:shadow-lg">
      <div className="bg-primary-600 text-white px-6 py-4">
        <h2 className="text-xl font-bold">
          Ngày {dayIndex + 1} - {formatDate(day.date)}
        </h2>
        <p className="text-primary-100">
          Tổng chi phí: {formatCurrency(day.estimatedCost || 0)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Lịch trình</h3>
          <div className="space-y-4">
            {activities.length > 0 ? (
              activities.map((activity, actIndex) => (
                <ActivityCard
                  key={actIndex}
                  activity={activity}
                  editing={editing}
                  dayIndex={dayIndex}
                  actIndex={actIndex}
                  itinerary={itinerary}
                  setItinerary={setItinerary}
                  formatCurrency={formatCurrency}
                  onActivityClick={() => handleActivityClick(actIndex)}
                  handleOpenImageGallery={handleOpenImageGallery}
                  isSelected={
                    selectedLocation &&
                    selectedLocation.lat === activity.location?.coordinates?.lat &&
                    selectedLocation.lng === activity.location?.coordinates?.lng
                  }
                  isOwner={isOwner}
                  currentUserId={currentUserId}
                  onUpsertLocationReview={onUpsertLocationReview}
                  onDeleteLocationReview={onDeleteLocationReview}
                />
              ))
            ) : (
              <p className="text-gray-500">Không có hoạt động nào</p>
            )}
          </div>
        </div>

        {locations.length > 0 && (
          <div className="p-6 border-t lg:border-t-0 lg:border-l border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Bản đồ</h3>
              {selectedLocation && (
                <button
                  type="button"
                  onClick={handleMapReset}
                  className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                >
                  Hiện tất cả
                </button>
              )}
            </div>
            <div className="h-96 rounded-lg overflow-hidden">
              <MapView 
                locations={locations} 
                selectedLocation={selectedLocation}
                onMarkerClick={setSelectedLocation}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ActivityCard = ({
  activity,
  editing,
  dayIndex,
  actIndex,
  itinerary,
  setItinerary,
  formatCurrency,
  onActivityClick,
  handleOpenImageGallery,
  isSelected,
  isOwner,
  currentUserId,
  onUpsertLocationReview,
  onDeleteLocationReview,
}) => {
  const [expandedCommunity, setExpandedCommunity] = React.useState(false);
  const [expandedReviews, setExpandedReviews] = React.useState(false);
  const [locationReviewRating, setLocationReviewRating] = React.useState(0);
  const [locationReviewComment, setLocationReviewComment] = React.useState('');
  const [submittingLocationReview, setSubmittingLocationReview] = React.useState(false);

  const getUserIdSafe = (userObj) => {
    if (!userObj) return null;
    if (typeof userObj === 'string') return userObj;
    return userObj._id || userObj.id || userObj;
  };

  const myReview = Array.isArray(activity.locationReviews) && currentUserId
    ? activity.locationReviews.find((r) => String(getUserIdSafe(r.userId)) === String(currentUserId))
    : null;

  React.useEffect(() => {
    if (myReview) {
      setLocationReviewRating(myReview.rating || 0);
      setLocationReviewComment(myReview.comment || '');
    } else {
      setLocationReviewRating(0);
      setLocationReviewComment('');
    }
  }, [currentUserId, activity.locationId, myReview?._id]);
  const getActivityType = (type) => {
    switch (type) {
      case 'attraction':
        return 'Tham quan';
      case 'restaurant':
        return 'Ẩm thực';
      case 'hotel':
        return 'Lưu trú';
      case 'activity':
        return 'Hoạt động';
      default:
        return 'Khác';
    }
  };

  const totalCommunityImages = (activity.locationImages?.length || 0);
  const communityReviewsCount = Array.isArray(activity.locationReviews) ? activity.locationReviews.length : 0;
  const communityRatingText =
    typeof activity.locationRating === 'number' && activity.locationRating > 0
      ? `${activity.locationRating.toFixed(1)} (${activity.locationRatingCount || communityReviewsCount})`
      : (communityReviewsCount > 0 ? `(${communityReviewsCount})` : '');

  return (
    <div 
      onClick={onActivityClick}
      className={`bg-white rounded-lg border ${
        isSelected ? 'border-primary-500 shadow-lg' : 'border-gray-200'
      } hover:shadow-md transition-all cursor-pointer overflow-hidden relative`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start gap-3 mb-2">
          {/* Thumbnail ảnh địa điểm */}
          {(activity.image || activity.locationImages?.[0]) && (
            <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-200 relative">
              <img
                src={activity.image || (typeof activity.locationImages[0] === 'string' ? activity.locationImages[0] : activity.locationImages[0]?.url)}
                alt={activity.name}
                className="w-full h-full object-cover"
                onError={(e) => e.target.style.display = 'none'}
              />
              {/* Badge ảnh cộng đồng */}
              {totalCommunityImages > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenImageGallery(activity.locationImages, activity.locationId);
                  }}
                  className="absolute bottom-1 right-1 bg-gray-900 bg-opacity-75 text-white rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-opacity-90 transition-all"
                >
                  {totalCommunityImages}
                </button>
              )}
            </div>
          )}
          
          <div className="flex items-start justify-between flex-1">
          <div className="flex items-start space-x-3 flex-1">
            <span className="text-xs font-semibold text-primary-600 uppercase flex-shrink-0">{getActivityType(activity.type)}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">{activity.time}</span>
                {editing ? (
                  <input
                    type="text"
                    value={activity.time}
                    onChange={(e) => {
                      const newItinerary = { ...itinerary };
                      newItinerary.days[dayIndex].activities[actIndex].time = e.target.value;
                      setItinerary(newItinerary);
                    }}
                    className="ml-2 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                ) : (
                  <h4 className="font-semibold text-gray-900 truncate">{activity.name}</h4>
                )}
              </div>
              {editing ? (
                <input
                  type="text"
                  value={activity.name}
                  onChange={(e) => {
                    const newItinerary = { ...itinerary };
                    newItinerary.days[dayIndex].activities[actIndex].name = e.target.value;
                    setItinerary(newItinerary);
                  }}
                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              ) : (
                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{activity.description}</p>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <div className="flex items-center text-primary-600">
              <span className="font-semibold text-sm">
                <span className="font-medium">Chi phí:</span> {formatCurrency(activity.cost || 0)}
              </span>
            </div>
          </div>
          </div>
        </div>
        {activity.location?.address && (
          <div className="flex items-center text-gray-500 text-sm mt-2">
            <span className="truncate">{activity.location.address}</span>
          </div>
        )}
      </div>

      {(activity.locationId && (currentUserId || communityReviewsCount > 0)) && (
        <div className="px-4 py-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpandedReviews((v) => !v)}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              {expandedReviews ? '▼' : '▶'} Đánh giá
            </button>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              {communityRatingText ? (
                <span className="text-yellow-600">⭐ {communityRatingText}</span>
              ) : (
                <span>Chưa có đánh giá</span>
              )}
              {myReview ? <span>Bạn đã đánh giá</span> : null}
            </div>
          </div>

          {expandedReviews && (
            <div className="mt-3">
              {communityReviewsCount > 0 && (
                <div>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {activity.locationReviews.map((review, idx) => {
                      const isMine = review.userId && currentUserId && String(getUserIdSafe(review.userId)) === String(currentUserId);
                      const userName = review.userId && typeof review.userId === 'object' ? (review.userId.name || 'Người dùng') : 'Người dùng';
                      const userAvatar = review.userId && typeof review.userId === 'object' ? review.userId.avatar : null;
                      const dateText = review.createdAt ? new Date(review.createdAt).toLocaleDateString('vi-VN') : '';
                      return (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="flex-shrink-0">
                            {userAvatar ? (
                              <img
                                src={userAvatar}
                                alt={userName}
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-xs font-semibold">
                                {String(userName || 'U').trim().slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className={`inline-block max-w-full rounded-2xl px-3 py-2 ${isMine ? 'bg-primary-50' : 'bg-gray-100'}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-900 truncate">
                                  {userName}{isMine ? ' (bạn)' : ''}
                                </span>
                                <span className="text-yellow-500 text-xs flex-shrink-0">
                                  {'★'.repeat(review.rating || 0)}
                                </span>
                              </div>
                              {review.comment ? (
                                <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                                  {review.comment}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-1 pl-2 flex items-center gap-3 text-xs text-gray-500">
                              {dateText ? <span>{dateText}</span> : null}
                              {isMine ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteLocationReview && onDeleteLocationReview(activity.locationId, review._id)}
                                  className="text-red-500 hover:text-red-700 font-medium"
                                >
                                  Xóa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!activity?.locationId || !review?._id) return;

                                    const reasonText = window.prompt(
                                      'Báo cáo đánh giá này vì lý do gì?\n(spam | harassment | inappropriate_content | false_information | copyright | other)',
                                      'spam'
                                    );
                                    if (!reasonText) return;

                                    const reason = String(reasonText).trim();
                                    const description = window.prompt('Mô tả chi tiết (bắt buộc):', '');
                                    if (!description || String(description).trim().length < 3) {
                                      toast.error('Vui lòng nhập mô tả chi tiết');
                                      return;
                                    }

                                    try {
                                      await axios.post(
                                        `${API_URL}/locations/${activity.locationId}/reviews/${review._id}/report`,
                                        { reason, description }
                                      );
                                      toast.success('Đã gửi báo cáo');
                                    } catch (err) {
                                      toast.error(err?.response?.data?.message || 'Không thể gửi báo cáo');
                                    }
                                  }}
                                  className="text-gray-600 hover:text-gray-800 font-medium"
                                >
                                  Báo cáo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentUserId && activity.locationId && (
                <div className={communityReviewsCount > 0 ? 'mt-4 border-t border-gray-200 pt-4' : ''}>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setLocationReviewRating(star)}
                        className={`text-lg transition-colors ${
                          star <= locationReviewRating ? 'text-yellow-500' : 'text-gray-300'
                        }`}
                        aria-label={`Rate ${star}`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="ml-2 text-xs text-gray-500">
                      {locationReviewRating > 0 ? `${locationReviewRating}/5` : 'Chưa chọn'}
                    </span>
                  </div>

                  <div className="mt-2">
                    <textarea
                      value={locationReviewComment}
                      onChange={(e) => setLocationReviewComment(e.target.value)}
                      placeholder="Viết nhận xét của bạn (tuỳ chọn)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={submittingLocationReview}
                      onClick={async () => {
                        if (!onUpsertLocationReview) return;
                        setSubmittingLocationReview(true);
                        try {
                          await onUpsertLocationReview(activity.locationId, locationReviewRating, locationReviewComment);
                        } finally {
                          setSubmittingLocationReview(false);
                        }
                      }}
                      className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
                    >
                      {myReview ? 'Cập nhật' : 'Gửi đánh giá'}
                    </button>

                    {myReview && onDeleteLocationReview && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Bạn có chắc muốn xóa đánh giá địa điểm này?')) {
                            onDeleteLocationReview(activity.locationId, myReview._id);
                          }
                        }}
                        className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trải nghiệm từ cộng đồng - Chỉ hiển experiences */}
      {(activity.locationExperiences && activity.locationExperiences.length > 0) && (
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCommunity(!expandedCommunity);
            }}
            className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            {expandedCommunity ? '▼' : '▶'} Xem trải nghiệm từ cộng đồng ({activity.locationExperiences.length})
          </button>
          
          {expandedCommunity && (
            <div className="mt-3">
              {/* Trải nghiệm cộng đồng */}
              {activity.locationExperiences && activity.locationExperiences.length > 0 && (
                <div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {activity.locationExperiences.map((exp, idx) => (
                      <div key={idx} className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex items-center gap-2 mb-1">
                          {exp.userId && typeof exp.userId === 'object' && (
                            <span className="text-xs font-semibold text-green-700">
                              {exp.userId.name || 'Người dùng'}
                            </span>
                          )}
                          {exp.createdAt && (
                            <span className="text-xs text-gray-500">
                              {new Date(exp.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{exp.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reviews từ cộng đồng */}
      {false && activity.locationReviews && activity.locationReviews.length > 0 && (
        <div className="px-4 pb-4 border-t border-gray-200 pt-4">
          <h5 className="text-sm font-semibold text-gray-700 mb-2">
            Đánh giá từ cộng đồng ({activity.locationReviews.length})
            {activity.locationRating > 0 && (
              <span className="ml-2 text-yellow-500">
                ⭐ {activity.locationRating.toFixed(1)} ({activity.locationRatingCount})
              </span>
            )}
          </h5>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {activity.locationReviews.map((review, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 text-sm">
                      {'⭐'.repeat(review.rating || 0)}
                    </span>
                    {review.userId && typeof review.userId === 'object' && (
                      <span className="text-xs font-medium text-gray-600">
                        {review.userId.name || 'Người dùng'}
                      </span>
                    )}
                    {review.createdAt && (
                      <span className="text-xs text-gray-500">
                        {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>
                  {review.userId && currentUserId && String(getUserIdSafe(review.userId)) === String(currentUserId) && (
                    <button
                      onClick={() => onDeleteLocationReview && onDeleteLocationReview(activity.locationId, review._id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Xóa
                    </button>
                  )}
                </div>
                {review.comment && (
                  <p className="text-gray-700 text-sm mt-1">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}


      {/* User Contributions - CHỈ hiển thị nếu là owner */}
      {isOwner && activity.userContributions && (
        <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-4">
          {/* Trải nghiệm của user */}
          {activity.userContributions.experience?.text && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                Trải nghiệm của bạn
              </h5>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">
                {activity.userContributions.experience.text}
              </p>
              {activity.userContributions.experience.createdAt && (
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(activity.userContributions.experience.createdAt).toLocaleDateString('vi-VN')}
                </p>
              )}
            </div>
          )}

          {/* Trạng thái đã thăm */}
          {activity.userContributions.visited && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <span>✓ Đã thăm địa điểm này</span>
              {activity.userContributions.visitedAt && (
                <span className="text-gray-500">
                  ({new Date(activity.userContributions.visitedAt).toLocaleDateString('vi-VN')})
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ItineraryDetail;



