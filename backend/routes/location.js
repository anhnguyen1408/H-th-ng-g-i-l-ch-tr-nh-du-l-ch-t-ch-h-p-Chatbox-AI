import express from 'express';
import Location from '../models/Location.js';
import Report from '../models/Report.js';
import { protect } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

// Lấy danh sách địa điểm từ BẢNG LOCATION TỔNG (public)
router.get('/', async (req, res) => {
  try {
    const { 
      city, 
      country, 
      type, 
      page = 1, 
      limit = 20, 
      search,
      sort = 'rating', // rating, usage, newest, verified
      verified,
      minRating,
    } = req.query;
    
    const query = { isActive: true, isPublic: true }; // Chỉ lấy public locations

    if (city) query.city = new RegExp(city, 'i');
    if (country) query.country = new RegExp(country, 'i');
    if (type) query.type = type;
    if (verified === 'true') query.isVerified = true;
    if (minRating) query.rating = { $gte: parseFloat(minRating) };
    
    // Tìm kiếm theo tên, địa chỉ, tags
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') },
      ];
    }

    // Sắp xếp
    let sortOption = {};
    switch (sort) {
      case 'usage':
        sortOption = { usageCount: -1, rating: -1 };
        break;
      case 'newest':
        sortOption = { updatedAt: -1 };
        break;
      case 'verified':
        sortOption = { isVerified: -1, rating: -1, usageCount: -1 };
        break;
      case 'rating':
      default:
        sortOption = { rating: -1, ratingCount: -1, usageCount: -1 };
        break;
    }

    const locations = await Location.find(query)
      .sort(sortOption)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-reviews'); // Không trả về reviews chi tiết để giảm payload

    const total = await Location.countDocuments(query);

    res.json({
      success: true,
      locations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      message: `Tìm thấy ${total} địa điểm trong bảng location tổng`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy địa điểm phổ biến nhất (theo số lần sử dụng)
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10, type } = req.query;
    const query = { isActive: true, isPublic: true, usageCount: { $gt: 0 } };
    
    if (type) query.type = type;

    const locations = await Location.find(query)
      .sort({ usageCount: -1, rating: -1 })
      .limit(parseInt(limit))
      .select('name type city country address coordinates rating usageCount stats images');

    res.json({
      success: true,
      locations,
      count: locations.length,
      message: 'Địa điểm phổ biến nhất trong bảng location tổng',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy địa điểm được đánh giá cao nhất
router.get('/top-rated', async (req, res) => {
  try {
    const { limit = 10, minRatingCount = 3 } = req.query;
    const query = { 
      isActive: true, 
      isPublic: true,
      rating: { $gte: 4 },
      ratingCount: { $gte: parseInt(minRatingCount) },
    };

    const locations = await Location.find(query)
      .sort({ rating: -1, ratingCount: -1 })
      .limit(parseInt(limit))
      .select('name type city country address coordinates rating ratingCount usageCount images');

    res.json({
      success: true,
      locations,
      count: locations.length,
      message: 'Địa điểm được đánh giá cao nhất',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Thống kê BẢNG LOCATION TỔNG
router.get('/stats', async (req, res) => {
  try {
    const total = await Location.countDocuments({});
    const active = await Location.countDocuments({ isActive: true });
    const inactive = await Location.countDocuments({ isActive: false });
    const publicLocations = await Location.countDocuments({ isActive: true, isPublic: true });
    const verified = await Location.countDocuments({ isActive: true, isVerified: true });
    
    // Thống kê theo type
    const byType = await Location.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    
    // Thống kê theo city
    const byCity = await Location.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    
    // Tổng số lần sử dụng
    const totalUsage = await Location.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$usageCount' } } },
    ]);
    
    // Lấy database name
    const dbName = Location.db.name;
    const collectionName = Location.collection.name;
    
    res.json({
      success: true,
      stats: {
        total,
        active,
        inactive,
        public: publicLocations,
        verified,
        totalUsage: totalUsage[0]?.total || 0,
      },
      breakdown: {
        byType,
        topCities: byCity,
      },
      database: {
        name: dbName,
        collection: collectionName,
        fullPath: `${dbName}.${collectionName}`,
      },
      message: `BẢNG LOCATION TỔNG: ${total} địa điểm (${active} active, ${publicLocations} public, ${verified} verified)`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Tìm kiếm địa điểm gần đây (theo tọa độ)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, maxDistance = 10000, type } = req.query; // maxDistance tính bằng mét

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    // Sử dụng locationService để tìm kiếm
    const { findNearbyLocation } = await import('../services/locationService.js');
    
    // Tìm trong phạm vi lớn hơn và lọc kết quả
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const maxDistanceKm = parseInt(maxDistance) / 1000;
    
    // Tìm tất cả locations trong bounding box
    const latRange = maxDistanceKm / 111;
    const lngRange = maxDistanceKm / (111 * Math.cos(latNum * Math.PI / 180));

    const query = {
      isActive: true,
      'coordinates.lat': {
        $gte: latNum - latRange,
        $lte: latNum + latRange,
      },
      'coordinates.lng': {
        $gte: lngNum - lngRange,
        $lte: lngNum + lngRange,
      },
    };

    if (type) query.type = type;

    const candidates = await Location.find(query)
      .limit(100); // Lấy nhiều hơn để lọc

    // Tính khoảng cách và lọc
    const R = 6371; // Bán kính Trái Đất (km)
    const locationsWithDistance = candidates
      .map((loc) => {
        const dLat = (loc.coordinates.lat - latNum) * Math.PI / 180;
        const dLng = (loc.coordinates.lng - lngNum) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(latNum * Math.PI / 180) *
            Math.cos(loc.coordinates.lat * Math.PI / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c * 1000; // Chuyển sang mét
        return { location: loc, distance };
      })
      .filter((item) => item.distance <= parseInt(maxDistance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20) // Giới hạn 20 kết quả
      .map((item) => item.location);

    res.json({
      success: true,
      locations: locationsWithDistance,
      count: locationsWithDistance.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy thông tin chi tiết một địa điểm theo ID
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location id',
      });
    }

    const location = await Location.findById(req.params.id)
      .populate('reviews.userId', 'name avatar')
      .populate('communityImages.userId', 'name avatar')
      .populate('communityExperiences.userId', 'name avatar');

    if (!location || !location.isActive) {
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

// Tạo địa điểm mới (yêu cầu đăng nhập)
router.post('/', protect, async (req, res) => {
  try {
    const locationData = {
      ...req.body,
    };

    // Kiểm tra xem địa điểm đã tồn tại chưa (theo tên và địa chỉ)
    const existingLocation = await Location.findOne({
      name: locationData.name,
      address: locationData.address,
      isActive: true,
    });

    if (existingLocation) {
      return res.status(400).json({
        success: false,
        message: 'Location already exists',
        location: existingLocation,
      });
    }

    console.log(' Creating location via API:', locationData.name);
    const location = await Location.create(locationData);
    console.log(' Location created via API:', location._id);

    res.status(201).json({
      success: true,
      location,
      message: 'Location created successfully',
    });
  } catch (error) {
    console.error('❌ Error creating location via API:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
});

// TEST: Tạo location test để kiểm tra database
router.post('/test', protect, async (req, res) => {
  try {
    const testLocation = {
      name: 'Test Location ' + Date.now(),
      type: 'attraction',
      city: 'Hà Nội',
      country: 'Vietnam',
      address: 'Test Address',
      coordinates: {
        lat: 21.0358,
        lng: 105.8320,
      },
      description: 'Test location để kiểm tra database',
    };

    console.log(' TEST: Creating test location...');
    console.log(' TEST: Location data:', JSON.stringify(testLocation, null, 2));
    
    const location = await Location.create(testLocation);
    
    // Verify
    const saved = await Location.findById(location._id);
    const total = await Location.countDocuments({});
    
    console.log(' TEST: Location created:', location._id);
    console.log(' TEST: Verified in database:', saved ? 'YES' : 'NO');
    console.log(' TEST: Total locations in database:', total);

    res.json({
      success: true,
      location,
      verified: !!saved,
      totalLocations: total,
      message: `Test location created successfully. Total locations: ${total}`,
    });
  } catch (error) {
    console.error(' TEST: Error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.errors || error,
    });
  }
});

// Cập nhật địa điểm (chỉ chủ sở hữu hoặc admin)
router.put('/:id', protect, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    // Kiểm tra quyền: chỉ admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this location. Admin only.',
      });
    }

    // Cập nhật thông tin
    Object.assign(location, req.body);
    location.updatedAt = Date.now();
    await location.save();

    res.json({
      success: true,
      location,
      message: 'Location updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Thêm đánh giá cho địa điểm (từ bảng location tổng)
router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const location = await Location.findById(req.params.id);

    if (!location || !location.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    await location.addReview(req.user._id, rating, comment);

    res.json({
      success: true,
      message: 'Review added successfully',
      location: {
        _id: location._id,
        name: location.name,
        rating: location.rating,
        ratingCount: location.ratingCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy đánh giá của một địa điểm
router.get('/:id/reviews', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id)
      .select('reviews rating ratingCount')
      .populate('reviews.userId', 'name');

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    res.json({
      success: true,
      reviews: location.reviews || [],
      rating: location.rating,
      ratingCount: location.ratingCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Thêm ảnh cộng đồng cho địa điểm
router.post('/:id/community-images', protect, async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;
    const location = await Location.findById(req.params.id);

    if (!location || !location.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required',
      });
    }

    location.communityImages.push({
      url: imageUrl,
      caption: caption || '',
      userId: req.user._id,
      uploadedAt: new Date(),
    });

    await location.save();

    const updatedLocation = await Location.findById(req.params.id)
      .populate('communityImages.userId', 'name avatar');

    res.json({
      success: true,
      message: 'Community image added successfully',
      location: updatedLocation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa ảnh cộng đồng (chỉ xóa ảnh của mình)
router.delete('/:id/community-images/:imageId', protect, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location || !location.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    const imageIndex = location.communityImages.findIndex(
      img => img._id.toString() === req.params.imageId && img.userId.toString() === req.user._id.toString()
    );

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Image not found or you are not authorized to delete this image',
      });
    }

    location.communityImages.splice(imageIndex, 1);
    await location.save();

    res.json({
      success: true,
      message: 'Community image deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa review (chỉ xóa review của mình)
router.delete('/:id/reviews/:reviewId', protect, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    const reviewIndex = location.reviews.findIndex(
      review => review._id.toString() === req.params.reviewId && review.userId.toString() === req.user._id.toString()
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Review not found or you are not authorized to delete this review',
      });
    }

    location.reviews.splice(reviewIndex, 1);
    
    // Recalculate rating
    if (location.reviews.length > 0) {
      const totalRating = location.reviews.reduce((sum, review) => sum + review.rating, 0);
      location.rating = totalRating / location.reviews.length;
      location.ratingCount = location.reviews.length;
    } else {
      location.rating = 0;
      location.ratingCount = 0;
    }

    await location.save();

    res.json({
      success: true,
      message: 'Review deleted successfully',
      location: {
        _id: location._id,
        rating: location.rating,
        ratingCount: location.ratingCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post('/:id/reviews/:reviewId/report', protect, async (req, res) => {
  try {
    const { reason, description } = req.body;

    const allowedReasons = [
      'spam',
      'harassment',
      'inappropriate_content',
      'false_information',
      'copyright',
      'other',
    ];

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reason',
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Description is required',
      });
    }

    const { id, reviewId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid id',
      });
    }

    const location = await Location.findById(id).select('reviews name');
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    const reviewExists = Array.isArray(location.reviews)
      ? location.reviews.some((r) => String(r._id) === String(reviewId))
      : false;

    if (!reviewExists) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    const existing = await Report.findOne({
      reportedBy: req.user._id,
      targetType: 'review',
      targetId: reviewId,
      status: { $in: ['pending', 'reviewed', 'resolved'] },
    }).lean();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this review',
      });
    }

    const report = await Report.create({
      reportedBy: req.user._id,
      targetType: 'review',
      targetId: reviewId,
      reason,
      description: `Location: ${location.name || ''}\n${description.trim()}`.trim(),
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      report,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa địa điểm (soft delete - chỉ chủ sở hữu hoặc admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    // Kiểm tra quyền: chỉ admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this location. Admin only.',
      });
    }

    // Soft delete
    location.isActive = false;
    location.updatedAt = Date.now();
    await location.save();

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

export default router;
