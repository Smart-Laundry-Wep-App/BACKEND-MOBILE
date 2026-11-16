const express = require('express');
const router = express.Router();
const {
  register,
  login,
  googleSignIn,
  facebookSignIn,
  getProfile,
  updateProfile,
  updateNotificationSettings,
  forgotPassword,
} = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleSignIn);
router.post('/facebook', facebookSignIn);
router.post('/forgot-password', forgotPassword);
router.get('/profile', authMiddleware, getProfile);
router.get('/me', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/notifications', authMiddleware, updateNotificationSettings);

module.exports = router;
