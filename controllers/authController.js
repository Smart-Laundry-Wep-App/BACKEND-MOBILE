const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../config/database');

const googleClient = new OAuth2Client();

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET harus diatur dengan nilai acak minimal 32 karakter.');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || 'customer',
    },
    secret,
    { expiresIn }
  );
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, confirm_password, username, phone, province, city, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nama, Email, dan Password wajib diisi.',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid.',
      });
    }

    if (confirm_password && password !== confirm_password) {
      return res.status(409).json({
        success: false,
        message: 'Konfirmasi password tidak cocok dengan password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password minimal 6 karakter.',
      });
    }

    // Auto-generate username if not provided
    const userUsername = (username || email.split('@')[0] || name.toLowerCase().replace(/\s+/g, '')).trim();

    // Check if email or username already registered
    const [existing] = await pool.query(
      'SELECT id, email, username FROM users WHERE email = ? OR username = ?',
      [email.trim().toLowerCase(), userUsername]
    );

    if (existing.length > 0) {
      const match = existing[0];
      const field = match.email === email.trim().toLowerCase() ? 'Email' : 'Username';
      return res.status(400).json({
        success: false,
        message: `${field} '${field === 'Email' ? email : userUsername}' sudah terdaftar. Silakan gunakan yang lain atau masuk.`,
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, password, phone, province, city, address, language, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        userUsername,
        email.trim().toLowerCase(),
        hashedPassword,
        phone || '+62 812 3366 2335',
        province || 'Jawa Timur',
        city || 'Kota Malang',
        address || 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
        'Indonesia (INA)',
        'customer',
      ]
    );

    const newUser = {
      id: result.insertId,
      name: name.trim(),
      username: userUsername,
      email: email.trim().toLowerCase(),
      phone: phone || '+62 812 3366 2335',
      province: province || 'Jawa Timur',
      city: city || 'Kota Malang',
      address: address || 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
      language: 'Indonesia (INA)',
      role: 'customer',
    };

    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil! Selamat datang di SCA Smart Laundry.',
      data: {
        token,
        user: newUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { identifier, email, username, password } = req.body;
    // Identifier can be sent as email, username, or identifier
    const loginInput = (identifier || email || username || '').trim();

    if (!loginInput || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email / Username dan Password wajib diisi.',
      });
    }

    // Find user by email or username
    const [rows] = await pool.query(
      `SELECT id, name, username, email, password, phone, province, city, address, language, notification_settings, role
       FROM users WHERE email = ? OR username = ?`,
      [loginInput.toLowerCase(), loginInput]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email atau Username tidak ditemukan.',
      });
    }

    const user = rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah.',
      });
    }

    const token = generateToken(user);

    // Exclude password from response
    delete user.password;

    res.status(200).json({
      success: true,
      message: 'Login berhasil.',
      data: {
        token,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me (or /api/users/profile)
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT id, name, username, email, phone, province, city, address, language, notification_settings, role, created_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profil pengguna tidak ditemukan.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Data profil berhasil diambil.',
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/auth/profile (or /api/users/profile)
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, username, email, phone, province, city, address, language } = req.body;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Format email tidak valid.',
      });
    }

    // Check if new email/username is taken by another user
    if (normalizedEmail || username) {
      const [existing] = await pool.query(
        'SELECT id, email, username FROM users WHERE (email = ? OR username = ?) AND id != ?',
        [normalizedEmail || '', username || '', userId]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email atau Username sudah digunakan oleh pengguna lain.',
        });
      }
    }

    await pool.query(
      `UPDATE users
       SET name = COALESCE(?, name),
           username = COALESCE(?, username),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           province = COALESCE(?, province),
           city = COALESCE(?, city),
           address = COALESCE(?, address),
           language = COALESCE(?, language)
       WHERE id = ?`,
      [name, username, normalizedEmail, phone, province, city, address, language, userId]
    );

    const [updated] = await pool.query(
      `SELECT id, name, username, email, phone, province, city, address, language, notification_settings, role
       FROM users WHERE id = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/notifications
const updateNotificationSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { notification_settings } = req.body;

    await pool.query(
      'UPDATE users SET notification_settings = ? WHERE id = ?',
      [JSON.stringify(notification_settings || {}), userId]
    );

    res.status(200).json({
      success: true,
      message: 'Pengaturan notifikasi berhasil diperbarui.',
      data: notification_settings,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email wajib diisi.',
    });
  }
  res.status(503).json({
    success: false,
    message: 'Layanan email belum dikonfigurasi; tautan reset password belum dapat dikirim.',
  });
};

const signInWithVerifiedProvider = async ({ email, name, providerId }, res) => {
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await pool.query(
    'SELECT id, name, username, email, phone, province, city, address, language, notification_settings, role FROM users WHERE email = ?',
    [normalizedEmail]
  );
  let user = existing[0];
  if (!user) {
    const userName = name || email.split('@')[0];
    const baseUsername = userName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'customer';
    const username = `${baseUsername}_${crypto.randomBytes(3).toString('hex')}`;
    const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, password, phone, province, city, address, language, role)
       VALUES (?, ?, ?, ?, '', '', '', '', 'Indonesia (INA)', 'customer')`,
      [userName, username, normalizedEmail, hashedPassword]
    );
    user = {
      id: result.insertId,
      name: userName,
      username,
      email: normalizedEmail,
      phone: '',
      province: '',
      city: '',
      address: '',
      language: 'Indonesia (INA)',
      role: 'customer',
    };
  }

  const token = generateToken(user);
  return res.status(200).json({
    success: true,
    message: `Login dengan ${providerId} berhasil.`,
    data: { token, user },
  });
};

// POST /api/auth/google (Google Sign-In)
const googleSignIn = async (req, res, next) => {
  try {
    const { google_token } = req.body;
    if (!google_token) {
      return res.status(400).json({
        success: false,
        message: 'Token Google wajib disertakan.',
      });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        success: false,
        message: 'Login Google belum dikonfigurasi pada backend.',
      });
    }

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: google_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Token Google tidak valid atau sudah kedaluwarsa.',
      });
    }
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: 'Akun Google belum memiliki email terverifikasi.',
      });
    }

    return await signInWithVerifiedProvider({
      email: payload.email,
      name: payload.name,
      providerId: 'Google',
    }, res);
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/facebook (Facebook Login)
const facebookSignIn = async (req, res, next) => {
  try {
    const { facebook_token } = req.body;
    if (!facebook_token) {
      return res.status(400).json({
        success: false,
        message: 'Token Facebook wajib disertakan.',
      });
    }
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      return res.status(503).json({
        success: false,
        message: 'Login Facebook belum dikonfigurasi pada backend.',
      });
    }

    const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
    const debugUrl = new URL('https://graph.facebook.com/debug_token');
    debugUrl.searchParams.set('input_token', facebook_token);
    debugUrl.searchParams.set('access_token', appToken);
    const debugResponse = await fetch(debugUrl);
    if (!debugResponse.ok) throw new Error('Tidak dapat memverifikasi token Facebook.');
    const debug = await debugResponse.json();
    const tokenData = debug.data;
    if (!tokenData?.is_valid || tokenData.app_id !== process.env.FACEBOOK_APP_ID) {
      return res.status(401).json({
        success: false,
        message: 'Token Facebook tidak valid.',
      });
    }

    const profileUrl = new URL('https://graph.facebook.com/me');
    profileUrl.searchParams.set('fields', 'id,name,email');
    profileUrl.searchParams.set('access_token', facebook_token);
    const profileResponse = await fetch(profileUrl);
    if (!profileResponse.ok) throw new Error('Tidak dapat membaca profil Facebook.');
    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.status(400).json({
        success: false,
        message: 'Izin email diperlukan untuk masuk dengan Facebook.',
      });
    }
    return await signInWithVerifiedProvider({
      email: profile.email,
      name: profile.name,
      providerId: 'Facebook',
    }, res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  googleSignIn,
  facebookSignIn,
  getProfile,
  updateProfile,
  updateNotificationSettings,
  forgotPassword,
};
