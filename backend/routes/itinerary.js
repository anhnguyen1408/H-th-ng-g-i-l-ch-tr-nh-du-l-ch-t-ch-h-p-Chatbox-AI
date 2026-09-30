import express from 'express';
import Itinerary from '../models/Itinerary.js';
import Location from '../models/Location.js';
import { protect } from '../middleware/auth.js';
import { generateItinerary } from '../services/aiService.js';
import { autoScheduleItinerary } from '../services/autoScheduleService.js';
import { chatWithItinerary } from '../services/chatService.js';
import { createNotification } from '../services/notificationService.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';
import { convertActivityToLocationReference } from '../services/locationService.js';
import RecommendationLog from '../models/RecommendationLog.js';
import SelectionLog from '../models/SelectionLog.js';
import crypto from 'crypto';

// Helper function để populate hình ảnh, reviews và user contributions vào activities
const populateActivityImages = async (itinerary) => {
  if (!itinerary.days || itinerary.days.length === 0) {
    return itinerary;
  }

  // Convert Mongoose document to plain object để có thể modify
  const itineraryObj = itinerary.toObject ? itinerary.toObject() : JSON.parse(JSON.stringify(itinerary));

  for (const day of itineraryObj.days) {
    if (day.activities && day.activities.length > 0) {
      for (const activity of day.activities) {
        // Khởi tạo locationImages và locationReviews mặc định
        activity.locationImages = activity.locationImages || [];
        activity.locationReviews = activity.locationReviews || [];
        activity.locationRating = activity.locationRating || 0;
        activity.locationRatingCount = activity.locationRatingCount || 0;

        // Nếu có locationId, fetch location để lấy hình ảnh, reviews và thông tin khác
        if (activity.locationId) {
          try {
            const location = await Location.findById(activity.locationId)
              .populate('reviews.userId', 'name email avatar')
              .populate('communityImages.userId', 'name email avatar')
              .populate('communityExperiences.userId', 'name email avatar')
              .lean();

            if (location) {
              // Thêm locationId vào activity để frontend biết location ID
              activity.locationId = location._id;

              // 1. Lấy ảnh cộng đồng từ Location (chỉ lấy đã được duyệt)
              if (location.communityImages && location.communityImages.length > 0) {
                activity.locationImages = location.communityImages
                  .filter(img => img.isApproved === true)
                  .map(img => ({
                    _id: img._id,
                    url: img.url,
                    userId: img.userId,
                    uploadedAt: img.uploadedAt,
                  }));
              } else {
                activity.locationImages = [];
              }

              // 1b. Lấy trải nghiệm cộng đồng từ Location (chỉ lấy đã được duyệt)
              if (location.communityExperiences && location.communityExperiences.length > 0) {
                activity.locationExperiences = location.communityExperiences
                  .filter(exp => exp.isApproved === true)
                  .map(exp => ({
                    _id: exp._id,
                    text: exp.text,
                    userId: exp.userId,
                    createdAt: exp.createdAt,
                  }));
              } else {
                activity.locationExperiences = [];
              }

              // Set activity.image từ location.images (admin images) nếu chưa có
              if (location.images && location.images.length > 0) {
                if (!activity.image || !activity.image.startsWith('http')) {
                  activity.image = location.images[0];
                }
              }

              // 2. Lấy reviews từ Location (đánh giá từ cộng đồng)
              if (location.reviews && location.reviews.length > 0) {
                activity.locationReviews = location.reviews.map(review => ({
                  _id: review._id,
                  userId: review.userId,
                  rating: review.rating,
                  comment: review.comment,
                  createdAt: review.createdAt,
                }));
                // Tính rating trung bình
                const totalRating = location.reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
                activity.locationRating = location.reviews.length > 0 ? totalRating / location.reviews.length : 0;
                activity.locationRatingCount = location.reviews.length;
              } else {
                activity.locationReviews = [];
                activity.locationRating = location.rating || 0;
                activity.locationRatingCount = location.ratingCount || 0;
              }

              // 3. Thêm thông tin location khác
              activity.locationInfo = {
                rating: location.rating || 0,
                ratingCount: location.ratingCount || 0,
                averageCost: location.averageCost || 0,
                priceRange: location.priceRange || 'mid-range',
                openingHours: location.openingHours || '',
                contact: location.contact || {},
                tags: location.tags || [],
              };
            } else {
              // Location không tồn tại, đảm bảo các field vẫn là mảng rỗng
              activity.locationId = null;
              activity.locationImages = [];
              activity.locationReviews = [];
            }
          } catch (error) {
            console.warn(`Failed to fetch location for activity ${activity.name}:`, error.message);
            // Đảm bảo các field vẫn được khởi tạo khi có lỗi
            activity.locationImages = activity.locationImages || [];
            activity.locationReviews = activity.locationReviews || [];
          }
        }

        // 4. Đảm bảo userContributions có cấu trúc đúng
        if (!activity.userContributions) {
          activity.userContributions = {
            images: [],
            experience: null,
            visited: false,
          };
        }

        // 5. Xử lý userContributions.images (ảnh đóng góp của user cho activity này)
        if (activity.userContributions.images) {
          // Đảm bảo images là array và có format đúng
          if (!Array.isArray(activity.userContributions.images)) {
            activity.userContributions.images = [];
          }
          // Nếu images là array of objects với url, giữ nguyên
          // Nếu images là array of strings, convert thành objects
          activity.userContributions.images = activity.userContributions.images.map(img => {
            if (typeof img === 'string') {
              return { url: img, uploadedAt: new Date() };
            }
            return img;
          });
        }

        // 6. Đảm bảo userContributions.experience có format đúng
        if (activity.userContributions.experience) {
          // Nếu experience là string, convert thành object
          if (typeof activity.userContributions.experience === 'string') {
            activity.userContributions.experience = {
              text: activity.userContributions.experience,
              createdAt: new Date(),
            };
          }
        }

        // 7. Lấy contributions từ các users khác (nếu có locationId)
        if (activity.locationId) {
          try {
            // Tìm tất cả các itineraries có activities với cùng locationId
            const otherItineraries = await Itinerary.find({
              _id: { $ne: itinerary._id }, // Loại trừ itinerary hiện tại
              'days.activities.locationId': activity.locationId,
            })
              .populate('userId', 'name email avatar')
              .select('days userId')
              .lean();

            const otherUsersContributions = {
              images: [],
              experiences: [],
            };

            // Duyệt qua tất cả các itineraries khác
            for (const otherItinerary of otherItineraries) {
              if (!otherItinerary.days || !Array.isArray(otherItinerary.days)) continue;

              // Tìm activities có cùng locationId
              for (const day of otherItinerary.days) {
                if (!day.activities || !Array.isArray(day.activities)) continue;

                for (const otherActivity of day.activities) {
                  // Chỉ lấy contributions từ activities có cùng locationId
                  if (otherActivity.locationId && 
                      otherActivity.locationId.toString() === activity.locationId.toString() &&
                      otherActivity.userContributions) {
                    
                    // Lấy ảnh từ user khác
                    if (otherActivity.userContributions.images && 
                        Array.isArray(otherActivity.userContributions.images) &&
                        otherActivity.userContributions.images.length > 0) {
                      otherActivity.userContributions.images.forEach(img => {
                        otherUsersContributions.images.push({
                          url: typeof img === 'string' ? img : img.url,
                          uploadedAt: typeof img === 'string' ? new Date() : (img.uploadedAt || new Date()),
                          userId: otherItinerary.userId,
                          itineraryId: otherItinerary._id,
                        });
                      });
                    }

                    // Lấy trải nghiệm từ user khác
                    if (otherActivity.userContributions.experience && 
                        otherActivity.userContributions.experience.text) {
                      otherUsersContributions.experiences.push({
                        text: otherActivity.userContributions.experience.text,
                        createdAt: otherActivity.userContributions.experience.createdAt || new Date(),
                        userId: otherItinerary.userId,
                        itineraryId: otherItinerary._id,
                      });
                    }
                  }
                }
              }
            }

            // Sắp xếp theo thời gian (mới nhất trước)
            otherUsersContributions.images.sort((a, b) => 
              new Date(b.uploadedAt) - new Date(a.uploadedAt)
            );
            otherUsersContributions.experiences.sort((a, b) => 
              new Date(b.createdAt) - new Date(a.createdAt)
            );

            // Gán vào activity
            activity.otherUsersContributions = otherUsersContributions;
          } catch (error) {
            console.warn(`Failed to fetch other users contributions for activity ${activity.name}:`, error.message);
            activity.otherUsersContributions = {
              images: [],
              experiences: [],
            };
          }
        } else {
          // Không có locationId, khởi tạo mảng rỗng
          activity.otherUsersContributions = {
            images: [],
            experiences: [],
          };
        }
      }
    }
  }

  return itineraryObj;
};

const router = express.Router();

// Lấy danh sách lịch trình public (không cần auth)
router.get('/public', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build query filters - hiển thị lịch trình công khai
    const query = { 
      $or: [
        { isPublic: true },
        { isShared: true }
      ]
    };
    
    // Filter by destination - flexible search (Huế → Thừa Thiên Huế)
    if (req.query.destination && req.query.destination.trim()) {
      const searchTerm = req.query.destination.trim();
      // Split by space and create OR conditions for each word
      const words = searchTerm.split(/\s+/);
      if (words.length > 1) {
        // Multiple words - match all
        query.$and = words.map(word => ({
          destination: { $regex: word, $options: 'i' }
        }));
      } else {
        // Single word - simple regex
        query.destination = { $regex: searchTerm, $options: 'i' };
      }
    }
    
    // Filter by budget range - dùng totalEstimatedCost (cost thực tế)
    if (req.query.minBudget || req.query.maxBudget) {
      query.totalEstimatedCost = {};
      if (req.query.minBudget) {
        query.totalEstimatedCost.$gte = parseInt(req.query.minBudget);
      }
      if (req.query.maxBudget) {
        query.totalEstimatedCost.$lte = parseInt(req.query.maxBudget);
      }
    }

    // Sort options
    let sortOptions = { createdAt: -1 }; // default
    if (req.query.sortBy) {
      switch (req.query.sortBy) {
        case 'averageRating':
          sortOptions = { averageRating: -1, createdAt: -1 };
          break;
        case 'likesCount':
          sortOptions = { likesCount: -1, createdAt: -1 };
          break;
        case 'budget':
          // Sort by totalEstimatedCost (cost thực tế)
          sortOptions = { totalEstimatedCost: req.query.order === 'asc' ? 1 : -1 };
          break;
        case 'createdAt':
        default:
          sortOptions = { createdAt: req.query.order === 'asc' ? 1 : -1 };
          break;
      }
    }

    // Lấy các itinerary với filters
    const itineraries = await Itinerary.find(query)
      .populate('userId', 'name email avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .select('title destination startDate endDate numberOfPeople budget interests days totalEstimatedCost createdAt userId averageRating likesCount');

    const total = await Itinerary.countDocuments(query);

    res.json({
      success: true,
      itineraries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching public itineraries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public itineraries',
    });
  }
});

router.post('/generate-from-locations', protect, async (req, res) => {
  try {
    const {
      destination,
      destinationCity,
      destinationCoordinates,
      startDate,
      endDate,
      numberOfPeople,
      budget,
      interests,
      locationIds,
    } = req.body;

    if (!destination || !startDate || !endDate || !numberOfPeople || !budget) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'locationIds is required',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (!Number.isFinite(daysCount) || daysCount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range',
      });
    }

    const uniqueLocationIds = [...new Set(locationIds.map((x) => String(x)))];
    const locations = await Location.find({
      _id: { $in: uniqueLocationIds },
      isActive: true,
    }).lean();

    if (!locations || locations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No locations found',
      });
    }

    const locationById = new Map(locations.map((l) => [String(l._id), l]));
    const pickedLocations = uniqueLocationIds.map((id) => locationById.get(String(id))).filter(Boolean);

    const defaultDurationByType = {
      attraction: 90,
      restaurant: 60,
      hotel: 120,
      activity: 90,
    };

    const days = Array.from({ length: daysCount }).map((_, idx) => {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + idx);
      return {
        date: dayDate,
        activities: [],
        estimatedCost: 0,
      };
    });

    const getLeastBusyDayIndex = () => {
      let bestIdx = 0;
      let bestCount = Number.POSITIVE_INFINITY;
      for (let i = 0; i < days.length; i += 1) {
        const c = Array.isArray(days[i].activities) ? days[i].activities.length : 0;
        if (c < bestCount) {
          bestCount = c;
          bestIdx = i;
        }
      }
      return bestIdx;
    };

    for (const loc of pickedLocations) {
      const dayIdx = getLeastBusyDayIndex();
      const activityIndexInDay = days[dayIdx].activities.length;
      const baseHour = 9;
      const hour = Math.min(baseHour + (activityIndexInDay * 2), 20);
      const time = `${String(hour).padStart(2, '0')}:00`;

      const cost = Number.isFinite(loc.averageCost) ? loc.averageCost : 0;

      days[dayIdx].activities.push({
        time,
        type: loc.type,
        name: loc.name,
        description: loc.description || '',
        locationId: loc._id,
        location: {
          address: loc.address,
          coordinates: {
            lat: loc.coordinates?.lat,
            lng: loc.coordinates?.lng,
          },
        },
        duration: defaultDurationByType[loc.type] || 90,
        cost,
        rating: loc.rating || 0,
      });
    }

    for (const day of days) {
      day.activities.sort((a, b) => {
        if (!a?.time) return 1;
        if (!b?.time) return -1;
        return String(a.time).localeCompare(String(b.time));
      });
      day.estimatedCost = day.activities.reduce((total, act) => total + (act.cost || 0), 0);
    }

    let locationsUpdated = 0;
    for (const loc of pickedLocations) {
      try {
        const locDoc = await Location.findById(loc._id);
        if (locDoc && typeof locDoc.incrementUsage === 'function') {
          await locDoc.incrementUsage(req.user._id);
          locationsUpdated += 1;
        }
      } catch (e) {
        // ignore
      }
    }

    let itinerary = await Itinerary.create({
      userId: req.user._id,
      title: `Trip to ${destination}`,
      destination,
      destinationCity,
      destinationCoordinates,
      startDate,
      endDate,
      numberOfPeople,
      budget,
      interests: interests || [],
      days,
    });

    itinerary = await populateActivityImages(itinerary);

    return res.status(201).json({
      success: true,
      itinerary,
      locationsUpdated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate itinerary',
    });
  }
});

// Tạo mới lịch trình bằng AI
router.post('/generate', protect, async (req, res) => {
  try {
    const { destination, destinationCity, destinationCoordinates, startDate, endDate, numberOfPeople, budget, interests, locationIds } = req.body;

    if (!destination || !startDate || !endDate || !numberOfPeople || !budget) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    if (Array.isArray(locationIds) && locationIds.length > 0) {
      try {
        const selected = [...new Set(locationIds.map((x) => String(x)).filter(Boolean))];
        const windowMs = 60 * 60 * 1000;
        const windowStart = new Date(Date.now() - windowMs);
        const latestRec = await RecommendationLog.findOne({
          userId: req.user._id,
          createdAt: { $gte: windowStart },
        }).sort({ createdAt: -1 }).lean();

        await SelectionLog.create({
          userId: req.user._id,
          recommendationLogId: latestRec?._id || null,
          selectedLocationIds: selected,
        });
      } catch (e) {
        // ignore logging errors
      }
    }

    // Gọi AI để sinh lịch trình
    // aiService đã xử lý:
    // 1. Lưu tất cả OSM places vào DB
    // 2. Gemini tạo itinerary
    // 3. Match activities với OSM locations
    // 4. Gắn locationId, osmId, osmType vào mỗi activity
    const aiItinerary = await generateItinerary({
      destination,
      destinationCity, // ← Canonical city từ Nominatim
      destinationCoordinates,
      startDate,
      endDate,
      numberOfPeople,
      budget,
      interests: interests || [],
      pickedLocationIds: Array.isArray(locationIds) ? locationIds : [],
    });

    //  FLOW MỚI: aiService đã gắn locationId cho activities
    // Chỉ cần increment usage count cho locations
    console.log(`\n Cập nhật usage count cho locations...`);
    let locationsUpdated = 0;
    
    for (const day of aiItinerary.days) {
      for (const activity of day.activities || []) {
        if (activity.locationId) {
          try {
            const location = await Location.findById(activity.locationId);
            if (location) {
              await location.incrementUsage(req.user._id);
              locationsUpdated++;
            }
          } catch (err) {
            console.warn(`     Failed to update usage for location ${activity.locationId}:`, err.message);
          }
        }
      }
    }
    
    console.log(`    Updated usage count for ${locationsUpdated} locations`);
    
    const daysWithLocationReferences = aiItinerary.days;
    
    // Xác minh: Đếm số locations đã được gắn vào activities
    const referencedLocationIds = [];
    daysWithLocationReferences.forEach(day => {
      day.activities?.forEach(activity => {
        if (activity.locationId) {
          referencedLocationIds.push(activity.locationId);
        }
      });
    });
    
    console.log(`\n Xác minh: Đã có ${referencedLocationIds.length} locationId được gán`);
    
    // Verify locations thực sự tồn tại trong database (deduplicate để so sánh đúng)
    if (referencedLocationIds.length > 0) {
      const uniqueLocationIds = [...new Set(referencedLocationIds.map(id => String(id)))];
      const existingLocations = await Location.find({ _id: { $in: uniqueLocationIds } });
      console.log(`    Xác minh: ${existingLocations.length}/${uniqueLocationIds.length} unique locations tồn tại trong database`);
      
      if (existingLocations.length < uniqueLocationIds.length) {
        console.warn(`    Cảnh báo: ${uniqueLocationIds.length - existingLocations.length} locations không tồn tại trong database`);
      }
    }

    // Tạo bản ghi lịch trình trong cơ sở dữ liệu
    let itinerary = await Itinerary.create({
      userId: req.user._id,
      title: `Trip to ${destination}`,
      destination,
      destinationCity, // ← Canonical city từ Nominatim
      destinationCoordinates,
      startDate,
      endDate,
      numberOfPeople,
      budget,
      interests: interests || [],
      days: daysWithLocationReferences,
      totalEstimatedCost: aiItinerary.totalEstimatedCost || 0,
    });

    console.log(` Đã tạo itinerary: ${itinerary._id}`);
    console.log(`   - Tổng số activities: ${itinerary.days.reduce((sum, day) => sum + (day.activities?.length || 0), 0)}`);
    console.log(`   - Số locations được tham chiếu: ${referencedLocationIds.length}\n`);

    // Populate hình ảnh vào activities
    itinerary = await populateActivityImages(itinerary);

    res.status(201).json({
      success: true,
      itinerary,
    });
  } catch (error) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate itinerary',
    });
  }
});

// Lấy danh sách lịch trình của người dùng hiện tại
router.get('/my-itineraries', protect, async (req, res) => {
  try {
    const itineraries = await Itinerary.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email avatar')
      .select('-days');
    
    res.json({
      success: true,
      count: itineraries.length,
      itineraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get('/favorites', async (req, res) => {
  try {
    const itineraries = await Itinerary.find({ isFavorite: true })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('userId', 'name')
      .select('title destination startDate endDate numberOfPeople totalEstimatedCost isShared createdAt userId');

    res.json({
      success: true,
      itineraries,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

//  QUAN TRỌNG: Các routes cụ thể phải được đăng ký TRƯỚC route /:id
// Lấy danh sách lịch trình đã hoàn thành
router.get('/completed', protect, async (req, res) => {
  try {
    console.log('Fetching completed itineraries for user:', req.user._id);
    
    // Tìm tất cả lịch trình của user, sau đó filter
    // Vì có thể có document cũ chưa có field status
    let allItineraries;
    try {
      allItineraries = await Itinerary.find({
        userId: req.user._id,
      })
        .lean();
      console.log(`Found ${allItineraries.length} total itineraries for user`);
    } catch (findError) {
      console.error('Error finding itineraries:', findError);
      throw findError;
    }

    // Filter chỉ lấy những cái có status = 'completed'
    const itineraries = allItineraries.filter(it => {
      return it.status === 'completed' || (it.completedAt && !it.status);
    });
    
    console.log(`Filtered to ${itineraries.length} completed itineraries`);

    // Sort
    itineraries.sort((a, b) => {
      const aDate = a.completedAt || a.updatedAt || a.createdAt || 0;
      const bDate = b.completedAt || b.updatedAt || b.createdAt || 0;
      return new Date(bDate) - new Date(aDate);
    });

    // Populate userId một cách an toàn
    if (itineraries.length > 0) {
      try {
        await Itinerary.populate(itineraries, { 
          path: 'userId', 
          select: 'name email avatar',
        });
        console.log('Successfully populated userId');
      } catch (populateError) {
        console.warn('Error populating userId (continuing without populate):', populateError.message);
        // Tiếp tục mà không populate
      }
    }

    // Map và chỉ lấy các fields cần thiết, xử lý null/undefined
    const simplifiedItineraries = [];
    for (const it of itineraries) {
      try {
        simplifiedItineraries.push({
          _id: it._id?.toString() || null,
          title: it.title || 'Không có tiêu đề',
          destination: it.destination || '',
          destinationCoordinates: it.destinationCoordinates || null,
          startDate: it.startDate || null,
          endDate: it.endDate || null,
          numberOfPeople: it.numberOfPeople || 1,
          budget: it.budget || 0,
          interests: Array.isArray(it.interests) ? it.interests : [],
          totalEstimatedCost: it.totalEstimatedCost || 0,
          isFavorite: it.isFavorite || false,
          isPublic: it.isPublic || false,
          likesCount: it.likesCount || 0,
          reviewsCount: it.reviewsCount || 0,
          averageRating: it.averageRating || 0,
          status: it.status || 'completed',
          startedAt: it.startedAt || null,
          completedAt: it.completedAt || null,
          createdAt: it.createdAt || null,
          updatedAt: it.updatedAt || null,
          shareLink: it.shareLink || null,
          isShared: it.isShared || false,
          userId: it.userId ? (typeof it.userId === 'object' ? it.userId : { _id: it.userId }) : null,
        });
      } catch (mapError) {
        console.error('Error mapping itinerary:', it._id, mapError);
        console.error('Itinerary data:', JSON.stringify(it, null, 2));
        // Bỏ qua item này
      }
    }

    console.log(`Returning ${simplifiedItineraries.length} itineraries`);

    res.json({
      success: true,
      count: simplifiedItineraries.length,
      itineraries: simplifiedItineraries,
    });
  } catch (error) {
    console.error('Error fetching completed itineraries:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể tải danh sách lịch trình đã hoàn thành',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Lấy lịch trình đang thực hiện
router.get('/active', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findOne({
      userId: req.user._id,
      status: 'in_progress',
    })
      .populate('userId', 'name email avatar');

    if (!itinerary) {
      return res.json({
        success: true,
        itinerary: null,
        message: 'Không có lịch trình đang thực hiện',
      });
    }

    // Populate hình ảnh vào activities
    const itineraryWithImages = await populateActivityImages(itinerary);

    res.json({
      success: true,
      itinerary: itineraryWithImages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy chi tiết một lịch trình cụ thể
router.get('/:id', protect, async (req, res) => {
  try {
    let itinerary = await Itinerary.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('reviews.userId', 'name');
    
    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    // Kiểm tra quyền: là chủ lịch trình, lịch trình được chia sẻ, hoặc lịch trình public
    const isOwner = itinerary.userId._id.toString() === req.user._id.toString();
    const isShared = itinerary.isShared;
    const isPublic = itinerary.isPublic;
    
    if (!isOwner && !isShared && !isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this itinerary',
      });
    }

    // Populate hình ảnh vào activities
    itinerary = await populateActivityImages(itinerary);

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

// Thêm một địa điểm (Location) vào itinerary và tự động chọn ngày phù hợp
router.post('/:id/add-location', protect, async (req, res) => {
  try {
    const { locationId, dayIndex } = req.body;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'locationId is required',
      });
    }

    const itinerary = await Itinerary.findById(req.params.id);
    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this itinerary',
      });
    }

    if (!Array.isArray(itinerary.days) || itinerary.days.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Itinerary has no days to add activities',
      });
    }

    const location = await Location.findById(locationId).lean();
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found',
      });
    }

    let targetDayIndex = Number.isInteger(dayIndex) ? dayIndex : parseInt(dayIndex, 10);
    if (!Number.isInteger(targetDayIndex) || targetDayIndex < 0 || targetDayIndex >= itinerary.days.length) {
      targetDayIndex = 0;
      let minCount = Number.POSITIVE_INFINITY;
      for (let i = 0; i < itinerary.days.length; i += 1) {
        const c = Array.isArray(itinerary.days[i].activities) ? itinerary.days[i].activities.length : 0;
        if (c < minCount) {
          minCount = c;
          targetDayIndex = i;
        }
      }
    }

    if (!Array.isArray(itinerary.days[targetDayIndex].activities)) {
      itinerary.days[targetDayIndex].activities = [];
    }

    const activityIndexInDay = itinerary.days[targetDayIndex].activities.length;
    const baseHour = 9;
    const hour = Math.min(baseHour + (activityIndexInDay * 2), 20);
    const time = `${String(hour).padStart(2, '0')}:00`;

    const defaultDurationByType = {
      attraction: 90,
      restaurant: 60,
      hotel: 120,
      activity: 90,
    };

    const newActivity = {
      time,
      type: location.type,
      name: location.name,
      description: location.description || '',
      locationId: location._id,
      location: {
        address: location.address,
        coordinates: {
          lat: location.coordinates?.lat,
          lng: location.coordinates?.lng,
        },
      },
      duration: defaultDurationByType[location.type] || 90,
      cost: 0,
      rating: location.rating || 0,
    };

    itinerary.days[targetDayIndex].activities.push(newActivity);
    itinerary.days[targetDayIndex].activities.sort((a, b) => {
      if (!a?.time) return 1;
      if (!b?.time) return -1;
      return String(a.time).localeCompare(String(b.time));
    });

    itinerary.days[targetDayIndex].estimatedCost = itinerary.days[targetDayIndex].activities.reduce(
      (total, act) => total + (act.cost || 0),
      0
    );

    await itinerary.save();

    try {
      const locDoc = await Location.findById(location._id);
      if (locDoc && typeof locDoc.incrementUsage === 'function') {
        await locDoc.incrementUsage(req.user._id);
      }
    } catch (e) {
      // ignore
    }

    let updatedItinerary = await Itinerary.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('reviews.userId', 'name');
    updatedItinerary = await populateActivityImages(updatedItinerary);

    return res.json({
      success: true,
      itinerary: updatedItinerary,
      dayIndex: targetDayIndex,
      dayDate: updatedItinerary?.days?.[targetDayIndex]?.date,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Clone/Save itinerary (người dùng lưu lịch trình public về tài khoản của mình)
router.post('/clone/:id', protect, async (req, res) => {
  try {
    const originalItinerary = await Itinerary.findById(req.params.id);

    if (!originalItinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    const { startDate } = req.body;

    // Tính số ngày từ lịch trình gốc
    const originalStart = new Date(originalItinerary.startDate);
    const originalEnd = new Date(originalItinerary.endDate);
    const numberOfDays = Math.ceil((originalEnd - originalStart) / (1000 * 60 * 60 * 24));

    // Nếu không có startDate, dùng ngày hiện tại
    const newStartDate = startDate ? new Date(startDate) : new Date();
    const newEndDate = new Date(newStartDate);
    newEndDate.setDate(newEndDate.getDate() + numberOfDays);

    // Clean days: loại bỏ userContributions và otherUsersContributions (đóng góp cá nhân)
    const cleanedDays = originalItinerary.days.map(day => ({
      ...day.toObject ? day.toObject() : day,
      activities: (day.activities || []).map(activity => {
        const cleanActivity = activity.toObject ? activity.toObject() : { ...activity };
        // Xóa đóng góp cá nhân của chủ lịch trình gốc
        delete cleanActivity.userContributions;
        delete cleanActivity.otherUsersContributions;
        // Giữ lại locationId để vẫn hiển thị community contributions từ Location
        return cleanActivity;
      })
    }));

    // Tạo bản sao với userId mới và ngày mới (giữ nguyên số ngày)
    const clonedItinerary = new Itinerary({
      userId: req.user._id,
      title: `${originalItinerary.title} (Bản sao)`,
      destination: originalItinerary.destination,
      destinationCity: originalItinerary.destinationCity,
      destinationCoordinates: originalItinerary.destinationCoordinates,
      startDate: newStartDate,
      endDate: newEndDate,
      numberOfPeople: originalItinerary.numberOfPeople,
      budget: originalItinerary.budget,
      interests: originalItinerary.interests,
      days: cleanedDays,
      totalEstimatedCost: originalItinerary.totalEstimatedCost,
      isShared: false,
      isFavorite: false,
    });

    await clonedItinerary.save();

    // Tạo thông báo cho chủ lịch trình gốc
    if (originalItinerary.userId.toString() !== req.user._id.toString()) {
      await createNotification(
        originalItinerary.userId,
        'clone',
        'Lịch trình được lưu',
        `${req.user.name} đã lưu lịch trình "${originalItinerary.title}" của bạn`,
        originalItinerary._id,
        'Itinerary',
        `/itinerary/${originalItinerary._id}`
      );
    }

    res.json({
      success: true,
      itinerary: clonedItinerary,
      message: 'Đã lưu lịch trình vào tài khoản của bạn',
    });
  } catch (error) {
    console.error('Error cloning itinerary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clone itinerary',
    });
  }
});

// Cập nhật thông tin lịch trình
router.put('/:id', protect, async (req, res) => {
  try {
    let itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this itinerary',
      });
    }

    itinerary = await Itinerary.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    // Populate userId và reviews để frontend check ownership chính xác
    itinerary = await Itinerary.findById(itinerary._id)
      .populate('userId', 'name email')
      .populate('reviews.userId', 'name');
    
    // Populate images
    itinerary = await populateActivityImages(itinerary);

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

// Xóa lịch trình
router.delete('/:id', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this itinerary',
      });
    }

    await itinerary.deleteOne();

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

// Chia sẻ lịch trình
router.post('/:id/share', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to share this itinerary',
      });
    }

    // Sinh link chia sẻ ngẫu nhiên
    const shareLink = crypto.randomBytes(32).toString('hex');
    
    itinerary.isShared = true;
    itinerary.isPublic = true; // Hiện trong trang Khám phá công cộng
    itinerary.shareLink = shareLink;
    await itinerary.save();

    res.json({
      success: true,
      shareLink,
      message: 'Itinerary shared successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy lịch trình được chia sẻ thông qua link
router.get('/share/:link', async (req, res) => {
  try {
    let itinerary = await Itinerary.findOne({ 
      shareLink: req.params.link,
      isShared: true,
    })
      .populate('userId', 'name')
      .populate('reviews.userId', 'name');
    
    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Shared itinerary not found',
      });
    }

    // Populate hình ảnh vào activities
    itinerary = await populateActivityImages(itinerary);

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

// Thêm hoặc cập nhật đánh giá (rating) cho lịch trình
router.post('/:id/review', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid rating (1-5)',
      });
    }

    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    // Kiểm tra người dùng đã đánh giá lịch trình này trước đó chưa
    const existingReview = itinerary.reviews.find(
      review => review.userId.toString() === req.user._id.toString()
    );

    if (existingReview) {
      existingReview.rating = rating;
      existingReview.comment = comment || '';
    } else {
      itinerary.reviews.push({
        userId: req.user._id,
        rating,
        comment: comment || '',
      });
    }

    await itinerary.save();

    res.json({
      success: true,
      message: 'Review added successfully',
      itinerary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Xóa đánh giá của người dùng cho lịch trình
router.delete('/:id/review', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    // Tìm và xóa đánh giá thuộc về người dùng hiện tại
    const reviewIndex = itinerary.reviews.findIndex(
      review => review.userId.toString() === req.user._id.toString()
    );

    if (reviewIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    itinerary.reviews.splice(reviewIndex, 1);
    await itinerary.save();

    res.json({
      success: true,
      message: 'Review deleted successfully',
      itinerary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Bật/tắt trạng thái yêu thích cho lịch trình
router.post('/:id/favorite', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this itinerary',
      });
    }

    itinerary.isFavorite = !itinerary.isFavorite;
    await itinerary.save();

    res.json({
      success: true,
      message: itinerary.isFavorite ? 'Added to favorites' : 'Removed from favorites',
      isFavorite: itinerary.isFavorite,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Chat với AI về lịch trình (hỏi đáp/gợi ý/chỉnh sửa)
router.post('/:id/chat', protect, chatRateLimiter, async (req, res) => {
  try {
    const { message, chatHistory } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tin nhắn hợp lệ',
      });
    }

    // Validate message length
    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Tin nhắn quá dài (tối đa 2000 ký tự)',
      });
    }

    // Validate chat history format
    if (chatHistory && !Array.isArray(chatHistory)) {
      return res.status(400).json({
        success: false,
        message: 'Chat history phải là mảng',
      });
    }

    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch trình',
      });
    }

    // Check if user owns this itinerary or it's shared
    if (itinerary.userId.toString() !== req.user._id.toString() && !itinerary.isShared) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập lịch trình này',
      });
    }

    // Validate itinerary has required data
    if (!itinerary.days || itinerary.days.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lịch trình chưa có dữ liệu. Vui lòng tạo lịch trình trước.',
      });
    }

    console.log(`[CHAT] User ${req.user._id} chatting about itinerary ${req.params.id}: "${message.substring(0, 50)}..."`);

    const aiResponse = await chatWithItinerary(itinerary, message, chatHistory || []);

    // Log if changes were detected
    if (aiResponse.changes && aiResponse.changes.operations) {
      console.log(`[CHAT] AI suggested ${aiResponse.changes.operations.length} change(s)`);
    }

    res.json({
      success: true,
      response: aiResponse.text || aiResponse,
      changes: aiResponse.changes || null,
    });
  } catch (error) {
    console.error('[CHAT ERROR] Full error:', error);
    
    // Handle specific error types
    let errorMessage = 'Không thể xử lý yêu cầu chat';
    let statusCode = 500;

    if (error.message) {
      // Gemini API errors
      if (error.message.includes('API key') || error.message.includes('GEMINI_API_KEY')) {
        errorMessage = 'Dịch vụ AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.';
        statusCode = 503;
      } else if (error.message.includes('quota') || error.message.includes('429')) {
        errorMessage = 'Dịch vụ AI đang quá tải. Vui lòng thử lại sau vài phút.';
        statusCode = 429;
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Yêu cầu xử lý quá lâu. Vui lòng thử lại.';
        statusCode = 504;
      } else {
        errorMessage = error.message;
      }
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Áp dụng các thay đổi do AI đề xuất lên lịch trình
router.post('/:id/apply-changes', protect, async (req, res) => {
  try {
    const { changes } = req.body;

    if (!changes) {
      return res.status(400).json({
        success: false,
        message: 'Changes are required',
      });
    }

    let itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Itinerary not found',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this itinerary',
      });
    }

    // Chuẩn hóa activity để đảm bảo luôn có đầy đủ các trường bắt buộc
    const normalizeActivity = (activity) => {
      if (!activity) return null;
      return {
        time: activity.time || '00:00',
        type: activity.type || 'activity',
        name: activity.name || 'Unnamed Activity',
        description: activity.description || '',
        location: {
          address: activity.location?.address || '',
          coordinates: {
            lat: activity.location?.coordinates?.lat || 0,
            lng: activity.location?.coordinates?.lng || 0,
          },
        },
        duration: activity.duration || 0,
        cost: activity.cost || 0,
        rating: activity.rating || 0,
      };
    };

    // Ghi lại các thay đổi (trước/sau) để trả về cho client
    const appliedChanges = [];
    const affectedDays = new Set();

    // Xử lý mảng operations (hỗ trợ nhiều thay đổi cùng lúc)
    const operations = changes.operations || [];
    
    for (const operation of operations) {
      const { action, dayIndex, activityIndex, activity, metadata } = operation;
      
      let beforeState = null;
      let afterState = null;

      // Xử lý cập nhật metadata (title, destination, budget, dates, numberOfPeople)
      if (action === 'updateMetadata') {
        if (metadata && typeof metadata === 'object') {
          beforeState = {
            title: itinerary.title,
            destination: itinerary.destination,
            budget: itinerary.budget,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            numberOfPeople: itinerary.numberOfPeople,
          };

          // Apply metadata changes
          if (metadata.title !== undefined) itinerary.title = metadata.title;
          if (metadata.destination !== undefined) itinerary.destination = metadata.destination;
          if (metadata.budget !== undefined) itinerary.budget = metadata.budget;
          if (metadata.startDate !== undefined) itinerary.startDate = metadata.startDate;
          if (metadata.endDate !== undefined) itinerary.endDate = metadata.endDate;
          if (metadata.numberOfPeople !== undefined) itinerary.numberOfPeople = metadata.numberOfPeople;

          afterState = {
            title: itinerary.title,
            destination: itinerary.destination,
            budget: itinerary.budget,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            numberOfPeople: itinerary.numberOfPeople,
          };

          appliedChanges.push({
            action: 'updateMetadata',
            before: beforeState,
            after: afterState,
          });
        }
        continue; // Bỏ qua, chuyển sang thao tác tiếp theo
      }
      // Tự động tạo thêm ngày mới nếu cần (cho các thao tác trên activity)
      while (dayIndex >= itinerary.days.length) {
        const lastDay = itinerary.days[itinerary.days.length - 1];
        const newDate = new Date(lastDay.date);
        newDate.setDate(newDate.getDate() + 1);
        
        itinerary.days.push({
          date: newDate.toISOString().split('T')[0],
          activities: [],
          estimatedCost: 0,
        });
        
        console.log(`Auto-created day ${itinerary.days.length} (${newDate.toISOString().split('T')[0]})`);
      }

      if (action === 'add') {
        // Lưu trạng thái trước khi thêm (đối với ngày này)
        beforeState = {
          dayIndex,
          activityCount: itinerary.days[dayIndex].activities.length,
        };

        // Thêm activity mới vào ngày tương ứng
        const normalizedActivity = normalizeActivity(activity);
        
        // Tìm hoặc tạo location trong database và tham chiếu đến nó
        const activityWithLocationRef = await convertActivityToLocationReference(
          normalizedActivity,
          req.user._id,
          itinerary.destination
        );
        
        // ✅ STRICT VALIDATION: Chỉ thêm nếu match được location trong DB/OSM
        if (!activityWithLocationRef || !activityWithLocationRef.locationId) {
          console.warn(`   ⚠️  REJECTED activity "${activity.name}" - không match với DB/OSM`);
          appliedChanges.push({
            action: 'add',
            dayIndex,
            status: 'rejected',
            reason: 'Activity không tồn tại trong danh sách địa điểm thực',
            rejectedActivity: activity.name,
          });
          continue; // Skip activity này
        }
        
        itinerary.days[dayIndex].activities.push(activityWithLocationRef);
        
        // Sắp xếp lại các activity theo thời gian
        itinerary.days[dayIndex].activities.sort((a, b) => {
          return a.time.localeCompare(b.time);
        });

        // Lưu trạng thái sau khi thêm
        afterState = {
          dayIndex,
          activityCount: itinerary.days[dayIndex].activities.length,
          addedActivity: activityWithLocationRef,
        };

        appliedChanges.push({
          action: 'add',
          dayIndex,
          status: 'applied',
          before: beforeState,
          after: afterState,
        });

      } else if (action === 'update') {
        // Cập nhật activity đã tồn tại
        if (itinerary.days[dayIndex].activities[activityIndex]) {
          // Lưu trạng thái trước khi cập nhật
          beforeState = {
            dayIndex,
            activityIndex,
            activity: JSON.parse(JSON.stringify(itinerary.days[dayIndex].activities[activityIndex])),
          };

          // Gộp với activity hiện tại, giữ lại các trường không được cung cấp mới
          const updatedActivity = {
            ...itinerary.days[dayIndex].activities[activityIndex],
            ...normalizeActivity(activity),
          };
          
          // Tìm hoặc tạo location trong database và tham chiếu đến nó
          const activityWithLocationRef = await convertActivityToLocationReference(
            updatedActivity,
            req.user._id,
            itinerary.destination
          );

          itinerary.days[dayIndex].activities[activityIndex] = activityWithLocationRef;

          // Lưu trạng thái sau khi cập nhật
          afterState = {
            dayIndex,
            activityIndex,
            activity: JSON.parse(JSON.stringify(itinerary.days[dayIndex].activities[activityIndex])),
          };

          appliedChanges.push({
            action: 'update',
            dayIndex,
            activityIndex,
            before: beforeState,
            after: afterState,
          });
        }

      } else if (action === 'delete') {
        // Xóa activity
        if (itinerary.days[dayIndex].activities[activityIndex]) {
          // Lưu trạng thái trước khi xóa
          beforeState = {
            dayIndex,
            activityIndex,
            activity: JSON.parse(JSON.stringify(itinerary.days[dayIndex].activities[activityIndex])),
          };

          itinerary.days[dayIndex].activities.splice(activityIndex, 1);

          // Capture after state
          afterState = {
            dayIndex,
            activityCount: itinerary.days[dayIndex].activities.length,
          };

          appliedChanges.push({
            action: 'delete',
            dayIndex,
            activityIndex,
            before: beforeState,
            after: afterState,
          });
        }
      }

      affectedDays.add(dayIndex);
    }

    // Tính lại chi phí cho tất cả các ngày bị ảnh hưởng
    for (const dayIndex of affectedDays) {
      if (itinerary.days[dayIndex]) {
        itinerary.days[dayIndex].estimatedCost = itinerary.days[dayIndex].activities.reduce(
          (total, act) => total + (act.cost || 0),
          0
        );
      }
    }

    // Tính lại tổng chi phí cho toàn bộ lịch trình
    itinerary.totalEstimatedCost = itinerary.days.reduce(
      (total, day) => total + (day.estimatedCost || 0),
      0
    );

    // Cập nhật lại endDate nếu số ngày trong lịch trình thay đổi
    if (itinerary.days.length > 0) {
      const lastDay = itinerary.days[itinerary.days.length - 1];
      itinerary.endDate = lastDay.date;
    }

    await itinerary.save();

    // Populate hình ảnh vào activities
    itinerary = await populateActivityImages(itinerary);

    // Tạo thông báo cho người dùng khi lịch trình được cập nhật
    const hasMetadataUpdate = appliedChanges.some(c => c.action === 'updateMetadata');
    if (hasMetadataUpdate || appliedChanges.length > 0) {
      await createNotification(
        req.user._id,
        'system',
        'Lịch trình đã được cập nhật!',
        `Đã áp dụng ${appliedChanges.length} thay đổi cho lịch trình "${itinerary.title}".`,
        itinerary._id,
        'Itinerary',
        `/itinerary/${itinerary._id}`
      );
    }

    res.json({
      success: true,
      message: `Đã áp dụng ${appliedChanges.length} thay đổi thành công`,
      itinerary,
      appliedChanges, // Bao gồm trạng thái trước/sau để hiển thị trên giao diện
    });
  } catch (error) {
    console.error('Error applying changes:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to apply changes',
    });
  }
});

// Tự động sắp xếp và tối ưu lịch trình theo layout người dùng đã chỉnh
router.post('/:id/auto-schedule', protect, async (req, res) => {
  try {
    const { days } = req.body;

    // Validate input
    if (!days || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp danh sách ngày và địa điểm',
      });
    }

    // Validate mỗi ngày phải có activities và không quá 12 activities
    for (let i = 0; i < days.length; i++) {
      if (!days[i].activities || !Array.isArray(days[i].activities)) {
        return res.status(400).json({
          success: false,
          message: `Ngày ${i + 1} thiếu danh sách activities`,
        });
      }
      
      if (days[i].activities.length > 12) {
        return res.status(400).json({
          success: false,
          message: `Ngày ${i + 1} có ${days[i].activities.length} hoạt động, vượt giới hạn 12 hoạt động/ngày. Vui lòng giảm bớt hoặc chia sang ngày khác.`,
        });
      }
    }

    let itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch trình',
      });
    }

    // Check ownership
    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền chỉnh sửa lịch trình này',
      });
    }

    console.log(`[AUTO-SCHEDULE] User ${req.user._id} re-scheduling itinerary ${req.params.id}`);
    console.log(`   Days: ${days.length}, Total activities: ${days.reduce((sum, d) => sum + d.activities.length, 0)}`);

    // Gọi AI để tối ưu lịch trình
    const scheduledItinerary = await autoScheduleItinerary({
      destination: itinerary.destination,
      startDate: itinerary.startDate.toISOString().split('T')[0],
      endDate: itinerary.endDate.toISOString().split('T')[0],
      numberOfPeople: itinerary.numberOfPeople,
      budget: itinerary.budget,
      days: days,
    });

    // Convert activities thành location references
    console.log('Converting activities to location references...');
    const daysWithLocationReferences = await Promise.all(
      scheduledItinerary.days.map(async (day) => {
        const activitiesWithReferences = await Promise.all(
          day.activities.map(async (activity) => {
            try {
              return await convertActivityToLocationReference(
                activity,
                req.user._id,
                itinerary.destination
              );
            } catch (error) {
              console.error(`Failed to convert activity "${activity.name}":`, error.message);
              return activity; // Fallback: giữ nguyên activity
            }
          })
        );
        return {
          ...day,
          activities: activitiesWithReferences,
        };
      })
    );

    // Cập nhật itinerary
    itinerary.days = daysWithLocationReferences;
    itinerary.totalEstimatedCost = scheduledItinerary.totalEstimatedCost || 0;
    await itinerary.save();

    console.log(`✓ Auto-schedule completed for itinerary ${req.params.id}`);

    // Query lại từ DB với populate để frontend check ownership chính xác
    itinerary = await Itinerary.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('reviews.userId', 'name');
    
    // Populate images
    const itineraryWithImages = await populateActivityImages(itinerary);

    res.json({
      success: true,
      message: 'Đã tối ưu lịch trình thành công',
      itinerary: itineraryWithImages,
    });
  } catch (error) {
    console.error('[AUTO-SCHEDULE ERROR]:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể tối ưu lịch trình. Vui lòng thử lại.',
    });
  }
});

// Like/Unlike itinerary
router.post('/:id/like', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);
    
    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch trình' });
    }

    const userId = req.user._id;
    const likeIndex = itinerary.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      itinerary.likes.splice(likeIndex, 1);
      itinerary.likesCount = itinerary.likes.length;
      await itinerary.save();
      
      res.json({ success: true, liked: false, likesCount: itinerary.likesCount });
    } else {
      // Like
      itinerary.likes.push(userId);
      itinerary.likesCount = itinerary.likes.length;
      await itinerary.save();

      // Tạo thông báo cho chủ lịch trình
      if (itinerary.userId.toString() !== userId.toString()) {
        await createNotification(
          itinerary.userId,
          'like',
          'Lịch trình được thích',
          `${req.user.name} đã thích lịch trình "${itinerary.title}"`,
          itinerary._id,
          'Itinerary',
          `/itinerary/${itinerary._id}`
        );
      }

      res.json({ success: true, liked: true, likesCount: itinerary.likesCount });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add/Update review
router.post('/:id/review-legacy', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating phải từ 1-5' });
    }

    const itinerary = await Itinerary.findById(req.params.id);
    
    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch trình' });
    }

    const userId = req.user._id;
    const existingReview = itinerary.reviews.find(r => r.userId.toString() === userId.toString());

    if (existingReview) {
      // Update existing review
      existingReview.rating = rating;
      existingReview.comment = comment || '';
    } else {
      // Add new review
      itinerary.reviews.push({
        userId,
        rating,
        comment: comment || '',
        createdAt: new Date(),
      });
    }

    // Tính lại average rating và reviewsCount
    itinerary.reviewsCount = itinerary.reviews.length;
    const totalRating = itinerary.reviews.reduce((sum, r) => sum + r.rating, 0);
    itinerary.averageRating = totalRating / itinerary.reviewsCount;

    await itinerary.save();

    // Tạo thông báo cho chủ lịch trình
    if (itinerary.userId.toString() !== userId.toString() && !existingReview) {
      await createNotification(
        itinerary.userId,
        'review',
        'Đánh giá mới',
        `${req.user.name} đã đánh giá lịch trình "${itinerary.title}" ${rating} sao`,
        itinerary._id,
        'Itinerary',
        `/itinerary/${itinerary._id}`
      );
    }

    res.json({
      success: true,
      averageRating: itinerary.averageRating,
      reviewsCount: itinerary.reviewsCount,
    });
  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete review
router.delete('/:id/review-legacy', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);
    
    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch trình' });
    }

    const userId = req.user._id;
    const reviewIndex = itinerary.reviews.findIndex(r => r.userId.toString() === userId.toString());

    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    }

    itinerary.reviews.splice(reviewIndex, 1);

    // Tính lại
    itinerary.reviewsCount = itinerary.reviews.length;
    if (itinerary.reviewsCount > 0) {
      const totalRating = itinerary.reviews.reduce((sum, r) => sum + r.rating, 0);
      itinerary.averageRating = totalRating / itinerary.reviewsCount;
    } else {
      itinerary.averageRating = 0;
    }

    await itinerary.save();

    res.json({ success: true, averageRating: itinerary.averageRating, reviewsCount: itinerary.reviewsCount });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bắt đầu lịch trình (chuyển từ draft sang in_progress)
router.post('/:id/start', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Lịch trình không tồn tại',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền bắt đầu lịch trình này',
      });
    }

    if (itinerary.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Lịch trình đã được bắt đầu',
      });
    }

    if (itinerary.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Lịch trình đã hoàn thành',
      });
    }

    itinerary.status = 'in_progress';
    itinerary.startedAt = new Date();
    await itinerary.save();

    res.json({
      success: true,
      message: 'Đã bắt đầu lịch trình!',
      itinerary,
    });
  } catch (error) {
    console.error('Error starting itinerary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể bắt đầu lịch trình',
    });
  }
});

// Đóng góp ảnh và trải nghiệm cho một activity
router.post('/:id/activities/:dayIndex/:activityIndex/contribute', protect, async (req, res) => {
  try {
    const { images, experience, visited } = req.body;
    const dayIndex = parseInt(req.params.dayIndex);
    const activityIndex = parseInt(req.params.activityIndex);

    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Lịch trình không tồn tại',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền chỉnh sửa lịch trình này',
      });
    }

    if (itinerary.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể đóng góp khi lịch trình đang được thực hiện',
      });
    }

    if (!itinerary.days[dayIndex] || !itinerary.days[dayIndex].activities[activityIndex]) {
      return res.status(404).json({
        success: false,
        message: 'Activity không tồn tại',
      });
    }

    const activity = itinerary.days[dayIndex].activities[activityIndex];

    // Khởi tạo userContributions nếu chưa có
    if (!activity.userContributions) {
      activity.userContributions = {
        images: [],
        experience: null,
        visited: false,
      };
    }

    // Thêm ảnh (nếu có)
    if (images && Array.isArray(images) && images.length > 0) {
      const validImages = images.filter(img => 
        typeof img === 'string' && 
        (img.startsWith('data:image/') || img.startsWith('http://') || img.startsWith('https://'))
      );
      
      if (validImages.length > 0) {
        const newImages = validImages.map(img => ({
          url: img,
          uploadedAt: new Date(),
        }));
        activity.userContributions.images = [
          ...(activity.userContributions.images || []),
          ...newImages,
        ];
      }
    }

    // Cập nhật trải nghiệm (nếu có)
    if (experience !== undefined && experience !== null) {
      // Nếu experience là chuỗi rỗng, xóa experience
      if (typeof experience === 'string' && experience.trim() === '') {
        activity.userContributions.experience = null;
      } else {
        activity.userContributions.experience = {
          text: experience,
          createdAt: new Date(),
        };
      }
      // Mark modified để đảm bảo Mongoose lưu nested object
      itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions.experience`);
    }

    // Cập nhật trạng thái đã thăm (nếu có)
    if (visited !== undefined) {
      activity.userContributions.visited = visited;
      if (visited) {
        activity.userContributions.visitedAt = new Date();
      } else {
        activity.userContributions.visitedAt = null;
      }
      // Mark modified để đảm bảo Mongoose lưu nested object
      itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions.visited`);
    }

    // Nếu có locationId, cập nhật ảnh và trải nghiệm vào Location để chia sẻ với cộng đồng
    if (activity.locationId) {
      try {
        const location = await Location.findById(activity.locationId);
        if (location) {
          // Cập nhật ảnh cộng đồng
          if (images && images.length > 0) {
            const validImages = images.filter(img => 
              typeof img === 'string' && 
              (img.startsWith('data:image/') || img.startsWith('http://') || img.startsWith('https://'))
            );
            if (validImages.length > 0) {
              const newCommunityImages = validImages.map(img => ({
                url: img,
                userId: req.user._id,
                uploadedAt: new Date(),
                isApproved: true, // Auto-approve để UX tốt, admin có thể ẩn/xóa spam sau
              }));
              location.communityImages = [...(location.communityImages || []), ...newCommunityImages];
            }
          }

          // Cập nhật trải nghiệm cộng đồng
          if (experience && typeof experience === 'string' && experience.trim() !== '') {
            // Kiểm tra user đã có experience cho location này chưa
            const existingExpIndex = location.communityExperiences.findIndex(
              exp => exp.userId.toString() === req.user._id.toString()
            );
            
            if (existingExpIndex !== -1) {
              // Cập nhật experience cũ
              location.communityExperiences[existingExpIndex].text = experience.trim();
              location.communityExperiences[existingExpIndex].createdAt = new Date();
            } else {
              // Thêm experience mới
              location.communityExperiences.push({
                text: experience.trim(),
                userId: req.user._id,
                createdAt: new Date(),
                isApproved: true, // Auto-approve để UX tốt, admin có thể ẩn/xóa spam sau
              });
            }
          }

          location.updatedAt = Date.now();
          await location.save();
        }
      } catch (locationError) {
        console.warn('Failed to update location contributions:', locationError.message);
      }
    }

    // Mark modified cho userContributions.images nếu có thay đổi
    if (images && images.length > 0) {
      itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions.images`);
    }

    // Mark modified cho toàn bộ userContributions để đảm bảo lưu đúng
    itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions`);

    await itinerary.save();

    // Reload itinerary để đảm bảo có dữ liệu mới nhất
    const updatedItinerary = await Itinerary.findById(req.params.id);
    const updatedActivity = updatedItinerary.days[dayIndex].activities[activityIndex];

    // Populate activity images để có đầy đủ dữ liệu
    const itineraryWithImages = await populateActivityImages(updatedItinerary);
    const populatedActivity = itineraryWithImages.days[dayIndex].activities[activityIndex];

    res.json({
      success: true,
      message: 'Đã cập nhật đóng góp!',
      activity: populatedActivity,
    });
  } catch (error) {
    console.error('Error contributing to activity:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể cập nhật đóng góp',
    });
  }
});

// Xóa ảnh đóng góp trong activity
router.delete('/:id/activities/:dayIndex/:activityIndex/images/:imageIndex', protect, async (req, res) => {
  try {
    const { dayIndex, activityIndex, imageIndex } = req.params;
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Lịch trình không tồn tại',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa ảnh này',
      });
    }

    const day = itinerary.days[dayIndex];
    if (!day) {
      return res.status(404).json({
        success: false,
        message: 'Ngày không tồn tại',
      });
    }

    const activity = day.activities[activityIndex];
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Hoạt động không tồn tại',
      });
    }

    if (!activity.userContributions || !activity.userContributions.images) {
      return res.status(404).json({
        success: false,
        message: 'Không có ảnh để xóa',
      });
    }

    if (imageIndex >= activity.userContributions.images.length) {
      return res.status(404).json({
        success: false,
        message: 'Ảnh không tồn tại',
      });
    }

    // Xóa ảnh
    activity.userContributions.images.splice(imageIndex, 1);
    itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions`);
    await itinerary.save();

    res.json({
      success: true,
      message: 'Đã xóa ảnh!',
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể xóa ảnh',
    });
  }
});

// Xóa trải nghiệm trong activity
router.delete('/:id/activities/:dayIndex/:activityIndex/experience', protect, async (req, res) => {
  try {
    const { dayIndex, activityIndex } = req.params;
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Lịch trình không tồn tại',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa trải nghiệm này',
      });
    }

    const day = itinerary.days[dayIndex];
    if (!day) {
      return res.status(404).json({
        success: false,
        message: 'Ngày không tồn tại',
      });
    }

    const activity = day.activities[activityIndex];
    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Hoạt động không tồn tại',
      });
    }

    if (!activity.userContributions || !activity.userContributions.experience) {
      return res.status(404).json({
        success: false,
        message: 'Không có trải nghiệm để xóa',
      });
    }

    // Xóa trải nghiệm
    activity.userContributions.experience = null;
    itinerary.markModified(`days.${dayIndex}.activities.${activityIndex}.userContributions`);
    await itinerary.save();

    res.json({
      success: true,
      message: 'Đã xóa trải nghiệm!',
    });
  } catch (error) {
    console.error('Error deleting experience:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể xóa trải nghiệm',
    });
  }
});

// Hoàn tất lịch trình
router.post('/:id/complete', protect, async (req, res) => {
  try {
    const itinerary = await Itinerary.findById(req.params.id);

    if (!itinerary) {
      return res.status(404).json({
        success: false,
        message: 'Lịch trình không tồn tại',
      });
    }

    if (itinerary.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền hoàn tất lịch trình này',
      });
    }

    if (itinerary.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể hoàn tất lịch trình đang được thực hiện',
      });
    }

    itinerary.status = 'completed';
    itinerary.completedAt = new Date();
    await itinerary.save();

    res.json({
      success: true,
      message: 'Chúc mừng! Bạn đã hoàn thành lịch trình!',
      itinerary,
    });
  } catch (error) {
    console.error('Error completing itinerary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể hoàn tất lịch trình',
    });
  }
});

export default router;



