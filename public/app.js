const app = document.getElementById("app");

const state = {
  user: null,
  settings: {},
  tournaments: [],
  registrations: [],
  page: "home",
  authMode: "login",
  adminTab: "tournaments"
};

const $ = (selector) => document.querySelector(selector);

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

function money(value) {
  return "৳" + Number(value || 0).toLocaleString("en-BD");
}

function notice(message, error = false) {
  const old = $("#toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;z-index:9999;top:18px;left:50%;
    transform:translateX(-50%);padding:13px 20px;
    border-radius:10px;background:${error ? "#a62938" : "#087b50"};
    color:white;font-weight:bold;max-width:90%;text-align:center;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function init() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    state.settings = data.settings || {};
    await loadTournaments();
    render();
  } catch (error) {
    app.innerHTML = `<main><div class="card">Website loading failed. Please refresh.</div></main>`;
  }
}

async function loadTournaments() {
  state.tournaments = await api("/api/tournaments");
}

function header() {
  return `
    <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <a href="#" onclick="go('home');return false;" class="logo">
        ⚽ ${esc(state.settings.logo_text || "NES")}
        <small style="display:block;font-size:12px;color:white">
          ${esc(state.settings.site_name || "NIROB E-SPORTS")}
        </small>
      </a>
      <nav style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="secondary" onclick="go('home')">Home</button>
        <button class="secondary" onclick="go('tournaments')">Tournaments</button>
        ${state.user ? `
          <button class="secondary" onclick="go('dashboard')">My Account</button>
          ${state.user.role === "admin" ? `<button class="secondary" onclick="go('admin')">Admin</button>` : ""}
          <button class="btn" onclick="logout()">Logout</button>
        ` : `
          <button class="secondary" onclick="go('login')">Login</button>
          <button class="btn" onclick="go('register')">Join Now</button>
        `}
      </nav>
    </header>
  `;
}

function footer() {
  return `
    <footer>
      <h3 style="color:#16e58b">NIROB E-SPORTS</h3>
      <p>FC Mobile Tournament Community</p>
      <p style="margin-top:8px">Play Fair • Compete • Win</p>
      <small>© ${new Date().getFullYear()} NIROB E-SPORTS. All rights reserved.</small>
    </footer>
  `;
}

function homePage() {
  return `
    <main>
      <section class="hero">
        <div style="font-size:45px">⚽ 🏆</div>
        <p style="color:#16e58b;font-weight:bold">WELCOME TO NES</p>
        <h1>YOUR GAME.<br>YOUR GLORY.</h1>
        <p>Join FC Mobile tournaments and compete with the best players.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
          <button class="btn" onclick="go('tournaments')">Explore Tournaments →</button>
          ${state.user ? "" : `<button class="secondary" onclick="go('register')">Create Account</button>`}
        </div>
      </section>

      <div class="notice">
        📢 ${esc(state.settings.home_notice || "Welcome to NIROB E-SPORTS!")}
      </div>

      <section>
        <h2 style="margin-bottom:15px">⚡ Choose Your Mode</h2>
        <div class="category-grid">
          <button class="category" onclick="filterCategory('FC MOBILE 1V1')">
            <div class="cat-icon">⚽</div>
            <strong>FC MOBILE 1V1</strong>
            <small>One versus one</small>
          </button>
          <button class="category" onclick="filterCategory('FC MOBILE 2V2')">
            <div class="cat-icon">🏆</div>
            <strong>FC MOBILE 2V2</strong>
            <small>Team versus team</small>
          </button>
        </div>
      </section>

      <section>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:15px">
          <h2>🔥 Latest Tournaments</h2>
          <button class="secondary" onclick="go('tournaments')">View All</button>
        </div>
        ${tournamentCards(state.tournaments.slice(0,3))}
      </section>
    </main>
  `;
}

function tournamentCards(items) {
  if (!items.length) {
    return `<div class="card text-center">
      <div style="font-size:35px">🏟️</div>
      <h3>No tournaments yet</h3>
      <p class="text-muted">New tournaments will appear here.</p>
    </div>`;
  }

  return items.map(t => `
    <article class="tournament-card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span class="badge">${esc(t.category)}</span>
        <span class="status">${esc(t.status)}</span>
      </div>
      <h2 style="margin-top:12px">${esc(t.title)}</h2>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:15px 0">
        <div><small class="text-muted">Entry Fee</small><h3>${money(t.entry_fee)}</h3></div>
        <div><small class="text-muted">Prize Pool</small><h3 style="color:#16e58b">${money(t.prize)}</h3></div>
        <div><small class="text-muted">Slots</small><h3>${esc(t.slots)}</h3></div>
        <div><small class="text-muted">Match Date</small><h3>${esc(t.match_date || "To be announced")}</h3></div>
      </div>
      <button class="btn" onclick="joinTournament(${Number(t.id)})">Join Tournament →</button>
    </article>
  `).join("");
}

function tournamentsPage() {
  return `
    <main>
      <h1>🏆 Tournaments</h1>
      <p class="text-muted" style="margin:8px 0 20px">Find your next FC Mobile competition.</p>
      <div class="category-grid" style="margin-bottom:20px">
        <button class="category" onclick="filterCategory('FC MOBILE 1V1')">
          <div class="cat-icon">⚽</div><strong>1V1</strong>
        </button>
        <button class="category" onclick="filterCategory('FC MOBILE 2V2')">
          <div class="cat-icon">🏆</div><strong>2V2</strong>
        </button>
      </div>
      ${tournamentCards(state.tournaments)}
    </main>
  `;
}

function authPage() {
  const register = state.authMode === "register";

  return `
    <main style="max-width:480px">
      <div class="card">
        <div class="text-center" style="margin-bottom:20px">
          <div style="font-size:48px">⚽</div>
          <h1>${register ? "Create Account" : "Welcome Back"}</h1>
          <p class="text-muted">NIROB E-SPORTS FC Mobile</p>
        </div>

        <form id="authForm">
          ${register ? `
            <label>Full Name</label>
            <input name="name" placeholder="Enter your name" required maxlength="60">
          ` : ""}
          <label>Email Address</label>
          <input name="email" type="email" placeholder="Enter your email" required>
          <label>Password</label>
          <input name="password" type="password" placeholder="Minimum 8 characters" required minlength="8">
          <button class="btn" type="submit">${register ? "Create Account" : "Login"}</button>
        </form>

        <p class="text-center" style="margin-top:18px">
          ${register ? "Already have an account?" : "New to NES?"}
          <button class="secondary" onclick="switchAuth('${register ? "login" : "register"}')">
            ${register ? "Login" : "Register"}
          </button>
        </p>
      </div>
    </main>
  `;
}

function dashboardPage() {
  return `
    <main>
      <div class="card">
        <h1>👋 Hello, ${esc(state.user.name)}</h1>
        <p class="text-muted">${esc(state.user.email)}</p>
        <span class="badge">PLAYER ACCOUNT</span>
      </div>
      <section>
        <h2 style="margin-bottom:15px">My Registrations</h2>
        <div id="myRegistrations" class="card">Loading registrations...</div>
      </section>
    </main>
  `;
}

async function loadMyRegistrations() {
  try {
    const rows = await api("/api/my-registrations");
    const target = $("#myRegistrations");
    if (!target) return;

    target.innerHTML = rows.length ? rows.map(r => `
      <div style="padding:12px 0;border-bottom:1px solid #29394a">
        <h3>${esc(r.title)}</h3>
        <p class="text-muted">${esc(r.category)} • FC ID: ${esc(r.fc_id)}</p>
        <p>Status: <span class="badge">${esc(r.status)}</span></p>
      </div>
    `).join("") : "You haven't joined any tournaments yet.";
  } catch (error) {
    notice(error.message, true);
  }
}

async function joinTournament(id) {
  if (!state.user) {
    state.page = "login";
    state.authMode = "login";
    render();
    notice("Please login to join a tournament.");
    return;
  }

  const t = state.tournaments.find(x => Number(x.id) === Number(id));
  if (!t) return;

  const fc_id = prompt("Enter your FC Mobile Player ID:");
  if (!fc_id || !fc_id.trim()) return;

  const phone = prompt("Enter your phone number:");
  if (!phone || !phone.trim()) return;

  try {
    await api(`/api/tournaments/${id}/join`, {
      method: "POST",
      body: JSON.stringify({fc_id:fc_id.trim(),phone:phone.trim()})
    });
    notice("Registration submitted successfully!");
  } catch (error) {
    notice(error.message, true);
  }
}

function adminPage() {
  return `
    <main>
      <h1>🛡️ Admin Panel</h1>
      <p class="text-muted" style="margin:8px 0 20px">Manage your FC Mobile tournaments.</p>

      <div class="admin-panel">
        <div class="admin-tabs">
          <button class="${state.adminTab === "tournaments" ? "active" : ""}" onclick="adminTab('tournaments')">Tournaments</button>
          <button class="${state.adminTab === "registrations" ? "active" : ""}" onclick="adminTab('registrations')">Players</button>
          <button class="${state.adminTab === "settings" ? "active" : ""}" onclick="adminTab('settings')">Settings</button>
        </div>
        <div id="adminContent">Loading...</div>
      </div>
    </main>
  `;
}

async function loadAdminContent() {
  const target = $("#adminContent");
  if (!target) return;

  try {
    if (state.adminTab === "tournaments") {
      target.innerHTML = `
        <h2>Create Tournament</h2>
        <form id="tournamentForm" style="margin:15px 0 25px">
          <label>Tournament Name</label>
          <input name="title" placeholder="NES FC Mobile Championship" required>
          <label>Category</label>
          <select name="category" required>
            <option value="FC MOBILE 1V1">FC Mobile 1V1</option>
            <option value="FC MOBILE 2V2">FC Mobile 2V2</option>
          </select>
          <label>Entry Fee (৳)</label>
          <input name="entry_fee" type="number" min="0" value="0">
          <label>Prize Pool (৳)</label>
          <input name="prize" type="number" min="0" value="0">
          <label>Slots</label>
          <input name="slots" type="number" min="2" value="32">
          <label>Match Date</label>
          <input name="match_date" type="datetime-local">
          <button class="btn" type="submit">Create Tournament</button>
        </form>
        <h2>Existing Tournaments</h2>
        ${tournamentCards(state.tournaments)}
        <div id="deleteList">
          ${state.tournaments.map(t => `
            <button class="secondary" style="margin:4px" onclick="deleteTournament(${Number(t.id)})">
              Delete #${Number(t.id)}
            </button>
          `).join("")}
        </div>
      `;
    }

    if (state.adminTab === "registrations") {
      const rows = await api("/api/admin/registrations");
      target.innerHTML = rows.length ? rows.map(r => `
        <div class="card">
          <h3>${esc(r.name)} — ${esc(r.title)}</h3>
          <p>Email: ${esc(r.email)}</p>
          <p>FC ID: ${esc(r.fc_id)}</p>
          <p>Phone: ${esc(r.phone)}</p>
          <p>Status: ${esc(r.status)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button class="btn" onclick="updateRegistration(${Number(r.id)},'approved')">Approve</button>
            <button class="secondary" onclick="updateRegistration(${Number(r.id)},'rejected')">Reject</button>
          </div>
        </div>
      `).join("") : `<div class="card">No registrations yet.</div>`;
    }

    if (state.adminTab === "settings") {
      const settings = await api("/api/admin/settings");
      target.innerHTML = `
        <h2>Website Settings</h2>
        <form id="settingsForm" style="margin-top:15px">
          <label>Website Name</label>
          <input name="site_name" value="${esc(settings.site_name)}">
          <label>Logo Text</label>
          <input name="logo_text" value="${esc(settings.logo_text)}">
          <label>Home Notice</label>
          <textarea name="home_notice">${esc(settings.home_notice)}</textarea>
          <label>bKash Number</label>
          <input name="bkash_number" value="${esc(settings.bkash_number)}">
          <label>Nagad Number</label>
          <input name="nagad_number" value="${esc(settings.nagad_number)}">
          <label>Rocket Number</label>
          <input name="rocket_number" value="${esc(settings.rocket_number)}">
          <button class="btn" type="submit">Save Settings</button>
        </form>
      `;
    }
  } catch (error) {
    target.innerHTML = `<div class="card">${esc(error.message)}</div>`;
  }
}

async function deleteTournament(id) {
  if (!confirm("Delete this tournament?")) return;

  try {
    await api(`/api/admin/tournaments/${id}`, {method:"DELETE"});
    await loadTournaments();
    await loadAdminContent();
    notice("Tournament deleted.");
  } catch (error) {
    notice(error.message, true);
  }
}

async function updateRegistration(id, status) {
  try {
    await api(`/api/admin/registrations/${id}`, {
      method:"PATCH",
      body:JSON.stringify({status})
    });
    await loadAdminContent();
    notice("Registration updated.");
  } catch (error) {
    notice(error.message, true);
  }
}

function render() {
  let content = "";

  if (state.page === "home") content = homePage();
  else if (state.page === "tournaments") content = tournamentsPage();
  else if (state.page === "login" || state.page === "register") content = authPage();
  else if (state.page === "dashboard" && state.user) content = dashboardPage();
  else if (state.page === "admin" && state.user?.role === "admin") content = adminPage();
  else content = homePage();

  app.innerHTML = header() + content + footer();

  if (state.page === "dashboard") loadMyRegistrations();
  if (state.page === "admin") loadAdminContent();
}

function go(page) {
  if ((page === "dashboard" || page === "admin") && !state.user) {
    page = "login";
  }

  if (page === "admin" && state.user?.role !== "admin") {
    notice("Admin access required.", true);
    return;
  }

  state.page = page;
  render();
  window.scrollTo(0,0);
}

function switchAuth(mode) {
  state.authMode = mode;
  state.page = mode;
  render();
}

function filterCategory(category) {
  state.tournaments = state.tournaments.filter(t => t.category === category);
  state.page = "tournaments";
  render();
  loadTournaments().catch(() => {});
}

async function logout() {
  try {
    await api("/api/logout", {method:"POST"});
    state.user = null;
    state.page = "home";
    await loadTournaments();
    render();
    notice("Logged out successfully.");
  } catch (error) {
    notice(error.message, true);
  }
}

function adminTab(tab) {
  state.adminTab = tab;
  render();
}

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());

  try {
    if (form.id === "authForm") {
      const register = state.authMode === "register";
      const data = await api(register ? "/api/register" : "/api/login", {
        method:"POST",
        body:JSON.stringify(values)
      });

      state.user = data.user;
      state.settings = data.settings || state.settings;
      state.page = "home";
      await loadTournaments();
      render();
      notice("Welcome to NIROB E-SPORTS!");
    }

    if (form.id === "tournamentForm") {
      await api("/api/admin/tournaments", {
        method:"POST",
        body:JSON.stringify(values)
      });
      await loadTournaments();
      await loadAdminContent();
      notice("Tournament created!");
    }

    if (form.id === "settingsForm") {
      await api("/api/admin/settings", {
        method:"PUT",
        body:JSON.stringify(values)
      });
      state.settings = await api("/api/admin/settings");
      render();
      notice("Settings saved!");
    }
  } catch (error) {
    notice(error.message, true);
  }
});

init();
