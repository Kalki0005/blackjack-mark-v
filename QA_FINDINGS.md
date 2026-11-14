# QA Findings — Phase 0 (Testing/QA department)

Handoff to **Engine** and **Frontend**. QA changed **no engine logic and no frontend
code**; everything below is documented, not fixed.

## 1. State of the net

| Item | Result |
|---|---|
| `backend/tests.py` | **83 tests: 80 pass + 3 `expectedFailure` (known bugs, §3) · 0 fail · 0 error · 0 skipped** (~1.5 s) |
| `backend/sim.py` (1,000,000 rounds, seed 42) | house edge **0.4703%**, money invariant **OK** (every round: `balance Δ == payout − staked`) |
| `backend/sim.py` (3,000,000 rounds) | house edge **0.5903%**, invariant **OK** |
| Engine verdict | Matches the earlier verification (~0.5% for 6-deck / S17 / DAS / peek-on-A / no-peek-on-10). |

### How to run (one command each, from the repo root)

```powershell
& "C:\Users\Sai Shetty\OneDrive\Desktop\Blackjack\Mark V\venv\Scripts\python.exe" backend\tests.py
& "C:\Users\Sai Shetty\OneDrive\Desktop\Blackjack\Mark V\venv\Scripts\python.exe" backend\sim.py        # ~35 s, exit code 0/1
```

**Import convention (decided):** the backend uses **flat imports** everywhere
(`from game import Table`, `from db import db`). `tests.py`/`sim.py` insert their own
directory into `sys.path`, so they run from any cwd. The old `from backend.X import *`
style is gone (it conflicted with `models.py`'s `from db import db`).

**What the suite covers:** hand totals + soft-ace demotion; blackjack detection (incl.
not-on-split); split, split-aces (one card, auto-stand, 21 ≠ BJ pays 1:1), 4-hand resplit
cap; every resolution path + double math; insurance (peek-on-Ace, 3× payout; declined;
lost) and the **no-peek-on-10** late-dealer-BJ path; Perfect Pairs + 21+3 (all tiers,
stake + winnings returned, PP capped at main bet); S17 vs H17; shoe build/deal/cut/clamp/
reshuffle; probability sanity; strategy spot-checks; `to_json → from_snapshot` round-trip
(betting / mid-split / game_over); settings schema; **`strategy.js` ≡ `strategy.py` for all
1,690 two-card-hand × dealer-upcard cases (runs the real JS via node)**; bot driver
(`_seed_bots/_run_bots`) incl. a full 3-bot round.

**Not covered (gaps for later):** Socket.IO handlers and REST routes (no Flask test-client
tests yet), OAuth, DB persistence of stats (`_flush_round_to_db`), frontend (no JS test
runner exists). `import app` is forced onto in-memory SQLite so tests never touch a real DB.

---

## 2. Settings audit (CONTRACTS.md §5)

Legend — **WORKS**: changes behaviour as advertised · **PARTIAL**: works in part / with a
caveat · **DEAD**: selectable but has no effect. Evidence = code read (frontend not run in
a browser) plus engine tests.

| Setting | Verdict | Evidence |
|---|---|---|
| `numDecks` | **PARTIAL** | Engine: sizes the shoe correctly for 1/2/4/6/8 (`TestSettings`). **But 1 and 2 decks are broken — Bug B1** (reshuffle never flagged → shoe empties mid-round). UI offers `[1,2,4,6,8]` (`EngineSettings.jsx:114`). Frontend shoe gauge divides by the *viewer's saved* `settings.numDecks`, not the room's (`App.jsx:1227-1228`), so joining a room with a different deck count draws a wrong gauge. Trainer/EV panel ignore deck count (infinite-deck). Applies at room creation only (accurate to the "for new tables" copy). |
| `dealerHitsSoft17` | **PARTIAL** | Engine: **WORKS** — `play_dealer` hits A-6 when on, stands when off (`TestDealerRules`). UI: set at room creation and in Engine Settings. **Teaching layer ignores it:** `strategy.py` has no S17/H17 split and `probability.dealer_outcome_distribution` always stands on every 17, so hints/EV are S17-only. (`soft 19 vs 6 → double` is an H17-only play baked into the S17 default table — already on Engine's list.) |
| `countVisibility` | **DEAD for `"hover"`** | `"hidden"` works; `"always"` works. UI renders a **Hover** option (`EngineSettings.jsx:144-146`) but the only consumer is `const showCount = settings.countVisibility !== 'hidden'` (`App.jsx:655`) — `hover` is treated exactly as `always`. No `onMouseEnter`/hover logic exists. Also: the HUD is Learner-mode only (`App.jsx:1475`). |
| `showStrategyHints` | **WORKS** (display-only) | Gates the whole "Optimal Play" block (`App.jsx:1487`). Caveat: purely cosmetic — the server always computes and broadcasts `learnerPanel` (suggestion + reasoning) to every client in the room regardless; and it is Learner-mode only. |
| `showBustProb` | **WORKS** (nested) | Hides the "Bust if hit" row (`App.jsx:1492`). Nested inside `showStrategyHints`, so it does nothing when hints are off. |
| `showWinProb` | **WORKS** (nested) | Hides the "Win if stand" row (`App.jsx:1495`). Same nesting. The separate "Optimal W/L/P" row is **not** gated by it and stays visible. |
| `dealSpeed` | **PARTIAL** | Frontend-only (engine just stores it). Scales the *initial deal* stagger via `dealStep` → `PlayingCard`/`SeatSpot` and the deal-SFX timing (`App.jsx:384,651`). **Not scaled:** dealer-draw reveal, hit animations, and result delay use fixed constants (`0.2/0.45/0.6 s`, `App.jsx:652`, `:352`). The copy "pace of card animations between actions" over-promises. |
| `audioEnabled` | **WORKS** | `useAudio(settings.audioEnabled !== false)` → hook returns no audio context when false (`useAudio.js:57-65`). Not verified by ear. |
| `tableTheme` | **PARTIAL** | Felt/rail colour works (`Table2D` `THEMES.green/blue`, `.table-room[data-theme="blue"]`). **Studio backdrop does not change:** `THEME_BG = { green: bg_teal.png, blue: bg_teal.png }` (`App.jsx:189`) though the UI promises "matching studio ambiance". The in-room Options picker (`App.jsx:752`) saves to the user's prefs but the room renders its **creation-time** theme (`App.jsx:1214` prefers `tableState.settings`), so changing it mid-room visibly does nothing. Backend accepts any string. (Table2D is legacy per the roadmap.) |

Backend validation gap: `_normalize_settings` coerces booleans and `numDecks` but accepts
**any string** for `dealSpeed`, `countVisibility`, `tableTheme` (pinned by
`test_string_settings_are_not_validated`).

---

## 3. Engine bugs (reported, NOT fixed)

Each is pinned by an `expectedFailure` test in `TestKnownBugs`. When Engine fixes one, the
test flips to "unexpected success" — just delete its `@unittest.expectedFailure`.

| # | Severity | Bug | Evidence / repro |
|---|---|---|---|
| **B1** | **High** | **1- and 2-deck shoes never flag a reshuffle.** `cut_card_position = len − randint(104,156)` is ≤ 0 for 104 or fewer cards, so `reshuffle_needed` never fires. The shoe runs dry **mid-round**; `Shoe.deal()` silently rebuilds (impossible duplicate cards on the table, running count not reset). | 20,000-round basic-strategy probe: **1-deck: 590 rounds (2.9%) hit a mid-round rebuild, 203 rounds had more copies of one card than the shoe contains** (e.g. two A♠). **2-deck:** 280 mid-round rebuilds, 4 impossible-dupe rounds. 4/6/8 decks: 0/0. Test: `test_BUG_low_deck_shoe_must_flag_reshuffle_before_running_dry`. Fix idea: cut at a *fraction* of the shoe (e.g. 50–75%), which also delivers the roadmap's "~75% penetration". |
| **B2** | Medium | **Rejected actions are recorded as strategy "mistakes".** `execute_action` appends to `pending_mistakes` *before* validating, so an illegal `split` on a non-pair, an unaffordable `double`, or a junk verb (`"banana"`) pollutes `roundMistakes`/stats/the review screen even though nothing happened. | Probe: after `split` (non-pair) + `banana`, `pending_mistakes == ['SPLIT','BANANA']`. Test: `test_BUG_rejected_actions_are_not_strategy_mistakes`. Also: action isn't whitelisted to `{hit,stand,double,split}`. |
| **B3** | Medium-Low | **`insurance_bet` is lost on snapshot restore.** `from_snapshot` never restores `seat.insurance_bet`, though the stake was already deducted from the balance. A server restart / room rebuild mid-insurance forfeits the 2:1 payout (and leaves `insurance_responses` saying "decided"). | Probe: `insurance_bet` 50 → 0 after `from_snapshot`. Test: `test_BUG_insurance_bet_survives_snapshot_restore`. |
| B4 | Low (design limit) | **The shoe is not persisted.** A restored table gets a fresh shuffled shoe: cards currently in play can reappear in it, `runningCount` is restored against a different shoe (true count wrong), `shoePendingShuffle` is lost. The round-trip test deliberately excludes `cardCounting`/`shoePendingShuffle`. | Code read (`from_snapshot`). |
| B5 | Low | **Fractional-chip truncation on odd bets.** Insurance = `bet // 2` (bet 25 → 12) and blackjack = `int(bet*2.5)` (bet 15 → 37 not 37.5). Edge is exact only for even bets; the sim uses bet=100. | Code read (`buy_insurance`, `resolve_game`). |
| B6 | Info | **`app.py` migration is Postgres-only syntax** (`ADD COLUMN IF NOT EXISTS`). On a *pre-existing* local SQLite dev DB it fails (prints "auth_email migration note") so `auth_email` is never added and social login would break there. Fresh DBs are fine (`create_all`). Also prints noise on every `import app`. | Observed on every test run. Ops/Backend call. |

Verified-correct (deliberately probed, no bug): peek-on-Ace / no-peek-on-10; split-ace
auto-stand and 21 ≠ BJ; BJ never after split; 4-hand resplit cap; double math; all side-bet
tiers; S17/H17; per-round money conservation over 1M+ rounds.

---

## 4. CONTRACTS.md inaccuracies / gaps

1. **§4 `dealerHand` leaks the hole card.** `to_json` always sends *all* dealer cards; the
   frontend merely hides the second (`hideDealer`). Anyone reading the socket payload sees
   it during `playing`/`insurance`. Fine for play-money solo; must be fixed before real
   multiplayer/Phase 4 — and **Pontoon (both cards face down) cannot ship on this contract**.
   Likewise `learnerPanel` (the optimal move) is broadcast to every client in the room.
2. **§4 `playerStats` is effectively always `{}` on the wire** for DB users: `app.py`
   `_flush_round_to_db` calls `table.player_stats.clear()` *before* the `state_update`
   broadcast, and the frontend never reads `playerStats` (stats come from REST
   `/api/stats`). Either document that, or stop sending it. (`roundMistakes` is correctly
   preserved.)
3. **§4 `logs` "(Learner mode only)"** — the server always sends `logs`; Classic/Learner is a
   client-only toggle (`gameMode`), not in the contract.
4. **§2 `error` event** is emitted only by `join_room` (room not found). Every other
   validation failure (insufficient funds, seat taken, seat cap, illegal action, missing
   user in `sit_player`) is **silent** — visible only as a `logs` line.
5. **§5 `numDecks`** — valid values are really `{1,2,4,6,8}` (UI), unvalidated server-side,
   and **1 and 2 are currently broken (B1)**. `countVisibility: "hover"` is in the schema
   but unimplemented. String settings are unvalidated.
6. **§3 REST** omits `GET|POST /api/auth/apple/login` (scaffold; always redirects with an
   error).
7. **§7 house-edge note:** ≈0.5% confirmed (0.47% @1M, 0.59% @3M). The sim's std-error is
   ~0.115% @1M, so QA's band is 0.3–0.8% and the default run is 1M rounds; don't shorten it.
8. **§5 "Frontend keeps `lib/strategy.js` in sync"** — now **enforced by a test**
   (`TestFrontendStrategySync`); currently in sync. Note it skips if `node` is absent.

---

## 5. Hand-over notes

- **Engine:** B1 first (blocks the UI's own 1/2-deck options), then B2, B3. Strategy/EV
  rule-awareness (S17/H17/decks/DAS) is already in your Phase 0 scope; `TestFrontendStrategySync`
  will fail the moment you change `strategy.py` without mirroring `strategy.js` — update both.
- **Frontend:** `countVisibility: hover` (implement or remove the option), `tableTheme`
  backdrop + in-room picker, `dealSpeed` coverage, shoe-gauge uses room's deck count.
- **Everyone:** run `backend\tests.py` before merging; run `backend\sim.py` after *any*
  change to `game.py` money paths. Phase 1 (ruleset refactor) must reproduce the sim numbers
  for the Classic config.
