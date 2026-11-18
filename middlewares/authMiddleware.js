const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_FALLBACK_SECRET = 'sca_smart_laundry_super_secret_jwt_key_2024_secure_random_token_99887766';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  return JWT_FALLBACK_SECRET;
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak. Token autentikasi tidak ditemukan.',
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    // Verify user still exists in database
    const [rows] = await pool.query(
      'SELECT id, name, username, email, phone, province, city, address, language, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Pengguna tidak ditemukan atau token tidak valid.',
      });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Sesi telah berakhir (Token kedaluwarsa). Silakan masuk kembali.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Token tidak valid.',
      error: error.message,
    });
  }
};

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret);
      const [rows] = await pool.query(
        'SELECT id, name, username, email, phone, province, city, address, language, role FROM users WHERE id = ?',
        [decoded.id]
      );
      if (rows.length > 0) {
        req.user = rows[0];
      }
    }
  } catch {
    // Ignore error in optional auth
  }
  next();
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
};
