const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const serviceRoutes = require('./serviceRoutes');
const orderRoutes = require('./orderRoutes');
const promoRoutes = require('./promoRoutes');
const trackingRoutes = require('./trackingRoutes');
const chatbotRoutes = require('./chatbotRoutes');
const infoRoutes = require('./infoRoutes');
const paymentRoutes = require('./paymentRoutes');

// API Health Check & Info
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Selamat datang di API SCA Smart Laundry Backend!',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET & PUT /api/auth/profile',
        notifications: 'PUT /api/auth/notifications',
      },
      services: {
        list: 'GET /api/services',
        detail: 'GET /api/services/:id',
      },
      orders: {
        create: 'POST /api/orders',
        list: 'GET /api/orders',
        active: 'GET /api/orders/active',
        detail: 'GET /api/orders/:id',
        pay: 'POST /api/orders/:id/pay',
        updateStatus: 'PUT /api/orders/:id/status',
      },
      payments: {
        webhook: 'POST /api/payments/xendit-webhook',
      },
      tracking: {
        live: 'GET /api/tracking/:orderCode',
      },
      promos: {
        list: 'GET /api/promos',
        validate: 'POST /api/promos/validate',
      },
      chatbot: {
        chat: 'POST /api/chatbot/message',
        history: 'GET /api/chatbot/history',
      },
      information: {
        operationalHours: 'GET /api/info/operational-hours',
        helpCenter: 'GET /api/info/help-center',
      },
    },
  });
});

// Mount Routes
router.use('/auth', authRoutes);
router.use('/users', authRoutes); // alias for /users/profile etc.
router.use('/', authRoutes); // alias for /google, /facebook, /oauth-session etc. directly under /api
router.use('/services', serviceRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/promos', promoRoutes);
router.use('/tracking', trackingRoutes);
router.use('/chatbot', chatbotRoutes);
router.use('/info', infoRoutes);
router.use('/', infoRoutes); // alias for /operational-hours and /help-center directly

module.exports = router;
