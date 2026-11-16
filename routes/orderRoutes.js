const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getActiveOrder,
  getOrderById,
  payOrder,
  getPaymentStatus,
  updateOrderStatus,
} = require('../controllers/orderController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const requireStaff = (req, res, next) => {
  if (!['admin', 'courier'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Hanya admin atau kurir yang dapat memperbarui status pesanan.',
    });
  }
  return next();
};

router.use(authMiddleware);

router.post('/', createOrder);
router.get('/', getOrders);
router.get('/active', getActiveOrder);
router.get('/:id/payment', getPaymentStatus);
router.get('/:id', getOrderById);
router.post('/:id/pay', payOrder);
router.put('/:id/status', requireStaff, updateOrderStatus);

module.exports = router;
