import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// Removed Lucide icons

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState('register'); // register, verify
  const [loading, setLoading] = useState(false);
  const { register, verifyEmail } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (step === 'register') {
      if (formData.password !== formData.confirmPassword) {
        alert('Mật khẩu xác nhận không khớp');
        return;
      }

      if (formData.password.length < 6) {
        alert('Mật khẩu phải có ít nhất 6 ký tự');
        return;
      }

      setLoading(true);
      const result = await register(formData.name, formData.email, formData.password);
      setLoading(false);
      
      if (result.success) {
        if (result.requireVerification) {
          setStep('verify');
        } else {
          navigate('/dashboard');
        }
      }
    } else {
      // Verify step
      if (!verificationCode) {
        alert('Vui lòng nhập mã xác thực');
        return;
      }

      setLoading(true);
      const result = await verifyEmail(formData.email, verificationCode);
      setLoading(false);

      if (result.success) {
        navigate('/dashboard');
      }
    }
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
              Tạo tài khoản để bắt đầu hành trình
            </p>
            <h2 className="text-3xl font-bold leading-tight">
              Bắt đầu với AI Travel Planner
              <span className="block text-primary-100">miễn phí và không giới hạn</span>
            </h2>
            <p className="text-sm text-primary-100/90 max-w-md">
              Lưu trữ lịch trình, chỉnh sửa bằng AI, chia sẻ với bạn bè và xuất PDF chỉ với vài thao tác.
            </p>
          </div>
          <div className="max-w-md w-full mx-auto space-y-8 bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-10 transition-transform duration-200 hover:-translate-y-1 hover:shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-blue-500 to-sky-400 rounded-full mb-6" />
            <div>
              <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900">
                Tạo tài khoản mới
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Đã có tài khoản?{' '}
                <Link
                  to="/login"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Đăng nhập
                </Link>
              </p>
            </div>
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              {step === 'register' ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Họ và tên
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Tên của bạn"
                      value={formData.name}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
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
                      autoComplete="new-password"
                      required
                      className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                      value={formData.password}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Xác nhận mật khẩu
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      placeholder="Nhập lại mật khẩu"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                    <div className="flex">
                      <div className="ml-3">
                        <p className="text-sm text-blue-700">
                          Mã xác thực đã được gửi đến email <strong>{formData.email}</strong>. Vui lòng kiểm tra hộp thư (cả thư rác).
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                      Mã xác thực
                    </label>
                    <input
                      id="code"
                      name="code"
                      type="text"
                      required
                      className="appearance-none rounded-lg block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-center tracking-widest text-2xl"
                      placeholder="******"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Đang xử lý...' : (step === 'register' ? 'Đăng ký' : 'Xác thực')}
                </button>
                {step === 'verify' && (
                  <button
                    type="button"
                    onClick={() => setStep('register')}
                    className="mt-2 w-full text-center text-sm text-gray-600 hover:text-gray-900"
                  >
                    Quay lại
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;





