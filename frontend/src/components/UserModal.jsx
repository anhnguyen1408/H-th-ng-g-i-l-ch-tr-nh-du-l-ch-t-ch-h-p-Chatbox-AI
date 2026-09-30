import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, User as UserIcon, Calendar, Share2, MessageSquare, Eye } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const UserModal = ({ userId, onClose, onUpdate, mode = 'view' }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(mode === 'create');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  });

  useEffect(() => {
    if (userId && mode !== 'create') {
      fetchUserProfile();
    } else {
      setLoading(false);
    }
  }, [userId, mode]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/users/${userId}/profile`);
      setUser(response.data.user);
      setProfile(response.data);
      setFormData({
        name: response.data.user.name,
        email: response.data.user.email,
        password: '',
        role: response.data.user.role,
      });
    } catch (error) {
      toast.error('Không thể tải thông tin người dùng');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (mode === 'create') {
        await axios.post(`${API_URL}/admin/users`, formData);
        toast.success('Tạo người dùng thành công');
      } else {
        const updateData = { ...formData };
        if (!updateData.password) delete updateData.password;
        await axios.put(`${API_URL}/admin/users/${userId}`, updateData);
        toast.success('Cập nhật thành công');
      }
      onUpdate();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể thực hiện');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">
            {mode === 'create' ? 'Tạo người dùng mới' : 'Chi tiết người dùng'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {mode !== 'create' && user && !isEditing && (
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-center space-x-4 pb-6 border-b">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-2xl font-bold">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    user.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                  <p className="text-gray-600">{user.email}</p>
                  <span className={`inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {user.role}
                  </span>
                </div>
              </div>

              {/* Stats */}
              {profile && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <Calendar className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                    <p className="text-2xl font-bold text-blue-900">{profile.stats.totalItineraries}</p>
                    <p className="text-sm text-blue-700">Lịch trình</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <Share2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
                    <p className="text-2xl font-bold text-green-900">{profile.stats.sharedItineraries}</p>
                    <p className="text-sm text-green-700">Đã chia sẻ</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <MessageSquare className="h-8 w-8 mx-auto text-orange-600 mb-2" />
                    <p className="text-2xl font-bold text-orange-900">{profile.stats.totalReviews}</p>
                    <p className="text-sm text-orange-700">Đánh giá</p>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Ngày tạo:</span>{' '}
                  {new Date(user.createdAt).toLocaleString('vi-VN')}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Hoạt động gần nhất:</span>{' '}
                  {new Date(user.lastActive || user.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>

              {/* Itineraries */}
              {profile && profile.itineraries && profile.itineraries.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Lịch trình ({profile.itineraries.length})</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {profile.itineraries.slice(0, 10).map(itin => (
                      <div key={itin._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{itin.title}</p>
                          <p className="text-sm text-gray-600">{itin.destination}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{new Date(itin.startDate).toLocaleDateString('vi-VN')}</p>
                          {itin.isShared && <span className="text-xs text-green-600">Công khai</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {(isEditing || mode === 'create') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {mode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                    minLength="6"
                  />
                </div>
              )}

              {mode !== 'create' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mật khẩu mới (để trống nếu không đổi)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    minLength="6"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quyền
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {mode === 'create' ? 'Tạo người dùng' : 'Lưu thay đổi'}
                </button>
                <button
                  type="button"
                  onClick={() => mode === 'create' ? onClose() : setIsEditing(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Hủy
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserModal;
