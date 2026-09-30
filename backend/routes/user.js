import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Cập nhật thông tin hồ sơ người dùng
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, preferences } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, preferences },
      { new: true, runValidators: true }
    ).select('-password');

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

// Đổi mật khẩu
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ thông tin',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải ít nhất 6 ký tự',
      });
    }

    // Lấy user với password
    const user = await User.findById(req.user._id).select('+password');

    // Kiểm tra mật khẩu hiện tại
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu hiện tại không đúng',
      });
    }

    // Hash mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Cập nhật avatar
router.put('/avatar', protect, async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ảnh đại diện',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      user,
      message: 'Cập nhật ảnh đại diện thành công',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;





