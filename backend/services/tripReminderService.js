import Itinerary from '../models/Itinerary.js';
import User from '../models/User.js';
import { sendItineraryEmail } from './emailService.js';

/**
 * Kiểm tra các lịch trình sắp đến và gửi email nhắc nhở
 */
export const checkUpcomingTrips = async () => {
  try {
    console.log('[Trip Reminder] Checking for upcoming trips...');
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Tìm các lịch trình có startDate = ngày mai
    const upcomingItineraries = await Itinerary.find({
      startDate: {
        $gte: tomorrow,
        $lt: dayAfterTomorrow,
      },
    }).populate('userId', 'name email');

    console.log(`   Found ${upcomingItineraries.length} trips starting tomorrow`);

    for (const itinerary of upcomingItineraries) {
      if (!itinerary.userId || !itinerary.userId.email) {
        console.log(`   Warning: Skipping itinerary ${itinerary._id} - no user email`);
        continue;
      }

      const user = itinerary.userId;
      
      console.log(`   Sending reminder to ${user.email} for trip to ${itinerary.destination}`);

      const result = await sendItineraryEmail(
        user.email,
        `Nhắc nhở: Chuyến đi ${itinerary.destination} của bạn bắt đầu vào ngày mai!`,
        'Chuyến đi của bạn sắp bắt đầu!',
        `Xin chào ${user.name},\n\nChuyến đi "${itinerary.title}" đến ${itinerary.destination} của bạn sẽ bắt đầu vào ngày mai (${new Date(itinerary.startDate).toLocaleDateString('vi-VN')}).\n\nĐừng quên chuẩn bị hành lý và kiểm tra lại lịch trình nhé!`,
        `/itinerary/${itinerary._id}`,
        itinerary
      );

      if (result.success) {
        console.log(`   Email sent successfully to ${user.email}`);
      } else {
        console.log(`   Failed to send email to ${user.email}:`, result.error);
      }
    }

    console.log('[Trip Reminder] Upcoming trips check completed');
    return { success: true, count: upcomingItineraries.length };
  } catch (error) {
    console.error('[Trip Reminder] Error checking upcoming trips:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Kiểm tra các lịch trình đang diễn ra (ngày đầu tiên)
 */
export const checkTodayTrips = async () => {
  try {
    console.log('[Trip Reminder] Checking for trips starting today...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Tìm các lịch trình có startDate = hôm nay
    const todayItineraries = await Itinerary.find({
      startDate: {
        $gte: today,
        $lt: tomorrow,
      },
    }).populate('userId', 'name email');

    console.log(`   Found ${todayItineraries.length} trips starting today`);

    for (const itinerary of todayItineraries) {
      if (!itinerary.userId || !itinerary.userId.email) {
        continue;
      }

      const user = itinerary.userId;
      
      console.log(`   Sending welcome email to ${user.email} for trip to ${itinerary.destination}`);

      await sendItineraryEmail(
        user.email,
        `Chúc mừng ngày đầu tiên của chuyến đi ${itinerary.destination}!`,
        'Chúc bạn có một chuyến đi tuyệt vời!',
        `Xin chào ${user.name},\n\nChúc mừng bạn đã bắt đầu chuyến đi "${itinerary.title}" đến ${itinerary.destination}!\n\nChúc bạn có những trải nghiệm tuyệt vời và an toàn. Đừng quên chia sẻ những khoảnh khắc đáng nhớ!`,
        `/itinerary/${itinerary._id}`,
        itinerary
      );
    }

    console.log('[Trip Reminder] Today trips check completed');
    return { success: true, count: todayItineraries.length };
  } catch (error) {
    console.error('[Trip Reminder] Error checking today trips:', error);
    return { success: false, error: error.message };
  }
};

export default { checkUpcomingTrips, checkTodayTrips };
