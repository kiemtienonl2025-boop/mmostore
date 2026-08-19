function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không có quyền admin.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
