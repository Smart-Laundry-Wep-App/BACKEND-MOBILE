// Handle 404 Not Found
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Endpoint tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
};

// Global Error Handler
const errorHandler = (err, req, res, next) => {
  console.error('[Server Error]:', err);

  const statusCode = err.statusCode
    || (err.code === 'ER_DUP_ENTRY' ? 409 : null)
    || (res.statusCode === 200 ? 500 : res.statusCode);

  res.status(statusCode).json({
    success: false,
    message: err.code === 'ER_DUP_ENTRY'
      ? 'Email atau username sudah digunakan.'
      : err.message || 'Terjadi kesalahan pada server internal.',
    stack: process.env.NODE_ENV === 'development' && statusCode >= 500 ? err.stack : undefined,
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
