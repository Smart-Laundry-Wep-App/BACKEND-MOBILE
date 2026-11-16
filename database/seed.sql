USE `sca_smart_laundry`;

-- 1. Seed Demo User: Narendra (password: password123)
-- Hash generated for password123: $2a$10$wEkgB5pA7G4l3L7vLz1eXOF4x7U5T3N5g8H4l1x2b3c4d5e6f7g8h (or we will also ensure bcrypt in migration)
INSERT INTO `users` (`id`, `name`, `username`, `email`, `password`, `phone`, `province`, `city`, `address`, `language`, `role`)
VALUES (
  1,
  'Narendra',
  'narendraub',
  'narendraub@gmail.com',
  '$2a$10$iI0w3Z9B/UfkxH/K6LkWpeYc1b9oF4y3Gk6C6ZpM2D7.z8g9J6kTC', -- hashed 'password123'
  '+62 812 3366 2335',
  'Jawa Timur',
  'Kota Malang',
  'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
  'Indonesia (INA)',
  'customer'
) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 2. Seed Services (sesuai pilihan di aplikasi Flutter)
INSERT INTO `services` (`id`, `name`, `category`, `description`, `price`, `unit`, `icon_type`) VALUES
(1, 'Cuci Kering', 'kiloan', 'Pakaian bersih dan kering, siap digunakan.', 10000.00, 'kg', 'washing_machine'),
(2, 'Cuci Express', 'kiloan', 'Laundry cepat untuk kebutuhan mendesak.', 15000.00, 'kg', 'express_shirt'),
(3, 'Cuci Selimut', 'satuan', 'Selimut bersih, lembut, dan nyaman.', 25000.00, 'pcs', 'blanket'),
(4, 'Cuci Bed Cover', 'satuan', 'Perlengkapan tidur bersih dan segar.', 35000.00, 'pcs', 'bed_cover'),
(5, 'Cuci Boneka', 'satuan', 'Boneka bersih dan nyaman dipeluk.', 20000.00, 'pcs', 'teddy_bear'),
(6, 'Cuci Sepatu', 'satuan', 'Sepatu bersih dengan perawatan tepat.', 30000.00, 'pcs', 'shoe'),
(7, 'Wenter Pakaian', 'satuan', 'Segarkan warna pakaian favoritmu.', 25000.00, 'pcs', 'pants')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `price` = VALUES(`price`), `description` = VALUES(`description`);

-- 3. Seed Promos
INSERT INTO `promos` (`id`, `code`, `title`, `promo_title`, `discount_type`, `discount_value`, `min_order_amount`, `validity`, `terms`) VALUES
(1, 'MERDEKA', 'Promo Kemerdekaan Indonesia.', 'Dirgahayu Indonesia', 'percentage', 20.00, 30000.00, '17-18 Agustus', 'Berlaku untuk semua layanan cuci kiloan dan satuan tanpa batasan berat minimal.'),
(2, 'FREEONGKIR', 'Gratis Ongkir Untuk Lokasi Tertentu.', 'Gratis Ongkir', 'free_shipping', 10000.00, 25000.00, 'Syarat & Ketentuan Berlaku', 'Khusus radius maksimal 5 km dari outlet terdekat SCA Smart Laundry.'),
(3, 'DISKON15', 'Potongan 15% S&K Berlaku.', 'Diskon 15%', 'percentage', 15.00, 20000.00, 'Syarat & Ketentuan Berlaku', 'Berlaku untuk pemesanan pertama atau pelanggan setia setiap hari kerja.'),
(4, 'MABA20', 'Promo Mahasiswa Baru.', 'Diskon 20%', 'percentage', 20.00, 0.00, '1-31 Agustus', 'Promo mahasiswa baru.')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `promo_title` = VALUES(`promo_title`);

-- 4. Seed Operational Hours (Senin s/d Minggu)
INSERT INTO `operational_hours` (`id`, `day_name`, `open_time`, `close_time`, `is_open`, `note`) VALUES
(1, 'Senin', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(2, 'Selasa', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(3, 'Rabu', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(4, 'Kamis', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(5, 'Jumat', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(6, 'Sabtu', '06.00', '21.00', 1, 'Buka Setiap Hari'),
(7, 'Minggu', '06.00', '21.00', 1, 'Buka Setiap Hari')
ON DUPLICATE KEY UPDATE `day_name` = VALUES(`day_name`);

-- 5. Seed Orders (Orders riwayat & aktif seperti di layar Flutter)
INSERT INTO `orders` (`id`, `order_code`, `user_id`, `service_id`, `service_name`, `service_variant`, `category_type`, `quantity`, `unit`, `price_per_unit`, `subtotal`, `delivery_fee`, `discount_amount`, `total_price`, `pickup_date`, `pickup_time`, `payment_method`, `payment_status`, `order_status`, `notes`) VALUES
(1, 'SCA-2841', 1, 1, 'Cuci Komplit', 'Reguler', 'delivery', 3.5, 'kg', 10000.00, 35000.00, 0.00, 0.00, 35000.00, '2026-11-16', '06.00 - 10.00', 'QRIS', 'paid', 'sedang_dicuci', 'Pakaian warna putih tolong dipisah'),
(2, '#SL0126', 1, 1, 'Cuci Kering', 'Reguler', 'pickup_outlet', 3.0, 'kg', 10000.00, 30000.00, 0.00, 0.00, 30000.00, '2026-11-16', '08.00 - 12.00', 'QRIS', 'paid', 'sedang_dicuci', 'Baju kaos dan celana'),
(3, '#SL0125', 1, 1, 'Cuci Setrika', 'Reguler', 'pickup_outlet', 2.0, 'kg', 10000.00, 20000.00, 0.00, 0.00, 20000.00, '2026-11-18', '09.00 - 13.00', 'Gopay', 'paid', 'selesai', 'Selesai tepat waktu'),
(4, '#SL0138', 1, 1, 'Cuci Kering', 'Reguler', 'pickup_outlet', 4.0, 'kg', 10000.00, 40000.00, 0.00, 0.00, 40000.00, '2026-11-20', '07.00 - 11.00', 'Dana', 'paid', 'selesai', 'Harum lavender'),
(5, '#SL0139', 1, 1, 'Cuci Setrika', 'Reguler', 'delivery', 1.0, 'kg', 10000.00, 10000.00, 0.00, 0.00, 10000.00, '2026-11-22', '10.00 - 14.00', 'QRIS', 'paid', 'selesai', 'Kemeja kantor rapi'),
(6, '#SL0211', 1, 2, 'Cuci Express', 'Express', 'delivery', 2.0, 'kg', 15000.00, 30000.00, 0.00, 0.00, 30000.00, '2026-11-26', '13.00 - 17.00', 'ShopeePay', 'paid', 'selesai', 'Pakaian acara darurat')
ON DUPLICATE KEY UPDATE `order_code` = VALUES(`order_code`);

-- 6. Seed Tracking for Order SCA-2841 (Order #12345 di GPS tracking)
INSERT INTO `order_tracking` (`id`, `order_id`, `current_step`, `step_index`, `driver_name`, `driver_phone`, `driver_vehicle`, `driver_lat`, `driver_lng`, `estimated_delivery`, `last_status_message`) VALUES
(1, 1, 'Proses Cuci', 2, NULL, NULL, NULL, NULL, NULL, NULL, 'Pesanan demo sedang dalam proses pencucian.')
ON DUPLICATE KEY UPDATE `current_step` = VALUES(`current_step`);
