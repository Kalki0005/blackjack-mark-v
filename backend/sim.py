"""
Blackjack Mark V — basic-strategy simulation harness  (QA money-math guard)
===========================================================================

A PERMANENT regression guard for the money math — not a throwaway. It seats one
basic-strategy player with a huge bankroll against the live engine (game.py),
plays N rounds, and asserts two things:

  1. MONEY INVARIANT (exact, every round):
        balance delta == total payout - total staked
     This is the core guarantee that the engine never creates or destroys chips.

  2. HOUSE EDGE lands in the expected band (~0.3%-0.8%) for the verified
     6-deck / dealer-stands-soft-17 / double-after-split / no-peek-on-10 game.
     Textbook basic strategy on these rules is ~0.5%.

HOW TO RUN (from the repo root, with the project venv):

    "C:\\Users\\Sai Shetty\\OneDrive\\Desktop\\Blackjack\\Mark V\\venv\\Scripts\\python.exe" backend\\sim.py

Optional: `backend\\sim.py 3000000` overrides the round count (default 1,000,000,
~35s). The std-error of the measured edge is ~1.15/sqrt(N): ~0.115% at 1M rounds,
so keep N >= 1M or the 0.3%-0.8% band can be tripped by noise alone. Runs are
seeded, so a given N is fully reproducible.

The player uses backend/strategy.py's basic_strategy() for every decision and
falls back to hit/stand when a double or split is not legal in the moment. It
always DECLINES insurance (insurance is a -EV side bet and is not part of the
house-edge baseline).
"""

import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from game import Table
from strategy import basic_strategy

# Verified-game ruleset for the house-edge baseline (engine defaults).
BASELINE_SETTINGS = {
    "numDecks": 6,
    "dealerHitsSoft17": False,   # dealer stands on soft 17
}

# House edge tolerance band (fraction of total initial wager).
EDGE_LOW = 0.003    # 0.3%
EDGE_HIGH = 0.008   # 0.8%


def _decide(table, player, seat):
    """Basic-strategy decision for the active hand, with legal-move fallback."""
    hand = seat.hands[table.current_hand_idx]
    action = basic_strategy(hand, table.dealer_hand.cards[0])

    # Fall back to hit/stand when the book play is not available right now.
    if action == "double" and (len(hand.cards) != 2 or not player.can_afford(hand.bet)):
        action = "hit"
    if action == "split" and (len(seat.hands) >= 4
                              or not hand.can_split()
                              or not player.can_afford(hand.bet)):
        action = "hit" if hand.total() < 17 else "stand"
    return action


def _play_out(table, player):
    """Play the single seat's turn(s) until the round leaves 'playing'."""
    guard = 0
    while table.game_state == "playing" and guard < 10000:
        guard += 1
        idx = table.current_seat_turn_idx
        if idx >= len(table.active_seat_numbers):
            break
        seat = table.seats[table.active_seat_numbers[idx] - 1]
        if table.current_hand_idx >= len(seat.hands):
            break
        table.execute_action(player.name, _decide(table, player, seat))


def run_sim(rounds=1000000, bet=100, seed=42, settings=None, verbose=False):
    """Play `rounds` basic-strategy rounds. Returns a stats dict.

    Note: bet should be >= 100 so blackjack's int(bet * 2.5) is exact (a bet of
    1 would round the 3:2 payout down and distort the measured edge).
    """
    random.seed(seed)
    table = Table(settings=settings if settings is not None else BASELINE_SETTINGS)
    table.add_player("Sim", [1], bet, 0, 0, current_balance=10 ** 12)
    player = table.get_unique_players()[0]

    start_balance = player.balance
    total_wagered = 0          # sum of the per-round MAIN bet (house-edge denominator)
    invariant_ok = True
    first_violation = None

    for i in range(rounds):
        before = player.balance

        table.deal_initial()
        if table.game_state == "insurance":
            table.buy_insurance(1, False)    # always decline insurance
        _play_out(table, player)

        # Per-round money invariant: chips out - chips in == balance change.
        seat = table.seats[0]
        staked = sum(h.bet for h in seat.hands)       # all chips committed this round
        returned = sum(h.payout for h in seat.hands)  # all chips returned this round
        delta = player.balance - before
        if delta != returned - staked:
            invariant_ok = False
            if first_violation is None:
                first_violation = {
                    "round": i, "delta": delta,
                    "staked": staked, "returned": returned,
                }

        total_wagered += bet
        table.reset_round()

    net = player.balance - start_balance
    house_edge = (-net) / total_wagered if total_wagered else 0.0

    return {
        "rounds": rounds,
        "bet": bet,
        "seed": seed,
        "net": net,
        "total_wagered": total_wagered,
        "house_edge": house_edge,
        "house_edge_pct": house_edge * 100,
        "invariant_ok": invariant_ok,
        "first_violation": first_violation,
        "final_balance": player.balance,
    }


def main():
    rounds = 1000000
    if len(sys.argv) > 1:
        rounds = int(sys.argv[1])

    print(f"Running basic-strategy simulation: {rounds:,} rounds "
          f"(6-deck, stand soft-17, DAS, no-peek-on-10)...")
    result = run_sim(rounds=rounds)

    print("-" * 60)
    print(f"  rounds          : {result['rounds']:,}")
    print(f"  total wagered   : {result['total_wagered']:,}")
    print(f"  net (player)    : {result['net']:,}")
    print(f"  house edge      : {result['house_edge_pct']:.4f}%")
    print(f"  money invariant : {'OK' if result['invariant_ok'] else 'VIOLATED'}")
    print("-" * 60)

    ok = True
    if not result["invariant_ok"]:
        ok = False
        print(f"FAIL: money invariant violated: {result['first_violation']}")
    if not (EDGE_LOW <= result["house_edge"] <= EDGE_HIGH):
        ok = False
        print(f"FAIL: house edge {result['house_edge_pct']:.4f}% outside "
              f"[{EDGE_LOW*100:.1f}%, {EDGE_HIGH*100:.1f}%]")

    if ok:
        print("PASS: money invariant holds and house edge is in the expected band.")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
