import mongoose from 'mongoose';

/**
 * Location Model - BẢNG LOCATION TỔNG
 * Lưu tất cả địa điểm từ tất cả người dùng để tái sử dụng
 * Collection name: "places" (để tránh nhầm lẫn với field "location" trong Itinerary)
 * Model name: "Location" (vẫn giữ tên này để code không thay đổi)
 * 
 * Đây là bảng tổng hợp tất cả địa điểm để:
 * - Tái sử dụng cho nhiều users
 * - Phát triển tính năng tìm kiếm, gợi ý địa điểm
 * - Xây dựng database địa điểm chung
 */
const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true, // Index để tìm kiếm nhanh
  },
  osmId: {
    type: String,
    index: true,
    sparse: true, // Cho phép null
  },
  osmType: {
    type: String,
    sparse: true,
  },
  placeId: {
    type: String,
    index: true,
    sparse: true,
  },
  type: {
    type: String,
    enum: ['attraction', 'restaurant', 'hotel', 'activity'],
    required: true,
    index: true,
  },
  city: {
    type: String,
    required: true,
    index: true,
  },
  country: {
    type: String,
    required: true,
    index: true,
  },
  address: {
    type: String,
    required: true,
  },
  coordinates: {
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
  },
  description: {
    type: String,
    default: '',
  },
  // Rating tổng hợp từ tất cả users
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  // Số lượng đánh giá từ users
  ratingCount: {
    type: Number,
    default: 0,
  },
  priceRange: {
    type: String,
    enum: ['budget', 'mid-range', 'luxury'],
    default: 'mid-range',
  },
  averageCost: {
    type: Number,
    default: 0,
  },
  openingHours: {
    type: String,
    default: '',
  },
  contact: {
    phone: String,
    website: String,
    email: String,
  },
  images: [{
    type: String,
  }],
  // Ảnh đóng góp từ cộng đồng (user upload)
  communityImages: [{
    url: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  }],
  // Bài viết/trải nghiệm đóng góp từ cộng đồng (user experiences)
  communityExperiences: [{
    text: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  }],
  tags: [{
    type: String,
  }],
  // Trạng thái
  isActive: {
    type: Boolean,
    default: true,
    require:false,
    index: true,
  },
  // Địa điểm đã được xác minh (verified)
  isVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  // Public/Private - Public: tất cả users có thể thấy, Private: chỉ user tạo
  isPublic: {
    type: Boolean,
    default: true,
    index: true,
  },
  // Số lần được sử dụng trong các itinerary (để thống kê)
  usageCount: {
    type: Number,
    default: 0,
    index: true,
  },
  // Danh sách users đã sử dụng địa điểm này (để thống kê)
  usedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Đánh giá từ nhiều users
  reviews: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Thống kê
  stats: {
    totalItineraries: {
      type: Number,
      default: 0,
    },
    totalUsers: {
      type: Number,
      default: 0,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Virtual field để chuyển đổi coordinates sang GeoJSON format cho geospatial queries
locationSchema.virtual('geoJSON').get(function() {
  if (this.coordinates && this.coordinates.lat && this.coordinates.lng) {
    return {
      type: 'Point',
      coordinates: [this.coordinates.lng, this.coordinates.lat],
    };
  }
  return null;
});

// Method để lấy GeoJSON coordinates
locationSchema.methods.getGeoJSON = function() {
  if (this.coordinates && this.coordinates.lat && this.coordinates.lng) {
    return {
      type: 'Point',
      coordinates: [this.coordinates.lng, this.coordinates.lat],
    };
  }
  return null;
};

// Indexes cho tìm kiếm và thống kê
locationSchema.index({ osmId: 1, osmType: 1 }, { unique: true, sparse: true }); // Unique theo osmId + osmType
locationSchema.index({ city: 1, country: 1 });
locationSchema.index({ 'coordinates.lng': 1, 'coordinates.lat': 1 });
locationSchema.index({ isActive: 1, isPublic: 1, type: 1 }); // Tìm kiếm public locations
locationSchema.index({ usageCount: -1 }); // Sắp xếp theo độ phổ biến
locationSchema.index({ rating: -1, ratingCount: -1 }); // Sắp xếp theo đánh giá
locationSchema.index({ isVerified: 1, rating: -1 }); // Địa điểm đã xác minh
locationSchema.index({ tags: 1 }); // Tìm kiếm theo tags

// Method: Tăng số lần sử dụng khi được dùng trong itinerary
locationSchema.methods.incrementUsage = async function(userId) {
  this.usageCount = (this.usageCount || 0) + 1;
  this.stats.totalItineraries = (this.stats.totalItineraries || 0) + 1;
  this.stats.lastUsedAt = new Date();
  
  // Thêm user vào danh sách nếu chưa có
  if (userId && !this.usedBy.includes(userId)) {
    this.usedBy.push(userId);
    this.stats.totalUsers = this.usedBy.length;
  }
  
  await this.save();
};

// Method: Thêm đánh giá từ user
locationSchema.methods.addReview = async function(userId, rating, comment = '') {
  // Kiểm tra user đã đánh giá chưa
  const existingReview = this.reviews.find(r => r.userId.toString() === userId.toString());
  
  if (existingReview) {
    // Cập nhật đánh giá cũ
    existingReview.rating = rating;
    existingReview.comment = comment;
  } else {
    // Thêm đánh giá mới
    this.reviews.push({
      userId,
      rating,
      comment,
    });
    this.ratingCount = (this.ratingCount || 0) + 1;
  }
  
  // Tính lại rating trung bình
  if (this.reviews.length > 0) {
    const totalRating = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.rating = totalRating / this.reviews.length;
  }
  
  await this.save();
};

// Đổi tên collection thành "places" để tránh nhầm lẫn với field "location" trong Itinerary
// Model name vẫn là "Location" nhưng collection name là "places"
export default mongoose.model('Location', locationSchema, 'places');





