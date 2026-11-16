const express = require('express');
const router = express.Router();
const { getAllPromos, validatePromo, claimPromo } = require('../controllers/promoController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.get('/', getAllPromos);
router.post('/validate', authMiddleware, validatePromo);
router.post('/claim', authMiddleware, claimPromo);

module.exports = router;
