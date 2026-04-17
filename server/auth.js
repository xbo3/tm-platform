import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'tm-platform-secret-2026';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, center_id: user.center_id, phone_id: user.phone_id, name: user.name },
    SECRET,
    { expiresIn: '24h' }
  );
}

export function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

export function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
