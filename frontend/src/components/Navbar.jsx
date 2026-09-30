import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import NotificationBell from './NotificationBell';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const linkClass = 'text-white/80 hover:text-white transition-colors';

  const primaryButtonClass =
    'bg-white text-primary-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors';

  const handleLogout = () => {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary-900 via-primary-700 to-primary-500/95 backdrop-blur-md shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-white">AI Travel Planner</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className={linkClass}>
              Trang chủ
            </Link>
            <Link to="/explore" className={linkClass}>
              Khám phá
            </Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className={linkClass}>
                  Lịch trình
                </Link>
                <Link to="/create" className={primaryButtonClass}>
                  Tạo lịch trình
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className={linkClass}
                  >
                    Admin
                  </Link>
                )}
                <NotificationBell />
                
                {/* User Dropdown */}
                <div ref={userMenuRef} className="relative pl-4 border-l border-white/30">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center space-x-2 focus:outline-none hover:opacity-80 transition-opacity"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 flex items-center justify-center">
                      {user?.avatar ? (
                        <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold text-sm">{user?.name?.[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-white font-medium hidden lg:block">{user?.name}</span>
                    <ChevronDown className="w-4 h-4 text-white" />
                  </button>
                  
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-50">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Hồ sơ của tôi
                      </Link>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className={linkClass}>
                  Đăng nhập
                </Link>
                <Link to="/register" className={primaryButtonClass}>
                  Đăng ký
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200">
          <div className="px-4 pt-2 pb-3 space-y-1">
            <Link
              to="/"
              className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              Trang chủ
            </Link>
            <Link
              to="/explore"
              className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              onClick={() => setMobileMenuOpen(false)}
            >
              Khám phá
            </Link>
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Lịch trình
                </Link>
                <Link
                  to="/create"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Tạo lịch trình
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <div className="flex items-center space-x-3 px-3 py-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                      {user?.avatar ? (
                        <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-600 font-bold">{user?.name?.[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                  </div>
                  <Link
                    to="/profile"
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md mx-3 my-1"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Hồ sơ của tôi
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-100 rounded-md mx-3 my-1"
                  >
                    Đăng xuất
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="block px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;





