import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { MapPin, Clock, DollarSign, Download, Star } from 'lucide-react';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import MapView from '../components/MapView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const SharedItinerary = () => {
  const { link } = useParams();
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSharedItinerary();
  }, [link]);

  const fetchSharedItinerary = async () => {
    try {
      const response = await axios.get(`${API_URL}/itinerary/share/${link}`);
      setItinerary(response.data.itinerary);
    } catch (error) {
      toast.error('Không thể tải lịch trình được chia sẻ');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(20);
    doc.text(itinerary.title, 14, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.text(`Điểm đến: ${itinerary.destination}`, 14, yPos);
    yPos += 7;
    doc.text(
      `Từ ${formatDate(itinerary.startDate)} đến ${formatDate(itinerary.endDate)}`,
      14,
      yPos
    );
    yPos += 7;
    doc.text(`Số người: ${itinerary.numberOfPeople}`, 14, yPos);
    yPos += 7;
    doc.text(
      `Tổng chi phí: ${formatCurrency(itinerary.totalEstimatedCost)}`,
      14,
      yPos
    );
    yPos += 10;

    itinerary.days.forEach((day, dayIndex) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text(`Ngày ${dayIndex + 1} - ${formatDate(day.date)}`, 14, yPos);
      yPos += 8;

      day.activities.forEach((activity) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`${activity.time} - ${activity.name}`, 14, yPos);
        yPos += 6;

        doc.setFont(undefined, 'normal');
        doc.text(`  ${activity.description || ''}`, 14, yPos);
        yPos += 5;
        doc.text(`  Địa chỉ: ${activity.location?.address || 'N/A'}`, 14, yPos);
        yPos += 5;
        doc.text(`  Chi phí: ${formatCurrency(activity.cost || 0)}`, 14, yPos);
        yPos += 7;
      });

      doc.text(
        `Tổng chi phí ngày: ${formatCurrency(day.estimatedCost || 0)}`,
        14,
        yPos
      );
      yPos += 10;
    });

    doc.save(`${itinerary.title.replace(/\s+/g, '_')}.pdf`);
    toast.success('Đã xuất PDF thành công!');
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Lịch trình không tồn tại hoặc đã bị xóa</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 animate-fade-in-up">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{itinerary.title}</h1>
              <p className="text-sm text-gray-500 mb-2">
                Được chia sẻ bởi: {itinerary.userId?.name || 'Người dùng'}
              </p>
              <div className="flex flex-wrap gap-4 text-gray-600">
                <span className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  {itinerary.destination}
                </span>
                <span>
                  {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
                </span>
                <span>{itinerary.numberOfPeople} người</span>
                <span className="font-semibold text-primary-600">
                  {formatCurrency(itinerary.totalEstimatedCost)}
                </span>
              </div>
            </div>
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Xuất PDF
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {itinerary.days.map((day, dayIndex) => (
            <DayCard
              key={dayIndex}
              day={day}
              dayIndex={dayIndex}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const DayCard = ({ day, dayIndex, formatDate, formatCurrency }) => {
  const activities = day.activities || [];
  const locations = activities
    .filter((a) => a.location?.coordinates?.lat && a.location?.coordinates?.lng)
    .map((a) => ({
      lat: a.location.coordinates.lat,
      lng: a.location.coordinates.lng,
      name: a.name,
    }));

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:scale-105 hover:shadow-lg">
      <div className="bg-primary-600 text-white px-6 py-4">
        <h2 className="text-xl font-bold">
          Ngày {dayIndex + 1} - {formatDate(day.date)}
        </h2>
        <p className="text-primary-100">
          Tổng chi phí: {formatCurrency(day.estimatedCost || 0)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Lịch trình</h3>
          <div className="space-y-4">
            {activities.map((activity, actIndex) => (
              <div key={actIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Hình ảnh địa điểm - Chỉ hiển thị nếu có ảnh thực sự */}
                <div className="w-full h-48 overflow-hidden bg-gray-200">
                  {activity.image ? (
                    <img 
                      src={activity.image} 
                      alt={activity.name || 'Địa điểm'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Nếu hình ảnh lỗi, ẩn img và hiển thị placeholder
                        e.target.style.display = 'none';
                        const parent = e.target.parentElement;
                        if (parent && !parent.querySelector('.no-image-placeholder')) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'no-image-placeholder w-full h-full flex items-center justify-center bg-gray-100';
                          placeholder.innerHTML = `
                            <div class="text-center text-gray-500">
                              <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <p class="text-sm">Không tìm thấy ảnh</p>
                            </div>
                          `;
                          parent.appendChild(placeholder);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="text-center text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-sm">Không tìm thấy ảnh</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="text-2xl flex-shrink-0">
                        {activity.type === 'attraction' && '🎯'}
                        {activity.type === 'restaurant' && '🍽️'}
                        {activity.type === 'hotel' && '🏨'}
                        {activity.type === 'activity' && '🎪'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          <span className="font-semibold text-gray-900">{activity.time}</span>
                          <h4 className="font-semibold text-gray-900 truncate">{activity.name}</h4>
                        </div>
                        <p className="text-gray-600 text-sm mt-1 line-clamp-2">{activity.description}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="flex items-center text-primary-600">
                        <DollarSign className="h-4 w-4 mr-1" />
                        <span className="font-semibold text-sm">
                          {formatCurrency(activity.cost || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {activity.location?.address && (
                    <div className="flex items-center text-gray-500 text-sm mt-2">
                      <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{activity.location.address}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {locations.length > 0 && (
          <div className="p-6 border-t lg:border-t-0 lg:border-l border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Bản đồ</h3>
            <div className="h-96 rounded-lg overflow-hidden">
              <MapView locations={locations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedItinerary;





