# NIROB E-SPORTS (NES)

A responsive, full-stack Free Fire tournament management starter built with vanilla HTML/CSS/JS, Express and SQLite.

## Included

- Email/password player registration and login (bcrypt password hashing).
- Separate player and owner roles; owner account is created from environment variables.
- Home page contains brand/banner area, Telegram CTA, notices and categories — **no match list**.
- Play page and category-specific match lists.
- Match detail, rules acceptance and registration flow.
- Live second-by-second countdowns on match cards.
- Registration captures IGN, Free Fire UID, team, payment method and transaction ID.
- Payment methods: bKash, Nagad, Rocket, Upay. The site never requests a PIN or OTP.
- My Matches, payment status, room credentials for approved registrations, results and profile.
- Owner admin: create/edit/delete tournaments, room details, registration verification, results, website/payment settings, banners and notices.
- SQLite database persists users, matches, registrations, results and settings.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

1. Extract the ZIP.
2. Open a terminal in the project folder.
3. Install packages:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`.
5. Set a strong unique `SESSION_SECRET`, `OWNER_EMAIL`, and `OWNER_PASSWORD`.
6. Start:

   ```bash
   npm start
   ```

7. Open `http://localhost:3000`.

The database is created automatically at `data/nes.sqlite`. A few sample matches are inserted on first launch. Remove those through the owner panel if you do not need them.

## Owner login

Use the `OWNER_EMAIL` and `OWNER_PASSWORD` values from `.env`. The owner is seeded on first startup. **Change the example credentials before exposing the site publicly.** If the owner account already exists, changing the environment password does not reset the existing account password; use a controlled database/admin password reset procedure.

## Deploy / hosting

Use a Node.js hosting provider that supports persistent disk storage (for example, a VPS or a platform with a persistent volume).

1. Upload the project or connect its Git repository.
2. Set the environment variables from `.env.example` in the hosting dashboard.
3. Set `NODE_ENV=production`, use a long random `SESSION_SECRET`, and configure `COOKIE_SECURE=true`.
4. Put the app behind HTTPS and point your domain to the Node service.
5. Ensure the `data/` directory is on persistent storage and backed up.
6. Run `npm install` and `npm start`.

Do not use ephemeral serverless hosting without adapting the database/session storage to a managed persistent database and shared session store.

## Security notes before production

This is a working baseline, not a third-party security audit. Before accepting real entry fees or high-value prizes:

- Add CSRF protection and stronger origin checks for state-changing requests.
- Add email verification, password reset, MFA for the owner, audit logs and account lockout.
- Add automated backups, monitoring, HTTPS, dependency scanning and a security review.
- Move to PostgreSQL for multi-instance/high-volume deployment and configure a shared session store.
- Implement a verified payment gateway/webhook if you need automated payment confirmation. Current payment flow is **manual transaction-ID submission and owner approval only**.
- Add a proper image upload service and moderation if owners need to upload banners rather than provide image URLs.
- Confirm applicable local laws, platform/game rules, age requirements and tournament/payment policies.

## Notes / current limitations

- Google OAuth is not wired in this version. The included login is email/password. Add Google OAuth through an official OAuth library and verified Google Cloud credentials if needed.
- Banner management stores image URLs; it does not upload image files.
- Category administration is represented by the built-in category set; tournament categories are selected when creating a match.
- Room ID/password are only exposed to a player after that player's registration is approved.
- The UI uses sample match records on first boot. These are examples, not live tournaments.

## API overview

Public: `GET /api/me`, `GET /api/banners`, `GET /api/notices`, `GET /api/categories`, `GET /api/matches`, `GET /api/matches/:id`, `GET /api/results`

Player: `POST /api/register`, `POST /api/login`, `POST /api/logout`, `POST /api/matches/:id/join`, `GET /api/my-matches`, `GET /api/profile`, `PATCH /api/profile`

Owner: `/api/admin/overview`, `/api/admin/matches`, `/api/admin/registrations`, `/api/admin/results`, `/api/admin/settings`, `/api/admin/banners`, `/api/admin/notices`
