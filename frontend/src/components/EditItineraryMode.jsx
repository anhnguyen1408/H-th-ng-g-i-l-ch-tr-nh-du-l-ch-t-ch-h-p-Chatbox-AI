import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const SortableActivity = ({ activity, dayIndex, actIndex, onDelete, formatCurrency }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${dayIndex}-${actIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getActivityType = (type) => {
    switch (type) {
      case 'attraction': return 'Tham quan';
      case 'restaurant': return 'Ẩm thực';
      case 'hotel': return 'Lưu trú';
      case 'activity': return 'Hoạt động';
      default: return 'Khác';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-primary-300 transition-colors ${isDragging ? 'shadow-lg opacity-50' : 'shadow-sm'}`}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 pt-1 px-2 font-bold">
        ⋮⋮
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-primary-600 uppercase">{getActivityType(activity.type)}</span>
          <h4 className="font-semibold text-gray-900">{activity.name}</h4>
        </div>
        {activity.description && (
          <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
        )}
        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
          {activity.time && (
            <span><span className="font-medium">Giờ:</span> {activity.time}</span>
          )}
          {activity.duration > 0 && (
            <span><span className="font-medium">Thời lượng:</span> {activity.duration} phút</span>
          )}
          {activity.cost > 0 && (
            <span><span className="font-medium">Chi phí:</span> {formatCurrency(activity.cost)}</span>
          )}
          {activity.location?.address && (
            <span className="truncate"><span className="font-medium">Địa chỉ:</span> {activity.location.address}</span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(dayIndex, actIndex)}
        className="text-red-500 hover:text-red-700 px-2 py-1 text-sm font-medium"
        title="Xóa"
      >
        Xóa
      </button>
    </div>
  );
};

const EditItineraryMode = ({ itinerary, setItinerary, formatCurrency }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dbPlaces, setDbPlaces] = useState([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [selectedType, setSelectedType] = useState('all'); // 'all', 'attraction', 'restaurant', 'hotel', 'activity'
  const [expandedPlaces, setExpandedPlaces] = useState(new Set()); // Track expanded community sections

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Parse IDs: "dayIndex-actIndex"
    const [activeDayIdx, activeActIdx] = active.id.split('-').map(Number);
    const [overDayIdx, overActIdx] = over.id.split('-').map(Number);

    const newItinerary = { ...itinerary };

    if (activeDayIdx === overDayIdx) {
      // Di chuyển trong cùng ngày
      const activities = [...newItinerary.days[activeDayIdx].activities];
      const newActivities = arrayMove(activities, activeActIdx, overActIdx);
      newItinerary.days[activeDayIdx].activities = newActivities;
    } else {
      // Di chuyển sang ngày khác
      const sourceActivities = [...newItinerary.days[activeDayIdx].activities];
      const destActivities = [...newItinerary.days[overDayIdx].activities];
      
      const [movedActivity] = sourceActivities.splice(activeActIdx, 1);
      destActivities.splice(overActIdx, 0, movedActivity);

      newItinerary.days[activeDayIdx].activities = sourceActivities;
      newItinerary.days[overDayIdx].activities = destActivities;
    }

    setItinerary(newItinerary);
  };

  const handleDeleteActivity = (dayIndex, actIndex) => {
    if (!confirm('Bạn có chắc muốn xóa hoạt động này?')) return;

    const newItinerary = { ...itinerary };
    newItinerary.days[dayIndex].activities.splice(actIndex, 1);
    setItinerary(newItinerary);
  };

  // Fetch DB places khi mở modal
  useEffect(() => {
    if (showAddModal && dbPlaces.length === 0) {
      fetchDBPlaces();
    }
  }, [showAddModal]);

  const fetchDBPlaces = async () => {
    if (!itinerary.destinationCity) {
      console.warn('No destinationCity available');
      return;
    }

    setLoadingPlaces(true);
    try {
      const response = await axios.get(`${API_URL}/locations`, {
        params: {
          city: itinerary.destinationCity,
          limit: 500,
        },
      });
      
      if (response.data.success && response.data.locations) {
        setDbPlaces(response.data.locations);
      }
    } catch (error) {
      console.error('Error fetching DB locations:', error);
    } finally {
      setLoadingPlaces(false);
    }
  };

  // Filter places dựa trên search query và type
  const filteredPlaces = dbPlaces.filter(place => {
    // Filter theo type
    const matchType = selectedType === 'all' || place.type === selectedType;
    
    // Filter theo search query
    const matchSearch = searchQuery === '' ||
      place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (place.address && place.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (place.description && place.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchType && matchSearch;
  });

  const handleAddActivity = (place) => {
    const newActivity = {
      type: place.type || 'attraction',
      name: place.name,
      description: place.description || '',
      location: {
        address: place.address || '',
        coordinates: {
          lat: place.coordinates?.lat || 0,
          lng: place.coordinates?.lng || 0,
        },
      },
      time: '',
      duration: 0,
      cost: 0,
      rating: place.rating || 0,
      locationId: place._id,
      osmId: place.osmId,
      osmType: place.osmType,
    };

    const newItinerary = { ...itinerary };
    newItinerary.days[selectedDay].activities.push(newActivity);
    setItinerary(newItinerary);

    // Reset
    setShowAddModal(false);
    setSearchQuery('');
  };

  // Flatten activities cho DndContext
  const allActivities = itinerary.days.flatMap((day, dayIdx) =>
    day.activities.map((_, actIdx) => `${dayIdx}-${actIdx}`)
  );

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Chế độ chỉnh sửa</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>Kéo-thả để di chuyển hoạt động giữa các ngày</li>
          <li>Bấm nút thùng rác để xóa</li>
          <li>Bấm "+" để thêm địa điểm mới</li>
          <li>Sau khi chỉnh xong, bấm "Tối ưu với AI" để tự động gán giờ/chi phí</li>
        </ul>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allActivities} strategy={verticalListSortingStrategy}>
          {itinerary.days.map((day, dayIndex) => (
            <div key={dayIndex} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Ngày {dayIndex + 1} - {new Date(day.date).toLocaleDateString('vi-VN')}
                </h3>
                <button
                  onClick={() => {
                    setSelectedDay(dayIndex);
                    setShowAddModal(true);
                  }}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
                >
                  + Thêm địa điểm
                </button>
              </div>

              {day.activities.length > 0 ? (
                <div className="space-y-4">
                  {/* Group activities theo type */}
                  {['attraction', 'restaurant', 'hotel', 'activity'].map(type => {
                    const typeActivities = day.activities
                      .map((act, idx) => ({ ...act, originalIndex: idx }))
                      .filter(act => act.type === type);
                    
                    if (typeActivities.length === 0) return null;

                    const typeLabels = {
                      attraction: { label: 'Tham quan', color: 'bg-blue-50 border-blue-200' },
                      restaurant: { label: 'Ẩm thực', color: 'bg-orange-50 border-orange-200' },
                      hotel: { label: 'Lưu trú', color: 'bg-purple-50 border-purple-200' },
                      activity: { label: 'Hoạt động', color: 'bg-green-50 border-green-200' },
                    };

                    return (
                      <div key={type} className={`border-2 rounded-lg p-3 ${typeLabels[type].color}`}>
                        <h4 className="font-semibold text-sm mb-2 text-gray-700">
                          {typeLabels[type].label} ({typeActivities.length})
                        </h4>
                        <div className="space-y-2">
                          {typeActivities.map((activity) => (
                            <SortableActivity
                              key={`${dayIndex}-${activity.originalIndex}`}
                              activity={activity}
                              dayIndex={dayIndex}
                              actIndex={activity.originalIndex}
                              onDelete={handleDeleteActivity}
                              formatCurrency={formatCurrency}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Chưa có hoạt động nào</p>
                  <p className="text-sm mt-1">Bấm "Thêm địa điểm" để bắt đầu</p>
                </div>
              )}
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {/* Modal thêm địa điểm */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Thêm địa điểm mới</h3>
            
            {/* Tabs phân loại */}
            <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-2">
              {[
                { value: 'all', label: 'Tất cả', count: dbPlaces.length },
                { value: 'attraction', label: 'Tham quan', count: dbPlaces.filter(p => p.type === 'attraction').length },
                { value: 'restaurant', label: 'Ẩm thực', count: dbPlaces.filter(p => p.type === 'restaurant').length },
                { value: 'hotel', label: 'Lưu trú', count: dbPlaces.filter(p => p.type === 'hotel').length },
                { value: 'activity', label: 'Hoạt động', count: dbPlaces.filter(p => p.type === 'activity').length },
              ].map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setSelectedType(tab.value)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedType === tab.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tìm kiếm địa điểm ({filteredPlaces.length} kết quả)
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Gõ để lọc danh sách..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>

            {/* Places List */}
            <div className="max-h-96 overflow-y-auto mb-4 border border-gray-200 rounded-lg">
              {loadingPlaces && (
                <div className="flex items-center justify-center py-8">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent mr-2"></div>
                  <span className="text-gray-600">Đang tải danh sách địa điểm...</span>
                </div>
              )}
              {!loadingPlaces && filteredPlaces.length > 0 && (
                <div className="divide-y divide-gray-200">
                  {filteredPlaces.map((place, idx) => {
                    const placeId = place._id || idx;
                    const isExpanded = expandedPlaces.has(placeId);
                    const hasCommunity = 
                      (place.communityImages && place.communityImages.filter(img => img.isApproved !== false).length > 0) ||
                      (place.communityExperiences && place.communityExperiences.filter(exp => exp.isApproved !== false).length > 0);
                    
                    const approvedImages = place.communityImages?.filter(img => img.isApproved !== false) || [];
                    const approvedExperiences = place.communityExperiences?.filter(exp => exp.isApproved !== false) || [];

                    return (
                      <div key={idx} className="p-3">
                        {/* Community section - nếu có */}
                        {hasCommunity && (
                          <div className="mb-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedPlaces(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(placeId)) {
                                    newSet.delete(placeId);
                                  } else {
                                    newSet.add(placeId);
                                  }
                                  return newSet;
                                });
                              }}
                              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                            >
                              {isExpanded ? '▼' : '▶'} Xem trải nghiệm từ cộng đồng
                              {approvedImages.length > 0 && (
                                <span className="text-xs text-gray-500">
                                  (Hơn {approvedImages.length} ảnh)
                                </span>
                              )}
                            </button>
                            
                            {isExpanded && (
                              <div className="mt-3 space-y-3 bg-gray-50 p-3 rounded-lg">
                                {/* Trải nghiệm cộng đồng */}
                                {approvedExperiences.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                      Trải nghiệm ({approvedExperiences.length})
                                    </h5>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                      {approvedExperiences.slice(0, 3).map((exp, expIdx) => (
                                        <div key={expIdx} className="bg-white rounded p-2 border border-green-200 text-xs">
                                          <div className="flex items-center gap-2 mb-1">
                                            {exp.userId && typeof exp.userId === 'object' && (
                                              <span className="font-semibold text-green-700">
                                                {exp.userId.name || 'Người dùng'}
                                              </span>
                                            )}
                                            {exp.createdAt && (
                                              <span className="text-gray-500">
                                                {new Date(exp.createdAt).toLocaleDateString('vi-VN')}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-gray-700 line-clamp-2">{exp.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Ảnh cộng đồng */}
                                {approvedImages.length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                      Ảnh từ cộng đồng ({approvedImages.length})
                                    </h5>
                                    <div className="grid grid-cols-4 gap-2">
                                      {approvedImages.slice(0, 8).map((image, imgIdx) => {
                                        const imageObj = typeof image === 'string' ? { url: image, userId: null } : image;
                                        return (
                                          <div
                                            key={imgIdx}
                                            className="aspect-square rounded overflow-hidden bg-gray-200 relative group"
                                          >
                                            <img
                                              src={imageObj.url}
                                              alt={`Community ${imgIdx + 1}`}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                e.target.style.display = 'none';
                                              }}
                                            />
                                            {imageObj.userId && typeof imageObj.userId === 'object' && (
                                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                                                {imageObj.userId.name || 'Người dùng'}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Main place button */}
                        <button
                          onClick={() => handleAddActivity(place)}
                          className="w-full text-left hover:bg-primary-50 transition-colors p-3 rounded border border-gray-200 hover:border-primary-300"
                        >
                          <div className="flex items-start gap-3">
                            {/* Thumbnail ảnh bên trái */}
                            {(place.images?.[0] || approvedImages[0]) ? (
                              <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-gray-200">
                                <img
                                  src={place.images?.[0]?.url || place.images?.[0] || approvedImages[0]?.url || approvedImages[0]}
                                  alt={place.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : null}
                            
                            {/* Nội dung bên phải */}
                            <div className="flex-1 min-w-0">
                              {/* Type badge + Name */}
                              <div className="flex items-start gap-2 mb-1">
                                <span className="text-xs font-semibold text-primary-600 uppercase flex-shrink-0">
                                  {place.type === 'hotel' ? 'LƯU TRÚ' : 
                                   place.type === 'restaurant' ? 'ẨM THỰC' :
                                   place.type === 'attraction' ? 'THAM QUAN' :
                                   place.type === 'activity' ? 'HOẠT ĐỘNG' : 'KHÁC'}
                                </span>
                                <h4 className="font-semibold text-gray-900">{place.name}</h4>
                              </div>
                              
                              {/* Description */}
                              {place.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{place.description}</p>
                              )}
                              
                              {/* Address */}
                              {place.address && (
                                <p className="text-sm text-gray-500 mt-1">{place.address}</p>
                              )}
                              
                              {/* Rating */}
                              {place.rating > 0 && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                  <span className="font-medium">Đánh giá:</span> 
                                  <span>{place.rating.toFixed(1)}/5</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {!loadingPlaces && dbPlaces.length > 0 && filteredPlaces.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  Không tìm thấy "{searchQuery}"
                </p>
              )}
              {!loadingPlaces && dbPlaces.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  Chưa có địa điểm nào cho {itinerary.destinationCity}. Hãy tạo lịch trình mới để seed dữ liệu.
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setShowAddModal(false);
                setSearchQuery('');
                setSelectedType('all');
                setExpandedPlaces(new Set());
              }}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditItineraryMode;
