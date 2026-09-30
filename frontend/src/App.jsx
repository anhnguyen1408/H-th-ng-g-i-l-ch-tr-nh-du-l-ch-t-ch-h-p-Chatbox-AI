import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateItinerary from './pages/CreateItinerary';
import ItineraryDetail from './pages/ItineraryDetail';
import AdminDashboard from './pages/AdminDashboard';
import SharedItinerary from './pages/SharedItinerary';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Explore from './pages/Explore';
import ActiveItinerary from './pages/ActiveItinerary';
import CompletedItineraries from './pages/CompletedItineraries';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100">
        <Navbar />
        <main className="pt-16">
          <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/shared/:link" element={<SharedItinerary />} />
          <Route path="/explore" element={<Explore />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <CreateItinerary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/itinerary/:id"
            element={
              <ProtectedRoute>
                <ItineraryDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/active"
            element={
              <ProtectedRoute>
                <ActiveItinerary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/active/:id"
            element={
              <ProtectedRoute>
                <ActiveItinerary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/completed"
            element={
              <ProtectedRoute>
                <CompletedItineraries />
              </ProtectedRoute>
            }
          />
        </Routes>
        </main>
        <Footer />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </div>
    </AuthProvider>
  );
}

export default App;





