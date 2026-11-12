# Panduan Deploy Navigasi Pro — Ubuntu 22.04 + Helipod

Panduan ini memakai SSH port 21100 sesuai screenshot Helipod. Pastikan VPS yang dipilih adalah instance yang benar dan statusnya **Running/Active**. Screenshot sebelumnya menunjukkan status Provisioning dan instance lain `solver` berstatus TERMINATED; jangan jalankan perintah sebelum instance tujuan aktif.

## 0. Spesifikasi VPS
VPS pada screenshot: 1 vCPU, RAM 1 GB, SSD 15 GB. Ini hanya cukup untuk uji coba terbatas dan sangat ketat untuk Node + PostgreSQL. Rekomendasi minimal 2 vCPU / 4 GB RAM / 40 GB SSD. Jangan menambah swap besar sebagai pengganti RAM. Bila tetap menguji pada 1 GB, gunakan satu service, batasi PostgreSQL memory, dan pantau `free -h`; build/deploy bisa kehabisan memori.

## 1. DNS
Buat record DNS:
- A `@` → IPv4 VPS
- A `www` → IPv4 VPS (opsional)
Tunggu propagasi DNS. HTTPS Certbot membutuhkan domain yang sudah mengarah ke VPS dan port 80/443 dapat diakses.

## 2. SSH dari Windows CMD / PowerShell
Ganti IP jika berbeda:
```powershell
ssh -p 21100 root@45.13.232.39
```
Jika login pertama, verifikasi fingerprint host melalui panel/provider sebelum mengetik `yes`. Jangan kirim password atau private key ke chat.

## 3. Update dan paket server
```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg git unzip nginx postgresql postgresql-contrib build-essential ufw certbot python3-certbot-nginx
```
Firewall (pastikan SSH port custom diizinkan sebelum enable):
```bash
ufw allow 21100/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```
Jangan membuka port PostgreSQL 5432 ke internet.

## 4. Node.js 22 dan PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
npm install -g pm2
```

## 5. PostgreSQL database
```bash
systemctl enable --now postgresql
sudo -u postgres psql
```
Di prompt PostgreSQL, buat user dan database dengan password kuat:
```sql
CREATE USER navigasi_user WITH PASSWORD 'GANTI_DENGAN_PASSWORD_KUAT';
CREATE DATABASE navigasi_pro OWNER navigasi_user;
\q
```
Database hanya diakses dari localhost. Uji:
```bash
psql -h 127.0.0.1 -U navigasi_user -d navigasi_pro
```

## 6. Clone repository GitHub
Buat folder:
```bash
mkdir -p /var/www
cd /var/www
```
Clone repo private menggunakan GitHub Deploy Key (disarankan read-only) atau HTTPS token yang hanya memiliki akses repo. Jangan tempel token ke chat atau simpan di URL remote. Contoh SSH:
```bash
git clone git@github.com:USERNAME/navigasi-pro.git
cd /var/www/navigasi-pro
```
Untuk repo private, tambahkan public key server sebagai Deploy Key read-only di Settings → Deploy keys GitHub. Simpan private key hanya di VPS dengan permission `600`.

## 7. Konfigurasi environment
```bash
cp .env.example .env
nano .env
```
Isi nilai sebenarnya:
```env
NODE_ENV=production
PORT=3000
APP_URL=https://domainkamu.com
DATABASE_URL=postgresql://navigasi_user:PASSWORD_URL_ENCODED@127.0.0.1:5432/navigasi_pro
JWT_SECRET=HASIL_RANDOM_MINIMAL_64_KARAKTER
TRUST_PROXY=true
```
Buat JWT secret dengan:
```bash
openssl rand -base64 64
```
Jika password database mengandung karakter khusus (`@`, `:`, `/`, `#`, `%`), URL-encode password tersebut sebelum dimasukkan ke DATABASE_URL. Amankan file:
```bash
chmod 600 .env
```

## 8. Install dependency dan buat schema
```bash
npm ci
npm run db:init
```
Jika belum ada `package-lock.json` di repo (misalnya belum pernah npm install di lokal), jalankan `npm install` sekali, commit `package-lock.json`, lalu gunakan `npm ci` di VPS.

## 9. Buat akun Founder pertama
Jalankan satu kali di shell VPS:
```bash
export FOUNDER_EMAIL='admin@domainkamu.com'
export FOUNDER_PASSWORD='PASSWORD_PANJANG_MINIMAL_14_KARAKTER'
npm run founder:create
unset FOUNDER_PASSWORD
```
Simpan password dengan password manager. Jangan mengirim kredensial login ke orang lain.

## 10. Jalankan dengan PM2
```bash
pm2 start src/server.js --name navigasi-pro
pm2 save
pm2 startup
```
Jalankan perintah `sudo ...` yang dicetak oleh `pm2 startup`, kemudian cek:
```bash
pm2 status
pm2 logs navigasi-pro --lines 50
curl http://127.0.0.1:3000/api/health
```

## 11. Nginx
Salin konfigurasi dan ganti domain:
```bash
nano /etc/nginx/sites-available/navigasi-pro
```
Gunakan isi `deploy/navigasi-pro.nginx`, ganti `domainkamu.com` dengan domain sendiri. Aktifkan:
```bash
ln -s /etc/nginx/sites-available/navigasi-pro /etc/nginx/sites-enabled/navigasi-pro
nginx -t
systemctl reload nginx
```

## 12. HTTPS
Setelah DNS benar dan port 80/443 terbuka:
```bash
certbot --nginx -d domainkamu.com -d www.domainkamu.com
certbot renew --dry-run
```

## 13. Update aplikasi setelah push GitHub
```bash
cd /var/www/navigasi-pro
git pull origin main
npm ci
npm run db:init
pm2 restart navigasi-pro --update-env
```
Jika perubahan hanya pada frontend statis, restart PM2 tidak wajib. Jalankan backup database sebelum perubahan schema besar.

## 14. Backup database manual
```bash
mkdir -p /var/backups/navigasi-pro
pg_dump -h 127.0.0.1 -U navigasi_user -Fc navigasi_pro > /var/backups/navigasi-pro/navigasi-$(date +%F).dump
```
Atur backup otomatis dan salin ke lokasi di luar VPS. Jangan mengandalkan backup pada disk VPS yang sama.

## Troubleshooting
- `Connection refused`: pastikan instance Running, IP/port SSH benar, dan firewall provider mengizinkan port 21100.
- `npm ci` gagal: cek `node -v`, koneksi DNS/internet, dan `package-lock.json`.
- `password authentication failed`: periksa DATABASE_URL dan password role PostgreSQL.
- Nginx 502: periksa `pm2 status`, `pm2 logs`, dan `curl 127.0.0.1:3000/api/health`.
- Certbot gagal: pastikan DNS sudah mengarah ke IP VPS dan port 80 dapat diakses dari internet.
