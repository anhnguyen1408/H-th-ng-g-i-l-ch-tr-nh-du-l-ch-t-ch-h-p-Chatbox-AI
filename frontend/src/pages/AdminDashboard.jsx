import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, MapPin, Calendar, Share2, Trash2, BarChart3, Shield, Clock, Eye, Edit, MessageSquare, AlertTriangle, UserPlus, Camera } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar } from 'recharts';
import { io } from 'socket.io-client';
import UserModal from '../components/UserModal';
import ItineraryModal from '../components/ItineraryModal';
import LocationModal from '../components/LocationModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [favoriteItineraries, setFavoriteItineraries] = useState([]);
  const [users, setUsers] = useState([]);
  const [itineraries, setItineraries] = useState([]);
  const [sharedItineraries, setSharedItineraries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [itineraryStats, setItineraryStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stats'); // stats, users, itineraries, shared, locations, reviews, reports, community
  const [reviews, setReviews] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedItineraryId, setSelectedItineraryId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationModalMode, setLocationModalMode] = useState('view');
  const [timeFilter, setTimeFilter] = useState('month'); // day, week, month, year, all
  const [locationSearch, setLocationSearch] = useState('');
  const [locationCityFilter, setLocationCityFilter] = useState('');
  const [locationCountryFilter, setLocationCountryFilter] = useState('');
  const [locationTypeFilter, setLocationTypeFilter] = useState('');
  const [locationSort, setLocationSort] = useState('newest');
  const [allCities, setAllCities] = useState([]);
  const [allCountries, setAllCountries] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [contributionStatus, setContributionStatus] = useState('all');

  useEffect(() => {
    fetchStats();
    fetchItineraries(); // Load itineraries on mount for charts
    fetchExtendedStats();
    
    // Socket.io connection (optional - graceful degradation if fails)
    let socket = null;
    try {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 5000,
      });

      socket.on('connect_error', (error) => {
        console.log('Socket connection failed in admin dashboard');
        // Silently fail - admin features work without websocket
      });

      socket.on('user_online', ({ userId, lastActive }) => {
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, lastActive } : u));
      });

      socket.on('user_updated', ({ user }) => {
        setUsers(prev => prev.map(u => u._id === user._id ? user : u));
      });

      socket.on('user_deleted', ({ userId }) => {
        setUsers(prev => prev.filter(u => u._id !== userId));
      });
    } catch (error) {
      console.log('Socket.io not available in admin dashboard');
    }

    return () => {
      if (socket) {
        try {
          socket.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'itineraries') {
      fetchItineraries();
    } else if (activeTab === 'shared') {
      fetchSharedItineraries();
    } else if (activeTab === 'locations') {
      fetchLocations();
    } else if (activeTab === 'reviews') {
      fetchReviews();
    } else if (activeTab === 'reports') {
      fetchReports();
    } else if (activeTab === 'community') {
      fetchContributions();
    }
  }, [activeTab, locationSearch, locationCityFilter, locationCountryFilter, locationTypeFilter, locationSort, contributionStatus]);

  const fetchStats = async () => {
    try {
      const [statsRes, favoritesRes] = await Promise.all([
        axios.get(`${API_URL}/admin/stats`),
        axios.get(`${API_URL}/admin/favorite-itineraries`),
      ]);
      setStats(statsRes.data.stats);
      setFavoriteItineraries(favoritesRes.data.favoriteItineraries || []);
    } catch (error) {
      toast.error('Không thể tải thống kê');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/users`);
      setUsers(response.data.users);
    } catch (error) {
      toast.error('Không thể tải danh sách người dùng');
    }
  };

  const fetchItineraries = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/itineraries`);
      setItineraries(response.data.itineraries);
    } catch (error) {
      toast.error('Không thể tải danh sách lịch trình');
    }
  };

  const fetchSharedItineraries = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/itineraries?shared=true`);
      setSharedItineraries(response.data.itineraries);
    } catch (error) {
      toast.error('Không thể tải lịch trình chia sẻ');
    }
  };

  const fetchLocations = async () => {
    try {
      const params = {};
      if (locationSearch) params.search = locationSearch;
      if (locationCityFilter) params.city = locationCityFilter;
      if (locationCountryFilter) params.country = locationCountryFilter;
      if (locationTypeFilter) params.type = locationTypeFilter;
      if (locationSort) params.sort = locationSort;
      
      const response = await axios.get(`${API_URL}/admin/locations`, { params });
      setLocations(response.data.locations);
      
      // Lần đầu tiên fetch tất cả để lấy danh sách cities/countries cho dropdown
      if (allCities.length === 0) {
        const allResponse = await axios.get(`${API_URL}/admin/locations`, { params: { limit: 1000 } });
        const allLocs = allResponse.data.locations;
        setAllCities([...new Set(allLocs.map(l => l.city).filter(Boolean))]);
        setAllCountries([...new Set(allLocs.map(l => l.country).filter(Boolean))]);
      }
    } catch (error) {
      toast.error('Không thể tải danh sách địa điểm');
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/itinerary-reviews`);
      setReviews(response.data.reviews || []);
    } catch (error) {
      toast.error('Không thể tải danh sách reviews');
    }
  };

  const fetchReports = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/reports`);
      setReports(response.data.reports || []);
    } catch (error) {
      toast.error('Không thể tải danh sách báo cáo');
    }
  };

  const fetchContributions = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/community/contributions?status=${contributionStatus}`);
      setContributions(response.data.contributions || []);
    } catch (error) {
      toast.error('Không thể tải community contributions');
    }
  };

  const handleApproveContribution = async (contrib) => {
    try {
      await axios.put(`${API_URL}/admin/community/contributions/${contrib.locationId}/approve/${contrib.contributionId}`, {
        type: contrib.type
      });
      toast.success('Đã duyệt đóng góp');
      fetchContributions();
    } catch (error) {
      toast.error('Không thể duyệt đóng góp');
    }
  };

  const handleRejectContribution = async (contrib) => {
    try {
      await axios.put(`${API_URL}/admin/community/contributions/${contrib.locationId}/reject/${contrib.contributionId}`, {
        type: contrib.type
      });
      toast.success('Đã ẩn đóng góp');
      fetchContributions();
    } catch (error) {
      toast.error('Không thể ẩn đóng góp');
    }
  };

  const handleDeleteContribution = async (contrib) => {
    if (!window.confirm('Xóa vĩnh viễn đóng góp này?')) return;
    try {
      await axios.delete(`${API_URL}/admin/community/contributions/${contrib.locationId}/${contrib.contributionId}?type=${contrib.type}`);
      toast.success('Đã xóa đóng góp');
      fetchContributions();
    } catch (error) {
      toast.error('Không thể xóa đóng góp');
    }
  };


  const handleDeleteLocation = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa địa điểm này?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/locations/${id}`);
      toast.success('Đã xóa địa điểm');
      fetchLocations();
      fetchStats();
    } catch (error) {
      toast.error('Không thể xóa địa điểm');
    }
  };

  const handleCreateLocation = () => {
    setLocationModalMode('create');
    setSelectedLocationId('new');
  };

  const handleViewLocation = (id) => {
    setLocationModalMode('view');
    setSelectedLocationId(id);
  };

  const fetchExtendedStats = async () => {
    try {
      // Fetch itinerary stats by date
      const itineraryStatsRes = await axios.get(`${API_URL}/admin/itinerary-stats`);
      setItineraryStats(itineraryStatsRes.data.stats || []);
    } catch (error) {
      console.log('Extended stats not available');
      setItineraryStats([]);
    }

  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Xóa người dùng này sẽ xóa tất cả lịch trình của họ. Bạn có chắc?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/users/${id}`);
      toast.success('Đã xóa người dùng');
      fetchUsers();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa người dùng');
    }
  };

  const handleChangeRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Thay đổi quyền thành ${newRole}?`)) {
      return;
    }

    try {
      await axios.put(`${API_URL}/admin/users/${id}/role`, { role: newRole });
      toast.success(`Đã đổi quyền thành ${newRole}`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể thay đổi quyền');
    }
  };

  const handleDeleteItinerary = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa lịch trình này?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/admin/itineraries/${id}`);
      toast.success('Đã xóa lịch trình');
      if (activeTab === 'shared') {
        fetchSharedItineraries();
      } else {
        fetchItineraries();
      }
      fetchStats();
    } catch (error) {
      toast.error('Không thể xóa lịch trình');
    }
  };

  const handleDeleteReview = async (itineraryId, reviewId) => {
    if (!window.confirm('Xóa review này?')) return;
    try {
      await axios.delete(`${API_URL}/admin/itineraries/${itineraryId}/reviews/${reviewId}`);
      toast.success('Đã xóa review');
      fetchReviews();
    } catch (error) {
      toast.error('Không thể xóa review');
    }
  };

  const handleUpdateReport = async (id, status, notes) => {
    try {
      await axios.put(`${API_URL}/admin/reports/${id}`, { status, adminNotes: notes });
      toast.success('Cập nhật báo cáo thành công');
      fetchReports();
    } catch (error) {
      toast.error('Không thể cập nhật');
    }
  };

  const handleCreateUser = () => {
    setSelectedUserId('new');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOnline = (lastActive) => {
    const now = new Date();
    const last = new Date(lastActive);
    const diff = (now - last) / 1000 / 60; // phút
    return diff < 5; // online nếu active trong 5 phút gần đây
  };

  // Prepare chart data
  const getShareChartData = () => {
    if (!stats) return [];
    return [
      { name: 'Chia sẻ', value: stats.sharedItineraries, color: '#10B981' },
      { name: 'Riêng tư', value: stats.totalItineraries - stats.sharedItineraries, color: '#6B7280' },
    ];
  };

  const filterItinerariesByTime = (items) => {
    if (!items || items.length === 0 || timeFilter === 'all') return items;
    
    const now = new Date();
    return items.filter(item => {
      const created = new Date(item.createdAt);
      const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      
      if (timeFilter === 'day') return diffDays === 0;
      if (timeFilter === 'week') return diffDays <= 7;
      if (timeFilter === 'month') return diffDays <= 30;
      if (timeFilter === 'year') return diffDays <= 365;
      return true;
    });
  };

  const getItinerariesByDateData = () => {
    if (!itineraryStats || itineraryStats.length === 0) return [];
    
    // Filter by time logic (assuming itineraryStats is already sorted by date)
    // Client-side filtering on the aggregated data
    if (timeFilter === 'all') return itineraryStats;

    const now = new Date();
    return itineraryStats.filter(item => {
      const date = new Date(item.date);
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (timeFilter === 'day') return diffDays === 0;
      if (timeFilter === 'week') return diffDays <= 7;
      if (timeFilter === 'month') return diffDays <= 30;
      if (timeFilter === 'year') return diffDays <= 365;
      return true;
    });
  };


  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-100">
      <div className="flex flex-col md:flex-row gap-4 lg:gap-6 w-full animate-fade-in-up">
        {/* Sidebar */}
        <aside className="md:w-64 w-full md:h-[calc(100vh-64px)] bg-gradient-to-b from-primary-900 via-primary-800 to-primary-700 text-white shadow-xl p-4 md:py-6 flex-shrink-0 md:sticky md:top-16 rounded-2xl md:rounded-none">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Bảng điều khiển</h2>
              <p className="text-xs text-white/80 mt-1">
                Quản lý người dùng, lịch trình và thống kê hệ thống.
              </p>
            </div>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('stats')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'stats'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Tổng quan
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                Người dùng
              </button>
              <button
                onClick={() => setActiveTab('itineraries')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'itineraries'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Lịch trình
              </button>
              <button
                onClick={() => setActiveTab('shared')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'shared'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Chia sẻ
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'locations'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Địa điểm
              </button>
              <button
                onClick={() => setActiveTab('reviews')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'reviews'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Reviews
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'reports'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Báo cáo
              </button>
              <button
                onClick={() => setActiveTab('community')}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'community'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Camera className="h-4 w-4 mr-2" />
                Cộng đồng
              </button>
            </nav>
          </aside>

          {/* Tab Content */}
          <div className="flex-1 px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Bảng điều khiển Admin</h1>
              <p className="text-gray-600">Quản lý người dùng, lịch trình và thống kê hệ thống</p>
            </div>

            {activeTab === 'stats' && (
              <>
            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div onClick={() => setActiveTab('users')} className="cursor-pointer">
                  <StatCard
                    icon={<Users className="h-8 w-8" />}
                    title="Tổng người dùng"
                    value={stats.totalUsers}
                    color="blue"
                  />
                </div>
                <div onClick={() => setActiveTab('itineraries')} className="cursor-pointer">
                  <StatCard
                    icon={<Calendar className="h-8 w-8" />}
                    title="Tổng lịch trình"
                    value={stats.totalItineraries}
                    color="green"
                  />
                </div>
                <div onClick={() => setActiveTab('locations')} className="cursor-pointer">
                  <StatCard
                    icon={<MapPin className="h-8 w-8" />}
                    title="Tổng địa điểm"
                    value={stats.totalLocations}
                    color="purple"
                  />
                </div>
                <div onClick={() => setActiveTab('shared')} className="cursor-pointer">
                  <StatCard
                    icon={<Share2 className="h-8 w-8" />}
                    title="Lịch trình chia sẻ"
                    value={stats.sharedItineraries}
                    color="orange"
                  />
                </div>
              </div>
            )}

            {/* Time Filter */}
            <div className="bg-white rounded-lg shadow-md p-4 mb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Lọc theo thời gian:</h3>
                <div className="flex space-x-2">
                  {['day', 'week', 'month', 'year', 'all'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter)}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                        timeFilter === filter
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {filter === 'day' && 'Hôm nay'}
                      {filter === 'week' && 'Tuần'}
                      {filter === 'month' && 'Tháng'}
                      {filter === 'year' && 'Năm'}
                      {filter === 'all' && 'Tất cả'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Pie Chart - Shared vs Private */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Tỷ lệ chia sẻ lịch trình</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getShareChartData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getShareChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Line Chart - Itineraries by Date */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Lịch trình tạo mới ({timeFilter === 'all' ? 'tất cả' : timeFilter === 'day' ? 'hôm nay' : timeFilter === 'week' ? '7 ngày' : timeFilter === 'month' ? '30 ngày' : '365 ngày'})</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={getItinerariesByDateData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Itinerary & City Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
                <h3 className="text-lg font-semibold mb-2">Tổng số lịch trình</h3>
                <p className="text-4xl font-bold">{itineraries.length}</p>
                <p className="text-sm text-blue-100 mt-2">Tất cả lịch trình đã tạo</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
                <h3 className="text-lg font-semibold mb-2">Số thành phố</h3>
                <p className="text-4xl font-bold">{new Set(itineraries.map(i => i.destination)).size}</p>
                <p className="text-sm text-green-100 mt-2">Thành phố/Điểm đến khác nhau</p>
              </div>
            </div>

            {/* Favorite Itineraries */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Lịch trình được yêu thích</h2>
              <p className="text-sm text-gray-500 mb-4">Danh sách các lịch trình mà người dùng đã đánh dấu yêu thích. Kéo xuống để xem thêm.</p>
              <div className="overflow-x-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiêu đề</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Điểm đến</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người tạo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reviews</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Đánh giá TB</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {favoriteItineraries.map((item) => (
                      <tr key={item._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.title}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.destination}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.userId?.name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {item.reviewCount} reviews
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="flex items-center">
                            <span className="text-yellow-500 mr-1">⭐</span>
                            {item.avgRating}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => setSelectedItineraryId(item._id)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Xem chi tiết"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {favoriteItineraries.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Chưa có lịch trình yêu thích nào
                </div>
              )}
            </div>
              </>
            )}

            {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Quản lý người dùng</h2>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center space-x-2"
              >
                <UserPlus className="h-4 w-4" />
                <span>Tạo người dùng</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quyền</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hoạt động gần nhất</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            isOnline(user.lastActive)
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {isOnline(user.lastActive) ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(user.lastActive || user.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => setSelectedUserId(user._id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleChangeRole(user._id, user.role)}
                          className="text-primary-600 hover:text-primary-900"
                          title="Đổi quyền"
                        >
                          <Shield className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            )}

            {activeTab === 'itineraries' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Quản lý lịch trình</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiêu đề</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Điểm đến</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người tạo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chi phí</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {itineraries.map((item) => (
                    <tr key={item._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.destination}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.userId?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(item.totalEstimatedCost || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => setSelectedItineraryId(item._id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItinerary(item._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            )}

            {activeTab === 'shared' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Lịch trình đang chia sẻ</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiêu đề</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Điểm đến</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người tạo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sharedItineraries.map((item) => (
                    <tr key={item._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.destination}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.userId?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(item.startDate)} - {formatDate(item.endDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => setSelectedItineraryId(item._id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItinerary(item._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            )}

            {activeTab === 'reviews' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Quản lý Reviews</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lịch trình</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người review</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Đánh giá</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bình luận</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reviews.map((review) => (
                        <tr key={review._id}>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{review.itineraryTitle}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{review.userId?.name || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <span className="flex items-center">
                              <span className="text-yellow-500 mr-1">⭐</span>
                              {review.rating}/5
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{review.comment}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(review.createdAt)}</td>
                          <td className="px-6 py-4 text-sm font-medium">
                            <button
                              onClick={() => handleDeleteReview(review.itineraryId, review._id)}
                              className="text-red-600 hover:text-red-900"
                              title="Xóa"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reviews.length === 0 && (
                  <div className="text-center py-8 text-gray-500">Chưa có review nào</div>
                )}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Quản lý Báo cáo</h2>
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div key={report._id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              report.status === 'reviewed' ? 'bg-blue-100 text-blue-800' :
                              report.status === 'resolved' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {report.status}
                            </span>
                            <span className="text-sm text-gray-600">{report.targetType}</span>
                          </div>
                          <p className="font-medium text-gray-900 mb-1">Lý do: {report.reason}</p>
                          <p className="text-sm text-gray-600 mb-2">{report.description}</p>
                          <p className="text-xs text-gray-500">Báo cáo bởi: {report.reportedBy?.name} - {formatDateTime(report.createdAt)}</p>
                          {report.adminNotes && (
                            <p className="text-xs text-blue-600 mt-2">Admin: {report.adminNotes}</p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdateReport(report._id, 'resolved', 'Xử lý xong')}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Giải quyết
                          </button>
                          <button
                            onClick={() => handleUpdateReport(report._id, 'dismissed', 'Không hợp lệ')}
                            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                          >
                            Bỏ qua
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {reports.length === 0 && (
                  <div className="text-center py-8 text-gray-500">Chưa có báo cáo nào</div>
                )}
              </div>
            )}

            {activeTab === 'locations' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Quản lý địa điểm</h2>
              <button
                onClick={handleCreateLocation}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center space-x-2"
              >
                <MapPin className="h-4 w-4" />
                <span>Tạo địa điểm mới</span>
              </button>
            </div>

            {/* Filters and Search */}
            <div className="mb-6 space-y-4">
              {/* Search */}
              <div>
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên, địa chỉ, mô tả..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Filters and Sort */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* City Filter - Tất cả cities từ DB */}
                {allCities.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Thành phố</label>
                    <select
                      value={locationCityFilter}
                      onChange={(e) => setLocationCityFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Tất cả</option>
                      {allCities.sort().map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Country Filter - Tất cả countries từ DB */}
                {allCountries.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quốc gia</label>
                    <select
                      value={locationCountryFilter}
                      onChange={(e) => setLocationCountryFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Tất cả</option>
                      {allCountries.sort().map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Type Filter - Dynamic */}
                {(() => {
                  const types = [...new Set(locations.map(l => l.type).filter(Boolean))];
                  const typeLabels = {
                    attraction: 'Điểm tham quan',
                    restaurant: 'Nhà hàng',
                    hotel: 'Khách sạn',
                    activity: 'Hoạt động'
                  };
                  return types.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                      <select
                        value={locationTypeFilter}
                        onChange={(e) => setLocationTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Tất cả</option>
                        {types.map(type => (
                          <option key={type} value={type}>{typeLabels[type] || type}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                {/* Sort */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sắp xếp</label>
                  <select
                    value={locationSort}
                    onChange={(e) => setLocationSort(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="newest">Mới nhất</option>
                    <option value="oldest">Cũ nhất</option>
                    <option value="usageDesc">Sử dụng: Cao → Thấp</option>
                    <option value="usageAsc">Sử dụng: Thấp → Cao</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Locations Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thành phố</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quốc gia</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Đánh giá</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sử dụng</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {locations.map((location) => (
                    <tr key={location._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {location.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {location.type === 'attraction' && 'Điểm tham quan'}
                        {location.type === 'restaurant' && 'Nhà hàng'}
                        {location.type === 'hotel' && 'Khách sạn'}
                        {location.type === 'activity' && 'Hoạt động'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {location.city}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {location.country}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="flex items-center">
                          <span className="text-yellow-500 mr-1">⭐</span>
                          {location.rating?.toFixed(1) || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {location.usageCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                          <span className={`px-2 py-1 rounded text-xs ${location.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {location.isActive ? 'Hoạt động' : 'Ngưng'}
                          </span>
                          {location.isVerified && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              Đã xác minh
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleViewLocation(location._id)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Xem chi tiết"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(location._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {locations.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {locationSearch ? 'Không tìm thấy địa điểm nào' : 'Chưa có địa điểm nào'}
              </div>
            )}
          </div>
            )}

            {activeTab === 'community' && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Quản lý đóng góp cộng đồng</h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={contributionStatus}
                      onChange={(e) => setContributionStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">Tất cả</option>
                      <option value="approved">Đã duyệt</option>
                      <option value="pending">Chờ duyệt</option>
                    </select>
                  </div>
                </div>

                {contributions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    Không có đóng góp nào
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Địa điểm</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nội dung</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người đóng góp</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {contributions.map((contrib) => (
                          <tr key={`${contrib.locationId}-${contrib.contributionId}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                contrib.type === 'image' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {contrib.type === 'image' ? 'Ảnh' : 'Bài viết'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{contrib.locationName}</div>
                              <div className="text-xs text-gray-500">{contrib.locationCity}</div>
                            </td>
                            <td className="px-6 py-4">
                              {contrib.type === 'image' ? (
                                <img 
                                  src={contrib.content} 
                                  alt="Preview" 
                                  className="w-20 h-20 object-cover rounded"
                                  onError={(e) => e.target.style.display = 'none'}
                                />
                              ) : (
                                <p className="text-sm text-gray-700 max-w-md truncate">{contrib.content}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {contrib.userId?.name || 'Unknown'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {contrib.userId?.email || ''}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDateTime(contrib.uploadedAt || contrib.createdAt)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                contrib.isApproved 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {contrib.isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                              {!contrib.isApproved && (
                                <button
                                  onClick={() => handleApproveContribution(contrib)}
                                  className="text-green-600 hover:text-green-900"
                                  title="Duyệt"
                                >
                                  ✓
                                </button>
                              )}
                              {contrib.isApproved && (
                                <button
                                  onClick={() => handleRejectContribution(contrib)}
                                  className="text-yellow-600 hover:text-yellow-900"
                                  title="Ẩn"
                                >
                                  ⊘
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteContribution(contrib)}
                                className="text-red-600 hover:text-red-900"
                                title="Xóa vĩnh viễn"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      {/* Modals */}
      {selectedUserId && (
        <UserModal
          userId={selectedUserId === 'new' ? null : selectedUserId}
          mode={selectedUserId === 'new' ? 'create' : 'view'}
          onClose={() => setSelectedUserId(null)}
          onUpdate={() => {
            fetchUsers();
            fetchStats();
          }}
        />
      )}

      {selectedItineraryId && (
        <ItineraryModal
          itineraryId={selectedItineraryId}
          onClose={() => setSelectedItineraryId(null)}
        />
      )}

      {selectedLocationId && (
        <LocationModal
          locationId={selectedLocationId === 'new' ? null : selectedLocationId}
          onClose={() => {
            setSelectedLocationId(null);
            setLocationModalMode('view');
          }}
          onUpdate={() => {
            fetchLocations();
            fetchStats();
          }}
          mode={locationModalMode}
        />
      )}
    </div>
  );
};

const StatCard = ({ icon, title, value, color }) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center">
        <div className={`${colorClasses[color]} text-white p-3 rounded-lg mr-4`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;





