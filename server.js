const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { testConnection } = require('./config/database');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
const startServer = async () => {
  try {
    // Check database connection
    try {
      await testConnection();
    } catch (dbErr) {
      console.warn('⚠️  [Database Warning] MySQL belum terhubung. Pastikan XAMPP / MySQL Service sudah di-start (Port 3306).');
    }

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
