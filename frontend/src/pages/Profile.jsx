import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); // info, password, avatar
  
  // Profile info
  const [name, setName] = useState('');
  
  // Password change
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setAvatarPreview(user.avatar || null);
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await axios.put(
        `${API_URL}/user/profile`,
        { name },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        updateUser(response.data.user);
        toast.success('Cập nhật thông tin thành công');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Mật khẩu mới không khớp');
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      toast.error('Mật khẩu mới phải ít nhất 6 ký tự');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.put(
        `${API_URL}/user/change-password`,
        {
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        toast.success('Đổi mật khẩu thành công');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Ảnh không được vượt quá 2MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadAvatar = async () => {
    if (!avatarPreview || avatarPreview === user.avatar) {
      toast.error('Vui lòng chọn ảnh mới');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await axios.put(
        `${API_URL}/user/avatar`,
        { avatar: avatarPreview },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        updateUser(response.data.user);
        toast.success('Cập nhật ảnh đại diện thành công');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Cập nhật ảnh thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8">
            <h1 className="text-3xl font-bold text-white">Hồ sơ cá nhân</h1>
            <p className="text-primary-100 mt-2">Quản lý thông tin và bảo mật tài khoản</p>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'info'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Thông tin cá nhân
              </button>
              <button
                onClick={() => setActiveTab('avatar')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'avatar'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Ảnh đại diện
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'password'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Đổi mật khẩu
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'info' && (
              <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email không thể thay đổi</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </form>
            )}

            {activeTab === 'avatar' && (
              <div className="space-y-6 max-w-xl">
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 mb-4">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl font-bold">
                        {user?.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                    id="avatar-upload"
                  />
                  
                  <label
                    htmlFor="avatar-upload"
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 cursor-pointer mb-4"
                  >
                    Chọn ảnh mới
                  </label>
                  
                  <p className="text-xs text-gray-500 text-center mb-4">
                    Ảnh không quá 2MB. Khuyến nghị ảnh vuông.
                  </p>
                  
                  {avatarPreview && avatarPreview !== user?.avatar && (
                    <button
                      onClick={handleUploadAvatar}
                      disabled={loading}
                      className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Đang tải lên...' : 'Lưu ảnh đại diện'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'password' && (
              <form onSubmit={handleChangePassword} className="space-y-6 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu hiện tại
                  </label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu mới
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                    minLength={6}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Xác nhận mật khẩu mới
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
