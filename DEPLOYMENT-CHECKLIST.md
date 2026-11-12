# Checklist deployment Navigasi Pro

- [ ] Source code diperiksa dan tidak ada `.env`, credential, token, atau private key
- [ ] GitHub repository diset Private
- [ ] VPS instance yang benar status Running/Active
- [ ] DNS A record domain sudah mengarah ke IPv4 VPS
- [ ] SSH custom port 21100 dapat diakses
- [ ] Firewall mengizinkan SSH custom port, HTTP 80, HTTPS 443
- [ ] PostgreSQL hanya listen pada localhost
- [ ] `.env` production dibuat di VPS dan permission 600
- [ ] Schema database berhasil dibuat
- [ ] Founder account dibuat dan password disimpan aman
- [ ] PM2 service aktif dan health endpoint merespons
- [ ] Nginx config lolos `nginx -t`
- [ ] HTTPS aktif dan auto-renew diuji
- [ ] Uji alur generate kode → aktivasi → login owner → edit link → buka landing page
- [ ] Uji NFC memakai URL publik dan QR unik
- [ ] Backup database terenkripsi disimpan di luar VPS
- [ ] Uji keamanan, rate limits, akses lintas owner, dan pemulihan backup
