// Simple in-memory rate limiter for chat endpoint
const requestLog = new Map();

// Rate limit: 10 requests per minute per user
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

export const chatRateLimiter = (req, res, next) => {
  const userId = req.user?._id?.toString();
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  const now = Date.now();
  const userKey = `chat:${userId}`;

  // Get or create user's request history
  if (!requestLog.has(userKey)) {
    requestLog.set(userKey, []);
  }

  const userRequests = requestLog.get(userKey);

  // Remove requests outside the time window
  const recentRequests = userRequests.filter(timestamp => now - timestamp < WINDOW_MS);
  requestLog.set(userKey, recentRequests);

  // Check if user exceeded rate limit
  if (recentRequests.length >= RATE_LIMIT) {
    const oldestRequest = Math.min(...recentRequests);
    const retryAfter = Math.ceil((WINDOW_MS - (now - oldestRequest)) / 1000);

    return res.status(429).json({
      success: false,
      message: `Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi ${retryAfter} giây.`,
      retryAfter,
    });
  }

  // Add current request to log
  recentRequests.push(now);
  requestLog.set(userKey, recentRequests);

  next();
};

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestLog.entries()) {
    const recentRequests = timestamps.filter(timestamp => now - timestamp < WINDOW_MS);
    if (recentRequests.length === 0) {
      requestLog.delete(key);
    } else {
      requestLog.set(key, recentRequests);
    }
  }
}, 5 * 60 * 1000);
