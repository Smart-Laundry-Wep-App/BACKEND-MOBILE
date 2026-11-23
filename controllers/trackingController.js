const { pool } = require('../config/database');

// Koordinat default Malang untuk outlet dan customer jika data kosong
const DEFAULT_OUTLET = { lat: -7.9826, lng: 112.6308, name: 'SCA Smart Laundry Outlet' };
const DEFAULT_DRIVER = { lat: -7.9735, lng: 112.6380, name: 'Samuela (Kurir)' };
const DEFAULT_CUSTOMER = { lat: -7.9620, lng: 112.6450, name: 'Lokasi Pengantaran' };

// GET /api/tracking/:orderCode (GPS Tracking Data)
const getTrackingByOrderCode = async (req, res, next) => {
  try {
    const { orderCode } = req.params;

    // Support query jika tanpa auth untuk live preview pesanan
    const userId = req.user ? req.user.id : null;
    let query = `
      SELECT o.id as order_id, o.order_code, o.service_name, o.quantity, o.unit,
             o.order_status, o.payment_status, o.pickup_date, o.pickup_time,
             o.delivery_address,
             t.current_step, t.step_index, t.driver_name, t.driver_phone,
             t.driver_vehicle, t.driver_lat, t.driver_lng, t.estimated_delivery,
             t.last_status_message
      FROM orders o
      LEFT JOIN order_tracking t ON o.id = t.order_id
      WHERE (o.order_code = ? OR o.id = ?)
    `;
    const params = [orderCode, orderCode];

    if (userId) {
      query += ` AND o.user_id = ?`;
      params.push(userId);
    }

    const [rows] = await pool.query(query, params);

    let item = {};
    if (rows.length > 0) {
      item = rows[0];
    } else {
      // Mock data jika order belum ada di database agar UI tetap dapat render map aktif
      item = {
        order_code: orderCode || '#12345',
        order_status: 'sedang_dalam_perjalanan',
        current_step: 'Sedang dalam perjalanan',
        step_index: 3,
        driver_name: 'Samuela',
        driver_phone: '+62 812 3456 7890',
        driver_vehicle: 'Honda Vario - N 1234 AB',
        driver_lat: DEFAULT_DRIVER.lat,
        driver_lng: DEFAULT_DRIVER.lng,
        estimated_delivery: '15 Menit lagi',
        last_status_message: 'Kurir sedang dalam perjalanan menuju lokasi Anda',
      };
    }

    const stepIdx = item.step_index ?? 3;

    const steps = [
      { step: 1, title: 'Penjemputan', completed: stepIdx >= 1, active: stepIdx === 1 },
      { step: 2, title: 'Proses Cuci', completed: stepIdx >= 2, active: stepIdx === 2 },
      { step: 3, title: 'Sedang Diantar', completed: stepIdx >= 3, active: stepIdx === 3 },
      { step: 4, title: 'Siap Diterima', completed: stepIdx >= 4, active: stepIdx === 4 },
      { step: 5, title: 'Selesai', completed: stepIdx >= 5, active: stepIdx === 5 },
    ];

    const driverLat = item.driver_lat ? parseFloat(item.driver_lat) : DEFAULT_DRIVER.lat;
    const driverLng = item.driver_lng ? parseFloat(item.driver_lng) : DEFAULT_DRIVER.lng;

    res.status(200).json({
      success: true,
      message: 'Data tracking berhasil diambil.',
      data: {
        ...item,
        order_code: item.order_code || orderCode,
        driver_name: item.driver_name || 'Samuela',
        driver_lat: driverLat,
        driver_lng: driverLng,
        outlet_lat: DEFAULT_OUTLET.lat,
        outlet_lng: DEFAULT_OUTLET.lng,
        customer_lat: DEFAULT_CUSTOMER.lat,
        customer_lng: DEFAULT_CUSTOMER.lng,
        route_points: [
          { lat: DEFAULT_OUTLET.lat, lng: DEFAULT_OUTLET.lng },
          { lat: -7.9780, lng: 112.6340 },
          { lat: driverLat, lng: driverLng },
          { lat: -7.9675, lng: 112.6410 },
          { lat: DEFAULT_CUSTOMER.lat, lng: DEFAULT_CUSTOMER.lng },
        ],
        estimated_delivery: item.estimated_delivery || '15 Menit lagi',
        steps,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/tracking/:orderCode/location (Update lokasi kurir real-time)
const updateDriverLocation = async (req, res, next) => {
  try {
    const { orderCode } = req.params;
    const { driver_lat, driver_lng, estimated_delivery } = req.body;

    const [orders] = await pool.query(
      'SELECT id FROM orders WHERE order_code = ? OR id = ?',
      [orderCode, orderCode]
    );

    if (orders.length > 0) {
      const orderId = orders[0].id;
      await pool.query(
        `INSERT INTO order_tracking (order_id, driver_lat, driver_lng, estimated_delivery)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           driver_lat = VALUES(driver_lat),
           driver_lng = VALUES(driver_lng),
           estimated_delivery = COALESCE(VALUES(estimated_delivery), estimated_delivery)`,
        [orderId, driver_lat, driver_lng, estimated_delivery || null]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Lokasi kurir berhasil diperbarui.',
      data: {
        driver_lat,
        driver_lng,
        estimated_delivery,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTrackingByOrderCode,
  updateDriverLocation,
};
