# SCA Smart Laundry API

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
