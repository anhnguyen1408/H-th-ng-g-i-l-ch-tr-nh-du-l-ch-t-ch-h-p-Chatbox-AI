import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// Removed Lucide icons

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(formData.email, formData.password);
    if (result.success) {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-700 to-blue-500 relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg?auto=compress&cs=tinysrgb&w=1600"
          alt="Cảnh du lịch"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/90 via-primary-700/85 to-blue-500/85" />
      </div>
      <div className="relative max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="hidden md:block text-white space-y-4">
            <p className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
              Trợ lý AI lập kế hoạch du lịch
            </p>
            <h2 className="text-3xl font-bold leading-tight">
              Chào mừng bạn quay lại,
              <span className="block text-primary-100">tiếp tục hành trình của bạn</span>
            </h2>
            <p className="text-sm text-primary-100/90 max-w-md">
              Đăng nhập để xem lại các lịch trình đã tạo, chỉnh sửa bằng AI và chia sẻ với bạn bè.
            </p>
          </div>
          <div className="max-w-md w-full mx-auto space-y-8 bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10 transition-transform duration-200 hover:-translate-y-1 hover:shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-blue-500 to-sky-400 rounded-full mb-6" />
            <div>
              <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
                Đăng nhập vào tài khoản
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Hoặc{' '}
                <Link
                  to="/register"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  đăng ký tài khoản mới
                </Link>
              </p>
            </div>
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="rounded-md shadow-sm -space-y-px">
                <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Email của bạn"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Mật khẩu
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                    placeholder="Mật khẩu của bạn"
                    value={formData.password}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </div>

              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary-600 hover:text-primary-500"
                >
                  Quên mật khẩu?
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;





