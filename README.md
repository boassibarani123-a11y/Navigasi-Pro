# Navigasi Pro v2.0 — VPS Edition

Starter aplikasi multi-owner NFC landing page dengan Founder Dashboard, aktivasi kartu sekali pakai, Owner Dashboard, pengaturan profil/link, halaman publik, dan analytics dasar. Tampilan menggunakan gaya Elegant Nature (cream, sage/forest green) seperti desain sebelumnya.

> **Status:** source code aplikasi full-stack dan konfigurasi deployment tersedia. Ini adalah fondasi MVP yang harus diuji di staging dan ditinjau keamanannya sebelum menerima pelanggan/uang sungguhan. Belum ada audit keamanan independen, billing/payment gateway, upload file langsung (gunakan URL gambar HTTPS untuk MVP), email reset password, atau integrasi otomatis ke chip NFC.

## Stack
- Node.js 22 LTS + Express
- PostgreSQL
- HTML/CSS/Vanilla JS frontend (tidak memerlukan bundler/build)
- Nginx + PM2 di Ubuntu 22.04

## Fitur
### Founder
- Login dengan role founder
- Ringkasan jumlah kartu, owner, page views, dan klik
- Generate 1–100 kode aktivasi unik per batch
- Kode aktivasi ditampilkan hanya pada saat generate; simpan dan serahkan ke pembeli secara pribadi
- Inventori kartu dan suspend/restore kartu
- Daftar owner

### Owner
- Aktivasi kartu satu kali sekaligus membuat akun Owner
- Profil bisnis, slug URL, deskripsi, URL logo dan cover
- Kelola hingga 30 link (Instagram, TikTok, Facebook, YouTube, WhatsApp, Google Maps, Google Reviews, custom)
- URL landing page permanen yang dapat disalin untuk ditulis ke chip NFC
- Analytics page view dan link click 30 hari

### Publik
- `https://domainkamu.com/p/slug-bisnis`
- Halaman bisnis responsif
- Link dibuka di tab baru

## Persyaratan
- Ubuntu 22.04 LTS
- Node.js 22, PostgreSQL 14+, Nginx
- Domain mengarah ke IP VPS untuk HTTPS
- Disarankan minimal 2 vCPU / 4 GB RAM / 40 GB SSD untuk MVP kecil. VPS pada screenshot (1 vCPU / 1 GB RAM / 15 GB SSD) sangat terbatas; gunakan hanya untuk uji coba dan upgrade sebelum produksi.

## Menjalankan lokal (Windows / Linux)
1. Install Node.js 22 dan PostgreSQL.
2. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL`, `APP_URL`, `JWT_SECRET`.
3. Buat database dan user PostgreSQL.
4. Jalankan:
   ```bash
   npm install
   npm run db:init
   ```
5. Buat akun Founder pertama:
   ```bash
   # Linux/macOS
   FOUNDER_EMAIL=admin@domainkamu.com FOUNDER_PASSWORD='Password-Panjang-Minimal-14!' npm run founder:create
   ```
   Windows CMD:
   ```cmd
   set FOUNDER_EMAIL=admin@domainkamu.com
   set FOUNDER_PASSWORD=Password-Panjang-Minimal-14!
   npm run founder:create
   ```
6. Jalankan `npm start`, lalu buka `http://localhost:3000`.

## Deploy Ubuntu 22.04
Lihat `deploy/UBUNTU-22.04.md`. File konfigurasi Nginx tersedia di `deploy/navigasi-pro.nginx`.

## GitHub
Repository sebaiknya **Private**. `.gitignore` sudah mengecualikan `.env`, `node_modules`, dan file build. Jangan pernah commit password, token, private key, atau dump database.

## Alur operasional NFC
1. Founder login → Manajemen Kartu/Overview → Generate kode.
2. Simpan kode aktivasi yang baru ditampilkan dan berikan secara privat kepada pembeli.
3. Owner buka `/` → Aktivasi kartu → isi kode, email, password, nama bisnis, dan slug.
4. Owner login ke dashboard, atur profil dan link.
5. Owner salin URL landing page, misalnya `https://domainkamu.com/p/kopi-toba`.
6. Gunakan aplikasi NFC Tools atau encoder NDEF untuk menulis URL tersebut sebagai URI record ke chip. Navigasi Pro tidak menulis chip secara otomatis melalui browser.
7. Untuk QR, generate QR yang mengarah ke URL publik yang sama. QR harus dicetak per kartu/owner jika ingin langsung menuju profil bisnis.

## Catatan keamanan dan keterbatasan
- Kode aktivasi disimpan dalam bentuk SHA-256 hash, digunakan satu kali, dan proses klaim memakai transaksi + row lock.
- Password akun di-hash dengan bcrypt; token JWT berlaku 12 jam.
- Login dan aktivasi memiliki rate limit.
- Founder pertama dibuat melalui perintah server `npm run founder:create`; jangan menyediakan endpoint pendaftaran Founder publik.
- Simpan kode aktivasi yang ditampilkan saat generate. Server tidak dapat menampilkan ulang kode asli karena yang disimpan adalah hash.
- Siapkan backup database terenkripsi di luar VPS, monitoring, pembaruan OS/dependency, kebijakan privasi, dan audit keamanan sebelum produksi.
- Untuk skala besar, pindahkan event analytics ke proses agregasi/queue dan tambahkan pagination serta retention policy.
