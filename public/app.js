const app = document.getElementById("app");

const state = {
  user: null,
  settings: {},
  tournaments: [],
  registrations: [],
  adminRegistrations: [],
  page: "home",
  category: "ALL"
};

const $ = selector => document.querySelector(selector);

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

function notify(message) {
  alert(message);
}

function money(value) {
  return "৳" + Number(value || 0).toLocaleString("en-BD");
}

function go(page) {
  state.page = page;
  render();
  window.scrollTo(0, 0);
}

function header() {
  return `
    <header>
      <a href="#" class="logo" data-page="home">
        ⚽ NIROB E-SPORTS
        <small>FC MOBILE TOURNAMENT</small>
      </a>

      <nav>
        <button data-page="home">Home</button>
        <button data-page="home">Tournaments</button>
        ${
          state.user
            ? `<button data-page="dashboard">Dashboard</button>`
            : `<button data-page="login">Login</button>`
        }
        ${
          state.user?.role === "admin"
            ? `<button data-page="admin">Admin Panel</button>`
            : ""
        }
        ${
          state.user
            ? `<button data-action="logout">Logout</button>`
            : `<button data-page="register">Register</button>`
        }
      </nav>
    </header>
  `;
}

function tournamentCard(tournament) {
  return `
    <article class="card">
      <span class="tag">${esc(tournament.category)}</span>
      <h3>${esc(tournament.title)}</h3>

      <p>Entry Fee: <strong>${money(tournament.entry_fee)}</strong></p>
      <p>Prize Pool: <strong class="price">${money(tournament.prize)}</strong></p>
      <p>Total Slots: ${esc(tournament.slots)}</p>
      <p>Status: ${esc(tournament.status)}</p>
      <p>Match Date: ${esc(tournament.match_date || "To be announced")}</p>

      <button class="btn"
        data-join="${tournament.id}"
        ${tournament.status !== "open" ? "disabled" : ""}>
        Join Tournament
      </button>
    </article>
  `;
}

function homePage() {
  const tournaments = state.category === "ALL"
    ? state.tournaments
    : state.tournaments.filter(t => t.category === state.category);

  return `
    <main class="container">
      <section class="hero">
        <h1>PLAY. <span>COMPETE.</span> WIN.</h1>
        <p>Welcome to ${esc(state.settings.site_name || "NIROB E-SPORTS")}</p>
        <p>${esc(state.settings.home_notice || "Join our FC Mobile tournaments!")}</p>
        <button class="btn" data-page="register">Join NES Now</button>
      </section>

      <div class="section-head">
        <h2>FC Mobile <span>Tournaments</span></h2>
      </div>

      <div class="filters">
        <button data-category="ALL" class="${state.category === "ALL" ? "active" : ""}">All</button>
        <button data-category="FC MOBILE 1V1" class="${state.category === "FC MOBILE 1V1" ? "active" : ""}">1V1</button>
        <button data-category="FC MOBILE 2V2" class="${state.category === "FC MOBILE 2V2" ? "active" : ""}">2V2</button>
      </div>

      <div class="grid">
        ${
          tournaments.length
            ? tournaments.map(tournamentCard).join("")
            : `<div class="empty">No tournaments available right now.</div>`
        }
      </div>

      <div class="notice">
        Fair Play • Respect Players • Enjoy FC Mobile
      </div>
    </main>
  `;
}

function authPage(register = false) {
  return `
    <main class="container">
      <form class="form-box" id="authForm">
        <h2>${register ? "Create Account" : "Welcome Back"}</h2>

        ${
          register
            ? `<div class="field">
                <label>Your Name</label>
                <input name="name" required maxlength="60">
              </div>`
            : ""
        }

        <div class="field">
          <label>Email Address</label>
          <input type="email" name="email" required>
        </div>

        <div class="field">
          <label>Password (minimum 8 characters)</label>
          <input type="password" name="password" minlength="8" required>
        </div>

        <button class="btn" type="submit">
          ${register ? "Register" : "Login"}
        </button>

        <p class="switch" data-page="${register ? "login" : "register"}">
          ${register ? "Already have an account? Login" : "New player? Create an account"}
        </p>
      </form>
    </main>
  `;
}

function dashboardPage() {
  return `
    <main class="container">
      <div class="section-head">
        <h2>Player <span>Dashboard</span></h2>
      </div>

      <div class="card">
        <h3>Welcome, ${esc(state.user.name)}</h3>
        <p>${esc(state.user.email)}</p>
        <p>Account Type: ${esc(state.user.role)}</p>
      </div>

      <div class="section-head">
        <h2>My <span>Registrations</span></h2>
      </div>

      ${
        state.registrations.length
          ? `<div class="grid">
              ${state.registrations.map(r => `
                <article class="card">
                  <h3>${esc(r.title)}</h3>
                  <p>${esc(r.category)}</p>
                  <p>FC ID: ${esc(r.fc_id)}</p>
                  <p>Entry Fee: ${money(r.entry_fee)}</p>
                  <p>Status:
                    <span class="status ${esc(r.status)}">${esc(r.status)}</span>
                  </p>
                </article>
              `).join("")}
            </div>`
          : `<div class="empty">You have not joined any tournament yet.</div>`
      }
    </main>
  `;
}

function adminPage() {
  return `
    <main class="container">
      <div class="section-head">
        <h2>Admin <span>Panel</span></h2>
      </div>

      <div class="notice">
        Manage tournaments, player registrations and payment information.
      </div>

      <form class="card" id="tournamentForm">
        <h3>Create Tournament</h3>

        <div class="field">
          <label>Tournament Name</label>
          <input name="title" required maxlength="100">
        </div>

        <div class="field">
          <label>Category</label>
          <select name="category" required>
            <option value="FC MOBILE 1V1">FC Mobile 1V1</option>
            <option value="FC MOBILE 2V2">FC Mobile 2V2</option>
          </select>
        </div>

        <div class="field">
          <label>Entry Fee (BDT)</label>
          <input name="entry_fee" type="number" min="0" value="0">
        </div>

        <div class="field">
          <label>Prize Pool (BDT)</label>
          <input name="prize" type="number" min="0" value="0">
        </div>

        <div class="field">
          <label>Total Slots</label>
          <input name="slots" type="number" min="2" value="32">
        </div>

        <div class="field">
          <label>Match Date</label>
          <input name="match_date" type="datetime-local">
        </div>

        <button class="btn">Create Tournament</button>
      </form>

      <div class="section-head">
        <h2>Manage <span>Tournaments</span></h2>
      </div>

      <div class="grid">
        ${
          state.tournaments.map(t => `
            <article class="card">
              <h3>${esc(t.title)}</h3>
              <p>${esc(t.category)}</p>
              <p>Entry: ${money(t.entry_fee)}</p>
              <button class="btn danger" data-delete="${t.id}">Delete</button>
            </article>
          `).join("") || `<div class="empty">No tournaments created.</div>`
        }
      </div>

      <div class="section-head">
        <h2>Player <span>Registrations</span></h2>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Email</th>
              <th>Tournament</th>
              <th>FC ID</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.adminRegistrations.map(r => `
                <tr>
                  <td>${esc(r.name)}</td>
                  <td>${esc(r.email)}</td>
                  <td>${esc(r.title)}</td>
                  <td>${esc(r.fc_id)}</td>
                  <td>${esc(r.phone)}</td>
                  <td>${esc(r.status)}</td>
                  <td>
                    <div class="actions">
                      <button class="btn" data-status="${r.id}" data-value="approved">Approve</button>
                      <button class="btn danger" data-status="${r.id}" data-value="rejected">Reject</button>
                    </div>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="7">No registrations yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>

      <div class="section-head">
        <h2>Payment <span>Settings</span></h2>
      </div>

      <form class="card" id="settingsForm">
        <div class="field">
          <label>bKash Number</label>
          <input name="bkash_number" value="${esc(state.settings.bkash_number || "")}">
        </div>
        <div class="field">
          <label>Nagad Number</label>
          <input name="nagad_number" value="${esc(state.settings.nagad_number || "")}">
        </div>
        <div class="field">
          <label>Rocket Number</label>
          <input name="rocket_number" value="${esc(state.settings.rocket_number || "")}">
        </div>
        <div class="field">
          <label>Home Notice</label>
          <textarea name="home_notice">${esc(state.settings.home_notice || "")}</textarea>
        </div>
        <button class="btn">Save Settings</button>
      </form>
    </main>
  `;
}

function render() {
  let content = "";

  if (state.page === "home") content = homePage();
  if (state.page === "login") content = authPage(false);
  if (state.page === "register") content = authPage(true);
  if (state.page === "dashboard") content = dashboardPage();
  if (state.page === "admin") content = adminPage();

  app.innerHTML = `
    ${header()}
    ${content}
    <footer>
      © ${new Date().getFullYear()} NIROB E-SPORTS | FC Mobile
    </footer>
  `;
}

async function loadTournaments() {
  state.tournaments = await api("/api/tournaments");
}

async function loadDashboard() {
  state.registrations = await api("/api/my-registrations");
}

async function loadAdmin() {
  state.adminRegistrations = await api("/api/admin/registrations");
}

async function refresh() {
  const data = await api("/api/me");

  state.user = data.user;
  state.settings = data.settings || {};

  await loadTournaments();

  if (state.user && state.page === "dashboard") {
    await loadDashboard();
  }

  if (state.user?.role === "admin" && state.page === "admin") {
    await loadAdmin();
  }

  render();
}

async function joinTournament(id) {
  if (!state.user) {
    notify("Please login first.");
    return go("login");
  }

  const fc_id = prompt("Enter your FC Mobile Player ID:");
  if (!fc_id || !fc_id.trim()) return;

  const phone = prompt("Enter your phone number:");
  if (!phone || !phone.trim()) return;

  try {
    const result = await api(`/api/tournaments/${id}/join`, {
      method: "POST",
      body: JSON.stringify({
        fc_id: fc_id.trim(),
        phone: phone.trim()
      })
    });

    notify(result.message || "Registration submitted!");
    await loadDashboard();
    go("dashboard");
  } catch (error) {
    notify(error.message);
  }
}

app.addEventListener("click", async event => {
  const pageButton = event.target.closest("[data-page]");
  const categoryButton = event.target.closest("[data-category]");
  const joinButton = event.target.closest("[data-join]");
  const deleteButton = event.target.closest("[data-delete]");
  const statusButton = event.target.closest("[data-status]");
  const actionButton = event.target.closest("[data-action]");

  if (pageButton) {
    const page = pageButton.dataset.page;

    if (page === "dashboard" && !state.user) {
      return go("login");
    }

    if (page === "admin" && state.user?.role !== "admin") {
      return notify("Admin access required.");
    }

    state.page = page;

    if (page === "dashboard") {
      try {
        await loadDashboard();
      } catch (error) {
        notify(error.message);
      }
    }

    if (page === "admin") {
      try {
        await loadAdmin();
      } catch (error) {
        notify(error.message);
      }
    }

    return render();
  }

  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    return render();
  }

  if (joinButton) {
    return joinTournament(joinButton.dataset.join);
  }

  if (deleteButton) {
    if (!confirm("Delete this tournament?")) return;

    try {
      await api(`/api/admin/tournaments/${deleteButton.dataset.delete}`, {
        method: "DELETE"
      });
      notify("Tournament deleted.");
      await loadTournaments();
      render();
    } catch (error) {
      notify(error.message);
    }
  }

  if (statusButton) {
    try {
      await api(`/api/admin/registrations/${statusButton.dataset.status}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: statusButton.dataset.value
        })
      });

      notify("Registration updated.");
      await loadAdmin();
      render();
    } catch (error) {
      notify(error.message);
    }
  }

  if (actionButton?.dataset.action === "logout") {
    try {
      await api("/api/logout", { method: "POST" });
      state.user = null;
      state.page = "home";
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  }
});

app.addEventListener("submit", async event => {
  event.preventDefault();

  if (event.target.id === "authForm") {
    const form = new FormData(event.target);
    const isRegister = state.page === "register";

    const body = {
      email: form.get("email"),
      password: form.get("password")
    };

    if (isRegister) body.name = form.get("name");

    try {
      await api(isRegister ? "/api/register" : "/api/login", {
        method: "POST",
        body: JSON.stringify(body)
      });

      state.page = "home";
      notify(isRegister ? "Account created!" : "Login successful!");
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  }

  if (event.target.id === "tournamentForm") {
    if (state.user?.role !== "admin") {
      return notify("Admin access required.");
    }

    const form = new FormData(event.target);

    const body = {
      title: form.get("title"),
      category: form.get("category"),
      entry_fee: Number(form.get("entry_fee")),
      prize: Number(form.get("prize")),
      slots: Number(form.get("slots")),
      match_date: form.get("match_date")
    };

    try {
      await api("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify(body)
      });

      notify("Tournament created!");
      await loadTournaments();
      render();
    } catch (error) {
      notify(error.message);
    }
  }

  if (event.target.id === "settingsForm") {
    if (state.user?.role !== "admin") {
      return notify("Admin access required.");
    }

    const form = new FormData(event.target);

    const body = {
      bkash_number: form.get("bkash_number"),
      nagad_number: form.get("nagad_number"),
      rocket_number: form.get("rocket_number"),
      home_notice: form.get("home_notice")
    };

    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(body)
      });

      notify("Settings saved!");
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  }
});

async function start() {
  try {
    await refresh();
  } catch (error) {
    app.innerHTML = `
      <main class="container">
        <div class="empty">
          <h2>Website could not load</h2>
          <p>${esc(error.message)}</p>
          <button class="btn" onclick="location.reload()">Try Again</button>
        </div>
      </main>
    `;
  }
}

start();
