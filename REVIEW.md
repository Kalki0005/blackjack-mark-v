# Blackjack Mark V — Independent Review

Reviewer: fresh-eyes pass, 14 Nov 2026, commit `d49bdc6`. Formed from the source and from
running the engine and server myself. `ROADMAP.md`, `CONTRACTS.md`, `HANDOVER.md`,
`DEALER_ART_GUIDE.md` and the README were read last and treated as claims to check.

**What I ran** (scripts are in `review_harness/`, so every number here is reproducible):

| Script | What it does |
|---|---|
| `sim.py edge` | 4,000,000 rounds through the real `Table` API, flat $100, one seat, with an independent re-implementation of totals/payouts checking every round |
| `sim.py spots` | 1,500,000 rigged deals per action for six disputed strategy cells |
| `probes.py` | 10 targeted bug/exploit probes against `game.py` |
| `e2e.py` | drives the real Flask + Socket.IO server (throwaway SQLite DB) |
| `npm ci && vite build && eslint .` | frontend build and lint |

**What I did not do:** I did not look at the running UI. Everything I say about the frontend
is from code, the build and the lint output, not from pixels. My views on how the table
*looks* are therefore worth less than my views on how it is built.

---

## Headline

The payout engine is correct. The things built around it are not what the docs say they are.

- **Money maths: verified correct.** 8 million rounds, zero invariant violations, house
  edge **0.52% ± 0.06%** — exactly where theory puts this rule set.
- **The strategy the game teaches is wrong for its own rules**, and the review screen
  labels the correct play a "Blunder". For a product whose pitch is "the best blackjack
  learning platform", this is the most important defect in the repo.
- **There is no authentication at all.** Identity is a username string the client sends.
  One socket message mints 900,000 chips into anyone's account.
- **The test suite does not import**, and the "fuzz-tested 32,000 rounds" harness is not in
  the repo.
- **Nothing is deployable**: the server URL is hardcoded in the client, the server runs the
  Werkzeug debugger, and a player closing a tab hangs a multiplayer table forever.

The plan on the table answers "what do we build next?" with variants and a 3D dealer. I
think the honest answer is: make the teaching correct, make it safe, put it on the
internet — and only then decide about dealers.

---

## 1. Game correctness and maths

### 1.1 Simulation result

Rules as coded: 6 decks, S17, double any two cards, double after split, split to 4 hands,
no resplit aces, one card on split aces, no surrender, BJ 3:2, peek on Ace only, **no peek
on a 10 and the full doubled/split stake is lost to a dealer blackjack**.

| Run (4,000,000 rounds each) | House edge | 95% CI | Violations |
|---|---|---|---|
| Engine's own `basic_strategy` | **0.523%** | 0.41% – 0.64% | 0 |
| Same table with the four corrections in §1.3 | 0.508% | 0.40% – 0.62% | 0 |

Published figures for 6D/S17/DAS with a peek are about 0.40–0.44%; no-peek with full loss
costs about 0.11% more. So 0.52% is the right answer, and `CONTRACTS.md §7`'s "≈ 0.5%"
holds. The two rows do not differ significantly from each other; the strategy errors are
resolved by the spot runs in §1.3, not by this table.

Per round I checked, independently of the engine's own bookkeeping:

- balance change equals expected payout minus total staked
- `hand.payout` matches my own recomputation from the cards
- dealer never stops below 17 and never draws on 17+
- never more than 4 hands; split aces always hold exactly 2 cards

Sanity figures from the same run: player blackjack paid 4.53% of rounds, 2.5% of rounds
split, 10.6% doubled, per-unit SD 1.16. All normal.

**Verified correct:** win 1:1, blackjack 3:2, push, double, split, resplit, split-ace
rules, 21 after split is not blackjack, insurance 2:1, peek on Ace, no peek on 10, dealer
S17 play, turn ownership inside the engine.

One number worth knowing: with the engine's strategy, a late dealer blackjack takes extra
double/split money in 0.14% of rounds, costing 0.146% of all initial bets. With the
corrected strategy that falls to 0.012%. That gap is the no-peek rule punishing the plays
the game itself recommends.

### 1.2 Engine bugs found

Ranked by severity. All reproduced by `probes.py` or `e2e.py`.

| # | Severity | Bug | Evidence |
|---|---|---|---|
| E1 | **Critical** | **Negative side bet mints chips.** `add_player` does `pp_bet = min(pp_bet, main_bet)` with no floor; `_collect_round_bets` then deducts a negative cost. | $100 hand with `pp_bet=-900000` → DB balance 5,000 → 904,900 |
| E2 | High | **Insurance can be bought repeatedly.** Each call deducts again but only one bet is recorded. | 3 calls: 150 deducted, 50 insured |
| E3 | High | **Insurance phase can be closed by a seat that is not in the round.** `insurance_responses` counts any seat number. | answering for empty seat 5 moved the table to `playing` before player B decided |
| E4 | High | **Snapshot restore splits a multi-seat player into separate `Player` objects**, each with the full balance; the shoe and `insurance_bet` are not serialised, but the running count is kept. | after restore: 2 objects for one user; count no longer matches the shoe |
| E5 | High | **1- and 2-deck shoes never reach the cut card.** `cut_card_position = len − randint(104,156)` goes negative, so the shoe silently rebuilds mid-round and the count is not reset. | 1 deck, 7 seats: 106 of 300 rounds had a mid-round reshuffle |
| E6 | Medium | **Penetration is very shallow and shrinks with more decks**: the cut is 104–156 cards *dealt*, not from the end. 6 decks ≈ 33–50%, 8 decks ≈ 25–37%. This guts the counting trainer; true counts rarely move. | `probes.py` §7 |
| E7 | Medium | **Seat numbers are unvalidated.** `seats=[0]` silently takes seat 7; `[8]` and `["1"]` raise. | `probes.py` §3 |
| E8 | Medium | **Mistake tracker ignores legality** — see §1.4. | `probes.py` §4 |
| E9 | Low | Odd bets round against the player: $5 blackjack pays $7, not $7.50; insurance on $5 costs $2. Only reachable by a crafted client, since the smallest chip is 10. | `probes.py` §8 |
| E10 | Low | Bet limits ("$10 – $500" in the HUD) are enforced nowhere; the chip picker itself offers $1,000. | `App.jsx:1385`, `:814` |
| E11 | Low | `dealer_turn` is never observable: `play_dealer` runs to completion inside the same call, so clients only ever see `playing → game_over`. The frontend's `dealer_turn` branches are dead and the dealer draw-out is reconstructed from a diff. | `game.py:588-605` |

The intentional rules (peek on Ace only, split-ace handling) behave exactly as documented.
I am not calling those bugs. I do think no-peek-with-full-loss is a harsher rule than most
players expect, and it is the root of §1.3.

### 1.3 Basic-strategy audit

The tables in `strategy.py` are the standard **peek-game, H17-flavoured** chart. This
table is S17 and does not peek on a 10. Four cells are wrong for the game as dealt.

Measured on the real engine, 1,500,000 rigged deals per action, fresh 6-deck shoe each
deal, EV in units of the initial bet:

| Hand vs upcard | Engine says | EV of engine's play | Better play | Its EV | Cost per occurrence | Why |
|---|---|---|---|---|---|---|
| 8,8 vs 10 | split | −0.610 | **hit** | −0.571 | 0.039 | no peek: both split bets die to a dealer blackjack |
| Hard 11 vs 10 | double | +0.009 | **hit** | +0.031 | 0.022 | same reason, for the doubled bet |
| A,8 vs 6 | double | +0.478 | **stand** | +0.494 | 0.016 | doubling soft 19 is an H17 play; this table is S17 |
| A,7 vs 2 | double | +0.119 | **stand** | +0.124 | 0.006 | same; closest of the four, about 3 standard errors |

Standard errors are 0.0006–0.0016 per figure, so the first three are far beyond noise and
the fourth is clear but narrow. Two control cells came out as the engine has them:
A,A vs 10 is still a split (+0.028 vs −0.132 for hitting) and 10 vs 10 is still a hit
(−0.054 vs −0.163 for doubling).

The roadmap already lists soft 19 vs 6. It does not list the other three, and the two
no-peek cells are the expensive ones.

Beyond those cells:

- **The H17 toggle changes the dealer and nothing else.** With `dealerHitsSoft17` on, the
  advice is unchanged (11 vs A should become double; A,8 vs 6 and A,7 vs 2 become correct).
  Deck count is ignored too.
- Everything else in the three tables matches the standard chart; I found no other cell
  errors for 6D/S17/DAS.

### 1.4 The teaching layer marks correct play as wrong

This is where the strategy errors turn into product damage.

- **Three-card hands.** `basic_strategy` returns `double` for a three-card 11 or soft 18,
  where doubling is illegal. A player who correctly hits 5-2-4 against a 10 gets a
  recorded mistake ("HIT, recommended DOUBLE"). Soft 18 on three cards vs 3–6 is told to
  double when the legal best is stand. Only the bots have a fallback (`app.py:476`), and
  that fallback is also wrong for soft 18.
- **8,8 vs 10.** Hitting is correct here; the review calls it a **Blunder**
  (`lib/strategy.js:91` hard-codes "best is SPLIT with 8s → blunder") and the Learning Hub
  prints "Always split 8s, everywhere" a few screens from the House Rules page that
  explains the no-peek rule.
- **Garbage input counts as a mistake.** The mistake is recorded before the action is
  validated, so `surrender` or any unknown string is logged against the player's permanent
  stats.
- **The learner panel's numbers are approximations presented as facts:**
  - "Bust if hit" uses the total only, so soft 17 shows 69.2% (true: 0%).
  - "Win if stand" versus an Ace still includes the dealer-blackjack branch (~31%) that the
    peek has already ruled out: standing on 18 vs A shows 26% win / 61% lose.
  - "Optimal W/L/P" considers hit and stand only (no double, no split), on an infinite
    deck, with an S17 dealer regardless of the table setting.
- **Two copies of the chart.** `lib/strategy.js` is a hand-kept port of `strategy.py`, so
  every error above exists twice and must be fixed twice.

### 1.5 Side bets

Detection logic for Perfect Pairs and 21+3 is correct, including A-2-3 and Q-K-A and no
wraparound. The pay tables (25/12/6 and 100/40/30/10/5) are the usual 6-deck ones. They
are applied unchanged at 1 and 2 decks, where a perfect pair (1 deck) and suited trips
(1–2 decks) cannot occur. `sidebets.py` still carries the old CLI functions
(`offer_insurance` with `input()`, `resolve_*` with `print`) that nothing calls.

---

## 2. Backend architecture and robustness

### 2.1 Security — critical, and it is one problem, not many

**There is no session.** `/api/login` returns `{username, balance}` and nothing else. Every
socket event and every REST write takes `username` from the request body and believes it.

Confirmed against the running server:

- A socket that never logged in created a room, sat down and played as `victim`.
- `POST /api/account/rename {username: "victim", new_username: "pwned"}` succeeded with no
  credentials.
- A second socket that never joined the room reset its round.
- `/?social_user=anyone` logs the browser in as that user (`App.jsx:281`); the Discord
  callback delivers identity this way by design.
- The dealer's hole card is in every `state_update` during play
  (`dealerHand: ['K♦','3♣']`); the client hides it with a prop.

Also present: `debug=True` with `allow_unsafe_werkzeug=True` (the Werkzeug debugger is
remote code execution if this is ever exposed), CORS `*` on both REST and sockets, a
default `SECRET_KEY`, no rate limiting, no username or password rules on register
(`USERNAME_RE` is applied to rename only), and Discord e-mail accepted without checking
it is verified, which would let a Discord account claim a Google user's row.

It is play money, so none of this hurts anyone today. But "rooms with friends" is one of
the two stated USPs, and a public leaderboard, a shared balance or one bored visitor ends
it. The roadmap files this under Phase 4, "harden". I would not call it hardening; the
feature is missing.

### 2.2 Robustness

| Severity | Issue |
|---|---|
| High | **A disconnect mid-hand hangs the table permanently.** The 30-second timer lives in the active player's browser. There is no server timer, no `disconnect` handler, and `leave_table` is refused outside betting. |
| High | **Unhandled exceptions on malformed input** (`seats=[99]` → `IndexError`, `main_bet="abc"` → `ValueError`). Handlers have no validation layer. |
| High | **No locking.** Socket.IO runs in `threading` mode and handlers mutate a shared `Table` with no lock; two quick emits can interleave. |
| Medium | **Every action writes the full room JSON to Postgres and runs 2–4 queries** (`_persist_state` on every hit). Against Neon that is network latency on every click, and it is the persisted blob that feeds the lossy restore in E4. |
| Medium | **`ACTIVE_ROOMS` is never evicted**, and rooms are single-process memory, so one worker only. |
| Medium | **Anyone can deal** as soon as one player is seated; others still choosing chips are dealt out. `ready_players` exists but gates nothing. |
| Medium | The same user in two rooms has two in-memory balances; the last flush wins. |
| Low | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` is a syntax error on SQLite, the default dev database (caught and printed on every boot). No migrations. |
| Low | `mistakes_history` is an unbounded JSON column, rewritten whole on every round. |
| Low | `/api/rooms/<username>` returns full table states for any name; stats are public. |

### 2.3 Structure

`Table` is one 790-line class that owns rules, turn flow, money, statistics, mistake
tracking, serialisation *and the tutorial copy* (the "reasoning" strings are built inside
`to_json`). The rules are not in one place: they are spread over `Hand.is_blackjack`,
`can_split`, `execute_action`, `play_dealer`, `resolve_game`, the `canDouble/canSplit`
flags in `to_json`, `strategy.py`, `probability.py`, `lib/strategy.js` and the Learning
Hub text. The bot driver in `app.py` is clean and uses only the public API; that part is
well done.

---

## 3. Test suite

`backend/tests.py` does not run. Neither invocation gets past the imports:

- `python -m unittest backend.tests` → `ModuleNotFoundError: No module named 'db'`
- `python tests.py` (from `backend/`) → `ModuleNotFoundError: No module named 'backend'`

It imports `Hand`/`Card` from `backend.models` (which is now the SQLAlchemy models file)
and calls `seat.resolve_bet`, `table.setup_players` and `table.play_round`, none of which
exist. It is a leftover from the CLI version. The roadmap's "70/83 error" is generous:
the real figure is 0 of 0, since nothing is collected.

**Real coverage of the current engine: zero.** No test touches `execute_action`,
`resolve_game`, insurance, splitting, snapshots or any socket handler. There are no
frontend tests and no CI.

The README says the engine "was validated by fuzz-testing 32,000 simulated rounds". No
such harness is in the repository. And 32,000 rounds could not validate a house edge in
any case: the standard error at that size is about 0.65%, larger than the edge itself. It
can show the engine does not crash, nothing more. `HANDOVER.md` also states "No git in
this repo", which is no longer true; that document is stale in several places and
contradicts the roadmap on the dealer (§5).

---

## 4. Frontend architecture

**Build:** passes, 380 kB JS (115 kB gzip). **Lint:** 35 errors, 2 warnings.

| Severity | Issue |
|---|---|
| High | **`http://localhost:5000` is hardcoded** for the socket (`App.jsx:229`) and both settings calls (`:309`, `:328`), beside an `API_BASE` constant that the other calls use. The app cannot be deployed without code edits. |
| High | **`App.jsx` is one 1,511-line component** with about 45 `useState` calls and every screen (auth, menu, create, join, table) in one function. The 1-second decision timer re-renders the whole table tree; `OptionsModal` and `ChipPicker` are declared inside the component, so they remount on each of those renders. |
| Medium | **Three table implementations** ship in the bundle: `Table2D` (live) plus `Table2DGemini` and `Table2DChatGPT`, statically imported by `main.jsx`. Four more components are dead (`Dealer3D`, `BlackjackTable3D`, `DealerArea`, `TableViewer`). |
| Medium | **182 MB of unused binaries in `frontend/public`** and therefore in git and in every deploy: `playing_cards.glb` 85 MB, `gameready_casino_scene.glb` 32 MB, `blackjack_table.glb` 24 MB, six 7–8 MB PNGs of which one is used, plus `.blend` files. The single commit is 148 MB. |
| Medium | Animation and audio are inferred by diffing whole-state snapshots (previous `gameState`, log-string matching such as `l.includes('wins')`). It works for a 2D table; it is the wrong foundation for any richer presentation (§5.1). |
| Low | `countVisibility: 'hover'` is offered in settings and never implemented. `alert()` is used for errors. No router, no TypeScript, a 1,363-line hand-written `index.css` alongside Tailwind. |

What is good: the component split below `App` is sensible (`SeatSpot`, `CasinoChip`,
`PlayingCard`, `Assessment`, `LearningHub`), the server-authoritative `canDouble/canSplit`
flags are the right idea, and the assessment review is a real differentiator in concept.
The Learning Hub has real substance (hand builder, tappable chart, move trainer, counting
drill, true-count lab).

---

## 5. The strategic calls

### 5.1 Full 3D R3F scene plus a real-time rigged dealer — **disagree**

The deciding fact is in the project's own handover: *the camera is fixed*. A live-casino
table is a fixed-camera video feed with a UI drawn over it. Real-time 3D buys camera
freedom and continuous reaction, and this product uses neither. What it costs:

- A rigged human whose hands handle cards is the hardest thing in character animation, and
  finger-to-card contact is exactly where the uncanny valley sits.
- The repo already holds two abandoned 3D attempts and 140 MB of their assets. The files
  that survive (`man_in_suit.glb` at 208 kB, `dealer_animated.glb` at 330 kB) are far
  below the quality bar the vision describes.
- The stated reason 3D was dropped last time was that the preview tool cannot screenshot
  WebGL. That has not changed, so the feedback loop for this work is still blind.
- Realistic ceiling for one person: a stylised character that reads as "mobile casino
  game". That is a different product from "feels like Evolution".

**What I would do instead: pre-rendered dealer, 2D/2.5D table.** Treat the dealer as a set
of short video plates (idle loop, deal gesture, shuffle, look-up, smile) with matched
first and last frames, driven by a small state machine, with the app drawing cards and
chips over it as it does now. The plates can come from image-to-video generation or from
an offline Blender render; either way the quality is not limited by what a browser can
rig and light in real time. This is how the look being imitated is actually produced.

It has its own risks, and they are real: keeping one face consistent across clips, clean
loop points, and loose sync between a gesture and a card appearing. Frame the dealer
chest-up, keep cards out of their hands, and let the shoe animation carry the dealing.
I would prototype one idle loop and one deal gesture before committing to anything — a
two-day test that answers the question the roadmap has "locked" without evidence.

Whichever way this goes, the engine should first **emit an ordered event list**
(card dealt to seat 3, hole card revealed, hand paid) alongside the snapshot. Every
presentation layer needs it, and it removes the log-string matching in §4.

### 5.2 Stylised dealer before photoreal — **agree, conditionally**

If the real-time 3D path is taken, stylised-first is plainly right; real-time photoreal
is out of reach. But it is a sound answer to a question I would not be asking. Note the
conflict it creates: the vision says "feels like a live Stake/Evolution table" and a
stylised avatar cannot deliver that, however polished.

### 5.3 Variants, tutorials and engine work before the dealer — **half agree**

Dealer last: yes. Phase 0 first: yes, and it is under-scoped (it does not mention E1–E5
or the missing auth). But **shipping is in Phase 4, after variants and after the 3D
rebuild**, and I think that is the plan's biggest sequencing error. Nothing has been
deployed. A portfolio project is worth what its link shows, and the launch hook the
roadmap itself names — "chess.com-style review for blackjack" — exists today and needs
correctness, not Pontoon.

### 5.4 Pontoon and Spanish 21 — **Spanish 21 yes, Pontoon no; engine not ready for either**

- **Spanish 21** is a good choice: widely played, genuinely different strategy, real
  teaching value. Be aware its correct strategy depends on how many cards are in the hand
  (the bonus 21s), which a rank-vs-upcard table cannot express.
- **British Pontoon**, as the roadmap describes it, is not a rule variation. Both dealer
  cards are hidden, so there is no upcard and the whole strategy model changes; "buy" lets
  you keep drawing after doubling; there is a five-card trick and a minimum standing
  total. The `RULESETS` flag dictionary in `CONTRACTS.md §6` cannot represent it; it needs
  different behaviour, not different settings.
- **What the audience would value more:** real-casino rule toggles — H17, late surrender,
  6:5, DAS off, resplit aces, peek vs no-peek — with strategy that adapts. The H17 toggle
  already exists and already gives wrong advice. Free Bet or Blackjack Switch would be
  better second variants than Pontoon.

The piece that makes all of this tractable is a **strategy generator**: compute the
EV-best action from the rule set by dynamic programming over the actual deck composition,
instead of typing tables. One component then fixes §1.3, makes the H17 and deck settings
honest, replaces the approximate learner panel, serves Spanish 21, and gives the review
screen the thing chess.com actually has — **the cost of each mistake in EV**, not three
hand-assigned severity labels.

### 5.5 One Claude session per department, coordinated by a contracts doc — **disagree**

- The codebase is about 8,000 lines of source. Seven departments is more org chart than
  there is code to own.
- The owner reviews and merges everything, so parallel sessions raise the volume of
  unreviewed change without raising throughput. The repo shows what that looks like:
  three table implementations, two abandoned 3D attempts, and a plan that has reversed
  on the dealer twice.
- A prose contract drifts, and this one already has. `CONTRACTS.md` says the server
  "validates turn ownership" (it trusts a client-supplied name), that insurance is "one
  per active seat" (not enforced, E2/E3), and lists `countVisibility: "hover"` as a value
  (never implemented).
- Parallel agents are only safe behind tests, and there are none.

What I would keep: the instinct to pin the backend/frontend boundary. Make it executable
— a schema or snapshot test for `to_json`, plus the simulation as a regression gate — and
run at most two streams at once, on branches, where the files truly do not overlap
(engine and tests; frontend).

---

## 6. Overall

**Overbuilt**

- Three table renderers, two 3D attempts, 182 MB of assets
- Google + Discord + Apple-scaffold OAuth, in front of a login that authenticates nothing
- Share-to-WhatsApp/Telegram/X/e-mail chips, the cut-the-deck ritual, phrase-variety
  systems in three places, a theme picker over a single background image
- Planning documents: four of them, mutually inconsistent

**Underbuilt**

- Authentication and input validation
- Tests (none run)
- Strategy and probability correctness — the core of the learning claim
- Server-side turn timer and disconnect handling — the core of the rooms claim
- Any deployment path

**Top risks**

1. The learning platform teaches wrong plays and penalises right ones. Anyone from
   r/blackjack will find 8,8 vs 10 within minutes, and that is the launch audience.
2. The 3D dealer absorbs months and lands below the "live casino" bar.
3. The project never ships, because shipping is scheduled after the two largest items.
4. Parallel sessions on an untested codebase regress the one part that is right.
5. A public demo with no auth gets its balances and usernames vandalised on day one.

**What I would change, in order**

1. **Make the engine's claims true and keep them true.** Commit the simulation and probes
   as the real test suite; delete `tests.py`. Fix E1–E5 and E8. About a week.
2. **Replace the typed strategy tables with a computed, rule-aware solver** and make it
   the single source for hints, the review, the chart and the bots. Delete
   `lib/strategy.js`'s copy of the tables. Grade mistakes by EV lost.
3. **Add real sessions and a server-side turn clock**, strip the hole card from
   broadcasts, validate every handler's input. Then deploy, with the dead assets removed.
4. **Launch the 2D version** on the review-screen hook and see what people ask for.
5. **Only then pick a dealer approach, by prototype**: two days on a video-plate dealer
   before a single hour on rigging. Add Spanish 21 once the solver exists; drop Pontoon.

---

## Summary

**Verdict:** a correct payout engine and a promising review feature, wrapped in a teaching
layer that is wrong in places it cannot afford to be, with no auth, no working tests and
no route to production. The plan spends the next several months on the two things that
matter least to whether this succeeds.

| Existing plan | My view |
|---|---|
| "Engine and money-math verified correct" | **Agree on payouts** (0.52% ± 0.06%, 0 violations in 8M rounds). **Disagree on the engine as a whole**: five serious bugs (E1–E5), one of which mints chips. |
| Full 3D R3F + real-time rigged dealer | **Disagree.** Fixed camera means pre-rendered beats real-time. Prototype video plates first. |
| Stylised dealer before photoreal | **Agree**, if 3D is done at all. |
| Variants and tutorials before the 3D dealer | **Agree** dealer is last. **Disagree** that shipping comes after both. |
| Pontoon + Spanish 21 via a ruleset config | **Spanish 21 yes, Pontoon no.** Build a strategy solver and real-casino rule toggles first; the flag dictionary cannot express Pontoon. |
| One session per department + `CONTRACTS.md` | **Disagree.** Too much process for 8,000 lines and one reviewer; replace the prose contract with tests, run two streams at most. |
| Phase 0: rewrite tests, fix soft 19 vs 6, deepen penetration | **Agree, and it is too small**: add the four strategy cells, legality-aware advice, E1–E5 and auth. |

**Top recommendations:** (1) simulation and probes become the test suite, fix the engine
bugs; (2) computed rule-aware strategy with EV-graded mistakes; (3) real auth, server turn
clock, deploy the 2D game; (4) decide the dealer by a two-day prototype, not by a locked
decision.
