import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['itinerary', 'review', 'user', 'location', 'comment'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'spam',
        'harassment',
        'inappropriate_content',
        'false_information',
        'copyright',
        'other',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
      default: 'pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    adminNotes: String,
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;
