import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import Location from '../models/Location.js';
import Itinerary from '../models/Itinerary.js';
import User from '../models/User.js';
import Report from '../models/Report.js';
import ActivityLog from '../models/ActivityLog.js';
import { getIO } from '../utils/socket.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Tất cả các route admin đều yêu cầu đăng nhập và có quyền admin
router.use(protect);
router.use(admin);

// Thống kê tổng quan cho dashboard
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalItineraries = await Itinerary.countDocuments();
    const totalLocations = await Location.countDocuments();
    const sharedItineraries = await Itinerary.countDocuments({ isShared: true });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalItineraries,
        totalLocations,
        sharedItineraries,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Thống kê lịch trình theo ngày (cho biểu đồ)
router.get('/itinerary-stats', async (req, res) => {
  try {
    const stats = await Itinerary.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: stats.map(item => ({
        date: item._id,
        count: item.count
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Thống kê đánh giá (cho biểu đồ)
router.get('/rating-stats', async (req, res) => {
  try {
    const stats = await Itinerary.aggregate([
      { $unwind: "$reviews" },
      {
        $group: {
          _id: "$reviews.rating",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Ensure all stars 1-5 are represented
    const formattedStats = [1, 2, 3, 4, 5].map(star => {
      const found = stats.find(s => s._id === star);
      return {
        star: `${star} sao`,
        count: found ? found.count : 0
      };
    });

    const totalReviews = formattedStats.reduce((acc, curr) => acc + curr.count, 0);
    const weightedSum = stats.reduce((acc, curr) => acc + (curr._id * curr.count), 0);
    const avgRating = totalReviews > 0 ? (weightedSum / totalReviews).toFixed(1) : 0;

    res.json({
      success: true,
      stats: formattedStats,
      summary: {
        total: totalReviews,
        avg: avgRating
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get favorite itineraries (dựa trên trạng thái yêu thích)
router.get('/favorite-itineraries', async (req, res) => {
  try {
    const favoriteItineraries = await Itinerary.find({
      isFavorite: true,
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .select('title destination startDate endDate reviews createdAt userId isShared');

    // Thêm số lượng reviews và rating trung bình
    const enrichedItineraries = favoriteItineraries.map((itinerary) => {
      const reviews = itinerary.reviews || [];
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

      return {
        _id: itinerary._id,
        title: itinerary.title,
        destination: itinerary.destination,
        startDate: itinerary.startDate,
        endDate: itinerary.endDate,
        createdAt: itinerary.createdAt,
        userId: itinerary.userId,
        isShared: itinerary.isShared,
        reviewCount: reviews.length,
        avgRating: avgRating.toFixed(1),
      };
    });

    res.json({
      success: true,
      favoriteItineraries: enrichedItineraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Thống kê địa điểm theo ngày (cho biểu đồ)
router.get('/location-stats', async (req, res) => {
  try {
    const stats = await Location.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: stats.map(item => ({
        date: item._id,
        count: item.count
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Quản lý địa điểm (Locations Management)
router.get('/locations', async (req, res) => {
  try {
    const { city, country, type, search, isVerified, isActive, sort, page = 1, limit = 100 } = req.query;
    const query = {};

    if (city) query.city = new RegExp(city, 'i');
    if (country) query.country = new RegExp(country, 'i');
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Xử lý sort
    let sortOption = { updatedAt: -1 }; // Mặc định: mới nhất
    if (sort === 'oldest') {
      sortOption = { updatedAt: 1 };
    } else if (sort === 'usageDesc') {
      sortOption = { usageCount: -1 };
    } else if (sort === 'usageAsc') {
      sortOption = { usageCount: 1 };
    } else if (sort === 'newest') {
      sortOption = { updatedAt: -1 };
    }

    const locations = await Location.find(query)
      .sort(sortOption)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Location.countDocuments(query);

    res.json({
      success: true,
      locations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get('/locations/:id', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id)
      .populate('usedBy', 'name email')
      .populate('reviews.userId', 'name email')
      .populate('communityImages.userId', 'name email avatar');

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.json({
      success: true,
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post('/locations', async (req, res) => {
  try {
    const location = await Location.create(req.body);

    res.status(201).json({
      success: true,
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.put('/locations/:id', async (req, res) => {
  try {
    const location = await Location.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.json({
      success: true,
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete('/locations/:id', async (req, res) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.json({
      success: true,
      message: 'Location deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa ảnh đóng góp không hợp lí
router.delete('/locations/:id/community-images/:imageId', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    const imageIndex = location.communityImages.findIndex(
      img => img._id.toString() === req.params.imageId
    );

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
      });
    }

    location.communityImages.splice(imageIndex, 1);
    await location.save();

    res.json({
      success: true,
      message: 'Community image deleted successfully',
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa review/comment vi phạm
router.delete('/locations/:id/reviews/:reviewId', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    const reviewIndex = location.reviews.findIndex(
      review => review._id.toString() === req.params.reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    location.reviews.splice(reviewIndex, 1);
    location.ratingCount = location.reviews.length;

    // Tính lại rating trung bình
    if (location.reviews.length > 0) {
      const totalRating = location.reviews.reduce((sum, r) => sum + r.rating, 0);
      location.rating = totalRating / location.reviews.length;
    } else {
      location.rating = 0;
    }

    await location.save();

    res.json({
      success: true,
      message: 'Review deleted successfully',
      location,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Quản lý người dùng (Users Management)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments();

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    // Không cho xóa chính mình
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Xóa tất cả lịch trình của user đó
    await Itinerary.deleteMany({ userId: req.params.id });

    res.json({
      success: true,
      message: 'User and their itineraries deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role } = req.body;

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be "user" or "admin"',
      });
    }

    // Không cho đổi role chính mình
    if (role && req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role',
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
      message: 'User updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be "user" or "admin"',
      });
    }

    // Không cho đổi role chính mình
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    try {
      getIO().emit('user_updated', { user });
    } catch (e) {
      console.warn('Socket emit failed');
    }

    res.json({
      success: true,
      user,
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Quản lý lịch trình (Itineraries Management)
router.get('/itineraries', async (req, res) => {
  try {
    const { page = 1, limit = 20, shared } = req.query;
    const query = {};

    if (shared === 'true') {
      query.isShared = true;
    }

    const itineraries = await Itinerary.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email')
      .select('title destination startDate endDate totalEstimatedCost isShared createdAt userId reviews');

    const total = await Itinerary.countDocuments(query);

    res.json({
      success: true,
      itineraries,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get('/itineraries/:id', async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id)
      .populate('userId', 'name email');

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    res.json({
      success: true,
      itinerary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.put('/itineraries/:id', async (req, res) => {
  try {
    const itinerary = await Itinerary.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('userId', 'name email');

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    // Log activity
    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_edit_itinerary',
      targetType: 'itinerary',
      targetId: req.params.id,
      details: { title: itinerary.title },
    });

    res.json({
      success: true,
      itinerary,
      message: 'Itinerary updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete('/itineraries/:id', async (req, res) => {
  try {
    const itinerary = await Itinerary.findByIdAndDelete(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    // Log activity
    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_delete_itinerary',
      targetType: 'itinerary',
      targetId: req.params.id,
      details: { title: itinerary.title },
    });

    res.json({
      success: true,
      message: 'Itinerary deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Bulk delete itineraries
router.post('/itineraries/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No itinerary IDs provided',
      });
    }

    await Itinerary.deleteMany({ _id: { $in: ids } });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_bulk_delete_itineraries',
      targetType: 'itinerary',
      details: { count: ids.length },
    });

    res.json({
      success: true,
      message: `Deleted ${ids.length} itineraries`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Itinerary Reviews Management
router.get('/itinerary-reviews', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const itineraries = await Itinerary.find({ 'reviews.0': { $exists: true } })
      .populate('userId', 'name email')
      .populate('reviews.userId', 'name email avatar')
      .select('title destination reviews createdAt')
      .sort({ 'reviews.createdAt': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Flatten reviews
    const allReviews = [];
    itineraries.forEach(itin => {
      itin.reviews.forEach(review => {
        allReviews.push({
          _id: review._id,
          itineraryId: itin._id,
          itineraryTitle: itin.title,
          rating: review.rating,
          comment: review.comment,
          userId: review.userId,
          createdAt: review.createdAt,
        });
      });
    });

    res.json({
      success: true,
      reviews: allReviews.slice(0, limit),
      total: allReviews.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete('/itineraries/:itineraryId/reviews/:reviewId', async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.itineraryId);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    const reviewIndex = itinerary.reviews.findIndex(
      r => r._id.toString() === req.params.reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    itinerary.reviews.splice(reviewIndex, 1);
    await itinerary.save();

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_delete_itinerary_review',
      targetType: 'review',
      targetId: req.params.reviewId,
      details: { itineraryId: req.params.itineraryId },
    });

    res.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Reports Management
router.get('/reports', async (req, res) => {
  try {
    const { status, targetType, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (targetType) query.targetType = targetType;

    const reports = await Report.find(query)
      .populate('reportedBy', 'name email avatar')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.put('/reports/:id', async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        adminNotes,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    ).populate('reportedBy', 'name email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_review_report',
      targetType: 'report',
      targetId: req.params.id,
      details: { status, targetType: report.targetType },
    });

    res.json({
      success: true,
      report,
      message: 'Report updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete('/reports/:id', async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Activity Logs
router.get('/activity-logs', async (req, res) => {
  try {
    const { userId, action, targetType, page = 1, limit = 50 } = req.query;
    const query = {};

    if (userId) query.userId = userId;
    if (action) query.action = new RegExp(action, 'i');
    if (targetType) query.targetType = targetType;

    const logs = await ActivityLog.find(query)
      .populate('userId', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ActivityLog.countDocuments(query);

    res.json({
      success: true,
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Create User
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_create_user',
      targetType: 'user',
      targetId: user._id,
      details: { name, email, role },
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      user: userResponse,
      message: 'User created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get user full profile with stats
router.get('/users/:id/profile', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const itineraries = await Itinerary.find({ userId: req.params.id })
      .select('title destination startDate endDate reviews isShared createdAt')
      .sort({ createdAt: -1 });

    const stats = {
      totalItineraries: itineraries.length,
      sharedItineraries: itineraries.filter(i => i.isShared).length,
      totalReviews: itineraries.reduce((sum, i) => sum + (i.reviews?.length || 0), 0),
    };

    res.json({
      success: true,
      user,
      itineraries,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Bulk delete users
router.post('/users/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No user IDs provided',
      });
    }

    // Prevent deleting self
    if (ids.includes(req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    await User.deleteMany({ _id: { $in: ids } });
    await Itinerary.deleteMany({ userId: { $in: ids } });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_bulk_delete_users',
      targetType: 'user',
      details: { count: ids.length },
    });

    res.json({
      success: true,
      message: `Deleted ${ids.length} users and their itineraries`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Bulk delete locations
router.post('/locations/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No location IDs provided',
      });
    }

    await Location.deleteMany({ _id: { $in: ids } });

    await ActivityLog.create({
      userId: req.user._id,
      action: 'admin_bulk_delete_locations',
      targetType: 'location',
      details: { count: ids.length },
    });

    res.json({
      success: true,
      message: `Deleted ${ids.length} locations`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;





