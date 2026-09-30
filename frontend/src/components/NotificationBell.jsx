import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bell, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds (fallback)
    const interval = setInterval(fetchNotifications, 30000);

    // Socket.io disabled - using polling only
    // Uncomment below if you want real-time notifications via WebSocket
    /*
    let socket = null;
    try {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 2,
        timeout: 3000,
      });

      socket.on('connect_error', () => {
        socket.disconnect();
      });

      socket.on('connect', () => {
        if (user?.id) {
          socket.emit('join_user', user.id);
        }
      });

      socket.on('new_notification', (notification) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
        toast.info(notification.title);
      });
    } catch (error) {
      // Silently fail
    }
    */
    let socket = null;

    return () => {
      clearInterval(interval);
      if (socket) {
        try {
          socket.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
    };
  }, [user]); // Re-run if user changes

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API_URL}/notifications`);
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    try {
      // Mark as read
      if (!notification.isRead) {
        await axios.put(`${API_URL}/notifications/${notification._id}/read`);
        setUnreadCount(prev => Math.max(0, prev - 1));
        setNotifications(notifications.map(n =>
          n._id === notification._id ? { ...n, isRead: true } : n
        ));
      }

      // Navigate if has link
      if (notification.link) {
        setIsOpen(false);
        navigate(notification.link);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setLoading(true);
      await axios.put(`${API_URL}/notifications/read-all`);
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('Đã đánh dấu tất cả đã đọc');
    } catch (error) {
      toast.error('Không thể đánh dấu tất cả');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = async (e, notificationId) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_URL}/notifications/${notificationId}`);
      setNotifications(notifications.filter(n => n._id !== notificationId));
      const deletedNotif = notifications.find(n => n._id === notificationId);
      if (!deletedNotif.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast.success('Đã xóa thông báo');
    } catch (error) {
      toast.error('Không thể xóa thông báo');
    }
  };

  const handleClearRead = async () => {
    try {
      setLoading(true);
      await axios.delete(`${API_URL}/notifications/clear-read`);
      setNotifications(notifications.filter(n => !n.isRead));
      toast.success('Đã xóa các thông báo đã đọc');
    } catch (error) {
      toast.error('Không thể xóa thông báo');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (date) => {
    const now = new Date();
    const notifDate = new Date(date);
    const diffMs = now - notifDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return notifDate.toLocaleDateString('vi-VN');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-600 rounded-full border-2 border-primary-700 shadow-lg animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[600px] flex flex-col animate-fade-in-down">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <h3 className="text-lg font-semibold text-gray-900">
              Thông báo {unreadCount > 0 && `(${unreadCount})`}
            </h3>
            <div className="flex items-center space-x-2">
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={handleMarkAllRead}
                    disabled={loading || unreadCount === 0}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Đánh dấu tất cả đã đọc"
                  >
                    Đánh dấu đã đọc
                  </button>
                  <button
                    onClick={handleClearRead}
                    disabled={loading}
                    className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                    title="Xóa đã đọc"
                  >
                    Xóa đã đọc
                  </button>
                </>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-sm">Không có thông báo nào</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.isRead ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p className={`text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                          <button
                            onClick={(e) => handleDeleteNotification(e, notification._id)}
                            className="ml-2 text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-gray-100"
                            aria-label="Delete notification"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                    {!notification.isRead && (
                      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
