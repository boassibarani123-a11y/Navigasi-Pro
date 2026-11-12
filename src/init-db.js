require('dotenv').config();
const fs=require('fs');const path=require('path');const {pool}=require('./db');
(async()=>{try{const sql=fs.readFileSync(path.join(__dirname,'..','db','schema.sql'),'utf8');await pool.query(sql);console.log('Database schema berhasil dibuat.');}catch(e){console.error(e);process.exitCode=1;}finally{await pool.end();}})();
