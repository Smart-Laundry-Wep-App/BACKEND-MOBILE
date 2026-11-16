const { pool } = require('../config/database');

// GET /api/services
const getAllServices = async (req, res, next) => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM services WHERE is_active = 1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY id ASC';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Daftar layanan berhasil diambil.',
      total: rows.length,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/services/:id
const getServiceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Layanan tidak ditemukan.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Detail layanan berhasil diambil.',
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllServices,
  getServiceById,
};
