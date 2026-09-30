import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import sendEmail from '../utils/sendEmail.js';
import { getIO } from '../utils/socket.js';

const router = express.Router();

// Đăng ký tài khoản
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body; //khoi tao

    // Check if user exists
    const userExists = await User.findOne({ email }); // bao mat // tim 
    if (userExists) {
      if (userExists.isVerified) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email',
        });
      }
      // Nếu user tồn tại nhưng chưa verify -> Xóa để đăng ký lại từ đầu
      await User.findByIdAndDelete(userExists._id);
    }

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    // --- QUAN TRỌNG: Gửi email ---
    // Chế độ NGHIÊM NGẶT: Bắt buộc gửi được email mới cho phép đi tiếp
    try {
      await sendEmail({
        email, 
        subject: 'Mã xác thực đăng ký - AI Travel Planner',
        message: `Mã xác thực của bạn là: ${verificationCode}. Mã này sẽ hết hạn sau 10 phút.`,
        html: `<h1>Chào mừng bạn đến với AI Travel Planner!</h1>
               <p>Mã xác thực của bạn là: <strong>${verificationCode}</strong></p>
               <p>Mã này sẽ hết hạn sau 10 phút.</p>`
      });
      console.log('Email sent successfully to:', email);
    } catch (err) {
      console.error('Email send error:', err.message);
      // Gửi mail thất bại -> Dừng ngay lập tức, không tạo user
      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email xác thực. Vui lòng kiểm tra lại địa chỉ email hoặc cấu hình hệ thống.',
        error: err.message
      });
    }

    // Chỉ khi gửi mail thành công mới tạo User vào DB
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'user',
      verificationCode,
      verificationCodeExpire,
      isVerified: false // Bắt buộc false chờ xác thực
    });

    console.log('User created successfully (Unverified):', user._id);

    res.status(201).json({
      success: true,
      message: 'Mã xác thực đã được gửi đến email. Vui lòng kiểm tra.',
      userId: user._id,
      requireVerification: true
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Verify Email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({
      email,
      verificationCode: code,
      verificationCodeExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;
    await user.save();

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Kiểm tra tài khoản và mật khẩu
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }
    
    // Check if verified
    if (!user.isVerified) {
       // Optional: Resend code logic could be triggered here or via another endpoint
       return res.status(401).json({
        success: false,
        message: 'Account not verified. Please verify your email.',
        requireVerification: true
      });
    }

    // Update lastActive
    user.lastActive = Date.now();
    await user.save();

    // Emit user online event
    try {
      const io = getIO();
      io.emit('user_online', { userId: user._id, lastActive: user.lastActive });
    } catch (e) {
      console.warn('Socket emit failed:', e.message);
    }

    // Generate token
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
      });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy thông tin người dùng hiện tại
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Forgot Password - Gửi email reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản với email này',
      });
    }

    // Tạo reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token và lưu vào DB
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Token expires in 1 hour
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
    
    await user.save();

    // Tạo reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    const message = `
Bạn nhận được email này vì bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu.

Vui lòng click vào link dưới đây để đặt lại mật khẩu:

${resetUrl}

Link này sẽ hết hạn sau 1 giờ.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Đặt lại mật khẩu - AI Travel Planner',
        message: message,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Đặt lại mật khẩu</h2>
            <p>Bạn nhận được email này vì bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu.</p>
            <p>Vui lòng click vào nút dưới đây để đặt lại mật khẩu:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Đặt lại mật khẩu</a>
            </div>
            <p style="color: #666; font-size: 14px;">Link này sẽ hết hạn sau 1 giờ.</p>
            <p style="color: #666; font-size: 14px;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          </div>
        `,
      });

      res.json({
        success: true,
        message: 'Email đặt lại mật khẩu đã được gửi',
      });
    } catch (emailError) {
      console.error('Forgot password email error:', emailError);
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Không thể gửi email. Vui lòng kiểm tra lại địa chỉ email.',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Reset Password - Đặt lại mật khẩu với token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải ít nhất 6 ký tự',
      });
    }

    // Hash token từ URL
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    // Tìm user với token và chưa hết hạn
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token không hợp lệ hoặc đã hết hạn',
      });
    }

    // Set password mới
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    
    await user.save();

    res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;





