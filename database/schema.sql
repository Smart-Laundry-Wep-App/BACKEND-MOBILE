-- Database Schema for SCA Smart Laundry
CREATE DATABASE IF NOT EXISTS `sca_smart_laundry` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sca_smart_laundry`;

-- 1. Table Users
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) UNIQUE NOT NULL,
  `email` VARCHAR(120) UNIQUE NOT NULL,
  `avatar_url` LONGTEXT DEFAULT NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) DEFAULT '+62 812 3366 2335',
  `province` VARCHAR(100) DEFAULT 'Jawa Timur',
  `city` VARCHAR(100) DEFAULT 'Kota Malang',
  `address` VARCHAR(500) DEFAULT 'Jl. Bareng menuju IPK 4, Malang, Jawa Timur',
  `address_detail` VARCHAR(255) DEFAULT 'Patokan dekat gapura putih',
  `latitude` DECIMAL(10,8) DEFAULT -7.98260000,
  `longitude` DECIMAL(11,8) DEFAULT 112.63080000,
  `language` VARCHAR(50) DEFAULT 'Indonesia (INA)',
  `notification_settings` JSON DEFAULT NULL,
  `role` ENUM('customer', 'admin', 'courier') DEFAULT 'customer',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table Services (Layanan Laundry)
CREATE TABLE IF NOT EXISTS `services` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) DEFAULT 'regular',
  `description` TEXT NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `unit` VARCHAR(20) DEFAULT 'kg',
  `icon_type` VARCHAR(50) DEFAULT 'washing_machine',
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table Promos (Promo & Voucher)
CREATE TABLE IF NOT EXISTS `promos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `promo_title` VARCHAR(150) NOT NULL,
  `discount_type` ENUM('percentage', 'fixed', 'free_shipping') NOT NULL DEFAULT 'percentage',
  `discount_value` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `min_order_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `validity` VARCHAR(100) NOT NULL,
  `terms` TEXT DEFAULT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table Orders (Pemesanan Laundry)
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_code` VARCHAR(50) UNIQUE NOT NULL,
  `user_id` INT NOT NULL,
  `service_id` INT NOT NULL,
  `service_name` VARCHAR(100) NOT NULL,
  `service_variant` VARCHAR(100) DEFAULT 'Reguler',
  `category_type` ENUM('pickup_outlet', 'delivery') DEFAULT 'pickup_outlet',
  `delivery_address` VARCHAR(500) DEFAULT NULL,
  `quantity` DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  `unit` VARCHAR(20) DEFAULT 'kg',
  `price_per_unit` DECIMAL(12,2) NOT NULL DEFAULT 10000.00,
  `subtotal` DECIMAL(12,2) NOT NULL,
  `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `promo_code` VARCHAR(50) DEFAULT NULL,
  `total_price` DECIMAL(12,2) NOT NULL,
  `pickup_date` DATE NOT NULL,
  `pickup_time` VARCHAR(50) NOT NULL,
  `payment_method` VARCHAR(50) DEFAULT 'QRIS',
  `payment_status` ENUM('unpaid', 'paid', 'cancelled') DEFAULT 'unpaid',
  `order_status` ENUM('menunggu_penjemputan', 'sedang_dicuci', 'siap_diambil', 'sedang_diantar', 'selesai', 'dibatalkan') DEFAULT 'menunggu_penjemputan',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_user_id` (`user_id`),
  INDEX `idx_orders_status` (`order_status`),
  INDEX `idx_orders_code` (`order_code`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_service` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table Payment Transactions
CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `provider` VARCHAR(30) NOT NULL DEFAULT 'xendit',
  `external_id` VARCHAR(100) NOT NULL UNIQUE,
  `provider_invoice_id` VARCHAR(100) DEFAULT NULL,
  `payment_method` VARCHAR(30) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('pending', 'paid', 'expired', 'failed') NOT NULL DEFAULT 'pending',
  `checkout_url` TEXT DEFAULT NULL,
  `provider_response` JSON DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payment_order` (`order_id`, `created_at`),
  INDEX `idx_payment_invoice` (`provider_invoice_id`),
  CONSTRAINT `fk_payment_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Table Promo Claims
CREATE TABLE IF NOT EXISTS `promo_claims` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `promo_id` INT NOT NULL,
  `claimed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_promo_claim_user` (`user_id`, `promo_id`),
  CONSTRAINT `fk_promo_claim_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promo_claim_promo` FOREIGN KEY (`promo_id`) REFERENCES `promos`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Table Order Tracking
CREATE TABLE IF NOT EXISTS `order_tracking` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL UNIQUE,
  `current_step` VARCHAR(100) NOT NULL DEFAULT 'Menunggu Penjemputan',
  `step_index` INT DEFAULT 1,
  `driver_name` VARCHAR(100) DEFAULT NULL,
  `driver_phone` VARCHAR(30) DEFAULT NULL,
  `driver_vehicle` VARCHAR(50) DEFAULT NULL,
  `driver_lat` DECIMAL(10,8) DEFAULT NULL,
  `driver_lng` DECIMAL(11,8) DEFAULT NULL,
  `estimated_delivery` VARCHAR(100) DEFAULT NULL,
  `last_status_message` VARCHAR(255) DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_tracking_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Table Operational Hours
CREATE TABLE IF NOT EXISTS `operational_hours` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `day_name` VARCHAR(30) NOT NULL,
  `open_time` VARCHAR(10) NOT NULL DEFAULT '06.00',
  `close_time` VARCHAR(10) NOT NULL DEFAULT '21.00',
  `is_open` BOOLEAN DEFAULT TRUE,
  `note` VARCHAR(100) DEFAULT 'Buka Setiap Hari'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Table Chatbot Messages & History
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `sender` ENUM('user', 'bot') NOT NULL,
  `message` TEXT NOT NULL,
  `has_order_widget` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_chat_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
