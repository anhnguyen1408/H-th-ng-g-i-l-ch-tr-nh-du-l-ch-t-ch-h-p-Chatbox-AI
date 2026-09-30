import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
// Removed Lucide icons
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ChatBox = ({ itineraryId, isOpen, onClose, onItineraryUpdate }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Xin chào! Tôi là trợ lý du lịch AI. Tôi có thể giúp bạn điều chỉnh lịch trình, thêm địa điểm mới, hoặc trả lời các câu hỏi về chuyến đi. Bạn muốn thay đổi gì?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handlePreviewChanges = (changes, messageIndex) => {
    setPreviewData({ changes, messageIndex });
    setShowPreview(true);
  };

  const handleApplyChanges = async (changes, messageIndex) => {
    try {
      const response = await axios.post(`${API_URL}/itinerary/${itineraryId}/apply-changes`, {
        changes,
      });

      const appliedCount = response.data.appliedChanges?.length || 0;
      toast.success(`Đã áp dụng ${appliedCount} thay đổi vào lịch trình!`);
      
      // Mark this message as applied and store applied changes
      const updatedMessages = [...messages];
      updatedMessages[messageIndex].changesApplied = true;
      updatedMessages[messageIndex].appliedChanges = response.data.appliedChanges;
      setMessages(updatedMessages);

      // Close preview if open
      setShowPreview(false);

      // Notify parent to refresh itinerary
      if (onItineraryUpdate) {
        onItineraryUpdate();
      }
    } catch (error) {
      toast.error('Không thể áp dụng thay đổi. Vui lòng thử lại.');
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Send to API
      const response = await axios.post(`${API_URL}/itinerary/${itineraryId}/chat`, {
        message: userMessage,
        chatHistory: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      });


      
      // Add AI response with changes if present
      const aiMessage = {
        role: 'assistant',
        content: response.data.response,
        changes: response.data.changes || null,
        changesApplied: false,
      };

      setMessages([...newMessages, aiMessage]);
    } catch (error) {
      toast.error('Không thể gửi tin nhắn. Vui lòng thử lại.');
      // Remove user message if error
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-primary-600 text-white rounded-t-lg">
        <div>
          <h3 className="font-semibold">Trợ lý AI - Tự động cập nhật</h3>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 transition-colors"
        >
          <span className="text-xl font-bold">×</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              
              {/* Show preview and apply buttons if there are changes */}
              {message.changes && !message.changesApplied && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-600 mb-1">
                    {message.changes.operations?.length || 0} thay đổi được đề xuất
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePreviewChanges(message.changes, index)}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <span>Xem trước</span>
                    </button>
                    <button
                      onClick={() => handleApplyChanges(message.changes, index)}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <span>Áp dụng</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Show applied indicator with details */}
              {message.changes && message.changesApplied && (
                <div className="mt-3 space-y-2">
                  <div className="text-green-600 text-sm font-medium">
                    <span>✓ Đã áp dụng {message.appliedChanges?.length || 0} thay đổi</span>
                  </div>
                  {message.appliedChanges && message.appliedChanges.length > 0 && (
                    <button
                      onClick={() => {
                        setPreviewData({ 
                          changes: message.changes, 
                          messageIndex: index,
                          appliedChanges: message.appliedChanges 
                        });
                        setShowPreview(true);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 underline"
                    >
                      Xem chi tiết thay đổi
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-primary-600 border-r-transparent"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ví dụ: Thêm quán cà phê vào buổi chiều ngày 1..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            rows="2"
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="font-bold">Gửi</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Nhấn Enter để gửi, Shift+Enter để xuống dòng
        </p>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <PreviewModal
          changes={previewData.changes}
          appliedChanges={previewData.appliedChanges}
          onClose={() => setShowPreview(false)}
          onApply={() => handleApplyChanges(previewData.changes, previewData.messageIndex)}
          alreadyApplied={!!previewData.appliedChanges}
        />
      )}
    </div>
  );
};

const PreviewModal = ({ changes, appliedChanges, onClose, onApply, alreadyApplied }) => {
  const operations = changes?.operations || [];

  const getActionText = (action) => {
    switch (action) {
      case 'add': return 'Thêm';
      case 'update': return 'Sửa';
      case 'delete': return 'Xoá';
      case 'updateMetadata': return 'Cập nhật thông tin';
      default: return action;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'add': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'updateMetadata': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">
            {alreadyApplied ? 'Chi tiết các thay đổi đã áp dụng' : 'Xem trước các thay đổi'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span className="text-xl font-bold">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {operations.map((op, idx) => {
            const applied = appliedChanges?.[idx];
            
            return (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                {/* Operation Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getActionColor(op.action)}`}>
                      {getActionText(op.action)}
                    </span>
                    {op.action !== 'updateMetadata' && (
                      <span className="text-sm text-gray-600">
                        Ngày {op.dayIndex + 1}
                        {op.activityIndex !== null && ` - Hoạt động #${op.activityIndex + 1}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata Update */}
                {op.action === 'updateMetadata' && (
                  <div className="border-l-4 border-purple-400 pl-3">
                    <div className="text-xs font-semibold text-purple-600 mb-2">
                      {alreadyApplied ? 'ĐÃ CẬP NHẬT:' : 'SẼ CẬP NHẬT:'}
                    </div>
                    <div className="space-y-1 text-sm">
                      {op.metadata?.title && (
                        <div><span className="font-medium">Tên lịch trình:</span> {op.metadata.title}</div>
                      )}
                      {op.metadata?.destination && (
                        <div><span className="font-medium">Điểm đến:</span> {op.metadata.destination}</div>
                      )}
                      {op.metadata?.numberOfPeople && (
                        <div><span className="font-medium">Số người:</span> {op.metadata.numberOfPeople}</div>
                      )}
                      {op.metadata?.budget && (
                        <div><span className="font-medium">Ngân sách:</span> {op.metadata.budget.toLocaleString('vi-VN')} VNĐ</div>
                      )}
                      {op.metadata?.startDate && (
                        <div><span className="font-medium">Ngày bắt đầu:</span> {new Date(op.metadata.startDate).toLocaleDateString('vi-VN')}</div>
                      )}
                      {op.metadata?.endDate && (
                        <div><span className="font-medium">Ngày kết thúc:</span> {new Date(op.metadata.endDate).toLocaleDateString('vi-VN')}</div>
                      )}
                      {applied?.before && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-500">Xem thông tin cũ</summary>
                          <div className="mt-1 text-xs text-gray-600 pl-2">
                            {applied.before.title && <div>Tên: {applied.before.title}</div>}
                            {applied.before.destination && <div>Điểm đến: {applied.before.destination}</div>}
                            {applied.before.numberOfPeople && <div>Số người: {applied.before.numberOfPeople}</div>}
                            {applied.before.budget && <div>Ngân sách: {applied.before.budget.toLocaleString('vi-VN')} VNĐ</div>}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                )}

                {/* Before/After for Update */}
                {op.action === 'update' && applied && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border-l-4 border-red-400 pl-3">
                      <div className="text-xs font-semibold text-red-600 mb-2">TRƯỚC KHI SỬA:</div>
                      <ActivityPreview activity={applied.before?.activity} />
                    </div>
                    <div className="border-l-4 border-green-400 pl-3">
                      <div className="text-xs font-semibold text-green-600 mb-2">SAU KHI SỬA:</div>
                      <ActivityPreview activity={applied.after?.activity} />
                    </div>
                  </div>
                )}

                {/* Add */}
                {op.action === 'add' && (
                  <div className="border-l-4 border-green-400 pl-3">
                    <div className="text-xs font-semibold text-green-600 mb-2">
                      {alreadyApplied ? 'ĐÃ THÊM:' : 'SẼ THÊM:'}
                    </div>
                    <ActivityPreview activity={applied?.after?.addedActivity || op.activity} />
                  </div>
                )}

                {/* Delete */}
                {op.action === 'delete' && applied && (
                  <div className="border-l-4 border-red-400 pl-3">
                    <div className="text-xs font-semibold text-red-600 mb-2">
                      {alreadyApplied ? 'ĐÃ XOÁ:' : 'SẼ XOÁ:'}
                    </div>
                    <ActivityPreview activity={applied.before?.activity} />
                  </div>
                )}

                {/* Fallback cho các operation chưa có dữ liệu applied và không có block riêng */}
                {!applied && op.action === 'update' && op.activity && (
                  <div className="border-l-4 border-gray-400 pl-3">
                    <div className="text-xs font-semibold text-gray-600 mb-2">CHI TIẾT:</div>
                    <ActivityPreview activity={op.activity} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Đóng
          </button>
          {!alreadyApplied && (
            <button
              onClick={onApply}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
            >
              <span>Áp dụng tất cả</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ActivityPreview = ({ activity }) => {
  if (!activity) return <p className="text-sm text-gray-500 italic">Không có thông tin</p>;

  return (
    <div className="space-y-1 text-sm">
      <div className="font-semibold text-gray-900">{activity.time} - {activity.name}</div>
      {activity.description && (
        <div className="text-gray-600">{activity.description}</div>
      )}
      {activity.location?.address && (
        <div className="text-gray-500 text-xs"> {activity.location.address}</div>
      )}
      <div className="flex items-center space-x-3 text-xs text-gray-500">
        {activity.duration > 0 && <span> {activity.duration} phút</span>}
        {activity.cost !== undefined && (
          <span> {activity.cost.toLocaleString('vi-VN')} VNĐ</span>
        )}
        {activity.rating > 0 && <span> {activity.rating}/5</span>}
      </div>
    </div>
  );
};

export default ChatBox;

