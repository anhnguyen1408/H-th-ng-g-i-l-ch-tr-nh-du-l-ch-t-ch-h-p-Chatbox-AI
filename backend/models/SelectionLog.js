import mongoose from 'mongoose';

const selectionLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  recommendationLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecommendationLog',
    default: null,
    index: true,
  },
  selectedLocationIds: [{
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

selectionLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('SelectionLog', selectionLogSchema);
