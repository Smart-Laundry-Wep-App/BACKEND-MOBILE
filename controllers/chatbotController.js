const { pool } = require('../config/database');
const https = require('https');
const http = require('http');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function extractOrderCode(text) {
  // Match patterns like SCA-2841, #SL0126, SL0125, etc.
  const match = text.match(/([#]?[A-Za-z]{2,4}[-]?\d{3,})/);
  return match ? match[1].replace('#', '').toUpperCase() : null;
}

async function fetchServicesFromDB() {
  const [rows] = await pool.query(
    'SELECT name, unit, price, description FROM services WHERE is_active = 1 ORDER BY id ASC'
  );
  return rows;
}

async function fetchPromosFromDB() {
  const [rows] = await pool.query(
    'SELECT code, promo_title, discount_type, discount_value, min_order_amount, validity, terms FROM promos WHERE is_active = 1 ORDER BY id ASC'
  );
  return rows;
}

async function fetchHoursFromDB() {
  const [rows] = await pool.query(
    'SELECT day_name, open_time, close_time, is_open FROM operational_hours ORDER BY id ASC'
  );
  return rows;
}

async function fetchUserOrders(userId, limit = 3) {
  const [rows] = await pool.query(
    `SELECT o.*, ot.current_step, ot.estimated_delivery, ot.driver_name
     FROM orders o
     LEFT JOIN order_tracking ot ON ot.order_id = o.id
     WHERE o.user_id = ?
     ORDER BY o.id DESC LIMIT ?`,
    [userId, limit]
  );
  return rows;
}

async function findOrderByCode(userId, code) {
  const cleanCode = code.replace('#', '').toUpperCase();
  // Try exact match first, then partial
  const [rows] = await pool.query(
    `SELECT o.*, ot.current_step, ot.estimated_delivery
     FROM orders o
     LEFT JOIN order_tracking ot ON ot.order_id = o.id
     WHERE o.user_id = ? AND (UPPER(REPLACE(o.order_code, '#', '')) = ? OR o.order_code LIKE ?)
     LIMIT 1`,
    [userId, cleanCode, `%${cleanCode}%`]
  );
  return rows[0] || null;
}

function buildOrderCard(ord) {
  const statusMap = {
    menunggu_penjemputan: 'Menunggu Penjemputan',
    sedang_dicuci: 'Sedang Dicuci',
    siap_diambil: 'Siap Diambil',
    sedang_diantar: 'Sedang Diantar',
    selesai: 'Selesai',
    dibatalkan: 'Dibatalkan',
  };
  return {
    order_code: ord.order_code,
    service_name: ord.service_name,
    service_variant: ord.service_variant || 'Reguler',
    quantity: parseFloat(ord.quantity),
    unit: ord.unit,
    total_price: parseFloat(ord.total_price),
    pickup_date: ord.pickup_date,
    pickup_time: ord.pickup_time,
    payment_method: ord.payment_method,
    payment_status: ord.payment_status,
    status: ord.order_status,
    status_label: statusMap[ord.order_status] || ord.order_status,
    estimated_delivery: ord.estimated_delivery || null,
    driver_name: ord.driver_name || null,
    current_step: ord.current_step || null,
  };
}

// Optional AI fallback via OpenAI-compatible API (only used if OPENAI_API_KEY set)
async function callAI(systemPrompt, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  const model = 'gemini-3.8-flash';

  if (!apiKey) return null;

  return new Promise((resolve) => {
    const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;
    const payload = JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.6 },
    });

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const content =
              json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            resolve(content || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => req.destroy());
    req.write(payload);
    req.end();
  });
}

// ─── POST /api/chatbot/message ─────────────────────────────────────────────────
const handleChatMessage = async (req, res, next) => {
  try {
    const { message, history } = req.body;
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
    let quickReplies = [];

    // ── Determine intent ──────────────────────────────────────────────────────

    const isOrderStatus =
      cleanMsg.includes('status') ||
      cleanMsg.includes('pesanan') ||
      cleanMsg.includes('cucian') ||
      cleanMsg.includes('lacak') ||
      cleanMsg.includes('order') ||
      cleanMsg.includes('cek pesanan');

    const isPromo =
      cleanMsg.includes('promo') ||
      cleanMsg.includes('diskon') ||
      cleanMsg.includes('voucher') ||
      cleanMsg.includes('kode') ||
      cleanMsg.includes('cashback');

    const isHours =
      cleanMsg.includes('jam') ||
      cleanMsg.includes('buka') ||
      cleanMsg.includes('tutup') ||
      cleanMsg.includes('operasional') ||
      cleanMsg.includes('jadwal');

    const isService =
      cleanMsg.includes('harga') ||
      cleanMsg.includes('tarif') ||
      cleanMsg.includes('biaya') ||
      cleanMsg.includes('layanan') ||
      cleanMsg.includes('cuci') ||
      cleanMsg.includes('kiloan') ||
      cleanMsg.includes('satuan') ||
      cleanMsg.includes('express') ||
      cleanMsg.includes('selimut') ||
      cleanMsg.includes('sepatu') ||
      cleanMsg.includes('boneka') ||
      cleanMsg.includes('bed cover');

    const isGreeting =
      cleanMsg === 'halo' ||
      cleanMsg === 'hai' ||
      cleanMsg === 'hi' ||
      cleanMsg === 'hello' ||
      cleanMsg.includes('halo') ||
      cleanMsg.includes('assalamualaikum') ||
      /^(selamat|halo|hai|hi|hello|pagi|siang|sore|malam)/.test(cleanMsg);

    const isThanks =
      cleanMsg.includes('terima kasih') ||
      cleanMsg.includes('makasih') ||
      cleanMsg.includes('terimakasih') ||
      cleanMsg === 'oke' ||
      cleanMsg === 'oke makasih';

    const isAdmin =
      cleanMsg.includes('admin') ||
      cleanMsg.includes('hubungi') ||
      cleanMsg.includes('kontak') ||
      cleanMsg.includes('whatsapp') ||
      cleanMsg.includes('telepon');

    const isHelp =
      cleanMsg.includes('bantuan') ||
      cleanMsg.includes('help') ||
      cleanMsg.includes('tolong') ||
      cleanMsg.includes('apa saja') ||
      cleanMsg.includes('bisa apa');

    // ── 1. Greeting ───────────────────────────────────────────────────────────
    if (isGreeting) {
      const userName = req.user?.name ? `, ${req.user.name.split(' ')[0]}` : '';
      replyText = `Halo${userName}! 👋 Selamat datang di SCA Smart Laundry.\n\nAda yang bisa CleanBOT bantu? Saya siap membantu Anda seputar:\n• 📦 Status pesanan laundry\n• 🧺 Info layanan & harga\n• 🏷️ Promo & voucher\n• ⏰ Jam operasional\n• 📞 Hubungi admin`;
      quickReplies = ['Cek Status Pesanan', 'Informasi Layanan', 'Informasi Harga', 'Promo Terbaru', 'Hubungi Admin'];

    // ── 2. Thanks ─────────────────────────────────────────────────────────────
    } else if (isThanks) {
      replyText = 'Sama-sama! 😊 Senang bisa membantu Anda. Jika butuh bantuan lain jangan ragu untuk bertanya ya.';
      quickReplies = ['Cek Status Pesanan', 'Informasi Layanan', 'Promo Terbaru'];

    // ── 3. Order status check ─────────────────────────────────────────────────
    } else if (isOrderStatus) {
      const orderCode = extractOrderCode(cleanMsg);

      if (orderCode) {
        // Search by specific order code (only owner can see)
        const ord = await findOrderByCode(userId, orderCode);
        if (ord) {
          showOrder = true;
          orderData = buildOrderCard(ord);
          replyText = `✅ Pesanan ${ord.order_code} ditemukan!\n\nStatus saat ini: *${orderData.status_label}*${ord.order_status === 'sedang_dicuci' ? '\n\n🧺 Pakaian Anda sedang dalam proses pencucian.' : ord.order_status === 'siap_diambil' ? '\n\n✅ Pakaian Anda sudah bersih dan siap diambil!' : ord.order_status === 'selesai' ? '\n\n🎉 Pesanan selesai. Terima kasih telah menggunakan layanan SCA Smart Laundry!' : ''}`;
        } else {
          replyText = `❌ Pesanan dengan kode *${orderCode}* tidak ditemukan pada akun Anda.\n\nPastikan kode pesanan sudah benar, atau cek riwayat pesanan di menu Riwayat.`;
          quickReplies = ['Cek Status Pesanan', 'Hubungi Admin'];
        }
      } else {
        // Show latest orders
        const orders = await fetchUserOrders(userId, 1);
        if (orders.length > 0) {
          const ord = orders[0];
          showOrder = true;
          orderData = buildOrderCard(ord);
          replyText = `Tentu! Ini pesanan terakhir Anda (${ord.order_code}).\n\nStatus saat ini: *${orderData.status_label}*\n\nApakah ada nomor pesanan lain yang ingin Anda cek?`;
          quickReplies = ['Lacak Kurir', 'Hubungi Admin'];
        } else {
          replyText = 'Saat ini belum ada pesanan aktif pada akun Anda. 😊\n\nAnda dapat membuat pesanan baru melalui menu *Pesan Laundry*!';
          quickReplies = ['Informasi Layanan', 'Informasi Harga'];
        }
      }

    // ── 4. Promo info ─────────────────────────────────────────────────────────
    } else if (isPromo) {
      const promos = await fetchPromosFromDB();
      if (promos.length > 0) {
        const promoLines = promos.map((p) => {
          const val =
            p.discount_type === 'percentage'
              ? `${p.discount_value}%`
              : p.discount_type === 'free_shipping'
              ? 'Gratis Ongkir'
              : formatRupiah(p.discount_value);
          return `🏷️ *${p.code}* – ${p.promo_title} (${val})\n   Masa berlaku: ${p.validity}`;
        });
        replyText = `Berikut promo aktif SCA Smart Laundry:\n\n${promoLines.join('\n\n')}\n\nMasukkan kode promo saat checkout untuk mendapatkan diskon!`;
      } else {
        replyText = 'Saat ini belum ada promo aktif. Pantau terus aplikasi untuk mendapatkan promo terbaru ya! 😊';
      }
      quickReplies = ['Informasi Layanan', 'Cek Status Pesanan'];

    // ── 5. Operational hours ──────────────────────────────────────────────────
    } else if (isHours) {
      const hours = await fetchHoursFromDB();
      if (hours.length > 0) {
        // Check if all days same schedule
        const allSame = hours.every(
          (h) => h.open_time === hours[0].open_time && h.close_time === hours[0].close_time && h.is_open
        );
        if (allSame) {
          replyText = `⏰ *Jam Operasional SCA Smart Laundry*\n\nBuka Setiap Hari\n🕐 ${hours[0].open_time} – ${hours[0].close_time} WIB\n\nSilakan datang atau hubungi kami selama jam operasional!`;
        } else {
          const lines = hours.map(
            (h) => `${h.day_name}: ${h.is_open ? `${h.open_time} – ${h.close_time} WIB` : 'Tutup'}`
          );
          replyText = `⏰ *Jam Operasional SCA Smart Laundry*\n\n${lines.join('\n')}`;
        }
      } else {
        replyText = 'SCA Smart Laundry buka setiap hari mulai pukul 06.00 sampai 21.00 WIB.';
      }
      quickReplies = ['Informasi Layanan', 'Cek Status Pesanan', 'Hubungi Admin'];

    // ── 6. Services & pricing ─────────────────────────────────────────────────
    } else if (isService) {
      const services = await fetchServicesFromDB();
      if (services.length > 0) {
        const lines = services.map(
          (s) => `🧺 *${s.name}* – ${formatRupiah(s.price)} / ${s.unit}`
        );
        replyText = `Berikut daftar layanan & tarif SCA Smart Laundry:\n\n${lines.join('\n')}\n\nSemua layanan menggunakan bahan cuci berkualitas & ramah lingkungan. ✨`;
      } else {
        replyText = 'Daftar layanan sedang diperbarui. Silakan hubungi admin untuk informasi terbaru.';
      }
      quickReplies = ['Promo Terbaru', 'Cek Status Pesanan', 'Hubungi Admin'];

    // ── 7. Contact admin ──────────────────────────────────────────────────────
    } else if (isAdmin) {
      replyText = '📞 *Hubungi Admin SCA Smart Laundry*\n\nWhatsApp: +62 812 3456 7890\nJam: 06.00 – 21.00 WIB\n\nAdmin kami siap membantu pertanyaan Anda!';
      quickReplies = ['Cek Status Pesanan', 'Informasi Layanan'];

    // ── 8. Help / what can you do ─────────────────────────────────────────────
    } else if (isHelp) {
      replyText = 'CleanBOT bisa membantu Anda dengan:\n\n📦 *Cek Status Pesanan* – Ketik "status pesanan" atau nomor pesanan\n🧺 *Info Layanan* – Ketik "info layanan" atau "harga"\n🏷️ *Promo* – Ketik "promo" atau "voucher"\n⏰ *Jam Buka* – Ketik "jam operasional"\n📞 *Kontak Admin* – Ketik "hubungi admin"\n\nAda yang ingin ditanyakan?';
      quickReplies = ['Cek Status Pesanan', 'Informasi Layanan', 'Promo Terbaru', 'Hubungi Admin'];

    // ── 9. AI Enrichment fallback (Approach C) ────────────────────────────────
    } else {
      // Build context from DB for AI grounding
      let aiReply = null;

      if (process.env.OPENAI_API_KEY) {
        try {
          // Gather context data
          const [services, promos, hours, latestOrder] = await Promise.all([
            fetchServicesFromDB(),
            fetchPromosFromDB(),
            fetchHoursFromDB(),
            fetchUserOrders(userId, 1),
          ]);

          const servicesText = services.map((s) => `${s.name}: ${formatRupiah(s.price)}/${s.unit}`).join(', ');
          const promosText = promos.map((p) => `${p.code} (${p.promo_title})`).join(', ');
          const hoursText = hours.length > 0 ? `${hours[0].open_time}–${hours[0].close_time} WIB setiap hari` : '06.00–21.00 WIB';
          const orderText =
            latestOrder.length > 0
              ? `Pesanan terakhir: ${latestOrder[0].order_code} (${latestOrder[0].order_status})`
              : 'Tidak ada pesanan aktif.';

          const systemPrompt = `Kamu adalah CleanBOT, asisten customer service AI untuk SCA Smart Laundry. 
Gunakan data berikut sebagai SUMBER UTAMA dan jangan mengarang informasi di luar ini:
- Layanan & harga: ${servicesText}
- Promo aktif: ${promosText || 'tidak ada promo saat ini'}
- Jam operasional: ${hoursText}
- ${orderText}
- Lokasi: Jl. Bareng menuju IPK 4, Malang, Jawa Timur
- WhatsApp admin: +62 812 3456 7890

Jawab dalam Bahasa Indonesia yang ramah, natural, dan ringkas (maks 150 kata). 
Jika tidak tahu jawabannya dari data di atas, arahkan ke admin.
Jangan pernah mengarang harga, promo, atau status pesanan.`;

          aiReply = await callAI(systemPrompt, message);
        } catch (err) {
          console.error('[CleanBOT AI] Error calling AI:', err.message);
        }
      }

      if (aiReply) {
        replyText = aiReply;
      } else {
        // Smart fallback: return helpful response
        replyText = `Maaf, CleanBOT belum memahami pertanyaan tersebut. 🤖\n\nSaya bisa membantu Anda dengan:\n• 📦 Status pesanan – ketik "status pesanan"\n• 🧺 Harga & layanan – ketik "info layanan"\n• 🏷️ Promo – ketik "promo terbaru"\n• ⏰ Jam buka – ketik "jam operasional"\n• 📞 Kontak – ketik "hubungi admin"`;
        quickReplies = ['Cek Status Pesanan', 'Informasi Layanan', 'Promo Terbaru', 'Hubungi Admin'];
      }
    }

    // ── Save conversation to DB ───────────────────────────────────────────────
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
        quickReplies,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/chatbot/history ──────────────────────────────────────────────────
const getChatHistory = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;

    const [rows] = await pool.query(
      'SELECT id, sender, message, has_order_widget, created_at FROM chat_messages WHERE user_id = ? ORDER BY id ASC LIMIT 100',
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Riwayat percakapan chatbot berhasil diambil.',
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/chatbot/history ───────────────────────────────────────────────
const clearChatHistory = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    await pool.query('DELETE FROM chat_messages WHERE user_id = ?', [userId]);
    res.status(200).json({ success: true, message: 'Riwayat percakapan dihapus.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleChatMessage,
  getChatHistory,
  clearChatHistory,
};
