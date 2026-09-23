const jwt = require('jsonwebtoken');

const JWT_SECRET = 'blog-platform-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    // 过期或非法令牌与"未携带令牌"同为未认证，统一返回 401，
    // 与前端拦截器的失效判定口径保持一致
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken, JWT_SECRET };
