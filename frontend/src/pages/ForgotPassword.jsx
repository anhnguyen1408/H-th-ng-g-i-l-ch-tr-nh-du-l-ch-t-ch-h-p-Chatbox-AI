import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Vui lòng nhập email');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, {
        email,
      });

      if (response.data.success) {
        setEmailSent(true);
        toast.success('Email đặt lại mật khẩu đã được gửi');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div>
            <h2 className="text-center text-3xl font-bold text-gray-900">
              Quên mật khẩu
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Nhập email của bạn để nhận link đặt lại mật khẩu
            </p>
          </div>

          {!emailSent ? (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-lg placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Đang gửi...' : 'Gửi email đặt lại mật khẩu'}
                </button>
              </div>

              <div className="text-center">
                <Link
                  to="/login"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Quay lại đăng nhập
                </Link>
              </div>
            </form>
          ) : (
            <div className="mt-8 space-y-6">
              <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      Email đã được gửi!
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>
                        Vui lòng kiểm tra email của bạn và click vào link để đặt lại mật khẩu.
                        Link sẽ hết hạn sau 1 giờ.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={() => setEmailSent(false)}
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Gửi lại email
                </button>
              </div>

              <div className="text-center">
                <Link
                  to="/login"
                  className="font-medium text-gray-600 hover:text-gray-500"
                >
                  Quay lại đăng nhập
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
