require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "nes.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player',
 photo_url TEXT DEFAULT '', ff_uid TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS matches (
 id INTEGER PRIMARY KEY AUTOINCREMENT, match_no TEXT UNIQUE, title TEXT NOT NULL,
 category TEXT NOT NULL, match_date TEXT NOT NULL, entry_type TEXT NOT NULL,
 entry_fee INTEGER NOT NULL DEFAULT 0, prize_pool INTEGER NOT NULL DEFAULT 0,
 per_kill INTEGER NOT NULL DEFAULT 0, map_name TEXT DEFAULT 'Bermuda',
 version TEXT DEFAULT 'Mobile', player_limit INTEGER NOT NULL DEFAULT 48,
 room_id TEXT DEFAULT '', room_password TEXT DEFAULT '', rules TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 match_id INTEGER NOT NULL REFERENCES matches(id), ff_name TEXT NOT NULL, ff_uid TEXT NOT NULL,
 team_name TEXT DEFAULT '', payment_method TEXT NOT NULL, transaction_id TEXT NOT NULL,
 payment_status TEXT NOT NULL DEFAULT 'pending', joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, match_id)
);
CREATE TABLE IF NOT EXISTS results (
 id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER NOT NULL REFERENCES matches(id),
 user_id INTEGER REFERENCES users(id), player_name TEXT NOT NULL, position INTEGER NOT NULL,
 kills INTEGER DEFAULT 0, prize INTEGER DEFAULT 0, note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, image_url TEXT DEFAULT '', link_url TEXT DEFAULT '', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const defaults = {
 site_name: "NIROB E-SPORTS", logo_text: "NES", telegram_url: "https://t.me/",
 bkash_number: "", nagad_number: "", rocket_number: "", upay_number: "",
 home_notice: "Welcome to NIROB E-SPORTS — Play fair, win big!"
};
const putSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
Object.entries(defaults).forEach(([k,v]) => putSetting.run(k,v));

const ownerEmail = (process.env.OWNER_EMAIL || "owner@example.com").toLowerCase();
const ownerPassword = process.env.OWNER_PASSWORD || "ChangeThisOwnerPassword123!";
if (!db.prepare("SELECT id FROM users WHERE email=?").get(ownerEmail)) {
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run(process.env.OWNER_NAME || "NES Owner", ownerEmail, bcrypt.hashSync(ownerPassword, 12), "owner");
}

if (db.prepare("SELECT COUNT(*) n FROM matches").get().n === 0) {
  const add = db.prepare(`INSERT INTO matches(match_no,title,category,match_date,entry_type,entry_fee,prize_pool,per_kill,map_name,version,player_limit,rules)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  [
    ["NES-1001","BR Solo | Mobile | Regular","BR SOLO",new Date(now+86400000).toISOString(),"Solo",20,800,10,"Bermuda","Mobile",48,"No hacks, scripts or teaming. Join the room on time. Admin decision is final."],
    ["NES-1002","BR Duo | Mobile | Regular","BR DUO",new Date(now+90000000).toISOString(),"Duo",30,1200,10,"Bermuda","Mobile",48,"Both players must use registered details. No hacks or abusive behavior."],
    ["NES-1003","Clash Squad | Mobile","CLASH SQUAD",new Date(now+172800000).toISOString(),"Squad",40,2000,0,"Bermuda","Mobile",32,"Team members must be registered. No emulator unless the event allows it."]
  ].forEach(x=>add.run(...x));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir, table: "sessions" }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret-before-deploying",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd || process.env.COOKIE_SECURE === "true", maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15*60*1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const safeUser = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, photo_url:u.photo_url, ff_uid:u.ff_uid });
function requireAuth(req,res,next){ if(!req.session.userId) return res.status(401).json({error:"Please login first."}); next(); }
function requireOwner(req,res,next){
  if(!req.session.userId) return res.status(401).json({error:"Login required."});
  const u=db.prepare("SELECT role FROM users WHERE id=?").get(req.session.userId);
  if(!u || u.role!=="owner") return res.status(403).json({error:"Owner access only."});
  next();
}
function getSettings(){ return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value])); }
function matchView(m){
 const joined=db.prepare("SELECT COUNT(*) n FROM registrations WHERE match_id=? AND payment_status!='rejected'").get(m.id).n;
 return {...m, joined, remaining:Math.max(0,m.player_limit-joined)};
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"NES"}));
app.get("/api/me",(req,res)=>{
 const u=req.session.userId && db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
 res.json({user:u?safeUser(u):null,settings:getSettings()});
});
app.post("/api/register",authLimiter,async(req,res)=>{
 const {name,email,password}=req.body||{};
 if(!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length<10)
   return res.status(400).json({error:"Name, valid email and password (at least 10 characters) are required."});
 try {
  const hash=await bcrypt.hash(password,12);
  const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name.trim().slice(0,60),email.toLowerCase(),hash);
  req.session.userId=info.lastInsertRowid;
  res.json({user:safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid))});
 } catch(e){ res.status(409).json({error:"This email may already be registered."}); }
});
app.post("/api/login",authLimiter,async(req,res)=>{
 const {email,password}=req.body||{};
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").toLowerCase());
 if(!u || !(await bcrypt.compare(password||"",u.password_hash))) return res.status(401).json({error:"Incorrect email or password."});
 req.session.userId = u.id;
 });

req.session.save((err) => {
  if (err) {
    return res.status(500).json({error: "Login session save failed."});
  }
  res.json({user: safeUser(u)});
});
app.post("/api/logout",requireAuth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/banners",(req,res)=>res.json(db.prepare("SELECT * FROM banners WHERE active=1 ORDER BY id DESC").all()));
app.get("/api/notices",(req,res)=>res.json(db.prepare("SELECT * FROM notices WHERE active=1 ORDER BY id DESC LIMIT 10").all()));
app.get("/api/categories",(req,res)=>res.json(["BR RANK","CS RANK","BR SOLO","BR DUO","BR SQUAD","CLASH SQUAD","LONE WOLF","CS 2 VS 2"]));
app.get("/api/matches",(req,res)=>{
 const {category}=req.query; let rows;
 if(category) rows=db.prepare("SELECT * FROM matches WHERE category=? AND status='open' ORDER BY match_date").all(category);
 else rows=db.prepare("SELECT * FROM matches WHERE status='open' ORDER BY match_date").all();
 res.json(rows.map(matchView));
});
app.get("/api/matches/:id",(req,res)=>{
 const m=db.prepare("SELECT * FROM matches WHERE id=?").get(req.params.id);
 if(!m) return res.status(404).json({error:"Match not found."});
 const out=matchView(m);
 if(!req.session.userId){out.room_id="";out.room_password="";}
 else {
  const r=db.prepare("SELECT payment_status FROM registrations WHERE user_id=? AND match_id=?").get(req.session.userId,m.id);
  if(!r || r.payment_status!=="approved"){out.room_id="";out.room_password="";}
 }
 res.json(out);
});
app.post("/api/matches/:id/join",requireAuth,(req,res)=>{
 const m=db.prepare("SELECT * FROM matches WHERE id=? AND status='open'").get(req.params.id);
 if(!m) return res.status(404).json({error:"Match is unavailable."});
 const count=db.prepare("SELECT COUNT(*) n FROM registrations WHERE match_id=? AND payment_status!='rejected'").get(m.id).n;
 if(count>=m.player_limit) return res.status(409).json({error:"This match is full."});
 const {ff_name,ff_uid,team_name,payment_method,transaction_id,accepted_rules}=req.body||{};
 if(!accepted_rules) return res.status(400).json({error:"Please accept tournament rules first."});
 if(!ff_name || !ff_uid || !payment_method || !transaction_id) return res.status(400).json({error:"Complete all required registration fields."});
 if(!["bKash","Nagad","Rocket","Upay"].includes(payment_method)) return res.status(400).json({error:"Invalid payment method."});
 if(String(transaction_id).trim().length<4) return res.status(400).json({error:"Enter a valid transaction ID."});
 try{
  db.prepare(`INSERT INTO registrations(user_id,match_id,ff_name,ff_uid,team_name,payment_method,transaction_id)
   VALUES(?,?,?,?,?,?,?)`).run(req.session.userId,m.id,String(ff_name).slice(0,60),String(ff_uid).slice(0,30),String(team_name||"").slice(0,60),payment_method,String(transaction_id).trim().slice(0,80));
  res.json({ok:true,message:"Registration submitted. Payment is pending admin verification."});
 }catch(e){res.status(409).json({error:"You have already registered for this match."});}
});
app.get("/api/my-matches",requireAuth,(req,res)=>{
 res.json(db.prepare(`SELECT r.*,m.match_no,m.title,m.category,m.match_date,m.entry_fee,m.map_name,m.room_id,m.room_password,m.status
 FROM registrations r JOIN matches m ON m.id=r.match_id WHERE r.user_id=? ORDER BY r.joined_at DESC`).all(req.session.userId));
});
app.get("/api/results",(req,res)=>res.json(db.prepare(`SELECT x.*,m.title,m.match_no FROM results x JOIN matches m ON m.id=x.match_id ORDER BY m.match_date DESC,x.position ASC`).all()));
app.get("/api/profile",requireAuth,(req,res)=>res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId))));
app.patch("/api/profile",requireAuth,(req,res)=>{
 const {name,ff_uid,photo_url}=req.body||{};
 db.prepare("UPDATE users SET name=?,ff_uid=?,photo_url=? WHERE id=?")
 .run(String(name||"").trim().slice(0,60),String(ff_uid||"").slice(0,30),String(photo_url||"").slice(0,500),req.session.userId);
 res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId)));
});

/* Owner API */
app.get("/api/admin/overview",requireOwner,(req,res)=>res.json({
 users:db.prepare("SELECT COUNT(*) n FROM users WHERE role='player'").get().n,
 matches:db.prepare("SELECT COUNT(*) n FROM matches").get().n,
 registrations:db.prepare("SELECT COUNT(*) n FROM registrations").get().n,
 pending:db.prepare("SELECT COUNT(*) n FROM registrations WHERE payment_status='pending'").get().n
}));
app.get("/api/admin/matches",requireOwner,(req,res)=>res.json(db.prepare("SELECT * FROM matches ORDER BY match_date DESC").all().map(matchView)));
app.post("/api/admin/matches",requireOwner,(req,res)=>{
 const b=req.body||{};
 if(!b.title||!b.category||!b.match_date) return res.status(400).json({error:"Title, category and date are required."});
 const no=b.match_no||("NES-"+Date.now().toString().slice(-7));
 const info=db.prepare(`INSERT INTO matches(match_no,title,category,match_date,entry_type,entry_fee,prize_pool,per_kill,map_name,version,player_limit,rules,status)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(no,b.title,b.category,b.match_date,b.entry_type||"Solo",Number(b.entry_fee||0),Number(b.prize_pool||0),Number(b.per_kill||0),b.map_name||"Bermuda",b.version||"Mobile",Number(b.player_limit||48),b.rules||"",b.status||"open");
 res.json({id:info.lastInsertRowid});
});
app.put("/api/admin/matches/:id",requireOwner,(req,res)=>{
 const b=req.body||{};
 const fields=["match_no","title","category","match_date","entry_type","entry_fee","prize_pool","per_kill","map_name","version","player_limit","room_id","room_password","rules","status"];
 const sets=fields.filter(k=>b[k]!==undefined);
 if(!sets.length) return res.json({ok:true});
 db.prepare("UPDATE matches SET "+sets.map(k=>k+"=?").join(",")+" WHERE id=?").run(...sets.map(k=>b[k]),req.params.id);
 res.json({ok:true});
});
app.delete("/api/admin/matches/:id",requireOwner,(req,res)=>{
 db.prepare("DELETE FROM results WHERE match_id=?").run(req.params.id);
 db.prepare("DELETE FROM registrations WHERE match_id=?").run(req.params.id);
 db.prepare("DELETE FROM matches WHERE id=?").run(req.params.id); res.json({ok:true});
});
app.get("/api/admin/registrations",requireOwner,(req,res)=>res.json(db.prepare(`SELECT r.*,u.name AS account_name,u.email,m.match_no,m.title FROM registrations r JOIN users u ON u.id=r.user_id JOIN matches m ON m.id=r.match_id ORDER BY r.joined_at DESC`).all()));
app.patch("/api/admin/registrations/:id",requireOwner,(req,res)=>{
 const s=req.body.payment_status;
 if(!["pending","approved","rejected"].includes(s)) return res.status(400).json({error:"Invalid payment status."});
 db.prepare("UPDATE registrations SET payment_status=? WHERE id=?").run(s,req.params.id); res.json({ok:true});
});
app.post("/api/admin/results",requireOwner,(req,res)=>{
 const b=req.body||{};
 if(!b.match_id||!b.player_name||!Number(b.position)) return res.status(400).json({error:"Match, player name and position are required."});
 db.prepare("INSERT INTO results(match_id,user_id,player_name,position,kills,prize,note) VALUES(?,?,?,?,?,?,?)")
 .run(b.match_id,b.user_id||null,b.player_name,Number(b.position),Number(b.kills||0),Number(b.prize||0),b.note||"");
 res.json({ok:true});
});
app.delete("/api/admin/results/:id",requireOwner,(req,res)=>{db.prepare("DELETE FROM results WHERE id=?").run(req.params.id);res.json({ok:true});});
app.get("/api/admin/settings",requireOwner,(req,res)=>res.json(getSettings()));
app.put("/api/admin/settings",requireOwner,(req,res)=>{
 const allowed=["site_name","logo_text","telegram_url","bkash_number","nagad_number","rocket_number","upay_number","home_notice"];
 const stmt=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 Object.entries(req.body||{}).forEach(([k,v])=>{if(allowed.includes(k))stmt.run(k,String(v).slice(0,500));});
 res.json(getSettings());
});
app.post("/api/admin/banners",requireOwner,(req,res)=>{
 const b=req.body||{}; if(!b.title) return res.status(400).json({error:"Banner title required."});
 db.prepare("INSERT INTO banners(title,image_url,link_url,active) VALUES(?,?,?,1)").run(b.title,b.image_url||"",b.link_url||"");res.json({ok:true});
});
app.delete("/api/admin/banners/:id",requireOwner,(req,res)=>{db.prepare("DELETE FROM banners WHERE id=?").run(req.params.id);res.json({ok:true});});
app.post("/api/admin/notices",requireOwner,(req,res)=>{
 const b=req.body||{};if(!b.title||!b.body)return res.status(400).json({error:"Title and notice text required."});
 db.prepare("INSERT INTO notices(title,body,active) VALUES(?,?,1)").run(b.title,b.body);res.json({ok:true});
});
app.delete("/api/admin/notices/:id",requireOwner,(req,res)=>{db.prepare("DELETE FROM notices WHERE id=?").run(req.params.id);res.json({ok:true});});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`NES running on http://localhost:${PORT}`));
