const { pool } = require('../config/database');

// GET /api/operational-hours
const getOperationalHours = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, day_name, open_time, close_time, is_open, note FROM operational_hours ORDER BY id ASC'
    );

    res.status(200).json({
      success: true,
      message: 'Jadwal jam operasional berhasil diambil.',
      data: {
        title: 'Jam Operasional Laundry',
        subtitle: 'Siap melayani cucian Anda setiap hari',
        default_schedule: 'Setiap Hari: 06.00 - 21.00 WIB',
        schedule_list: rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/help-center
const getHelpCenter = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Informasi pusat bantuan berhasil diambil.',
      data: {
        bot: {
          name: 'CleanBOT Asisten 24/7',
          description: 'Asisten virtual cerdas siap menjawab pertanyaan Anda 24 jam.',
          badge: '(Disarankan)',
        },
        admin: {
          name: 'Hubungi Admin',
          phone: '+62 812 3456 7890',
          whatsapp: 'https://wa.me/6281234567890',
          note: '(Slowrespon jika sibuk)',
        },
        outlet: {
          name: 'SCA Smart Laundry Outlet Utama',
          address: 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
          operating_hours: '06.00 - 21.00 WIB',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOperationalHours,
  getHelpCenter,
};
