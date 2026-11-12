require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, query } = require('./db');
const { tokenFor, auth, founderOnly, ownerOnly, hashCode, makeActivationCode } = require('./security');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48) throw new Error('JWT_SECRET wajib diisi dengan minimal 48 karakter acak.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum dikonfigurasi.');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/activate', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false }));
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = s => String(s || '').trim();
const validSlug = s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;
const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } };

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Navigasi Pro', version: '2.0.0' }));

// Founder bootstrap: set FOUNDER_EMAIL and FOUNDER_PASSWORD, then run npm run founder:create once.
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = clean(req.body.email).toLowerCase(); const password = String(req.body.password || '');
  const r = await query('SELECT id,email,password_hash,role FROM users WHERE email=$1', [email]);
  if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash))) return res.status(401).json({ error: 'Email atau password salah.' });
  const u = r.rows[0]; res.json({ token: tokenFor(u), user: { id: u.id, email: u.email, role: u.role } });
}));
app.get('/api/me', auth, asyncRoute(async (req,res) => { const r=await query('SELECT id,email,role FROM users WHERE id=$1',[req.user.sub]); if(!r.rowCount) return res.status(401).json({error:'Akun tidak ditemukan.'}); res.json({user:r.rows[0]}); }));

app.post('/api/activate', asyncRoute(async (req,res) => {
  const code=clean(req.body.code).toUpperCase(); const email=clean(req.body.email).toLowerCase(); const password=String(req.body.password||'');
  const businessName=clean(req.body.businessName); const slug=clean(req.body.slug).toLowerCase();
  if(!/^NP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code)) return res.status(400).json({error:'Format kode aktivasi tidak valid.'});
  if(!/^\S+@\S+\.\S+$/.test(email) || password.length<10 || !businessName || !validSlug(slug)) return res.status(400).json({error:'Lengkapi email, password minimal 10 karakter, nama bisnis, dan slug URL yang valid.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const card=await client.query("SELECT id FROM nfc_cards WHERE activation_hash=$1 AND status='available' FOR UPDATE",[hashCode(code)]);
    if(!card.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({error:'Kode tidak ditemukan, sudah digunakan, atau kartu tidak tersedia.'}); }
    const exists=await client.query('SELECT 1 FROM users WHERE email=$1',[email]);
    if(exists.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({error:'Email sudah terdaftar. Gunakan email lain atau login.'}); }
    const userId=(await client.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'owner') RETURNING id",[email,await bcrypt.hash(password,12)])).rows[0].id;
    const business=(await client.query('INSERT INTO businesses(owner_id,business_name,slug) VALUES($1,$2,$3) RETURNING id,slug',[userId,businessName,slug])).rows[0];
    await client.query("UPDATE nfc_cards SET status='activated',owner_id=$1,business_id=$2,activated_at=NOW(),activation_hash=NULL WHERE id=$3",[userId,business.id,card.rows[0].id]);
    await client.query('INSERT INTO audit_logs(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[userId,'card.activated',card.rows[0].id,{businessName,slug}]);
    await client.query('COMMIT');
    const user={id:userId,email,role:'owner'}; res.status(201).json({token:tokenFor(user),user,business,landingUrl:`${process.env.APP_URL}/p/${slug}`});
  } catch(e) { await client.query('ROLLBACK'); if(e.code==='23505') return res.status(409).json({error:'Email atau alamat landing page sudah digunakan.'}); throw e; }
  finally { client.release(); }
}));

app.get('/api/founder/summary',auth,founderOnly,asyncRoute(async(req,res)=>{
 const [cards,owners,views,clicks]=await Promise.all([
  query("SELECT status,COUNT(*)::int AS count FROM nfc_cards GROUP BY status"),
  query("SELECT COUNT(*)::int AS count FROM users WHERE role='owner'"),
  query("SELECT COUNT(*)::int AS count FROM analytics_events WHERE event_type='view'"),
  query("SELECT COUNT(*)::int AS count FROM analytics_events WHERE event_type='click'")
 ]); res.json({cards:cards.rows,owners:owners.rows[0].count,views:views.rows[0].count,clicks:clicks.rows[0].count});
}));
app.get('/api/founder/cards',auth,founderOnly,asyncRoute(async(req,res)=>{const r=await query('SELECT c.id,c.serial_code,c.status,c.created_at,c.activated_at,u.email,b.business_name FROM nfc_cards c LEFT JOIN users u ON u.id=c.owner_id LEFT JOIN businesses b ON b.id=c.business_id ORDER BY c.created_at DESC');res.json({cards:r.rows});}));
app.post('/api/founder/cards',auth,founderOnly,asyncRoute(async(req,res)=>{
 const count=Math.min(Math.max(parseInt(req.body.count,10)||1,1),100); const cards=[];
 for(let i=0;i<count;i++){let code,serial;let tries=0;do{code=makeActivationCode();serial='NP-CARD-'+require('crypto').randomBytes(4).toString('hex').toUpperCase();tries++;}while(tries<5&&(await query('SELECT 1 FROM nfc_cards WHERE serial_code=$1 OR activation_hash=$2',[serial,hashCode(code)])).rowCount);
 const r=await query('INSERT INTO nfc_cards(serial_code,activation_hash) VALUES($1,$2) RETURNING id,serial_code,status',[serial,hashCode(code)]);cards.push({...r.rows[0],activationCode:code}); }
 await query('INSERT INTO audit_logs(actor_id,action,details) VALUES($1,$2,$3)',[req.user.sub,'cards.generated',{count}]);res.status(201).json({cards,warning:'Simpan kode sekarang. Kode aktivasi hanya ditampilkan sekali.'});
}));
app.patch('/api/founder/cards/:id/status',auth,founderOnly,asyncRoute(async(req,res)=>{const status=req.body.status;if(!['available','suspended','activated'].includes(status))return res.status(400).json({error:'Status tidak valid.'});const r=await query('UPDATE nfc_cards SET status=$1 WHERE id=$2 RETURNING id,status',[status,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Kartu tidak ditemukan.'});res.json({card:r.rows[0]});}));
app.get('/api/founder/owners',auth,founderOnly,asyncRoute(async(req,res)=>{const r=await query("SELECT u.id,u.email,u.created_at,b.business_name,b.slug,c.serial_code,c.status FROM users u LEFT JOIN businesses b ON b.owner_id=u.id LEFT JOIN nfc_cards c ON c.owner_id=u.id WHERE u.role='owner' ORDER BY u.created_at DESC");res.json({owners:r.rows});}));

app.get('/api/owner/profile',auth,ownerOnly,asyncRoute(async(req,res)=>{const r=await query('SELECT b.*,c.serial_code,c.status FROM businesses b LEFT JOIN nfc_cards c ON c.business_id=b.id WHERE b.owner_id=$1',[req.user.sub]);if(!r.rowCount)return res.status(404).json({error:'Profil bisnis tidak ditemukan.'});const links=await query('SELECT id,platform,label,url,sort_order FROM social_links WHERE business_id=$1 ORDER BY sort_order,id',[r.rows[0].id]);res.json({business:r.rows[0],links:links.rows,landingUrl:`${process.env.APP_URL}/p/${r.rows[0].slug}`});}));
app.put('/api/owner/profile',auth,ownerOnly,asyncRoute(async(req,res)=>{
 const name=clean(req.body.businessName),desc=clean(req.body.description),logo=clean(req.body.logoUrl),cover=clean(req.body.coverUrl),slug=clean(req.body.slug).toLowerCase();
 if(!name||!validSlug(slug))return res.status(400).json({error:'Nama bisnis dan slug URL wajib valid.'});if(logo&&!safeUrl(logo)||cover&&!safeUrl(cover))return res.status(400).json({error:'URL gambar harus menggunakan HTTP atau HTTPS.'});
 const r=await query('UPDATE businesses SET business_name=$1,description=$2,logo_url=$3,cover_url=$4,slug=$5 WHERE owner_id=$6 RETURNING *',[name,desc,logo,cover,slug,req.user.sub]);res.json({business:r.rows[0],landingUrl:`${process.env.APP_URL}/p/${slug}`});
}));
app.put('/api/owner/links',auth,ownerOnly,asyncRoute(async(req,res)=>{
 if(!Array.isArray(req.body.links)||req.body.links.length>30)return res.status(400).json({error:'Maksimal 30 link.'});const b=await query('SELECT id FROM businesses WHERE owner_id=$1',[req.user.sub]);if(!b.rowCount)return res.status(404).json({error:'Bisnis tidak ditemukan.'});
 const normalized=[];for(let i=0;i<req.body.links.length;i++){const l=req.body.links[i],url=safeUrl(l.url);if(!url||!clean(l.platform)||!clean(l.label))return res.status(400).json({error:`Link nomor ${i+1} tidak valid.`});normalized.push({platform:clean(l.platform).slice(0,40),label:clean(l.label).slice(0,80),url,sort_order:i});}
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('DELETE FROM social_links WHERE business_id=$1',[b.rows[0].id]);for(const l of normalized)await client.query('INSERT INTO social_links(business_id,platform,label,url,sort_order) VALUES($1,$2,$3,$4,$5)',[b.rows[0].id,l.platform,l.label,l.url,l.sort_order]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}res.json({saved:normalized.length});
}));
app.get('/api/owner/analytics',auth,ownerOnly,asyncRoute(async(req,res)=>{const b=await query('SELECT id FROM businesses WHERE owner_id=$1',[req.user.sub]);if(!b.rowCount)return res.status(404).json({error:'Bisnis tidak ditemukan.'});const r=await query("SELECT event_type,COUNT(*)::int AS count FROM analytics_events WHERE business_id=$1 AND created_at>=NOW()-INTERVAL '30 days' GROUP BY event_type",[b.rows[0].id]);res.json({last30Days:r.rows});}));

app.get('/api/public/:slug',asyncRoute(async(req,res)=>{const b=await query('SELECT id,business_name,slug,description,logo_url,cover_url,theme FROM businesses WHERE slug=$1 AND published=true',[req.params.slug]);if(!b.rowCount)return res.status(404).json({error:'Halaman bisnis tidak ditemukan.'});const links=await query('SELECT id,platform,label,url FROM social_links WHERE business_id=$1 ORDER BY sort_order,id',[b.rows[0].id]);await query("INSERT INTO analytics_events(business_id,event_type) VALUES($1,'view')",[b.rows[0].id]);res.json({business:b.rows[0],links:links.rows});}));
app.post('/api/public/:slug/click/:linkId',asyncRoute(async(req,res)=>{const b=await query('SELECT id FROM businesses WHERE slug=$1 AND published=true',[req.params.slug]);if(!b.rowCount)return res.status(404).json({error:'Tidak ditemukan.'});await query("INSERT INTO analytics_events(business_id,event_type,link_id) SELECT $1,'click',id FROM social_links WHERE id=$2 AND business_id=$1",[b.rows[0].id,req.params.linkId]);res.json({ok:true});}));

app.use(express.static(path.join(__dirname,'..','public')));
app.get('/p/:slug',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:process.env.NODE_ENV==='production'?'Terjadi kesalahan server.':'Internal server error',detail:process.env.NODE_ENV==='production'?undefined:err.message});});
const server=app.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log(`Navigasi Pro berjalan di port ${process.env.PORT||3000}`));
process.on('SIGTERM',()=>server.close(()=>pool.end()));
