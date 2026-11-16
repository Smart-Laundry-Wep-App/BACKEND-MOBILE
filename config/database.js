const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sca_smart_laundry',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Test connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Terhubung ke MySQL server: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306} (Database: ${process.env.DB_NAME || 'sca_smart_laundry'})`);
    connection.release();
    return true;
  } catch (error) {
    console.error('[Database Error] Gagal terhubung ke MySQL:');
    console.error(error.message);
    console.log('\n[Tips Troubleshooting MySQL]:');
    console.log('1. Pastikan XAMPP / MySQL Service sudah di-start (Port 3306).');
    console.log('2. Jalankan perintah `npm run migrate` untuk membuat database dan tabel otomatis.');
    console.log('3. Sesuaikan konfigurasi DB_USER dan DB_PASSWORD di file .env jika ada perubahan.');
    throw error;
  }
};

module.exports = {
  pool,
  testConnection,
};
