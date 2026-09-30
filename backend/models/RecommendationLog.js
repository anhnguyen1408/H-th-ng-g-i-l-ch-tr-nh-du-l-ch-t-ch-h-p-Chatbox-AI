import mongoose from 'mongoose';

const recommendationLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  city: {
    type: String,
    default: '',
    index: true,
  },
  interests: [{
    type: String,
  }],
  algo: {
    type: String,
    default: 'cosine',
  },
  limit: {
    type: Number,
    default: 12,
  },
  recommendedLocationIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

recommendationLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('RecommendationLog', recommendationLogSchema);
