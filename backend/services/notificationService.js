import Notification from '../models/Notification.js';
import Itinerary from '../models/Itinerary.js';
import User from '../models/User.js';
import { getIO } from '../utils/socket.js';
import { sendItineraryEmail } from './emailService.js';

// Tạo thông báo mới
export const createNotification = async (userId, type, title, message, relatedId = null, relatedModel = null, link = null) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      relatedId,
      relatedModel,
      link,
    });

    // Emit socket event
    try {
      const io = getIO();
      io.to(userId.toString()).emit('new_notification', notification);
    } catch (socketError) {
      console.warn('Socket emit failed:', socketError.message);
    }

    // Gửi email nếu là thông báo lịch trình
    if (type === 'itinerary_reminder' && link) {
      try {
        const user = await User.findById(userId);
        if (user && user.email) {
          let itinerary = null;
          if (relatedId && relatedModel === 'Itinerary') {
            itinerary = await Itinerary.findById(relatedId);
          }

          await sendItineraryEmail(
            user.email,
            title, // subject
            title, // title
            message, // message
            link, // link
            itinerary // itinerary info
          );
          console.log(`✓ Email sent to ${user.email} for itinerary reminder`);
        }
      } catch (emailError) {
        console.warn('Failed to send email notification:', emailError.message);
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Kiểm tra và tạo thông báo nhắc lịch trình (chạy định kỳ hàng ngày)
export const checkItineraryReminders = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Tìm các lịch trình bắt đầu trong ngày hôm nay
    const itinerariesToday = await Itinerary.find({
      startDate: {
        $gte: today,
        $lt: tomorrow,
      },
    });
    

    for (const itinerary of itinerariesToday) {
      // Kiểm tra xem đã tồn tại thông báo cho lịch trình này trong hôm nay chưa
      const existingNotification = await Notification.findOne({
        userId: itinerary.userId,
        type: 'itinerary_reminder',
        relatedId: itinerary._id,
        createdAt: {
          $gte: today,
        },
      });

      if (!existingNotification) {
        await createNotification(
          itinerary.userId,
          'itinerary_reminder',
          `Hôm nay là ngày bắt đầu chuyến đi! `,
          `Chuyến đi "${itinerary.title}" đến ${itinerary.destination} sẽ bắt đầu hôm nay. Chúc bạn có một chuyến đi vui vẻ!`,
          itinerary._id,
          'Itinerary',
          `/itinerary/${itinerary._id}`
        );
        console.log(`Created reminder for itinerary: ${itinerary.title}`);
      }
    }

    // Tìm các lịch trình bắt đầu vào ngày mai (nhắc nhở trước)
    const itinerariesTomorrow = await Itinerary.find({
      startDate: {
        $gte: tomorrow,
        $lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    

    for (const itinerary of itinerariesTomorrow) {
      // Kiểm tra xem đã tồn tại thông báo nhắc ngày mai hay chưa
      const existingNotification = await Notification.findOne({
        userId: itinerary.userId,
        type: 'itinerary_reminder',
        relatedId: itinerary._id,
        message: { $regex: 'ngày mai' },
        createdAt: {
          $gte: today,
        },
      });

      if (!existingNotification) {
        await createNotification(
          itinerary.userId,
          'itinerary_reminder',
          `Chuẩn bị cho chuyến đi ngày mai! 🧳`,
          `Chuyến đi "${itinerary.title}" đến ${itinerary.destination} sẽ bắt đầu vào ngày mai. Đừng quên chuẩn bị hành lý nhé!`,
          itinerary._id,
          'Itinerary',
          `/itinerary/${itinerary._id}`
        );
        console.log(` Created advance reminder for itinerary: ${itinerary.title}`);
      }
    }

    console.log(` Đã kiểm tra ${itinerariesToday.length} lịch trình cho hôm nay, ${itinerariesTomorrow.length} cho ngày mai`);
  } catch (error) {
    console.error('Error checking itinerary reminders:', error);
  }
};

// Khởi động tác vụ kiểm tra thông báo nhắc lịch trình (chạy nền)
export const startNotificationScheduler = () => {
  // Chạy ngay khi server khởi động
  checkItineraryReminders();
  
  // Sau đó lặp lại mỗi giờ để bắt kịp các lịch trình mới tạo
  setInterval(checkItineraryReminders, 60 * 60 * 1000); // Mỗi 1 giờ
  
  console.log(' Bộ lập lịch thông báo đã được khởi động');
};
