# Blackjack Mark V — Shared Contracts

The interface boundary between departments. **Read before any task. Changing anything here
is a negotiated edit announced to all departments — never a silent drift.** Backend owns the
server side of these; Frontend/3D code against them; a new field is additive and
back-compatible unless called out.

Verified against code Nov 2026 (`backend/app.py`, `backend/game.py` `to_json`/`to_snapshot`);
Phase 1 engine fixes (E2–E6, E8) reflected.

---

## 1. WebSocket — client → server
Socket.IO, default namespace. Server replies by broadcasting `state_update` to the room
(plus a direct `room_created`/`room_joined` to the caller). `room` is the 6-char code.

| Event | Payload | Notes |
|---|---|---|
| `create_room` | `{username, settings?, is_public?, solo?, room_name?, bots?}` | `settings` overrides the host's saved settings; `bots` 0–3 (ignored if `solo`). |
| `join_room` | `{room}` | Rebuilds from DB snapshot if not in memory. |
| `sit_player` | `{room, username, seats:[int], main_bet, pp_bet, t3_bet}` | Locks bets; cap 3 seats/player in rooms, uncapped solo. Validated: ints, `main_bet > 0`, side bets ≥ 0, unique seats in 1..7. |
| `leave_table` | `{room, username}` | Only during `betting`. |
| `execute_deal` | `{room, cut?}` | `cut` 0.05–0.95 cut fraction (math-neutral rotation) when a shuffle is pending. |
| `submit_action` | `{room, username, action}` | `action ∈ {hit, stand, double, split}`. Server checks the *named* user owns the turn — but `username` is client-supplied (no auth yet, see §8). Anything not legal for the hand right now (unknown verb, split on a non-pair or at 4 hands, double on 3+ cards or unaffordable) is a silent no-op and is **not** graded as a strategy mistake. Mistakes are graded against the best *legal* play ("double" unavailable → hit, or stand on soft 18/19). |
| `buy_insurance` | `{room, seat_number, wants_insurance}` | Exactly one decision per seat **in the round**; repeats and seats not in `activeSeatNumbers` are ignored. Unaffordable insurance counts as declined. The phase closes once every active seat has decided. (Seat ownership is not checked — no auth yet, §8.) |
| `clear_round` | `{room}` | Reset to `betting` for the next round. |
| `reload_bankroll` | `{room, username}` | Tops balance up to $5,000 (only raises). |

## 2. WebSocket — server → client
| Event | Payload |
|---|---|
| `room_created` | `{room, state}` (state = §4 snapshot) |
| `room_joined` | `{room, state}` |
| `state_update` | the §4 snapshot (broadcast to room on every change) |
| `error` | `{message}` |

## 3. REST
Auth: `POST /api/register`, `POST /api/login`, `GET /api/auth/config`,
`POST /api/auth/google`, `GET /api/auth/discord/login`, `GET /api/auth/discord/callback`,
`POST /api/account/rename {username, new_username}`.
Data: `GET /api/stats/<username>`, `GET|PUT /api/settings/<username>`,
`GET /api/rooms/public`, `GET /api/rooms/<username>`.

## 4. Game state snapshot (`Table.to_json()`)
The single source of truth the frontend renders. Shape:
```
{
  gameState: "betting"|"insurance"|"playing"|"dealer_turn"|"game_over",
  isPublic, isSolo, shoePendingShuffle, hostName, roomName,
  botNames: [str],
  logs: [str],                       // verbose round log (Learner mode only)
  roundMistakes: [mistake],          // harvested at game_over for the review screen
  activeSeatNumbers: [int], activeSeatTurnIdx, activeHandIndex,
  seats: [{
    number, isOccupied, playerName, balance,
    bet, ppBet, t3Bet, insuranceBet,   // insuranceBet: 0 unless bought this round
    ppDisplay, t3Display,            // total return if resolved, else the stake
    sidebetResults: {pp, t3},        // null=unresolved, 0=lost, >0=total returned
    isActiveTurn, insuranceDecisionMade,
    hands: [{
      cards:[str], total, bet, isBust, isBlackjack,
      canDouble, canSplit, canHit,   // UI gating — authoritative
      fromSplit, fromSplitAces,
      outcome: null|"win"|"loss"|"push"|"blackjack", payout
    }]
  }],
  players: [{name, balance, seats:[int], isReady}],
  playerStats: { <name>: {hands_won, hands_lost, hands_push, blackjacks,
                          total_earned, mistakes_count, lucky_mistakes_count,
                          mistakes_history:[mistake]} },
  learnerPanel: null | { suggestion, activeSeat, activePlayer, reasoning,
                         bustIfHit, winIfStand:{win,lose,push},
                         optimalPlay:{win,lose,push} },
  cardCounting: { runningCount, trueCount, remainingCards },
  settings: <settings>,              // §5
  dealerHand: { cards:[str], total }
}
mistake = {player_total, dealer_upcard, user_action, recommended_action,
           is_soft, is_pair, cards:[str], hand_outcome?, username?}
```
Card string = rank+suit, e.g. `"A♠"`, `"10♥"`. Suits: ♠♥♦♣.

**Persisted snapshot (`Table.to_snapshot()`, server-only).** `GameRoom.state` stores the §4
snapshot **plus** a private `engine` block: `{shoe:{numDecks, cards:[str], cutCardPosition,
reshuffleNeeded}, insuranceResponses:{"<seat>":bool}, readyPlayers:[str],
pendingMistakes:{"<seat>":[[mistake]...per hand]}}`. `from_snapshot(to_snapshot())`
round-trips exactly (one `Player` per name across seats, insurance bet, shoe and count).
The `engine` block holds the **future card order** — never send it to a client; REST
uses `Table.public_view()`. Legacy snapshots without it restore with a fresh shoe and
`runningCount` 0.

## 5. Settings schema (`Table._normalize_settings`)
```
{ numDecks:int, dealerHitsSoft17:bool, countVisibility:"always"|"hover"|"hidden",
  showStrategyHints:bool, showBustProb:bool, showWinProb:bool,
  dealSpeed:"slow"|"normal"|"fast", audioEnabled:bool, tableTheme:str }
```
Persisted per user (`UserSettings`); a room snapshots the host's at creation. **Frontend keeps
`lib/strategy.js` in sync with `backend/strategy.py`.**

## 6. Ruleset model — TARGET (Phase 2/5, not yet built)
Variants become data, not forks. Classic must reproduce the *current* verified behavior
(prove with the sim). Proposed shape the engine reads instead of hardcoded rules:
```
RULESETS["classic"|"pontoon"|"spanish21"] = {
  decks, deckComposition: "standard"|"spanish"(no 10 pips),
  dealerHitsSoft17, peek: {ace:bool, ten:bool},
  blackjackPays: 1.5, dealerCardsFaceDown:int,  // pontoon=2
  das:bool, resplitAces:bool, maxSplitHands:int, surrender:"none"|"late",
  fiveCardTrick:bool, playerBlackjackAlwaysWins:bool,  // spanish21
  bonusPayouts: {...}                                    // spanish21 21-bonuses
}
```
Flags alone cannot express every variant: British Pontoon (no upcard, buy/twist, five-card
trick) and Blackjack Switch need **behaviour hooks** in the engine, not just settings.
Strategy comes from the Phase 2 solver, not hand-typed tables. Each variant also ships: its strategy table (backend + `lib/strategy.js` mirror) and its
tutorial content. `submit_action` gains variant actions where needed (Pontoon twist/stick/buy
map onto hit/stand/double or new verbs — decide at build time, document here).

## 7. Invariants (QA guards these)
- Money: bet deducted up front; win pays 2×, blackjack 2.5×, push 1×, double/split stake ×2.
  Basic-strategy sim house edge ≈ 0.5% (6-deck S17/DAS/no-peek-on-10).
- Peek on Ace (insurance resolves, dealer BJ ends round pre-action); **no peek on 10**
  (doubles/splits lost to a late dealer BJ stay lost) — intentional, do not "fix".
- Split aces: one card each, auto-stand, 21 is **not** blackjack (pays 1:1).
- Blackjack only on the initial 2 cards, never after split.
- Shoe: cut card at ~75% penetration (72–78% dealt, any deck count). A round only starts
  with ≥ (seats+1)×4 cards left, else the shoe is reshuffled first (`shoePendingShuffle`
  is raised at `clear_round`). If a shoe still runs dry mid-round, only the discards are
  reshuffled (never a card on the table) and the count restarts from the cards in play.
  Hi-Lo invariant: `runningCount` + Hi-Lo sum of the cards left in the shoe = 0.

## 8. Known gaps (fix in Phase 3 — do not build on these as if they were true)
- **No authentication.** `username` in every socket event and REST write is trusted as sent.
- **Hole card leaks:** `dealerHand.cards` includes the face-down card during play; the
  client just hides it. Same for `learnerPanel` (broadcast to the whole room).
- **Silent failures:** only `join_room` emits `error`; other rejections just append a log line.
- **`playerStats` is usually `{}`** on the wire (cleared before broadcast); stats come from REST.
- **Settings are not fully validated** (string fields accept anything);
  `countVisibility: "hover"` is unimplemented. (`numDecks` 1/2 fixed in Phase 1.)
- **`dealer_turn` is never observed** by clients: the dealer plays out inside one call.
