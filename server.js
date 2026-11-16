const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { testConnection } = require('./config/database');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Root Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SCA Smart Laundry Backend API Server sedang berjalan 🚀',
    endpoints_index: '/api',
  });
});

// API Routes
app.use('/api', apiRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
const startServer = async () => {
  try {
    // Check database connection
    const connected = await testConnection();
    if (!connected) throw new Error('Koneksi database MySQL gagal.');

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log(` SCA Smart Laundry Backend siap melayani!`);
      console.log(` Server berjalan di : http://localhost:${PORT}`);
      console.log(` Index Endpoint API : http://localhost:${PORT}/api`);
      console.log(` Environment        : ${process.env.NODE_ENV || 'development'}`);
      console.log('====================================================');
    });
  } catch (error) {
    console.error('Gagal menjalankan server:', error.message);
  }
};

startServer();

module.exports = app;
