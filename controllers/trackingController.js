const { pool } = require('../config/database');

// GET /api/tracking/:orderCode (GPS Tracking Data)
const getTrackingByOrderCode = async (req, res, next) => {
  try {
    const { orderCode } = req.params;

    const [rows] = await pool.query(
      `SELECT o.id as order_id, o.order_code, o.service_name, o.quantity, o.unit,
              o.order_status, o.payment_status, o.pickup_date, o.pickup_time,
              t.current_step, t.step_index, t.driver_name, t.driver_phone,
              t.driver_vehicle, t.driver_lat, t.driver_lng, t.estimated_delivery,
              t.last_status_message
       FROM orders o
       LEFT JOIN order_tracking t ON o.id = t.order_id
       WHERE (o.order_code = ? OR o.id = ?) AND o.user_id = ?`,
      [orderCode, orderCode, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tracking tidak ditemukan.',
      });
    }

    const item = rows[0];
    const stepIdx = item.step_index ?? 1;

    const steps = [
      { step: 1, title: 'Penjemputan', completed: stepIdx >= 1, active: stepIdx === 1 },
      { step: 2, title: 'Proses Cuci', completed: stepIdx >= 2, active: stepIdx === 2 },
      { step: 3, title: 'Setrika & Packing', completed: stepIdx >= 3, active: stepIdx === 3 },
      { step: 4, title: 'Siap Diantar / Diambil', completed: stepIdx >= 4, active: stepIdx === 4 },
      { step: 5, title: 'Selesai', completed: stepIdx >= 5, active: stepIdx === 5 },
    ];

    res.status(200).json({
      success: true,
      message: 'Data tracking berhasil diambil.',
      data: {
        ...item,
        steps,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTrackingByOrderCode,
};
