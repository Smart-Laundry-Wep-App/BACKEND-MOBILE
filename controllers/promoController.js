const { pool } = require('../config/database');
const { authMiddleware } = require('../middlewares/authMiddleware');

// GET /api/promos
const getAllPromos = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, code, title, promo_title, discount_type, discount_value, min_order_amount, validity, terms FROM promos WHERE is_active = 1 ORDER BY id ASC'
    );

    // Map to frontend PromoItemData format
    const formatted = rows.map((p) => ({
      ...p,
      title: p.title,
      promoTitle: p.promo_title,
      validity: p.validity,
    }));

    res.status(200).json({
      success: true,
      message: 'Daftar promo berhasil diambil.',
      total: formatted.length,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/promos/validate (Klaim / Cek Voucher)
const validatePromo = async (req, res, next) => {
  try {
    const { code, order_amount = 0 } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        field: 'code',
        message: 'Kode voucher wajib dimasukkan.',
      });
    }

    const cleanCode = code.trim().toUpperCase();

    const [rows] = await pool.query(
      'SELECT * FROM promos WHERE code = ? AND is_active = 1',
      [cleanCode]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        field: 'code',
        message: `Kode voucher '${code}' tidak valid atau sudah kedaluwarsa.`,
      });
    }

    const promo = rows[0];

    if (parseFloat(order_amount) > 0 && parseFloat(order_amount) < parseFloat(promo.min_order_amount)) {
      return res.status(400).json({
        success: false,
        field: 'code',
        message: `Minimal transaksi untuk voucher '${promo.code}' adalah Rp ${parseFloat(promo.min_order_amount).toLocaleString('id-ID')}.`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Voucher '${promo.code}' berhasil digunakan!`,
      data: {
        code: promo.code,
        title: promo.title,
        promo_title: promo.promo_title,
        discount_type: promo.discount_type,
        discount_value: parseFloat(promo.discount_value),
        validity: promo.validity,
      },
    });
  } catch (error) {
    next(error);
  }
};

const claimPromo = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || !String(code).trim()) {
      return res.status(400).json({
        success: false,
        field: 'code',
        message: 'Kode voucher wajib dimasukkan.',
      });
    }

    const [promos] = await pool.query(
      'SELECT id, code, title FROM promos WHERE code = ? AND is_active = 1',
      [String(code).trim().toUpperCase()]
    );
    if (!promos.length) {
      return res.status(404).json({
        success: false,
        field: 'code',
        message: 'Kode promo tidak tersedia atau sudah kedaluwarsa.',
      });
    }

    await pool.query(
      'INSERT INTO promo_claims (user_id, promo_id) VALUES (?, ?)',
      [req.user.id, promos[0].id]
    );
    return res.status(201).json({
      success: true,
      message: `Promo ${promos[0].code} berhasil diklaim.`,
      data: promos[0],
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Promo ini sudah pernah diklaim.',
      });
    }
    return next(error);
  }
};

module.exports = {
  getAllPromos,
  validatePromo,
  claimPromo,
};
