const express = require('express');
const { handleXenditWebhook } = require('../controllers/paymentController');

const router = express.Router();
router.post('/xendit-webhook', handleXenditWebhook);

module.exports = router;
