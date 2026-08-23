import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'vt_token';

export function signIn(res, user) {
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000
  });
}

export function signOut(res) {
  res.clearCookie(COOKIE);
}

export function readUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch { /* jeton invalide/expiré */ }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}
