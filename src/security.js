const jwt = require('jsonwebtoken');
const crypto = require('crypto');
function tokenFor(user) { return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h', issuer: 'navigasi-pro' }); }
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'navigasi-pro' }); next(); }
  catch { return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa.' }); }
}
const founderOnly = (req, res, next) => req.user?.role === 'founder' ? next() : res.status(403).json({ error: 'Akses Founder diperlukan.' });
const ownerOnly = (req, res, next) => req.user?.role === 'owner' ? next() : res.status(403).json({ error: 'Akses Owner diperlukan.' });
const hashCode = value => crypto.createHash('sha256').update(value).digest('hex');
const makeActivationCode = () => 'NP-' + crypto.randomBytes(2).toString('hex').toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
module.exports = { tokenFor, auth, founderOnly, ownerOnly, hashCode, makeActivationCode };
