const express = require('express');
const router = express.Router();
const { handleChatMessage, getChatHistory, clearChatHistory } = require('../controllers/chatbotController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/message', authMiddleware, handleChatMessage);
router.get('/history', authMiddleware, getChatHistory);
router.delete('/history', authMiddleware, clearChatHistory);

module.exports = router;
