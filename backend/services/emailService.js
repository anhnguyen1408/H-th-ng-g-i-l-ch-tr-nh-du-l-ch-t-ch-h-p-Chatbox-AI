import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Tạo transporter cho nodemailer
const createTransporter = () => {
  // Kiểm tra xem có cấu hình email trong .env không
  const emailUser = process.env.EMAIL_USER || process.env.EMAIL_USERNAME;
  const emailPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;

  if (!process.env.EMAIL_HOST || !emailUser || !emailPass) {
    console.warn('Email configuration not found. Email notifications will be disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
};

const transporter = createTransporter();

/**
 * Gửi email thông báo lịch trình
 * @param {string} to - Email người nhận
 * @param {string} subject - Tiêu đề email
 * @param {string} title - Tiêu đề thông báo
 * @param {string} message - Nội dung thông báo
 * @param {string} link - Link đến lịch trình
 * @param {Object} itinerary - Thông tin lịch trình (optional)
 */
export const sendItineraryEmail = async (to, subject, title, message, link, itinerary = null) => {
  if (!transporter) {
    console.log('Email service not configured, skipping email...');
    return { success: false, message: 'Email service not configured' };
  }
  
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const fullLink = `${clientUrl}${link}`;

    // Tạo HTML email đẹp
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 30px;
    }
    .notification-title {
      font-size: 20px;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 15px;
    }
    .notification-message {
      font-size: 16px;
      color: #555;
      margin-bottom: 20px;
      line-height: 1.8;
    }
    .itinerary-info {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .itinerary-info h3 {
      margin: 0 0 10px 0;
      color: #333;
      font-size: 18px;
    }
    .itinerary-info p {
      margin: 5px 0;
      color: #666;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      margin: 20px 0;
      text-align: center;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #777;
      font-size: 14px;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AI Travel Planner</h1>
    </div>
    <div class="content">
      <div class="notification-title">${title}</div>
      <div class="notification-message">${message}</div>
      ${itinerary ? `
      <div class="itinerary-info">
        <h3>${itinerary.title || 'Lịch trình của bạn'}</h3>
        <p><strong>Điểm đến:</strong> ${itinerary.destination || 'Chưa xác định'}</p>
        <p><strong>Ngày:</strong> ${new Date(itinerary.startDate).toLocaleDateString('vi-VN')} - ${new Date(itinerary.endDate).toLocaleDateString('vi-VN')}</p>
        <p><strong>Số người:</strong> ${itinerary.numberOfPeople || 1} người</p>
        <p><strong>Ngân sách:</strong> ${itinerary.budget?.toLocaleString('vi-VN') || '0'} VNĐ</p>
      </div>
      ` : ''}
      <div style="text-align: center;">
        <a href="${fullLink}" class="button">Xem lịch trình chi tiết →</a>
      </div>
      <p style="color: #999; font-size: 14px; margin-top: 20px;">
        Hoặc copy link này vào trình duyệt:<br>
        <a href="${fullLink}" style="color: #667eea;">${fullLink}</a>
      </p>
    </div>
    <div class="footer">
      <p>Đây là email tự động từ <strong>AI Travel Planner</strong></p>
      <p>Nếu bạn không yêu cầu email này, vui lòng bỏ qua.</p>
      <p><a href="${clientUrl}">Truy cập website</a></p>
    </div>
  </div>
</body>
</html>
    `;

    const emailUser = process.env.EMAIL_USER || process.env.EMAIL_USERNAME;
    
    const mailOptions = {
      from: `"AI Travel Planner" <${emailUser}>`,
      to,
      subject,
      html: htmlContent,
      text: `${title}\n\n${message}\n\nXem chi tiết tại: ${fullLink}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✓ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('✗ Error sending email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Gửi email xác thực tài khoản
 */
export const sendVerificationEmail = async (to, verificationCode) => {
  if (!transporter) {
    console.log('Email service not configured, skipping verification email...');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; letter-spacing: 5px; padding: 20px; background: #f8f9fa; border-radius: 5px; margin: 20px 0; }
    .footer { margin-top: 30px; text-align: center; color: #777; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Xác thực tài khoản AI Travel Planner</h1>
    </div>
    <p>Chào bạn!</p>
    <p>Cảm ơn bạn đã đăng ký tài khoản AI Travel Planner. Đây là mã xác thực của bạn:</p>
    <div class="code">${verificationCode}</div>
    <p>Vui lòng nhập mã này vào trang xác thực để hoàn tất đăng ký.</p>
    <p>Mã xác thực có hiệu lực trong 10 phút.</p>
    <div class="footer">
      <p>Nếu bạn không yêu cầu email này, vui lòng bỏ qua.</p>
      <p><a href="${clientUrl}">AI Travel Planner</a></p>
    </div>
  </div>
</body>
</html>
    `;

    const emailUser = process.env.EMAIL_USER || process.env.EMAIL_USERNAME;
    
    const mailOptions = {
      from: `"AI Travel Planner" <${emailUser}>`,
      to,
      subject: 'Xác thực tài khoản AI Travel Planner',
      html: htmlContent,
      text: `Mã xác thực của bạn là: ${verificationCode}. Mã có hiệu lực trong 10 phút.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✓ Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('✗ Error sending verification email:', error);
    return { success: false, error: error.message };
  }
};

export default { sendItineraryEmail, sendVerificationEmail };
