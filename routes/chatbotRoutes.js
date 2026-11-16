const express = require('express');
const router = express.Router();
const { handleChatMessage, getChatHistory } = require('../controllers/chatbotController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/message', authMiddleware, handleChatMessage);
router.get('/history', authMiddleware, getChatHistory);

module.exports = router;
