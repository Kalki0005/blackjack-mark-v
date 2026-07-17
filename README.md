# Blackjack Mark V — Multiplayer Casino & Learning Platform

A premium online blackjack experience in the style of live-casino products (Evolution
Gaming / Stake), built with two differentiators most blackjack sites don't have:

1. **Rooms** — real-time public/private multiplayer tables to play with friends
2. **Learner mode** — shows the mathematically ideal move *and the probability
   reasoning behind it*, plus Hi-Lo card-counting training

No real money — the point is the craft: authentic casino rules, real probability math,
and a UI that takes itself seriously.

## Engine (the part that took the longest)

The complete blackjack rules engine lives in `backend/game.py` as the single source of
truth: multi-seat, multi-hand play, splits (up to 4 hands/seat, re-split 10s allowed),
double-down, insurance, and authentic peek rules (dealer peeks on an Ace up — insurance
resolves and blackjack ends the round before you can double into it — but does NOT peek
on a 10 up, exactly like Stake/Evolution). Split aces get one card each and a 21 there
is *not* blackjack. The engine was validated by **fuzz-testing 32,000 simulated rounds**.

The strategy layer (`strategy.py`, `probability.py`) computes basic-strategy
recommendations, bust probabilities, and running Hi-Lo counts live during play.

## Stack

- **Backend:** Flask + Flask-SocketIO (REST + websockets), PostgreSQL (Neon) via
  SQLAlchemy — users, stats, settings, and game rooms (room state as a JSON blob, so
  schema changes need no migration)
- **Auth:** Google & Discord OAuth + classic accounts
- **Frontend:** React 19 + Vite + Tailwind v4, custom casino UI with dedicated audio,
  animations, and motion

## Run it

```bash
# backend  (port 5000)
cd backend
python -m venv venv && venv/Scripts/pip install -r requirements.txt
# create backend/.env with DATABASE_URL, SECRET_KEY (see below)
python app.py

# frontend (port 5173)
cd frontend
npm install
npm run dev
```

`backend/.env` needs: `DATABASE_URL` (any Postgres), `SECRET_KEY`, and optionally
`GOOGLE_CLIENT_ID` / `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` for social login
(see `SOCIAL_LOGIN_SETUP.md`).

## Status

Actively developed. Engine and multiplayer are stable; current work is on the 3D table
environment and dealer presentation.
