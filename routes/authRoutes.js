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
  initOAuthSession,
  getOAuthSessionStatus,
  getGoogleAuthUrl,
  googleCallback,
  getFacebookAuthUrl,
  facebookCallback,
  getOAuthStatus,
  updateOAuthConfig,
} = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleSignIn);
router.post('/facebook', facebookSignIn);
router.post('/forgot-password', forgotPassword);

// Real OAuth 2.0 Flow (Web / In-App Browser)
router.get('/oauth-status', getOAuthStatus);
router.post('/oauth-config', updateOAuthConfig);
router.post('/oauth-session/init', initOAuthSession);
router.get('/oauth-session/init', initOAuthSession);
router.get('/oauth-session/:id', getOAuthSessionStatus);

// Official OAuth URL and Callback Endpoints
router.get('/google/url', getGoogleAuthUrl);
router.get('/google/callback', googleCallback);

router.get('/facebook/url', getFacebookAuthUrl);
router.get('/facebook/callback', facebookCallback);

router.get('/profile', authMiddleware, getProfile);
router.get('/me', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/notifications', authMiddleware, updateNotificationSettings);

module.exports = router;
