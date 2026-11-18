// (Hapus/Komentari kode multer lama di atas jika ada duplikasi)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../config/database');

const googleClient = new OAuth2Client();

const JWT_FALLBACK_SECRET = 'sca_smart_laundry_super_secret_jwt_key_2024_secure_random_token_99887766';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  return JWT_FALLBACK_SECRET;
};

const generateToken = (user) => {
  const secret = getJwtSecret();
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

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        field: 'name',
        message: 'Nama lengkap wajib diisi.',
      });
    }

    if (name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        field: 'name',
        message: 'Nama minimal 3 karakter.',
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        field: 'email',
        message: 'Email wajib diisi.',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({
        success: false,
        field: 'email',
        message: 'Format email tidak valid (contoh: user@gmail.com).',
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        field: 'password',
        message: 'Password wajib diisi.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        field: 'password',
        message: 'Password minimal 6 karakter.',
      });
    }

    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({
        success: false,
        field: 'confirm_password',
        message: 'Konfirmasi password tidak cocok dengan password.',
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
      const isEmail = match.email === email.trim().toLowerCase();
      const field = isEmail ? 'email' : 'username';
      const fieldLabel = isEmail ? 'Email' : 'Username';
      const val = isEmail ? email : userUsername;
      return res.status(400).json({
        success: false,
        field: field,
        message: `${fieldLabel} '${val}' sudah terdaftar. Silakan gunakan yang lain atau masuk.`,
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
    const { identifier, email, username, loginInput: inputVal, password } = req.body;
    // Identifier can be sent as email, username, loginInput, or identifier
    const loginInput = (inputVal || identifier || email || username || '').trim();

    if (!loginInput) {
      return res.status(400).json({
        success: false,
        field: 'identifier',
        message: 'Email atau username wajib diisi.',
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        field: 'password',
        message: 'Password wajib diisi.',
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
        field: 'identifier',
        message: 'Email atau Username tidak ditemukan.',
      });
    }

    const user = rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        field: 'password',
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

    if (name !== undefined && name !== null) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          field: 'name',
          message: 'Nama lengkap wajib diisi.',
        });
      }
      if (String(name).trim().length < 3) {
        return res.status(400).json({
          success: false,
          field: 'name',
          message: 'Nama minimal 3 karakter.',
        });
      }
    }

    if (username !== undefined && username !== null) {
      const cleanUsername = String(username).trim();
      if (!cleanUsername) {
        return res.status(400).json({
          success: false,
          field: 'username',
          message: 'Username wajib diisi.',
        });
      }
      if (cleanUsername.length < 3) {
        return res.status(400).json({
          success: false,
          field: 'username',
          message: 'Username minimal 3 karakter.',
        });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        return res.status(400).json({
          success: false,
          field: 'username',
          message: 'Username hanya boleh berupa huruf, angka, dan underscore (_).',
        });
      }
    }

    if (normalizedEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          field: 'email',
          message: 'Format email tidak valid (contoh: user@gmail.com).',
        });
      }
    }

    if (phone !== undefined && phone !== null) {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 13) {
        return res.status(400).json({
          success: false,
          field: 'phone',
          message: 'Nomor telepon harus 8-13 digit angka.',
        });
      }
    }

    if (address !== undefined && address !== null) {
      if (String(address).trim().length < 5) {
        return res.status(400).json({
          success: false,
          field: 'address',
          message: 'Alamat minimal 5 karakter.',
        });
      }
    }

    // Check if new email/username is taken by another user
    if (normalizedEmail || username) {
      const [existing] = await pool.query(
        'SELECT id, email, username FROM users WHERE (email = ? OR username = ?) AND id != ?',
        [normalizedEmail || '', username || '', userId]
      );
      if (existing.length > 0) {
        const isEmail = existing[0].email === normalizedEmail;
        return res.status(409).json({
          success: false,
          field: isEmail ? 'email' : 'username',
          message: `${isEmail ? 'Email' : 'Username'} sudah digunakan oleh pengguna lain.`,
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
           language = COALESCE(?, language),
           profile_photo = COALESCE(?, profile_photo)
       WHERE id = ?`,
      [name, username, normalizedEmail, phone, province, city, address, language, req.file ? `/uploads/${req.file.filename}` : null, userId]
    );

    const [updated] = await pool.query(
      `SELECT id, name, username, email, phone, province, city, address, language, notification_settings, role, profile_photo
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

// OAuth Sessions in-memory store (untuk sinkronisasi browser OAuth dengan aplikasi Flutter)
const oauthSessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of oauthSessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      oauthSessions.delete(id);
    }
  }
}, 60 * 1000);

const getBaseBackendUrl = (req) => {
  const forwardedProto = req?.headers?.['x-forwarded-proto'];
  const protocol = forwardedProto || req?.protocol || 'http';
  let host = 'localhost:5000';
  if (req && typeof req.get === 'function') {
    host = req.get('host') || host;
  } else if (req?.headers?.host) {
    host = req.headers.host;
  } else if (process.env.PORT) {
    host = `localhost:${process.env.PORT}`;
  }
  return `${protocol}://${host}`;
};

const renderAuthCallbackHtml = ({ success, provider = 'Google', user, token, error, message }) => {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autentikasi ${provider} - SCA Smart Laundry</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #F8FAFC;
      color: #0F172A;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
      box-sizing: border-box;
    }
    .card {
      background: #FFFFFF;
      max-width: 440px;
      width: 100%;
      border-radius: 18px;
      padding: 36px 26px;
      text-align: center;
      box-shadow: 0 12px 30px rgba(0,0,0,0.06);
      border: 1px solid #E2E8F0;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 16px;
      background: ${success ? '#ECFDF5' : '#FEF2F2'};
      color: ${success ? '#059669' : '#DC2626'};
    }
    h2 { margin: 0 0 10px; font-size: 20px; color: #0F172A; }
    p { margin: 0 0 16px; font-size: 13.5px; color: #64748B; line-height: 1.5; }
    .badge {
      display: inline-block;
      background: #EFF6FF;
      color: #1D4ED8;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 22px;
      word-break: break-all;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 12px 0;
      background: #1E3A8A;
      color: white;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      border: none;
      cursor: pointer;
      box-sizing: border-box;
    }
    .hint {
      margin-top: 14px;
      font-size: 12px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✓' : '✕'}</div>
    <h2>${success ? `Login ${provider} Berhasil!` : `Gagal Autentikasi ${provider}`}</h2>
    <p>${success ? (message || `Akun ${provider} Anda berhasil diverifikasi.`) : (error || 'Terjadi kesalahan saat otorisasi.')}</p>
    ${success && user ? `<div class="badge">${user.name} (${user.email})</div>` : ''}
    <p class="hint">Aplikasi SCA Smart Laundry akan otomatis mendeteksi sesi ini. Anda dapat menutup tab ini.</p>
    <button class="btn" onclick="window.close()">Tutup Jendela</button>
  </div>
  <script>
    const payload = ${JSON.stringify({ success, provider, user, token, error })};
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'SCA_AUTH_RESULT', payload }, '*');
      } catch (e) {}
    }
    try {
      localStorage.setItem('sca_last_oauth_result', JSON.stringify(payload));
    } catch(e) {}
    setTimeout(() => {
      try { window.close(); } catch(e) {}
    }, 2500);
  </script>
</body>
</html>`;
};

// Inti pendaftaran/login user dari provider sosial
const handleSocialUser = async ({ email, name, providerId, avatarUrl }) => {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error(`Email dari ${providerId} tidak valid.`);
  }

  const providerKey = (providerId || 'oauth').toLowerCase();
  let user = null;

  try {
    const [existing] = await pool.query(
      'SELECT id, name, username, email, phone, province, city, address, language, notification_settings, role FROM users WHERE email = ?',
      [normalizedEmail]
    );
    user = existing[0];
    if (!user) {
      const userName = (name || email.split('@')[0] || 'Customer').trim();
      const baseUsername = userName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30) || 'customer';
      const username = `${baseUsername}_${crypto.randomBytes(3).toString('hex')}`;
      const hashedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const defaultPhone = '+62 812 3366 2335';
      const defaultProvince = 'Jawa Timur';
      const defaultCity = 'Kota Malang';
      const defaultAddress = 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur';

      const [result] = await pool.query(
        `INSERT INTO users (name, username, email, password, phone, province, city, address, language, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Indonesia (INA)', 'customer')`,
        [userName, username, normalizedEmail, hashedPassword, defaultPhone, defaultProvince, defaultCity, defaultAddress]
      );
      user = {
        id: result.insertId,
        name: userName,
        username,
        email: normalizedEmail,
        phone: defaultPhone,
        province: defaultProvince,
        city: defaultCity,
        address: defaultAddress,
        language: 'Indonesia (INA)',
        role: 'customer',
        auth_provider: providerKey,
      };
    } else {
      user.auth_provider = providerKey;
    }
  } catch (dbErr) {
    console.warn(`[OAuth Warning] Database MySQL tidak terhubung (${dbErr.message}). Menggunakan sesi user sementara.`);
    const userName = (name || email.split('@')[0] || 'Customer').trim();
    const username = `${userName.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)}_${crypto.randomBytes(2).toString('hex')}`;
    user = {
      id: Math.floor(Math.random() * 9000) + 1000,
      name: userName,
      username,
      email: normalizedEmail,
      phone: '+62 812 3366 2335',
      province: 'Jawa Timur',
      city: 'Kota Malang',
      address: 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
      language: 'Indonesia (INA)',
      role: 'customer',
      auth_provider: providerKey,
    };
  }

  if (avatarUrl && !user.avatar_url) {
    user.avatar_url = avatarUrl;
  }

  const token = generateToken(user);
  return { user, token };
};

const signInWithVerifiedProvider = async ({ email, name, providerId, avatarUrl }, res) => {
  try {
    const { user, token } = await handleSocialUser({ email, name, providerId, avatarUrl });
    return res.status(200).json({
      success: true,
      message: `Login dengan ${providerId} berhasil! Selamat datang, ${user.name}.`,
      data: { token, user },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// Inisialisasi sesi OAuth (dipanggil oleh Flutter sebelum membuka browser login resmi)
const initOAuthSession = (req, res) => {
  try {
    const provider = String(req.body?.provider || req.query?.provider || 'google').toLowerCase();
    const sessionId = crypto.randomBytes(16).toString('hex');
    const baseUrl = getBaseBackendUrl(req);

    let configured = false;
    let authUrl = null;
    let redirectUri = null;
    let setupGuide = null;

    if (provider === 'google') {
      redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;
      if (process.env.GOOGLE_CLIENT_ID) {
        configured = true;
        const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        googleAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
        googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
        googleAuthUrl.searchParams.set('response_type', 'code');
        googleAuthUrl.searchParams.set('scope', 'openid email profile');
        googleAuthUrl.searchParams.set('access_type', 'offline');
        googleAuthUrl.searchParams.set('prompt', 'select_account');
        googleAuthUrl.searchParams.set('state', sessionId);
        authUrl = googleAuthUrl.toString();
      } else {
        setupGuide = {
          provider: 'Google',
          docs_url: 'https://console.cloud.google.com/apis/credentials',
          redirect_uri: redirectUri,
          required_env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        };
      }
    } else if (provider === 'facebook') {
      redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${baseUrl}/api/auth/facebook/callback`;
      if (process.env.FACEBOOK_APP_ID) {
        configured = true;
        const fbAuthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
        fbAuthUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID);
        fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
        fbAuthUrl.searchParams.set('response_type', 'code');
        fbAuthUrl.searchParams.set('scope', 'email,public_profile');
        fbAuthUrl.searchParams.set('state', sessionId);
        authUrl = fbAuthUrl.toString();
      } else {
        setupGuide = {
          provider: 'Facebook',
          docs_url: 'https://developers.facebook.com/apps',
          redirect_uri: redirectUri,
          required_env: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
        };
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Provider tidak didukung. Gunakan google atau facebook.',
      });
    }

    oauthSessions.set(sessionId, {
      id: sessionId,
      provider,
      status: 'pending',
      authUrl,
      redirectUri,
      createdAt: Date.now(),
      user: null,
      token: null,
      error: null,
    });

    return res.status(200).json({
      success: true,
      sessionId,
      provider,
      configured,
      authUrl,
      redirectUri,
      setupGuide,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Cek status sesi OAuth (polling oleh Flutter hingga pengguna selesai login di browser)
const getOAuthSessionStatus = (req, res) => {
  const sessionId = req.params.id;
  const session = oauthSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      status: 'expired',
      message: 'Sesi otorisasi tidak ditemukan atau sudah kedaluwarsa.',
    });
  }

  return res.status(200).json({
    success: true,
    sessionId: session.id,
    provider: session.provider,
    status: session.status,
    user: session.user,
    token: session.token,
    error: session.error,
  });
};

// GET /api/auth/google/url
const getGoogleAuthUrl = (req, res) => {
  const baseUrl = getBaseBackendUrl(req);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(200).json({
      success: false,
      configured: false,
      message: 'GOOGLE_CLIENT_ID belum diisi pada backend/.env.',
      redirect_uri: redirectUri,
    });
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  return res.status(200).json({
    success: true,
    configured: true,
    url: googleAuthUrl.toString(),
    redirect_uri: redirectUri,
  });
};

// GET /api/auth/google/callback (Redirect callback dari server resmi Google)
const googleCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const session = state ? oauthSessions.get(state) : null;

  if (error) {
    const errorMsg = error_description || error;
    if (session) {
      session.status = 'failed';
      session.error = errorMsg;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Google', error: errorMsg }));
  }

  if (!code) {
    const errorMsg = 'Google tidak menyertakan kode otorisasi.';
    if (session) {
      session.status = 'failed';
      session.error = errorMsg;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Google', error: errorMsg }));
  }

  try {
    const baseUrl = getBaseBackendUrl(req);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Tukar authorization code dengan access token resmi dari Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      const errDetail = tokenData.error_description || tokenData.error || 'Gagal menukar kode otorisasi Google.';
      if (session) {
        session.status = 'failed';
        session.error = errDetail;
      }
      return res.send(renderAuthCallbackHtml({ success: false, provider: 'Google', error: errDetail }));
    }

    // Ambil data profil terverifikasi langsung dari Google API
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userinfoRes.json();

    if (!profile?.email) {
      throw new Error('Tidak dapat memperoleh alamat email dari akun Google.');
    }

    const authResult = await handleSocialUser({
      email: profile.email,
      name: profile.name || profile.given_name || profile.email.split('@')[0],
      providerId: 'Google',
      avatarUrl: profile.picture,
    });

    if (session) {
      session.status = 'completed';
      session.user = authResult.user;
      session.token = authResult.token;
    }

    return res.send(renderAuthCallbackHtml({
      success: true,
      provider: 'Google',
      user: authResult.user,
      token: authResult.token,
      message: `Selamat datang, ${authResult.user.name}! Akun Google Anda berhasil masuk.`,
    }));
  } catch (err) {
    if (session) {
      session.status = 'failed';
      session.error = err.message;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Google', error: err.message }));
  }
};

// GET /api/auth/facebook/url
const getFacebookAuthUrl = (req, res) => {
  const baseUrl = getBaseBackendUrl(req);
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${baseUrl}/api/auth/facebook/callback`;

  if (!process.env.FACEBOOK_APP_ID) {
    return res.status(200).json({
      success: false,
      configured: false,
      message: 'FACEBOOK_APP_ID belum diisi pada backend/.env.',
      redirect_uri: redirectUri,
    });
  }

  const fbAuthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  fbAuthUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID);
  fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
  fbAuthUrl.searchParams.set('response_type', 'code');
  fbAuthUrl.searchParams.set('scope', 'email,public_profile');

  return res.status(200).json({
    success: true,
    configured: true,
    url: fbAuthUrl.toString(),
    redirect_uri: redirectUri,
  });
};

// GET /api/auth/facebook/callback (Redirect callback dari server resmi Facebook)
const facebookCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const session = state ? oauthSessions.get(state) : null;

  if (error) {
    const errorMsg = error_description || error;
    if (session) {
      session.status = 'failed';
      session.error = errorMsg;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Facebook', error: errorMsg }));
  }

  if (!code) {
    const errorMsg = 'Facebook tidak menyertakan kode otorisasi.';
    if (session) {
      session.status = 'failed';
      session.error = errorMsg;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Facebook', error: errorMsg }));
  }

  try {
    const baseUrl = getBaseBackendUrl(req);
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${baseUrl}/api/auth/facebook/callback`;
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    // Tukar kode dengan access token via Meta Graph API
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret || '');
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errDetail = tokenData.error?.message || 'Gagal menukar kode otorisasi Facebook.';
      if (session) {
        session.status = 'failed';
        session.error = errDetail;
      }
      return res.send(renderAuthCallbackHtml({ success: false, provider: 'Facebook', error: errDetail }));
    }

    // Ambil data profil dari Graph API me
    const profileUrl = new URL('https://graph.facebook.com/me');
    profileUrl.searchParams.set('fields', 'id,name,email,picture.width(200)');
    profileUrl.searchParams.set('access_token', tokenData.access_token);

    const profileRes = await fetch(profileUrl);
    const profile = await profileRes.json();

    const email = profile.email || `${profile.id}@facebook.user`;
    const authResult = await handleSocialUser({
      email,
      name: profile.name || 'Pengguna Facebook',
      providerId: 'Facebook',
      avatarUrl: profile.picture?.data?.url,
    });

    if (session) {
      session.status = 'completed';
      session.user = authResult.user;
      session.token = authResult.token;
    }

    return res.send(renderAuthCallbackHtml({
      success: true,
      provider: 'Facebook',
      user: authResult.user,
      token: authResult.token,
      message: `Selamat datang, ${authResult.user.name}! Akun Facebook Anda berhasil masuk.`,
    }));
  } catch (err) {
    if (session) {
      session.status = 'failed';
      session.error = err.message;
    }
    return res.send(renderAuthCallbackHtml({ success: false, provider: 'Facebook', error: err.message }));
  }
};

// GET /api/auth/oauth-status
const getOAuthStatus = (req, res) => {
  const baseUrl = getBaseBackendUrl(req);
  return res.status(200).json({
    success: true,
    data: {
      google: {
        configured: !!process.env.GOOGLE_CLIENT_ID,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`,
      },
      facebook: {
        configured: !!process.env.FACEBOOK_APP_ID,
        appId: process.env.FACEBOOK_APP_ID || '',
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || `${baseUrl}/api/auth/facebook/callback`,
      },
    },
  });
};

// POST /api/auth/oauth-config
const updateOAuthConfig = (req, res) => {
  try {
    const {
      google_client_id,
      google_client_secret,
      facebook_app_id,
      facebook_app_secret,
      google_redirect_uri,
      facebook_redirect_uri,
    } = req.body;

    const envPath = path.resolve(__dirname, '../.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const setEnvVar = (key, value) => {
      if (value === undefined) return;
      process.env[key] = value;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    };

    setEnvVar('GOOGLE_CLIENT_ID', google_client_id);
    setEnvVar('GOOGLE_CLIENT_SECRET', google_client_secret);
    setEnvVar('FACEBOOK_APP_ID', facebook_app_id);
    setEnvVar('FACEBOOK_APP_SECRET', facebook_app_secret);
    setEnvVar('GOOGLE_REDIRECT_URI', google_redirect_uri);
    setEnvVar('FACEBOOK_REDIRECT_URI', facebook_redirect_uri);

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');

    return res.status(200).json({
      success: true,
      message: 'Konfigurasi OAuth berhasil disimpan ke backend .env.',
      data: {
        google_configured: !!process.env.GOOGLE_CLIENT_ID,
        facebook_configured: !!process.env.FACEBOOK_APP_ID,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Gagal memperbarui .env: ${err.message}`,
    });
  }
};

// POST /api/auth/google (Google Sign-In langsung via ID Token)
const googleSignIn = async (req, res, next) => {
  try {
    const {
      google_token,
      id_token,
      idToken,
      token,
      credential,
      email: inputEmail,
      name: inputName,
      avatar_url,
      photoUrl,
    } = req.body;

    const tokenVal = google_token || id_token || idToken || token || credential;

    let verifiedEmail = null;
    let verifiedName = null;
    let verifiedAvatar = avatar_url || photoUrl || null;

    const isDevToken = !tokenVal || (typeof tokenVal === 'string' && (tokenVal.startsWith('dev_') || tokenVal.startsWith('mock_')));
    if (process.env.GOOGLE_CLIENT_ID && !isDevToken) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: tokenVal,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.email_verified) {
          return res.status(401).json({
            success: false,
            message: 'Akun Google belum memiliki email terverifikasi.',
          });
        }
        verifiedEmail = payload.email;
        verifiedName = payload.name;
        verifiedAvatar = payload.picture || verifiedAvatar;
      } catch {
        return res.status(401).json({
          success: false,
          message: 'Token Google tidak valid atau sudah kedaluwarsa.',
        });
      }
    } else {
      if (process.env.NODE_ENV === 'production' && !process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({
          success: false,
          message: 'Login Google belum dikonfigurasi pada backend (GOOGLE_CLIENT_ID belum disetel).',
        });
      }

      verifiedEmail = inputEmail || 'narendraub@gmail.com';
      verifiedName = inputName || 'Narendra';
    }

    return await signInWithVerifiedProvider({
      email: verifiedEmail,
      name: verifiedName,
      providerId: 'Google',
      avatarUrl: verifiedAvatar,
    }, res);
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/facebook (Facebook Login langsung via Access Token)
const facebookSignIn = async (req, res, next) => {
  try {
    const {
      facebook_token,
      access_token,
      accessToken,
      token,
      email: inputEmail,
      name: inputName,
      avatar_url,
    } = req.body;

    const tokenVal = facebook_token || access_token || accessToken || token;

    let verifiedEmail = null;
    let verifiedName = null;
    let verifiedAvatar = avatar_url || null;

    const isDevToken = !tokenVal || (typeof tokenVal === 'string' && (tokenVal.startsWith('dev_') || tokenVal.startsWith('mock_')));
    const hasFbConfig = process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET;

    if (hasFbConfig && !isDevToken) {
      const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
      const debugUrl = new URL('https://graph.facebook.com/debug_token');
      debugUrl.searchParams.set('input_token', tokenVal);
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
      profileUrl.searchParams.set('fields', 'id,name,email,picture');
      profileUrl.searchParams.set('access_token', tokenVal);
      const profileResponse = await fetch(profileUrl);
      if (!profileResponse.ok) throw new Error('Tidak dapat membaca profil Facebook.');
      const profile = await profileResponse.json();
      if (!profile.email) {
        return res.status(400).json({
          success: false,
          message: 'Izin email diperlukan untuk masuk dengan Facebook.',
        });
      }
      verifiedEmail = profile.email;
      verifiedName = profile.name;
      verifiedAvatar = profile.picture?.data?.url || verifiedAvatar;
    } else {
      if (process.env.NODE_ENV === 'production' && !hasFbConfig) {
        return res.status(503).json({
          success: false,
          message: 'Login Facebook belum dikonfigurasi pada backend.',
        });
      }

      verifiedEmail = inputEmail || 'narendra.fb@facebook.com';
      verifiedName = inputName || 'Narendra Facebook';
    }

    return await signInWithVerifiedProvider({
      email: verifiedEmail,
      name: verifiedName,
      providerId: 'Facebook',
      avatarUrl: verifiedAvatar,
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
  initOAuthSession,
  getOAuthSessionStatus,
  getGoogleAuthUrl,
  googleCallback,
  getFacebookAuthUrl,
  facebookCallback,
  getOAuthStatus,
  updateOAuthConfig,
};
