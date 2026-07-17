# Social Login Setup

The sign-in screen has **Google**, **Discord**, and **Apple** buttons wired to real OAuth flows.
They stay disabled / show an error until you add credentials to `backend/.env`.
After editing `backend/.env`, **restart the Flask server** (and reload the frontend).

Local URLs assumed: frontend `http://localhost:5173`, backend `http://localhost:5000`.
When you deploy, set `FRONTEND_URL` and `BACKEND_URL` in `.env` to your real domains and add
the production URLs to each provider's console.

---

## 1. Google  (easiest — do this first)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project if you don't have one.
3. **Create Credentials → OAuth client ID → Application type: Web application.**
4. Under **Authorized JavaScript origins** add:
   - `http://localhost:5173`
   - (later) your production frontend URL
5. Click Create and copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`).
6. Put it in `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
7. Restart Flask. The greyed "Continue with Google" button becomes the real Google button.

> Google sign-in needs **only** the Client ID — no client secret, because the backend
> verifies the ID token directly with Google's public keys.

---

## 2. Discord

1. Go to https://discord.com/developers/applications → **New Application**.
2. Open **OAuth2** in the sidebar. Copy the **Client ID** and **Client Secret**.
3. Under **OAuth2 → Redirects** add exactly:
   ```
   http://localhost:5000/api/auth/discord/callback
   ```
   (and your production `https://<backend>/api/auth/discord/callback` later)
4. Put both in `backend/.env`:
   ```
   DISCORD_CLIENT_ID=...
   DISCORD_CLIENT_SECRET=...
   ```
5. Restart Flask. "Continue with Discord" now works.

---

## 3. Apple — REMOVED from the UI (July 2026)

Apple sign-in needs a paid Apple Developer Program membership, so the button was
removed from the auth screen at the user's request. The backend route scaffold
(`/api/auth/apple/*`) still exists but is unreachable from the UI. If an Apple
Developer account ever materialises: re-add the button in `App.jsx` (git-less
repo — see this file's history note), create a Services ID (`APPLE_CLIENT_ID`),
and finish the token-exchange + client-secret JWT signing.

---

## How it works (so you can reason about it)

- **Google**: frontend gets an ID token from Google → `POST /api/auth/google` → backend
  verifies it → finds/creates a user keyed by the Google email → returns `{username, balance}`.
- **Discord/Apple**: button redirects to the provider → provider redirects back to the backend
  callback → backend exchanges the code, reads the profile, finds/creates a user → redirects to
  the frontend with the session info.
- Social users are stored in the same `users` table; they just can't log in with a password.

> Security note: the current session model (used by the original username/password login too)
> is lightweight and not hardened for production. When you're closer to shipping, we should add
> signed session tokens (JWT) — flag it and I'll do that as its own step.
