const { pool } = require('../config/database');

// Helper to generate unique order code like #SL0142 or SCA-2841
const generateOrderCode = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `SCA-${randomNum}`;
};

// POST /api/orders (Buat Pesanan Laundry Baru)
const createOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      service_id,
      service_name,
      delivery,
      category_type, // 'pickup_outlet' or 'delivery'
      quantity = 1,
      pickup_date,
      pickup_time,
      payment_method = 'QRIS',
      promo_code,
      delivery_address,
      notes,
    } = req.body;

    // 1. Resolve service
    let service;
    if (service_id) {
      const [services] = await pool.query('SELECT * FROM services WHERE id = ?', [service_id]);
      service = services[0];
    } else if (service_name) {
      const [services] = await pool.query('SELECT * FROM services WHERE name = ?', [service_name]);
      service = services[0];
    }

    if (!service) {
      return res.status(400).json({
        success: false,
        field: 'service_id',
        message: 'Layanan laundry yang dipilih tidak valid atau tidak ditemukan.',
      });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 500) {
      return res.status(400).json({
        success: false,
        field: 'quantity',
        message: 'Jumlah harus lebih dari 0 dan maksimal 500.',
      });
    }

    if (pickup_date) {
      const parsedDate = new Date(pickup_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(parsedDate.getTime()) || parsedDate < today) {
        return res.status(400).json({
          success: false,
          field: 'pickup_date',
          message: 'Tanggal pengambilan tidak boleh di masa lalu.',
        });
      }
    }

    const pricePerUnit = parseFloat(service.price);
    const subtotal = qty * pricePerUnit;

    // 2. Resolve delivery type
    let finalCategoryType = 'pickup_outlet';
    if (delivery === true || delivery === 'true' || category_type === 'delivery') {
      finalCategoryType = 'delivery';
    }

    const supportedMethods = ['QRIS', 'GOPAY', 'DANA', 'SHOPEEPAY', 'OVO'];
    const paymentMethod = String(payment_method).toUpperCase();
    if (!supportedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        field: 'payment_method',
        message: 'Metode pembayaran tidak didukung.',
      });
    }

    let deliveryAddress = null;
    if (finalCategoryType === 'delivery') {
      const [users] = await pool.query(
        'SELECT address FROM users WHERE id = ?',
        [userId]
      );
      deliveryAddress = String(delivery_address || users[0]?.address || '').trim();
      if (!deliveryAddress) {
        return res.status(400).json({
          success: false,
          field: 'delivery_address',
          message: 'Alamat delivery belum tersedia. Lengkapi alamat pada profil terlebih dahulu.',
        });
      }
    }

    // Free delivery as per frontend design
    const deliveryFee = 0.00;

    // 3. Resolve promo discount
    let discountAmount = 0.00;
    let appliedPromo = null;
    if (promo_code) {
      const [promos] = await pool.query(
        'SELECT * FROM promos WHERE code = ? AND is_active = 1',
        [promo_code.trim().toUpperCase()]
      );
      if (promos.length > 0) {
        const promo = promos[0];
        if (subtotal < Number(promo.min_order_amount)) {
          return res.status(400).json({
            success: false,
            message: `Minimal transaksi untuk voucher '${promo.code}' adalah Rp ${Number(promo.min_order_amount).toLocaleString('id-ID')}.`,
          });
        }
        appliedPromo = promo.code;
        if (promo.discount_type === 'percentage') {
          discountAmount = (subtotal * parseFloat(promo.discount_value)) / 100;
        } else if (promo.discount_type === 'fixed') {
          discountAmount = parseFloat(promo.discount_value);
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Kode promo tidak valid atau sudah kedaluwarsa.',
        });
      }
    }

    discountAmount = Math.min(discountAmount, subtotal + deliveryFee);
    const totalPrice = Math.max(0, subtotal + deliveryFee - discountAmount);
    const orderCode = generateOrderCode();
    const pickupDate = pickup_date ? new Date(pickup_date) : new Date();
    if (Number.isNaN(pickupDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Tanggal pengambilan tidak valid.',
      });
    }
    const formattedPickupDate = pickupDate.toISOString().split('T')[0];
    const formattedPickupTime = pickup_time || '06.00 - 10.00';

    const connection = await pool.getConnection();
    let newOrderRows;
    try {
      await connection.beginTransaction();

      // 4. Insert order
      const [orderResult] = await connection.query(
        `INSERT INTO orders (
          order_code, user_id, service_id, service_name, service_variant, category_type, delivery_address,
          quantity, unit, price_per_unit, subtotal, delivery_fee, discount_amount,
          promo_code, total_price, pickup_date, pickup_time, payment_method, payment_status,
          order_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'menunggu_penjemputan', ?)`,
        [
          orderCode,
          userId,
          service.id,
          service.name,
          service.name === 'Cuci Express' ? 'Express' : 'Reguler',
          finalCategoryType,
          deliveryAddress,
          qty,
          service.unit,
          pricePerUnit,
          subtotal,
          deliveryFee,
          discountAmount,
          appliedPromo,
          totalPrice,
          formattedPickupDate,
          formattedPickupTime,
          paymentMethod,
          notes || null,
        ]
      );

      const orderId = orderResult.insertId;

      // 5. Create initial tracking record
      await connection.query(
        `INSERT INTO order_tracking (
          order_id, current_step, step_index, driver_name, driver_phone, driver_vehicle,
          driver_lat, driver_lng, estimated_delivery, last_status_message
        ) VALUES (?, 'Menunggu Penjemputan', 1, NULL, NULL, NULL, NULL, NULL, NULL,
                  'Pesanan berhasil dibuat dan menunggu penjemputan.')`,
        [orderId]
      );

      // Fetch created order
      [newOrderRows] = await connection.query(
        `SELECT o.*, t.current_step, t.step_index, t.estimated_delivery, t.driver_name
         FROM orders o
         LEFT JOIN order_tracking t ON o.id = t.order_id
         WHERE o.id = ?`,
        [orderId]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat. Silakan lanjutkan pembayaran.',
      data: newOrderRows[0],
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/orders (Riwayat Pesanan Pengguna dengan filter)
const getOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, month } = req.query; // status: 'Semua', 'Berlangsung', 'Selesai'

    let query = `
      SELECT o.*, 
             DATE_FORMAT(o.pickup_date, '%d %M %Y') as formatted_date,
             t.current_step, t.step_index, t.estimated_delivery
      FROM orders o
      LEFT JOIN order_tracking t ON o.id = t.order_id
      WHERE o.user_id = ?
    `;
    const params = [userId];

    // Filter status
    if (status) {
      const lowerStatus = status.toLowerCase();
      if (lowerStatus === 'berlangsung') {
        query += " AND o.order_status IN ('menunggu_penjemputan', 'sedang_dicuci', 'siap_diambil', 'sedang_diantar')";
      } else if (lowerStatus === 'selesai') {
        query += " AND o.order_status = 'selesai'";
      }
    }

    // Filter month
    if (month) {
      // Handles 'Nov 2026' or '2026-11'
      query += " AND (DATE_FORMAT(o.pickup_date, '%b %Y') = ? OR DATE_FORMAT(o.pickup_date, '%Y-%m') = ?)";
      params.push(month, month);
    }

    query += ' ORDER BY o.id DESC';

    const [rows] = await pool.query(query, params);

    // Map to frontend RiwayatOrderItem format for convenience
    const formattedList = rows.map((o) => {
      const isOngoing = ['menunggu_penjemputan', 'sedang_dicuci', 'siap_diambil', 'sedang_diantar'].includes(o.order_status);
      return {
        ...o,
        orderId: o.order_code,
        serviceName: `${o.service_name} - ${o.quantity}${o.unit}`,
        date: o.formatted_date || o.pickup_date,
        status: isOngoing ? 'Berlangsung' : 'Selesai',
      };
    });

    res.status(200).json({
      success: true,
      message: 'Riwayat pesanan berhasil diambil.',
      total: formattedList.length,
      data: formattedList,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/orders/active (Pesanan Terbaru / Aktif untuk Widget Dashboard)
const getActiveOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Prioritaskan pesanan aktif terbaru, atau jika tidak ada yang sedang berjalan, ambil pesanan paling baru yang masuk ke backend
    let [rows] = await pool.query(
      `SELECT o.*, 
              t.current_step, t.step_index, t.estimated_delivery, t.last_status_message,
              t.driver_name, t.driver_phone
       FROM orders o
       LEFT JOIN order_tracking t ON o.id = t.order_id
       WHERE o.user_id = ? AND o.order_status IN ('menunggu_penjemputan', 'sedang_dicuci', 'siap_diambil', 'sedang_diantar')
       ORDER BY o.id DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      [rows] = await pool.query(
        `SELECT o.*, 
                t.current_step, t.step_index, t.estimated_delivery, t.last_status_message,
                t.driver_name, t.driver_phone
         FROM orders o
         LEFT JOIN order_tracking t ON o.id = t.order_id
         WHERE o.user_id = ?
         ORDER BY o.id DESC
         LIMIT 1`,
        [userId]
      );
    }

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada pesanan saat ini.',
        data: null,
      });
    }

    const order = rows[0];

    const statusMap = {
      menunggu_penjemputan: 'Menunggu Penjemputan',
      sedang_dicuci: 'Sedang Dicuci',
      siap_diambil: 'Siap Diambil',
      sedang_diantar: 'Sedang Diantar',
      selesai: 'Selesai',
      dibatalkan: 'Dibatalkan',
    };
    const statusLabel = statusMap[order.order_status] || 'Dalam Proses';

    let formattedPickupDate = '';
    if (order.pickup_date) {
      const d = new Date(order.pickup_date);
      if (!isNaN(d.getTime())) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        formattedPickupDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    }

    const timeOrStatus = order.pickup_time ? `${order.pickup_time} WIB` : '';
    const summaryText = `${order.service_name} • ${Number(order.quantity)} ${order.unit || 'kg'} • ${formattedPickupDate ? `${formattedPickupDate}, ` : ''}${timeOrStatus || statusLabel}`;

    res.status(200).json({
      success: true,
      message: 'Pesanan terbaru berhasil ditemukan.',
      data: {
        id: order.id,
        orderId: order.order_code,
        orderCode: order.order_code,
        serviceName: order.service_name,
        quantity: order.quantity,
        unit: order.unit,
        totalPrice: order.total_price,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        pickupDate: order.pickup_date,
        pickupTime: order.pickup_time,
        categoryType: order.category_type,
        statusLabel,
        summaryText,
        estimatedDelivery: order.estimated_delivery || '16.00 WIB',
        raw: order,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/orders/:id (Detail Pesanan)
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Can query by internal id or order_code (e.g. 'SCA-2841' or '#SL0126')
    const [rows] = await pool.query(
      `SELECT o.*, 
              t.current_step, t.step_index, t.driver_name, t.driver_phone, 
              t.driver_vehicle, t.driver_lat, t.driver_lng, t.estimated_delivery,
              t.last_status_message
       FROM orders o
       LEFT JOIN order_tracking t ON o.id = t.order_id
       WHERE (o.id = ? OR o.order_code = ?) AND o.user_id = ?`,
      [id, id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Detail pesanan berhasil diambil.',
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/orders/:id/pay (Create a real Xendit invoice)
const payOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { payment_method = 'QRIS' } = req.body;
    const method = String(payment_method).toUpperCase();
    const supportedMethods = ['QRIS', 'GOPAY', 'DANA', 'SHOPEEPAY', 'OVO'];
    if (!supportedMethods.includes(method)) {
      return res.status(400).json({
        success: false,
        message: 'Metode pembayaran tidak didukung.',
      });
    }

    if (!process.env.XENDIT_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Pembayaran belum aktif. Atur XENDIT_SECRET_KEY di backend.',
      });
    }

    const [orders] = await pool.query(
      'SELECT id, order_code, total_price, payment_status FROM orders WHERE (id = ? OR order_code = ?) AND user_id = ?',
      [id, id, userId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan.',
      });
    }

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Pesanan ini sudah dibayar.',
        data: { order_code: order.order_code, payment_status: 'paid' },
      });
    }

    const [existingPayments] = await pool.query(
      "SELECT external_id, provider_invoice_id, checkout_url, status FROM payment_transactions WHERE order_id = ? AND payment_method = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [order.id, method]
    );
    if (existingPayments.length) {
      return res.status(200).json({
        success: true,
        message: 'Tagihan pembayaran masih aktif.',
        data: {
          order_code: order.order_code,
          payment_status: 'unpaid',
          payment_method: method,
          payment_url: existingPayments[0].checkout_url,
          payment_invoice_id: existingPayments[0].provider_invoice_id,
        },
      });
    }

    const externalId = `${order.order_code}-${Date.now()}`;
    const credentials = Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64');
    const gatewayResponse = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: Math.round(Number(order.total_price)),
        currency: 'IDR',
        description: `Pembayaran ${order.order_code}`,
        payment_methods: [method],
        invoice_duration: 86400,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const invoice = await gatewayResponse.json();
    if (!gatewayResponse.ok) {
      return res.status(502).json({
        success: false,
        message: invoice.message || 'Gateway pembayaran gagal membuat tagihan.',
      });
    }

    await pool.query(
      `INSERT INTO payment_transactions
       (order_id, external_id, provider_invoice_id, payment_method, amount, checkout_url, provider_response)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        externalId,
        invoice.id || null,
        method,
        order.total_price,
        invoice.invoice_url || null,
        JSON.stringify(invoice),
      ]
    );
    await pool.query(
      'UPDATE orders SET payment_method = ? WHERE id = ?',
      [method, order.id]
    );

    res.status(200).json({
      success: true,
      message: 'Tagihan berhasil dibuat. Selesaikan pembayaran melalui tautan Xendit.',
      data: {
        order_code: order.order_code,
        payment_status: 'unpaid',
        payment_method: method,
        payment_url: invoice.invoice_url || null,
        payment_invoice_id: invoice.id || null,
        expires_at: invoice.expiry_date || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentStatus = async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      'SELECT id, order_code, payment_status, payment_method FROM orders WHERE (id = ? OR order_code = ?) AND user_id = ?',
      [req.params.id, req.params.id, req.user.id]
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }
    const [payments] = await pool.query(
      `SELECT external_id, provider_invoice_id, payment_method, amount, status,
              checkout_url, paid_at, created_at
       FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
      [orders[0].id]
    );
    res.status(200).json({
      success: true,
      data: { ...orders[0], payment: payments[0] || null },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/orders/:id/status (Update status pesanan)
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      order_status,
      step_index,
      current_step,
      last_status_message,
      driver_name,
      driver_phone,
      driver_vehicle,
      driver_lat,
      driver_lng,
      estimated_delivery,
    } = req.body;
    const allowedStatuses = [
      'menunggu_penjemputan',
      'sedang_dicuci',
      'siap_diambil',
      'sedang_diantar',
      'selesai',
      'dibatalkan',
    ];
    if (order_status && !allowedStatuses.includes(order_status)) {
      return res.status(400).json({
        success: false,
        message: 'Status pesanan tidak valid.',
      });
    }
    if (step_index != null && (!Number.isInteger(Number(step_index)) || Number(step_index) < 1 || Number(step_index) > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Tahapan tracking tidak valid.',
      });
    }
    const latitude = driver_lat == null ? null : Number(driver_lat);
    const longitude = driver_lng == null ? null : Number(driver_lng);
    if ((latitude == null) !== (longitude == null) ||
        (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
        (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      return res.status(400).json({
        success: false,
        message: 'Koordinat kurir tidak valid.',
      });
    }

    const [orders] = await pool.query(
      'SELECT id FROM orders WHERE id = ? OR order_code = ?',
      [id, id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pesanan tidak ditemukan.',
      });
    }

    const orderId = orders[0].id;

    if (order_status) {
      await pool.query('UPDATE orders SET order_status = ? WHERE id = ?', [order_status, orderId]);
    }

    if (
      step_index != null || current_step || last_status_message ||
      driver_name || driver_phone || driver_vehicle ||
      latitude != null || estimated_delivery
    ) {
      await pool.query(
        `UPDATE order_tracking
         SET step_index = COALESCE(?, step_index),
             current_step = COALESCE(?, current_step),
             last_status_message = COALESCE(?, last_status_message),
             driver_name = COALESCE(?, driver_name),
             driver_phone = COALESCE(?, driver_phone),
             driver_vehicle = COALESCE(?, driver_vehicle),
             driver_lat = COALESCE(?, driver_lat),
             driver_lng = COALESCE(?, driver_lng),
             estimated_delivery = COALESCE(?, estimated_delivery)
         WHERE order_id = ?`,
        [
          step_index,
          current_step,
          last_status_message,
          driver_name,
          driver_phone,
          driver_vehicle,
          latitude,
          longitude,
          estimated_delivery,
          orderId,
        ]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Status pesanan berhasil diperbarui.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getActiveOrder,
  getOrderById,
  payOrder,
  getPaymentStatus,
  updateOrderStatus,
};
