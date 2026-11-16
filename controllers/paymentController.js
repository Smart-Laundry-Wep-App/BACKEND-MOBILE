const crypto = require('crypto');
const { pool } = require('../config/database');

const handleXenditWebhook = async (req, res, next) => {
  try {
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;
    const receivedToken = req.get('x-callback-token') || '';
    if (!expectedToken) {
      return res.status(503).json({
        success: false,
        message: 'Callback Xendit belum dikonfigurasi pada backend.',
      });
    }

    const expected = Buffer.from(expectedToken);
    const received = Buffer.from(receivedToken);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return res.status(401).json({
        success: false,
        message: 'Token callback pembayaran tidak valid.',
      });
    }

    const { id: invoiceId, external_id: externalId, status } = req.body;
    const normalizedStatus = String(status || '').toUpperCase();
    const paymentStatus = normalizedStatus === 'PAID'
      ? 'paid'
      : normalizedStatus === 'EXPIRED'
        ? 'expired'
        : normalizedStatus === 'FAILED'
          ? 'failed'
          : null;
    if (!invoiceId && !externalId) {
      return res.status(400).json({
        success: false,
        message: 'ID invoice atau external ID wajib disertakan.',
      });
    }
    if (!paymentStatus) return res.status(200).json({ success: true, received: true });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [payments] = await connection.query(
        `SELECT id, order_id, status FROM payment_transactions
         WHERE provider_invoice_id = ? OR external_id = ? LIMIT 1 FOR UPDATE`,
        [invoiceId || '', externalId || '']
      );
      if (payments.length) {
        const payment = payments[0];
        if (payment.status !== 'paid' || paymentStatus === 'paid') {
          await connection.query(
            `UPDATE payment_transactions
             SET status = ?, paid_at = IF(? = 'paid', COALESCE(paid_at, NOW()), paid_at)
             WHERE id = ?`,
            [paymentStatus, paymentStatus, payment.id]
          );
        }
        if (paymentStatus === 'paid') {
          await connection.query(
            `UPDATE orders SET payment_status = 'paid', order_status = 'sedang_dicuci'
             WHERE id = ? AND payment_status <> 'paid'`,
            [payment.order_id]
          );
          await connection.query(
            `UPDATE order_tracking
             SET current_step = 'Proses Cuci', step_index = 2,
                 last_status_message = 'Pembayaran terkonfirmasi. Cucian Anda sedang diproses.'
             WHERE order_id = ?`,
            [payment.order_id]
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(200).json({ success: true, received: true });
  } catch (error) {
    return next(error);
  }
};

module.exports = { handleXenditWebhook };
