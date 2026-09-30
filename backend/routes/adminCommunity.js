import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import Location from '../models/Location.js';

const router = express.Router();

// Tất cả các route đều yêu cầu admin
router.use(protect);
router.use(admin);

// Lấy tất cả community contributions (ảnh + bài viết) để review
router.get('/contributions', async (req, res) => {
  try {
    const { limit = 50, skip = 0, status = 'all' } = req.query;
    
    const locations = await Location.find({
      $or: [
        { 'communityImages.0': { $exists: true } },
        { 'communityExperiences.0': { $exists: true } }
      ]
    })
      .populate('communityImages.userId', 'name email')
      .populate('communityExperiences.userId', 'name email')
      .select('name city country communityImages communityExperiences')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ updatedAt: -1 })
      .lean();

    // Flatten contributions để dễ quản lý
    const contributions = [];
    
    locations.forEach(location => {
      // Images
      if (location.communityImages) {
        location.communityImages.forEach(img => {
          if (status === 'all' || 
              (status === 'pending' && !img.isApproved) ||
              (status === 'approved' && img.isApproved)) {
            contributions.push({
              type: 'image',
              locationId: location._id,
              locationName: location.name,
              locationCity: location.city,
              contributionId: img._id,
              content: img.url,
              userId: img.userId,
              uploadedAt: img.uploadedAt,
              isApproved: img.isApproved,
            });
          }
        });
      }
      
      // Experiences
      if (location.communityExperiences) {
        location.communityExperiences.forEach(exp => {
          if (status === 'all' || 
              (status === 'pending' && !exp.isApproved) ||
              (status === 'approved' && exp.isApproved)) {
            contributions.push({
              type: 'experience',
              locationId: location._id,
              locationName: location.name,
              locationCity: location.city,
              contributionId: exp._id,
              content: exp.text,
              userId: exp.userId,
              createdAt: exp.createdAt,
              isApproved: exp.isApproved,
            });
          }
        });
      }
    });

    // Sắp xếp theo thời gian mới nhất
    contributions.sort((a, b) => 
      new Date(b.uploadedAt || b.createdAt) - new Date(a.uploadedAt || a.createdAt)
    );

    res.json({
      success: true,
      contributions,
      total: contributions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Approve một contribution
router.put('/contributions/:locationId/approve/:contributionId', async (req, res) => {
  try {
    const { locationId, contributionId } = req.params;
    const { type } = req.body; // 'image' hoặc 'experience'

    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    let updated = false;

    if (type === 'image') {
      const img = location.communityImages.id(contributionId);
      if (img) {
        img.isApproved = true;
        updated = true;
      }
    } else if (type === 'experience') {
      const exp = location.communityExperiences.id(contributionId);
      if (exp) {
        exp.isApproved = true;
        updated = true;
      }
    }

    if (updated) {
      location.updatedAt = Date.now();
      await location.save();
      
      res.json({
        success: true,
        message: 'Đã duyệt đóng góp',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đóng góp',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Reject/Hide một contribution
router.put('/contributions/:locationId/reject/:contributionId', async (req, res) => {
  try {
    const { locationId, contributionId } = req.params;
    const { type } = req.body;

    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    let updated = false;

    if (type === 'image') {
      const img = location.communityImages.id(contributionId);
      if (img) {
        img.isApproved = false;
        updated = true;
      }
    } else if (type === 'experience') {
      const exp = location.communityExperiences.id(contributionId);
      if (exp) {
        exp.isApproved = false;
        updated = true;
      }
    }

    if (updated) {
      location.updatedAt = Date.now();
      await location.save();
      
      res.json({
        success: true,
        message: 'Đã ẩn đóng góp',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đóng góp',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa vĩnh viễn một contribution
router.delete('/contributions/:locationId/:contributionId', async (req, res) => {
  try {
    const { locationId, contributionId } = req.params;
    const { type } = req.query;

    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    let deleted = false;

    if (type === 'image') {
      const imgIndex = location.communityImages.findIndex(
        img => img._id.toString() === contributionId
      );
      if (imgIndex !== -1) {
        location.communityImages.splice(imgIndex, 1);
        deleted = true;
      }
    } else if (type === 'experience') {
      const expIndex = location.communityExperiences.findIndex(
        exp => exp._id.toString() === contributionId
      );
      if (expIndex !== -1) {
        location.communityExperiences.splice(expIndex, 1);
        deleted = true;
      }
    }

    if (deleted) {
      location.updatedAt = Date.now();
      await location.save();
      
      res.json({
        success: true,
        message: 'Đã xóa đóng góp',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đóng góp',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Bulk approve/reject
router.post('/contributions/bulk-action', async (req, res) => {
  try {
    const { action, contributions } = req.body; // action: 'approve' hoặc 'reject'
    
    if (!contributions || !Array.isArray(contributions)) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách contributions không hợp lệ',
      });
    }

    let updated = 0;

    for (const contrib of contributions) {
      try {
        const location = await Location.findById(contrib.locationId);
        if (!location) continue;

        if (contrib.type === 'image') {
          const img = location.communityImages.id(contrib.contributionId);
          if (img) {
            img.isApproved = action === 'approve';
            updated++;
          }
        } else if (contrib.type === 'experience') {
          const exp = location.communityExperiences.id(contrib.contributionId);
          if (exp) {
            exp.isApproved = action === 'approve';
            updated++;
          }
        }

        location.updatedAt = Date.now();
        await location.save();
      } catch (err) {
        console.error(`Failed to update contribution ${contrib.contributionId}:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `Đã ${action === 'approve' ? 'duyệt' : 'ẩn'} ${updated} đóng góp`,
      updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
