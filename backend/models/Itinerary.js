import mongoose from 'mongoose';

const itinerarySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  destination: {
    type: String,
    required: true,
  },
  destinationCity: {
    type: String,
    // Canonical city name (bỏ tiền tố "Thành phố/TP./Tỉnh") để query DB chính xác
    // VD: "Đà Nẵng" thay vì "Thành phố Đà Nẵng"
  },
  destinationCoordinates: {
    lat: Number,
    lng: Number,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  numberOfPeople: {
    type: Number,
    required: true,
    min: 1,
  },
  budget: {
    type: Number,
    required: true,
  },
  interests: [{
    type: String,
  }],
  days: [{
    date: {
      type: Date,
      required: true,
    },
    activities: [{
      time: String,
      type: {
        type: String,
        enum: ['attraction', 'restaurant', 'hotel', 'activity'],
      },
      name: String,
      description: String,
      // Tham chiếu đến bảng Location (để tái sử dụng địa điểm)
      locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location',
      },
      // Giữ lại location embedded để hiển thị nhanh và backward compatibility
      location: {
        address: String,
        coordinates: {
          lat: Number,
          lng: Number,
        },
      },
      duration: Number, // đơn vị: phút
      cost: Number,
      rating: Number,
      // User contributions khi thực hiện lịch trình
      userContributions: {
        images: [{
          url: {
            type: String, // URL hoặc base64
            required: true,
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        }],
        experience: {
          text: {
            type: String, // Trải nghiệm của user về địa điểm này
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
        visited: {
          type: Boolean,
          default: false,
        },
        visitedAt: {
          type: Date,
        },
      },
    }],
    estimatedCost: {
      type: Number,
      default: 0,
    },
  }],
  totalEstimatedCost: {
    type: Number,
    default: 0,
  },
  isShared: {
    type: Boolean,
    default: false,
  },
  shareLink: {
    type: String,
    unique: true,
    sparse: true,
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likesCount: {
    type: Number,
    default: 0,
  },
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
  averageRating: {
    type: Number,
    default: 0,
  },
  reviewsCount: {
    type: Number,
    default: 0,
  },
  // Trạng thái lịch trình
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'completed'],
    default: 'draft',
    index: true,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

itinerarySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate total cost
  this.totalEstimatedCost = this.days.reduce((total, day) => {
    return total + (day.estimatedCost || 0);
  }, 0);
  
  next();
});

export default mongoose.model('Itinerary', itinerarySchema);



