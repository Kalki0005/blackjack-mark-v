# Blackjack Mark V — Roadmap

**Vision:** the best *free* online blackjack, and the best interactive blackjack *learning*
platform: classic plus every major real-casino variant, a strategy trainer that is correct
for whatever rules you are playing, and a chess.com-style post-game review.

**Revised Nov 2026** after an independent review (`REVIEW.md`) and a QA pass
(`QA_FINDINGS.md`). This replaces the earlier "3D first, ship last" plan.

---

## Principles

1. **Correct before pretty.** The teaching layer must be right for the rules being played.
2. **Ship early.** A deployed link is worth more than an unshipped feature.
3. **Tests are the contract.** `backend/tests.py` + `backend/sim.py` must pass before any
   merge. Run `sim.py` after any change to money paths.
4. **Two work streams at most**, on branches, with files that do not overlap:
   **Engine** (backend + tests) and **App** (frontend). Not seven departments.
5. **Decide the dealer by prototype**, not by assertion.

---

## Phases

### Phase 1 — Make the engine honest  *(Engine stream; ~1 week)*
- ✅ Working test suite (88 tests) and house-edge sim (`backend/sim.py`) merged.
- ✅ E1 (negative side bet minted chips) and E7 (unvalidated seats) fixed.
- Fix the remaining engine bugs from `REVIEW.md` §1.2 / `QA_FINDINGS.md` §3:
  E2 repeat insurance purchase · E3 insurance closed by a seat not in the round ·
  E4/B3/B4 lossy snapshot restore (split players, lost insurance bet, shoe not persisted) ·
  E5/B1 1–2 deck shoes never reshuffle · E6 shallow penetration (cut ~75% from the end) ·
  B2/E8 rejected or illegal actions logged as "mistakes".
- Fold the useful probes from `review_harness/` into the test suite.

### Phase 2 — Strategy solver  *(Engine stream; the core of the learning claim)*
- Replace the hand-typed tables with a **computed, rule-aware solver** (EV by dynamic
  programming over deck composition) for any rule set: decks, S17/H17, peek vs no-peek,
  DAS, resplit aces, surrender, BJ payout.
- One source of truth for hints, the chart, the review screen and the bots.
  `lib/strategy.js`'s duplicate tables go away (frontend asks the server or a generated file).
- Advice is **legality-aware** (never "double" on a three-card hand).
- Review screen grades each mistake by **EV lost**, not by hand-assigned severity labels.
- Learner panel numbers become exact (soft-hand bust %, peek-adjusted win %, double/split
  included in "optimal").

### Phase 3 — Safe to put online  *(both streams)*
- **Real sessions** (server-issued token; socket events and REST writes use the session,
  never a client-supplied username).
- **Server-side turn clock** + disconnect handling (a closed tab can't hang a table).
- Strip the dealer's hole card and other players' learner hints from broadcasts.
- Validate every handler's input; per-room locking; rate limiting; CORS lockdown;
  no Werkzeug debugger; production server.
- Frontend: remove hardcoded `localhost:5000`, delete dead table/3D files and the
  ~180 MB of unused assets, split `App.jsx`.

### Phase 4 — Ship the 2D game
- Deploy (cheap domain). 60–90 s demo video.
- Launch on the hook that already exists: *chess.com-style game review for blackjack*.
- Watch what players actually use and ask for.

### Phase 5 — Variants  *(each one = rule set + solver support + tutorial)*
Built on the solver, so strategy and the review work for every variant from day one.
- **Real-casino rule toggles** on classic: H17, late surrender, 6:5, DAS off, resplit
  aces, peek vs no-peek.
- **Spanish 21** — 48-card decks (no 10 pips), player 21 always wins, bonus 21 payouts,
  late surrender, redouble. Strategy depends on card count in hand.
- **Pontoon** — both regional forms (see below). Needs new *behaviour*, not just flags.
- **Free Bet Blackjack** — free doubles/splits, dealer 22 pushes.
- **Blackjack Switch** — two hands, swap second cards, dealer 22 pushes, BJ pays 1:1.
- **Double Exposure** — both dealer cards face up, ties lose, BJ pays even.
- **Infinite / common-draw blackjack** (Evolution-style shared hand) — fits rooms well.
- "Play Classic / Play Other Modes" menu; per-variant interactive tutorial in the Hub.

> **Pontoon means two different games.** *British Pontoon*: both dealer cards face down,
> twist/stick/buy, five-card trick, pontoon pays 2:1, dealer wins ties. *Asian/Australian
> casino Pontoon*: much closer to Spanish 21. Confirm which one Genting Highlands deals
> (was a dealer card face up? were the 10s removed?) and build that one first.

### Phase 6 — Dealer and premium presentation
- Engine first emits an **ordered event list** (card to seat 3, hole card revealed, hand
  paid) alongside the snapshot, so any presentation layer can animate from it.
- **2-day prototype before committing:** one idle loop + one deal gesture as pre-rendered
  video plates (image-to-video or offline Blender render) over the 2D table. Compare against
  a real-time stylised R3F dealer. Pick by evidence.
- Then: male + female dealer, audio, dialogue, table themes.

---

## How to work

- **Engine stream** owns `backend/` (rules, solver, variants, socket handlers, bots,
  tests, sim). **App stream** owns `frontend/`.
- Before merging: `backend\tests.py` green; after money-path changes, `backend\sim.py`
  PASS. Interface changes update `CONTRACTS.md` *and* a test.
- Run commands (from repo root):
  ```
  & ".\venv\Scripts\python.exe" backend\tests.py
  & ".\venv\Scripts\python.exe" backend\sim.py
  ```
