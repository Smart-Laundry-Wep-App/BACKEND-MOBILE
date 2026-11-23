const express = require('express');
const router = express.Router();
const { getTrackingByOrderCode, updateDriverLocation } = require('../controllers/trackingController');
const { optionalAuthMiddleware } = require('../middlewares/authMiddleware');

// Bisa diakses dengan token atau tanpa token (fallback public tracking demo)
router.get('/:orderCode', optionalAuthMiddleware, getTrackingByOrderCode);
router.put('/:orderCode/location', updateDriverLocation);

module.exports = router;
