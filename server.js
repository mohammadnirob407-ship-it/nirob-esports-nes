require("dotenv").config();

const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// SESSION SECURITY
if (
  process.env.NODE_ENV === "production" &&
  !process.env.SESSION_SECRET
) {
  throw new Error("SESSION_SECRET is required in production.");
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DATABASE
const db = new Database("nes-fc-mobile.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 role TEXT DEFAULT 'player',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 category TEXT NOT NULL,
 entry_fee REAL DEFAULT 0,
 prize REAL DEFAULT 0,
 slots INTEGER DEFAULT 32,
 status TEXT DEFAULT 'open',
 match_date TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 tournament_id INTEGER NOT NULL,
 fc_id TEXT NOT NULL,
 phone TEXT NOT NULL,
 status TEXT DEFAULT 'pending',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,tournament_id)
);

CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT
);
`);

// DEFAULT SETTINGS
const defaults = {
 site_name: "NIROB E-SPORTS",
 logo_text: "NES",
 home_notice: "Welcome to NIROB E-SPORTS FC Mobile!",
 bkash_number: "",
 nagad_number: "",
 rocket_number: ""
};

for (const [key, value] of Object.entries(defaults)) {
  db.prepare(
    "INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)"
  ).run(key, value);
}

// ADMIN ACCOUNT SETUP
const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
  ? process.env.ADMIN_EMAIL.trim().toLowerCase()
  : "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (ADMIN_NAME && ADMIN_EMAIL && ADMIN_PASSWORD) {
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }

  const existingAdmin = db.prepare(
    "SELECT id, role FROM users WHERE email = ?"
  ).get(ADMIN_EMAIL);

  if (!existingAdmin) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

    db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, 'admin')
    `).run(ADMIN_NAME.trim(), ADMIN_EMAIL, hash);

    console.log("NES Admin account created.");
  } else if (existingAdmin.role === "admin") {
    console.log("NES Admin account already exists.");
  } else {
    console.log(
      "WARNING: Admin email already belongs to a player. Use a different email."
    );
  }
} else {
  console.log("Admin environment variables are missing.");
}

// SESSION
app.use(session({
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: "."
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// API RATE LIMIT
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100
});

app.use("/api", limiter);

// AUTH MIDDLEWARE
function auth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Login required" });
  }
  next();
}

function admin(req, res, next) {
  if (
    !req.session.user ||
    req.session.user.role !== "admin"
  ) {
    return res.status(403).json({
      error: "Admin access required"
    });
  }
  next();
}

// SETTINGS HELPER
function getSettings() {
  return Object.fromEntries(
    db.prepare("SELECT key,value FROM settings")
      .all()
      .map(x => [x.key, x.value])
  );
}

// PLAYER REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      password.length < 8
    ) {
      return res.status(400).json({
        error: "Name, email and password (8+ characters) required"
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    const hash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO users (name,email,password)
      VALUES (?,?,?)
    `).run(cleanName, cleanEmail, hash);

    req.session.user = {
      id: Number(result.lastInsertRowid),
      name: cleanName,
      email: cleanEmail,
      role: "player"
    };

    req.session.save(err => {
      if (err) {
        return res.status(500).json({
          error: "Session error"
        });
      }

      res.json({ user: req.session.user });
    });

  } catch (e) {
    res.status(400).json({
      error: "Email already registered or invalid information"
    });
  }
});

// PLAYER AND ADMIN LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();

  const user = db.prepare(
    "SELECT * FROM users WHERE email=?"
  ).get(cleanEmail);

  if (
    !user ||
    !(await bcrypt.compare(password || "", user.password))
  ) {
    return res.status(401).json({
      error: "Incorrect email or password"
    });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  req.session.save(err => {
    if (err) {
      return res.status(500).json({
        error: "Session error"
      });
    }

    res.json({ user: req.session.user });
  });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// CURRENT USER
app.get("/api/me", (req, res) => {
  res.json({
    user: req.session.user || null,
    settings: getSettings()
  });
});

// ALL TOURNAMENTS
app.get("/api/tournaments", (req, res) => {
  const tournaments = db.prepare(
    "SELECT * FROM tournaments ORDER BY id DESC"
  ).all();

  res.json(tournaments);
});

// JOIN TOURNAMENT
app.post("/api/tournaments/:id/join", auth, (req, res) => {
  const { fc_id, phone } = req.body;

  if (!fc_id || !phone) {
    return res.status(400).json({
      error: "FC Mobile ID and phone required"
    });
  }

  const tournament = db.prepare(`
    SELECT * FROM tournaments
    WHERE id=? AND status='open'
  `).get(req.params.id);

  if (!tournament) {
    return res.status(404).json({
      error: "Tournament unavailable"
    });
  }

  try {
    db.prepare(`
      INSERT INTO registrations
      (user_id,tournament_id,fc_id,phone)
      VALUES (?,?,?,?)
    `).run(
      req.session.user.id,
      tournament.id,
      String(fc_id).trim(),
      String(phone).trim()
    );

    res.json({
      success: true,
      message: "Tournament registration submitted"
    });

  } catch (e) {
    res.status(400).json({
      error: "Already registered or invalid registration"
    });
  }
});

// MY REGISTRATIONS
app.get("/api/my-registrations", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*,t.title,t.category,t.entry_fee,t.prize
    FROM registrations r
    JOIN tournaments t ON t.id=r.tournament_id
    WHERE r.user_id=?
    ORDER BY r.id DESC
  `).all(req.session.user.id);

  res.json(rows);
});

// ADMIN: ALL REGISTRATIONS
app.get("/api/admin/registrations", admin, (req, res) => {
  res.json(db.prepare(`
    SELECT r.*,u.name,u.email,t.title
    FROM registrations r
    JOIN users u ON u.id=r.user_id
    JOIN tournaments t ON t.id=r.tournament_id
    ORDER BY r.id DESC
  `).all());
});

// ADMIN: CREATE TOURNAMENT
app.post("/api/admin/tournaments", admin, (req, res) => {
  const {
    title,
    category,
    entry_fee,
    prize,
    slots,
    match_date
  } = req.body;

  if (
    !title ||
    !["FC MOBILE 1V1", "FC MOBILE 2V2"].includes(category)
  ) {
    return res.status(400).json({
      error: "Invalid tournament details"
    });
  }

  const result = db.prepare(`
    INSERT INTO tournaments
    (title,category,entry_fee,prize,slots,match_date)
    VALUES (?,?,?,?,?,?)
  `).run(
    String(title).trim(),
    category,
    Math.max(0, Number(entry_fee) || 0),
    Math.max(0, Number(prize) || 0),
    Math.max(1, Number(slots) || 32),
    match_date || null
  );

  res.json({
    success: true,
    id: result.lastInsertRowid
  });
});

// ADMIN: DELETE TOURNAMENT
app.delete("/api/admin/tournaments/:id", admin, (req, res) => {
  db.prepare(
    "DELETE FROM tournaments WHERE id=?"
  ).run(req.params.id);

  res.json({ success: true });
});

// ADMIN: APPROVE OR REJECT REGISTRATION
app.patch("/api/admin/registrations/:id", admin, (req, res) => {
  const { status } = req.body;

  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({
      error: "Invalid status"
    });
  }

  db.prepare(
    "UPDATE registrations SET status=? WHERE id=?"
  ).run(status, req.params.id);

  res.json({ success: true });
});

// ADMIN: GET SETTINGS
app.get("/api/admin/settings", admin, (req, res) => {
  res.json(getSettings());
});

// ADMIN: UPDATE SETTINGS
app.put("/api/admin/settings", admin, (req, res) => {
  const allowed = [
    "site_name",
    "logo_text",
    "home_notice",
    "bkash_number",
    "nagad_number",
    "rocket_number"
  ];

  const update = db.prepare(`
    INSERT OR REPLACE INTO settings (key,value)
    VALUES (?,?)
  `);

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update.run(key, String(req.body[key]));
    }
  }

  res.json({ success: true });
});

// FRONTEND
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});
// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log("NES FC Mobile server running on port " + PORT);
});
