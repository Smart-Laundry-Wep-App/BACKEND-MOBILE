const { pool } = require('../config/database');

// POST /api/chatbot/message
const handleChatMessage = async (req, res, next) => {
  try {
    const { message } = req.body;
    const userId = req.user ? req.user.id : null;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Pesan tidak boleh kosong.',
      });
    }

    const cleanMsg = message.trim().toLowerCase();
    let replyText = '';
    let showOrder = false;
    let orderData = null;

    // Check for order status query
    if (
      cleanMsg.includes('status') ||
      cleanMsg.includes('pesanan') ||
      cleanMsg.includes('cucian') ||
      cleanMsg.includes('lacak')
    ) {
      // Only use the authenticated user's orders.
      let orders = [];
      const [userOrders] = await pool.query(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [userId]
      );
      orders = userOrders;

      if (orders.length > 0) {
        const ord = orders[0];
        showOrder = true;
        replyText = `Tentu! Pesanan terakhir Anda terdeteksi (${ord.order_code}). Status saat ini: ${ord.order_status.replace('_', ' ').toUpperCase()}.`;
        orderData = {
          order_code: ord.order_code,
          service_name: ord.service_name,
          quantity: ord.quantity,
          unit: ord.unit,
          status: ord.order_status,
          estimated_time: '16.00 WIB',
        };
      } else {
        replyText = 'Saat ini belum ada pesanan aktif atas akun Anda. Anda dapat membuat pesanan baru melalui menu Pesan Laundry!';
      }
    } else if (cleanMsg.includes('promo') || cleanMsg.includes('diskon') || cleanMsg.includes('voucher')) {
      replyText = 'Kami memiliki beberapa promo menarik hari ini:\n1. MERDEKA (Diskon 20%)\n2. FREEONGKIR (Gratis ongkos kirim)\n3. DISKON15 (Potongan 15%)\nAnda dapat memasukkan kode tersebut saat checkout!';
    } else if (cleanMsg.includes('jam') || cleanMsg.includes('buka') || cleanMsg.includes('tutup') || cleanMsg.includes('operasional')) {
      replyText = 'SCA Smart Laundry buka setiap hari mulai pukul 06.00 sampai 21.00 WIB.';
    } else if (cleanMsg.includes('harga') || cleanMsg.includes('tarif') || cleanMsg.includes('biaya') || cleanMsg.includes('layanan')) {
      replyText = 'Daftar tarif layanan kami:\n• Cuci Kering: Rp 10.000 / kg\n• Cuci Express: Rp 15.000 / kg\n• Cuci Selimut: Rp 25.000 / pcs\n• Cuci Bed Cover: Rp 35.000 / pcs\n• Cuci Boneka: Rp 20.000 / pcs\n• Cuci Sepatu: Rp 30.000 / pcs';
    } else if (cleanMsg.includes('halo') || cleanMsg.includes('hai') || cleanMsg.includes('pagi') || cleanMsg.includes('siang') || cleanMsg.includes('sore') || cleanMsg.includes('malam')) {
      replyText = 'Halo! 👋 Selamat datang di SCA Smart Laundry. Ada yang bisa CleanBOT bantu terkait cucian, status pesanan, atau promo spesial hari ini?';
    } else if (cleanMsg.includes('terima kasih') || cleanMsg.includes('makasih') || cleanMsg.includes('oke')) {
      replyText = 'Sama-sama! Senang bisa membantu Anda. Jika butuh bantuan lain jangan ragu untuk bertanya ya 😊';
    } else {
      replyText = `Terima kasih atas pesan Anda: "${message}". CleanBOT siap membantu Anda seputar pesanan, info layanan, promo, dan jam operasional. Ada yang ingin ditanyakan lagi?`;
    }

    await pool.query(
      'INSERT INTO chat_messages (user_id, sender, message, has_order_widget) VALUES (?, "user", ?, ?), (?, "bot", ?, ?)',
      [userId, message, false, userId, replyText, showOrder]
    );

    res.status(200).json({
      success: true,
      data: {
        sender: 'bot',
        message: replyText,
        showOrder,
        order: orderData,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/chatbot/history
const getChatHistory = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    let query = 'SELECT * FROM chat_messages';
    const params = [];

    query += ' WHERE user_id = ?';
    params.push(userId);

    query += ' ORDER BY id ASC LIMIT 50';

    const [rows] = await pool.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Riwayat percakapan chatbot berhasil diambil.',
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleChatMessage,
  getChatHistory,
};
