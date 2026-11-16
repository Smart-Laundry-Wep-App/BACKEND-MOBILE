const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('----------------------------------------------------');
  console.log(' Memulai Migrasi Database SCA Smart Laundry...');
  console.log('----------------------------------------------------');

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const databaseName = process.env.DB_NAME || 'sca_smart_laundry';

  let rootConnection;

  try {
    // Step 1: Connect to MySQL root (without target db)
    console.log(`[1/4] Menghubungkan ke MySQL di ${host}:${port} sebagai user '${user}'...`);
    rootConnection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
    console.log('[1/4] Koneksi awal berhasil!');

    // Step 2: Create database if not exists
    console.log(`[2/4] Membuat / memastikan database '${databaseName}'...`);
    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConnection.changeUser({ database: databaseName });
    console.log(`[2/4] Database '${databaseName}' siap digunakan!`);

    // Step 3: Run schema.sql
    console.log('[3/4] Menjalankan DDL schema tabel...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await rootConnection.query(schemaSql);
    const [orderColumns] = await rootConnection.query(
      "SHOW COLUMNS FROM `orders` LIKE 'delivery_address'"
    );
    if (orderColumns.length === 0) {
      await rootConnection.query(
        'ALTER TABLE `orders` ADD COLUMN `delivery_address` VARCHAR(500) DEFAULT NULL AFTER `category_type`'
      );
    }
    await rootConnection.query(
      "ALTER TABLE `orders` ALTER COLUMN `order_status` SET DEFAULT 'menunggu_penjemputan'"
    );
    await rootConnection.query(
      `ALTER TABLE \`order_tracking\`
       ALTER COLUMN \`current_step\` SET DEFAULT 'Menunggu Penjemputan',
       ALTER COLUMN \`step_index\` SET DEFAULT 1,
       ALTER COLUMN \`driver_name\` DROP DEFAULT,
       ALTER COLUMN \`driver_phone\` DROP DEFAULT,
       ALTER COLUMN \`driver_vehicle\` DROP DEFAULT,
       ALTER COLUMN \`driver_lat\` DROP DEFAULT,
       ALTER COLUMN \`driver_lng\` DROP DEFAULT,
       ALTER COLUMN \`estimated_delivery\` DROP DEFAULT,
       ALTER COLUMN \`last_status_message\` DROP DEFAULT`
    );
    await rootConnection.query(
      `UPDATE \`order_tracking\`
       SET \`current_step\` = 'Menunggu Penjemputan',
           \`step_index\` = 1,
           \`driver_name\` = NULL,
           \`driver_phone\` = NULL,
           \`driver_vehicle\` = NULL,
           \`driver_lat\` = NULL,
           \`driver_lng\` = NULL,
           \`estimated_delivery\` = NULL,
           \`last_status_message\` = 'Pesanan menunggu penjemputan.'
       WHERE \`driver_name\` = 'Budi Santoso'
         AND \`driver_lat\` = -7.98390800
         AND \`driver_lng\` = 112.62139100`
    );
    console.log('[3/4] Seluruh tabel berhasil dibuat!');

    // Step 4: Run seed.sql
    console.log('[4/4] Memasukkan data awal (seed data)...');
    
    // Hash demo password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    // Read and run seed.sql
    let seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
    // Replace placeholder hash if needed or run queries
    await rootConnection.query(seedSql);

    // Update password for demo user to ensure hash matches password123
    await rootConnection.query(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, 'narendraub@gmail.com']
    );

    console.log('[4/4] Data awal berhasil dimasukkan!');
    console.log('----------------------------------------------------');
    console.log(' Migrasi Sukses!');
    console.log(' Akun Demo Pengguna:');
    console.log(' - Email     : narendraub@gmail.com (atau narendraub)');
    console.log(' - Password  : password123');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('\n[Error Migrasi]:', error.message);
    console.log('\n[Tips]:');
    console.log('1. Pastikan server MySQL (misal XAMPP / Laragon / MySQL Service) dalam keadaan AKTIF.');
    console.log('2. Cek apakah username dan password di file `.env` sudah sesuai.');
    process.exit(1);
  } finally {
    if (rootConnection) {
      await rootConnection.end();
    }
  }
}

runMigration();
