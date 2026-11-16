# SCA Smart Laundry API

Backend REST API yang dipakai aplikasi Flutter di folder `FRONTEND-MOBILE`.
Database MySQL `sca_smart_laundry` dapat dilihat dan dikelola melalui phpMyAdmin.

## Menjalankan backend

1. Pastikan MySQL aktif, lalu buka terminal di `BACKEND-MOBILE-main`.
2. Salin `.env.example` menjadi `.env` dan sesuaikan kredensial MySQL. Isi
   `JWT_SECRET` dengan nilai acak minimal 32 karakter; jangan commit `.env`.
3. Jalankan:

   ```powershell
   npm install
   npm run migrate
   npm run dev
   ```

   Server mendengarkan pada `http://localhost:5000`. Kesehatan dan daftar
   endpoint tersedia di `GET /` dan `GET /api`.

Akun demo yang diisi oleh migrasi: `narendraub@gmail.com` /
`password123`. Ganti password demo sebelum memakai data ini di luar development.

## Menghubungkan Flutter

Jalankan Flutter dari folder `FRONTEND-MOBILE`:

```powershell
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5000/api
```

Untuk Android Emulator, gunakan
`--dart-define=API_BASE_URL=http://10.0.2.2:5000/api`. Untuk telepon fisik,
gunakan alamat IP LAN komputer dan pastikan firewall mengizinkan koneksi. Build
release harus menggunakan HTTPS.

## Endpoint utama

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/google`, `POST /api/auth/facebook`
- `GET|PUT /api/auth/profile`, `PUT /api/auth/notifications`
- `GET /api/services`, `GET /api/info/operational-hours`,
  `GET /api/info/help-center`
- `GET /api/promos`, `POST /api/promos/validate`,
  `POST /api/promos/claim`
- `POST|GET /api/orders`, `GET /api/orders/active`,
  `GET /api/orders/:id`, `GET /api/orders/:id/payment`,
  `POST /api/orders/:id/pay`, `PUT /api/orders/:id/status`
- `GET /api/tracking/:orderCode`
- `POST|GET /api/chatbot/message`, `GET /api/chatbot/history`
- `POST /api/payments/xendit-webhook`

Endpoint yang memerlukan akun menerima `Authorization: Bearer <token>`.
Perubahan status pesanan hanya dapat dilakukan akun admin/kurir.

Kurir/admin dapat memperbarui status sekaligus mengirim koordinat GPS melalui
`PUT /api/orders/:id/status`, misalnya:

```json
{
  "order_status": "sedang_diantar",
  "step_index": 4,
  "current_step": "Sedang Diantar",
  "driver_lat": -7.9839,
  "driver_lng": 112.6214,
  "estimated_delivery": "16.00 WIB"
}
```

Koordinat tidak dibuat-buat: nilai GPS tetap kosong sampai perangkat kurir
mengirim pembaruan. Aplikasi Flutter ini berperan sebagai aplikasi pelanggan;
pengiriman lokasi kurir memerlukan akun/perangkat kurir dan pengirim GPS yang
terpisah.

## Login sosial dan pembayaran

Email/password dan seluruh alur pesanan tersimpan ke MySQL. Untuk login Google,
isi `GOOGLE_CLIENT_ID` di `.env` backend dan berikan nilai yang sama ke Flutter
melalui `--dart-define=GOOGLE_CLIENT_ID=...`. Google Sign-In juga memerlukan
OAuth client Android/iOS/web yang cocok dengan aplikasi.

Login Facebook memerlukan `FACEBOOK_APP_ID` dan `FACEBOOK_APP_SECRET` di backend,
`--dart-define=FACEBOOK_APP_ID=...` di Flutter, serta konfigurasi Facebook SDK
untuk platform target (Android/iOS/Web).

Pembayaran tidak disimulasikan sebagai lunas. Atur `XENDIT_SECRET_KEY` dan
`XENDIT_CALLBACK_TOKEN` di `.env`, lalu daftarkan
`https://<host-publik>/api/payments/xendit-webhook` sebagai callback Xendit.
Status pesanan berubah menjadi lunas hanya setelah callback Xendit yang valid
diterima. Akun Xendit sandbox/kredensial provider diperlukan untuk uji transaksi
end-to-end; jangan masukkan secret ke Flutter atau Git.
