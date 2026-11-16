const express = require('express');
const router = express.Router();
const { getTrackingByOrderCode } = require('../controllers/trackingController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.get('/:orderCode', authMiddleware, getTrackingByOrderCode);

module.exports = router;
