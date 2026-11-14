"""
Blackjack Mark V — automated test suite  (QA / Phase 0 regression net)
======================================================================

Runs against the CURRENT engine API (game.py: Table.add_player / deal_initial /
execute_action / buy_insurance / reset_round / to_json / from_snapshot;
Hand / Shoe / Card / Player / Seat).

HOW TO RUN (one documented command, from the repo root):

    "C:\\Users\\Sai Shetty\\OneDrive\\Desktop\\Blackjack\\Mark V\\venv\\Scripts\\python.exe" backend\\tests.py

or, equivalently, from inside backend/ with the same interpreter:

    <venv-python> -m unittest tests -v

Import convention: the whole backend uses FLAT imports (`from game import ...`,
`from db import db`). This file matches that — the `sys.path` insert below puts
backend/ on the path so the suite runs from any working directory. (The old
`from backend.X import *` style conflicted with models.py's `from db import db`
and is gone.)

The engine's game logic and money math are VERIFIED CORRECT and are NOT modified
by QA. If a test here fails, it means a real regression — see QA_FINDINGS.md.
"""

import os
import sys
import unittest
from unittest.mock import patch

# --- Put backend/ on the path so flat imports resolve from any cwd. ----------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from game import Table, Card, Hand, Shoe, Player, Seat
from strategy import basic_strategy
from probability import (
    bust_probability,
    dealer_bust_probability,
    dealer_outcome_distribution,
    player_win_probability,
    optimal_win_probability,
    _is_soft_total,
)
from sidebets import check_perfect_pairs, check_21_plus_3


# =====================================================================
# Test helpers — deterministic dealing via a stacked shoe.
# =====================================================================

def make_hand(*cards, bet=0):
    """Build a Hand from (rank, suit) tuples."""
    h = Hand(bet=bet)
    for rank, suit in cards:
        h.add(Card(rank, suit))
    return h


def _stack(table, seq):
    """Replace the table's shoe with an exact, ordered deck (front dealt first).

    cut_card_position is pushed far negative so the engine never auto-reshuffles
    mid-scenario (which would rebuild a random shoe and ruin determinism).
    """
    table.shoe.cards = [Card(r, s) for (r, s) in seq]
    table.shoe.cut_card_position = -10 ** 9
    table.shoe.reshuffle_needed = False


def seat_and_deal(player_cards, dealer_cards, rest=None, bet=100,
                  pp=0, t3=0, settings=None, balance=100000, name="P"):
    """Seat one player on seat 1 and deal a controlled round.

    deal_initial deals in the order p0, d0, p1, d1, so the player ends up with
    `player_cards` and the dealer with `dealer_cards`; `rest` feeds later draws.
    Returns (table, seat_1).
    """
    t = Table(settings=settings)
    t.add_player(name, [1], bet, pp, t3, current_balance=balance)
    seq = [player_cards[0], dealer_cards[0], player_cards[1], dealer_cards[1]]
    seq += (rest or [])
    _stack(t, seq)
    t.deal_initial()
    return t, t.seats[0]


# =====================================================================
# 1. Hand totals, soft-ace demotion, blackjack detection
# =====================================================================

class TestHandTotals(unittest.TestCase):

    def test_simple_hard_total(self):
        self.assertEqual(make_hand(('8', '♠'), ('9', '♥')).total(), 17)

    def test_face_cards_are_ten(self):
        self.assertEqual(make_hand(('J', '♠'), ('Q', '♥')).total(), 20)

    def test_soft_seventeen(self):
        self.assertEqual(make_hand(('A', '♠'), ('6', '♥')).total(), 17)

    def test_ace_demotes_to_one_when_needed(self):
        # A + K + 5  ->  ace must count as 1  ->  16
        self.assertEqual(make_hand(('A', '♠'), ('K', '♥'), ('5', '♦')).total(), 16)

    def test_two_aces(self):
        self.assertEqual(make_hand(('A', '♠'), ('A', '♥')).total(), 12)

    def test_two_aces_plus_nine(self):
        self.assertEqual(make_hand(('A', '♠'), ('A', '♥'), ('9', '♦')).total(), 21)

    def test_many_aces_demote(self):
        # 4 aces -> 11 + 1 + 1 + 1 = 14
        self.assertEqual(make_hand(('A', '♠'), ('A', '♥'),
                                   ('A', '♦'), ('A', '♣')).total(), 14)

    def test_bust(self):
        h = make_hand(('K', '♠'), ('J', '♥'), ('5', '♦'))
        self.assertEqual(h.total(), 25)
        self.assertTrue(h.is_bust())

    def test_soft_flag(self):
        self.assertTrue(_is_soft_total(make_hand(('A', '♠'), ('6', '♥'))))
        self.assertFalse(_is_soft_total(make_hand(('9', '♠'), ('6', '♥'))))
        # ace forced to 1 is no longer soft
        self.assertFalse(_is_soft_total(make_hand(('A', '♠'), ('K', '♥'), ('5', '♦'))))


class TestBlackjackDetection(unittest.TestCase):

    def test_natural_blackjack(self):
        self.assertTrue(make_hand(('A', '♠'), ('K', '♥')).is_blackjack())

    def test_three_card_21_is_not_blackjack(self):
        h = make_hand(('7', '♠'), ('7', '♥'), ('7', '♦'))
        self.assertEqual(h.total(), 21)
        self.assertFalse(h.is_blackjack())

    def test_blackjack_not_on_split_hand(self):
        # A hand built from a split can never be a "blackjack" even at 21.
        h = make_hand(('A', '♠'), ('K', '♥'))
        h.from_split = True
        self.assertFalse(h.is_blackjack())

    def test_can_split_same_rank(self):
        self.assertTrue(make_hand(('8', '♠'), ('8', '♥')).can_split())

    def test_can_split_ten_values(self):
        self.assertTrue(make_hand(('K', '♠'), ('J', '♥')).can_split())

    def test_cannot_split_different_values(self):
        self.assertFalse(make_hand(('8', '♠'), ('9', '♥')).can_split())

    def test_ace_split_cannot_resplit(self):
        h = make_hand(('A', '♠'), ('A', '♥'))
        h.from_split_aces = True
        self.assertFalse(h.can_split())


# =====================================================================
# 2. Split mechanics (regular + aces), resplit limit
# =====================================================================

class TestSplit(unittest.TestCase):

    def test_split_aces_one_card_each_and_auto_stand(self):
        # A,A vs dealer 9/8 (17). Split aces: one card each, auto-stand.
        t, seat = seat_and_deal(
            player_cards=[('A', '♠'), ('A', '♥')],
            dealer_cards=[('9', '♣'), ('8', '♦')],
            rest=[('10', '♣'), ('6', '♦')],   # hand0 -> A+10=21, hand1 -> A+6=17
            bet=100, balance=10000,
        )
        t.execute_action("P", "split")

        self.assertEqual(t.game_state, "game_over")
        self.assertEqual(len(seat.hands), 2)
        h0, h1 = seat.hands
        # one card each -> each hand has exactly 2 cards
        self.assertEqual(len(h0.cards), 2)
        self.assertEqual(len(h1.cards), 2)
        self.assertTrue(h0.from_split_aces and h1.from_split_aces)

    def test_split_ace_21_is_not_blackjack_pays_1_to_1(self):
        t, seat = seat_and_deal(
            player_cards=[('A', '♠'), ('A', '♥')],
            dealer_cards=[('9', '♣'), ('8', '♦')],   # dealer 17
            rest=[('10', '♣'), ('6', '♦')],           # hand0 = A+10 = 21
            bet=100, balance=10000,
        )
        t.execute_action("P", "split")
        h0 = seat.hands[0]
        self.assertEqual(h0.total(), 21)
        self.assertFalse(h0.is_blackjack())          # 21 after split != blackjack
        self.assertEqual(h0.outcome, "win")          # beats 17
        self.assertEqual(h0.payout, 200)             # 1:1 -> 2x stake (NOT 2.5x)

    def test_split_ace_cannot_hit(self):
        t, seat = seat_and_deal(
            player_cards=[('A', '♠'), ('A', '♥')],
            dealer_cards=[('9', '♣'), ('8', '♦')],
            rest=[('5', '♣'), ('6', '♦')],
            bet=100, balance=10000,
        )
        t.execute_action("P", "split")
        for h in t.to_json()["seats"][0]["hands"]:
            self.assertFalse(h["canHit"])            # split aces: no more cards

    def test_regular_split_resolves_both_hands(self):
        # 8,8 vs dealer 20. Each 8 draws one card; we then stand both.
        t, seat = seat_and_deal(
            player_cards=[('8', '♠'), ('8', '♥')],
            dealer_cards=[('K', '♣'), ('10', '♦')],  # dealer 20
            rest=[('10', '♣'), ('10', '♥')],          # hand0=18, hand1=18
            bet=100, balance=10000,
        )
        t.execute_action("P", "split")
        self.assertEqual(len(seat.hands), 2)
        # both are 8+10 = 18, playable, stand them
        t.execute_action("P", "stand")
        t.execute_action("P", "stand")
        self.assertEqual(t.game_state, "game_over")
        for h in seat.hands:
            self.assertEqual(h.outcome, "loss")       # 18 loses to 20

    def test_resplit_capped_at_four_hands(self):
        t, seat = seat_and_deal(
            player_cards=[('8', '♠'), ('8', '♥')],
            dealer_cards=[('10', '♣'), ('7', '♦')],   # dealer 17
            rest=[('8', '♦')] * 10,                    # endless 8s to split
            bet=100, balance=100000,
        )
        t.execute_action("P", "split")   # 2 hands
        t.execute_action("P", "split")   # 3 hands
        t.execute_action("P", "split")   # 4 hands
        self.assertEqual(len(seat.hands), 4)
        t.execute_action("P", "split")   # rejected — max 4 hands
        self.assertEqual(len(seat.hands), 4)
        for h in seat.hands:
            self.assertEqual(len(h.cards), 2)          # one card each on split


# =====================================================================
# 3. Resolution paths + double stake/payout math
# =====================================================================

class TestResolution(unittest.TestCase):

    def test_win_pays_2x(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('10', '♥')],   # 20
            dealer_cards=[('10', '♣'), ('8', '♦')],    # 18
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        h = seat.hands[0]
        self.assertEqual(h.outcome, "win")
        self.assertEqual(h.payout, 200)
        self.assertEqual(seat.player.balance, 10000 - 100 + 200)

    def test_blackjack_pays_2_5x(self):
        t, seat = seat_and_deal(
            player_cards=[('A', '♠'), ('K', '♥')],     # natural BJ
            dealer_cards=[('9', '♣'), ('8', '♦')],     # dealer 17, no BJ
            bet=100, balance=10000,
        )
        h = seat.hands[0]
        self.assertEqual(t.game_state, "game_over")
        self.assertEqual(h.outcome, "blackjack")
        self.assertEqual(h.payout, 250)                # int(100 * 2.5)
        self.assertEqual(seat.player.balance, 10000 - 100 + 250)

    def test_push_returns_stake(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('10', '♥')],   # 20
            dealer_cards=[('10', '♣'), ('10', '♦')],   # 20
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        h = seat.hands[0]
        self.assertEqual(h.outcome, "push")
        self.assertEqual(h.payout, 100)
        self.assertEqual(seat.player.balance, 10000)

    def test_loss_pays_nothing(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('8', '♥')],    # 18
            dealer_cards=[('10', '♣'), ('10', '♦')],   # 20
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        h = seat.hands[0]
        self.assertEqual(h.outcome, "loss")
        self.assertEqual(h.payout, 0)
        self.assertEqual(seat.player.balance, 10000 - 100)

    def test_bust_loses(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('6', '♥')],    # 16
            dealer_cards=[('9', '♣'), ('7', '♦')],     # 16 (won't matter)
            rest=[('10', '♦')],                         # hit -> 26 bust
            bet=100, balance=10000,
        )
        t.execute_action("P", "hit")
        h = seat.hands[0]
        self.assertTrue(h.is_bust())
        self.assertEqual(h.outcome, "loss")
        self.assertEqual(seat.player.balance, 10000 - 100)

    def test_double_win_doubles_stake_and_payout(self):
        t, seat = seat_and_deal(
            player_cards=[('6', '♠'), ('5', '♥')],     # 11
            dealer_cards=[('6', '♣'), ('10', '♦')],    # 16, will draw
            rest=[('9', '♠'), ('10', '♥')],            # double -> 20 ; dealer 26 bust
            bet=100, balance=10000,
        )
        t.execute_action("P", "double")
        h = seat.hands[0]
        self.assertEqual(h.bet, 200)                   # stake doubled
        self.assertEqual(h.outcome, "win")
        self.assertEqual(h.payout, 400)                # 2x the doubled stake
        self.assertEqual(seat.player.balance, 10000 - 100 - 100 + 400)

    def test_double_loss_loses_doubled_stake(self):
        t, seat = seat_and_deal(
            player_cards=[('6', '♠'), ('5', '♥')],     # 11
            dealer_cards=[('10', '♣'), ('9', '♦')],    # 19
            rest=[('2', '♠')],                          # double -> 13
            bet=100, balance=10000,
        )
        t.execute_action("P", "double")
        h = seat.hands[0]
        self.assertEqual(h.bet, 200)
        self.assertEqual(h.outcome, "loss")
        self.assertEqual(seat.player.balance, 10000 - 200)


# =====================================================================
# 4. Insurance — peek on Ace, and no-peek on 10
# =====================================================================

class TestInsurance(unittest.TestCase):

    def test_ace_upcard_opens_insurance(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],
            dealer_cards=[('A', '♣'), ('5', '♦')],     # Ace up, no BJ
            bet=100, balance=10000,
        )
        self.assertEqual(t.game_state, "insurance")

    def test_insurance_wins_on_dealer_blackjack(self):
        # Ace up + 10 hole = dealer BJ. Insurance pays 2:1 (returns 3x stake).
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],    # 17, not BJ
            dealer_cards=[('A', '♣'), ('10', '♦')],    # dealer BJ
            bet=100, balance=10000,
        )
        self.assertEqual(t.game_state, "insurance")
        t.buy_insurance(1, True)                        # stake = 100 // 2 = 50
        self.assertEqual(t.game_state, "game_over")
        h = seat.hands[0]
        self.assertEqual(h.outcome, "loss")             # main bet lost to dealer BJ
        # -100 main -50 insurance +150 insurance payout = net 0
        self.assertEqual(seat.player.balance, 10000)

    def test_insurance_lost_when_no_dealer_blackjack(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('9', '♥')],     # 19
            dealer_cards=[('A', '♣'), ('6', '♦')],      # Ace up, soft 17, NO BJ
            bet=100, balance=10000,
        )
        t.buy_insurance(1, True)                         # -50, insurance lost
        self.assertEqual(t.game_state, "playing")
        # insurance already resolved as lost: main (-100) + insurance (-50) gone
        self.assertEqual(seat.player.balance, 10000 - 100 - 50)
        t.execute_action("P", "stand")                   # stand 19; dealer stands soft 17
        h = seat.hands[0]
        self.assertEqual(h.outcome, "win")               # 19 beats 17
        # -100 main -50 insurance (lost) +200 win = +50
        self.assertEqual(seat.player.balance, 10050)

    def test_declining_insurance_costs_nothing(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],
            dealer_cards=[('A', '♣'), ('10', '♦')],      # dealer BJ
            bet=100, balance=10000,
        )
        t.buy_insurance(1, False)
        self.assertEqual(t.game_state, "game_over")
        self.assertEqual(seat.player.balance, 10000 - 100)  # only main bet lost

    def test_no_peek_on_ten_doubled_hand_stays_lost(self):
        # Dealer shows 10 (NOT Ace) with an Ace in the hole = blackjack, but the
        # table intentionally does NOT peek on a 10. The player doubles, then
        # loses the full doubled stake to the late dealer blackjack.
        t, seat = seat_and_deal(
            player_cards=[('6', '♠'), ('5', '♥')],       # 11
            dealer_cards=[('10', '♣'), ('A', '♦')],      # dealer BJ, 10 up
            rest=[('9', '♠')],                             # double -> 20
            bet=100, balance=10000,
        )
        self.assertEqual(t.game_state, "playing")        # no insurance on a 10
        t.execute_action("P", "double")
        h = seat.hands[0]
        self.assertEqual(h.bet, 200)
        self.assertEqual(h.outcome, "loss")              # 20 loses to dealer BJ
        self.assertEqual(seat.player.balance, 10000 - 200)  # full doubled stake lost


# =====================================================================
# 5. Side bets — Perfect Pairs + 21+3 (resolved by the engine at deal)
# =====================================================================

class TestSideBets(unittest.TestCase):

    def _deal_sidebet(self, p0, p1, up, hole, pp=0, t3=0, bet=100, balance=10000):
        return seat_and_deal(
            player_cards=[p0, p1],
            dealer_cards=[up, hole],
            pp=pp, t3=t3, bet=bet, balance=balance,
        )

    # ---- Perfect Pairs: perfect 25x / colored 12x / mixed 6x ----

    def test_perfect_pair(self):
        _, seat = self._deal_sidebet(('8', '♠'), ('8', '♠'),
                                     ('9', '♣'), ('5', '♦'), pp=10)
        self.assertEqual(seat.sidebet_results["pp"], 10 * 25 + 10)   # 260

    def test_colored_pair(self):
        _, seat = self._deal_sidebet(('8', '♠'), ('8', '♣'),
                                     ('9', '♣'), ('5', '♦'), pp=10)
        self.assertEqual(seat.sidebet_results["pp"], 10 * 12 + 10)   # 130

    def test_mixed_pair(self):
        _, seat = self._deal_sidebet(('8', '♠'), ('8', '♥'),
                                     ('9', '♣'), ('5', '♦'), pp=10)
        self.assertEqual(seat.sidebet_results["pp"], 10 * 6 + 10)    # 70

    def test_no_pair_loses_pp(self):
        _, seat = self._deal_sidebet(('8', '♠'), ('9', '♥'),
                                     ('2', '♣'), ('5', '♦'), pp=10)
        self.assertEqual(seat.sidebet_results["pp"], 0)

    def test_pp_capped_at_main_bet(self):
        # pp requested 100 but main bet is 50 -> capped to 50.
        _, seat = self._deal_sidebet(('8', '♠'), ('8', '♠'),
                                     ('9', '♣'), ('5', '♦'),
                                     pp=100, bet=50)
        self.assertEqual(seat.perfect_pairs_amount, 50)
        self.assertEqual(seat.sidebet_results["pp"], 50 * 25 + 50)   # 1300

    # ---- 21+3: suited trips 100x / straight flush 40x / trips 30x /
    #            straight 10x / flush 5x ----

    def test_suited_trips(self):
        _, seat = self._deal_sidebet(('7', '♠'), ('7', '♠'),
                                     ('7', '♠'), ('5', '♦'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 10 * 100 + 10)  # 1010

    def test_straight_flush(self):
        _, seat = self._deal_sidebet(('7', '♠'), ('8', '♠'),
                                     ('9', '♠'), ('2', '♦'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 10 * 40 + 10)   # 410

    def test_three_of_a_kind(self):
        _, seat = self._deal_sidebet(('7', '♠'), ('7', '♥'),
                                     ('7', '♦'), ('2', '♣'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 10 * 30 + 10)   # 310

    def test_straight(self):
        _, seat = self._deal_sidebet(('7', '♠'), ('8', '♥'),
                                     ('9', '♦'), ('2', '♣'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 10 * 10 + 10)   # 110

    def test_flush(self):
        _, seat = self._deal_sidebet(('2', '♠'), ('7', '♠'),
                                     ('K', '♠'), ('5', '♦'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 10 * 5 + 10)    # 60

    def test_no_21_plus_3(self):
        _, seat = self._deal_sidebet(('2', '♠'), ('7', '♥'),
                                     ('K', '♦'), ('5', '♣'), t3=10)
        self.assertEqual(seat.sidebet_results["t3"], 0)


class TestSideBetDetectors(unittest.TestCase):
    """Pure detector functions (sidebets.py)."""

    def test_perfect_pairs_detector(self):
        self.assertEqual(check_perfect_pairs(make_hand(('8', '♠'), ('8', '♠'))), 'perfect')
        self.assertEqual(check_perfect_pairs(make_hand(('8', '♠'), ('8', '♣'))), 'colored')
        self.assertEqual(check_perfect_pairs(make_hand(('8', '♠'), ('8', '♥'))), 'mixed')
        self.assertIsNone(check_perfect_pairs(make_hand(('8', '♠'), ('9', '♥'))))

    def test_21_plus_3_edge_straights(self):
        # A-2-3 low straight
        self.assertEqual(check_21_plus_3(make_hand(('A', '♠'), ('2', '♥')),
                                         Card('3', '♦')), 'straight')
        # Q-K-A high straight
        self.assertEqual(check_21_plus_3(make_hand(('Q', '♠'), ('K', '♥')),
                                         Card('A', '♦')), 'straight')


# =====================================================================
# 6. Dealer rule: stand-on-17 vs hit-soft-17
# =====================================================================

class TestDealerRules(unittest.TestCase):

    def test_dealer_stands_on_soft_17_by_default(self):
        # Default dealerHitsSoft17 = False -> dealer stands on A,6 = soft 17.
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],     # 17
            dealer_cards=[('6', '♣'), ('A', '♦')],      # soft 17, 6 up
            rest=[('5', '♥')],                            # would be drawn if H17
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        self.assertEqual(len(t.dealer_hand.cards), 2)    # did NOT hit
        self.assertEqual(t.dealer_hand.total(), 17)

    def test_dealer_hits_soft_17_when_enabled(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],
            dealer_cards=[('6', '♣'), ('A', '♦')],      # soft 17
            rest=[('3', '♥')],                            # -> soft 20, then stands
            settings={"dealerHitsSoft17": True},
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        self.assertEqual(len(t.dealer_hand.cards), 3)    # DID hit the soft 17
        self.assertEqual(t.dealer_hand.total(), 20)


# =====================================================================
# 7. Shoe: build / deal / cut / reshuffle
# =====================================================================

class TestShoe(unittest.TestCase):

    def test_build_size(self):
        self.assertEqual(len(Shoe(6).cards), 312)
        self.assertEqual(len(Shoe(2).cards), 104)
        self.assertEqual(len(Shoe(1).cards), 52)

    def test_composition(self):
        shoe = Shoe(6)
        counts = {}
        for c in shoe.cards:
            counts[(c.rank, c.suit)] = counts.get((c.rank, c.suit), 0) + 1
        self.assertEqual(len(counts), 52)                # all 52 unique cards
        self.assertTrue(all(v == 6 for v in counts.values()))  # each x6

    def test_deal_pops_from_front_and_shrinks(self):
        shoe = Shoe(6)
        front = shoe.cards[0]
        dealt = shoe.deal()
        self.assertIs(dealt, front)
        self.assertEqual(len(shoe.cards), 311)

    def test_cut_card_position_in_range(self):
        shoe = Shoe(6)
        # cut card sits 104..156 cards from the end of the shoe
        from_end = len(shoe.cards) - shoe.cut_card_position
        self.assertTrue(104 <= from_end <= 156)

    def test_reshuffle_flag_and_rebuild(self):
        shoe = Shoe(6)
        shoe.cut_card_position = len(shoe.cards) - 1   # force near-immediate flag
        shoe.deal()
        self.assertTrue(shoe.reshuffle_needed)
        shoe.reshuffle_if_needed()
        self.assertEqual(len(shoe.cards), 312)          # rebuilt a full shoe
        self.assertFalse(shoe.reshuffle_needed)

    def test_cut_fraction_preserves_composition(self):
        # A player cut is a pure rotation: same multiset, same count, math-neutral.
        shoe = Shoe(6)
        shoe.build(cut_fraction=0.5)
        self.assertEqual(len(shoe.cards), 312)
        counts = {}
        for c in shoe.cards:
            counts[(c.rank, c.suit)] = counts.get((c.rank, c.suit), 0) + 1
        self.assertTrue(all(v == 6 for v in counts.values()))

    def test_cut_fraction_clamped(self):
        # out-of-range cut fractions are clamped to [0.05, 0.95]; still 312 cards.
        shoe = Shoe(6)
        shoe.build(cut_fraction=5.0)
        self.assertEqual(len(shoe.cards), 312)
        shoe.build(cut_fraction=-5.0)
        self.assertEqual(len(shoe.cards), 312)


# =====================================================================
# 8. Probability module sanity
# =====================================================================

class TestProbability(unittest.TestCase):

    def test_bust_probability_known_values(self):
        self.assertAlmostEqual(bust_probability(12), 4 / 13, places=3)
        self.assertAlmostEqual(bust_probability(20), 12 / 13, places=3)
        self.assertEqual(bust_probability(11), 0.0)
        self.assertEqual(bust_probability(21), 0.0)

    def test_dealer_distribution_sums_to_one(self):
        for up in [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]:
            dist = dealer_outcome_distribution(up, up == 11)
            self.assertAlmostEqual(sum(dist.values()), 1.0, places=6)

    def test_dealer_six_busts_more_than_ten(self):
        self.assertGreater(dealer_bust_probability(6), dealer_bust_probability(10))

    def test_player_win_prob_sums_to_one(self):
        for pt in [12, 15, 17, 19, 20]:
            for up in [2, 6, 10, 11]:
                r = player_win_probability(pt, up)
                self.assertAlmostEqual(r['win'] + r['lose'] + r['push'], 1.0, places=3)

    def test_optimal_win_prob_sums_to_one(self):
        r = optimal_win_probability(make_hand(('K', '♠'), ('6', '♥')), 7)
        self.assertAlmostEqual(r['win'] + r['lose'] + r['push'], 1.0, places=3)


# =====================================================================
# 9. Basic strategy spot-checks
# =====================================================================

class TestBasicStrategy(unittest.TestCase):

    def test_always_split_aces_and_eights(self):
        for rank in ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']:
            up = Card(rank, '♦')
            self.assertEqual(basic_strategy(make_hand(('A', '♠'), ('A', '♥')), up), 'split')
            self.assertEqual(basic_strategy(make_hand(('8', '♠'), ('8', '♥')), up), 'split')

    def test_never_split_fives_or_tens(self):
        up = Card('6', '♦')
        self.assertNotEqual(basic_strategy(make_hand(('5', '♠'), ('5', '♥')), up), 'split')
        self.assertNotEqual(basic_strategy(make_hand(('10', '♠'), ('10', '♥')), up), 'split')

    def test_hard_11_doubles_vs_10(self):
        self.assertEqual(basic_strategy(make_hand(('6', '♠'), ('5', '♥')), Card('10', '♦')), 'double')

    def test_hard_17_stands(self):
        self.assertEqual(basic_strategy(make_hand(('K', '♠'), ('7', '♥')), Card('10', '♦')), 'stand')

    def test_soft_18_vs_9_hits_vs_7_stands(self):
        self.assertEqual(basic_strategy(make_hand(('A', '♠'), ('7', '♥')), Card('9', '♦')), 'hit')
        self.assertEqual(basic_strategy(make_hand(('A', '♠'), ('7', '♥')), Card('7', '♦')), 'stand')


# =====================================================================
# 10. Serialization round-trip: to_json -> from_snapshot
# =====================================================================

class TestSnapshotRoundTrip(unittest.TestCase):
    """The persisted snapshot must rebuild an equivalent table.

    The shoe itself is intentionally NOT persisted (rooms rebuild from the DB),
    so cardCounting.remainingCards / trueCount and shoePendingShuffle are
    excluded from the comparison — see QA_FINDINGS.md.
    """

    # fields that depend on the (non-persisted) live shoe
    _VOLATILE = {"cardCounting", "shoePendingShuffle"}

    def _curated(self, snap):
        return {k: v for k, v in snap.items() if k not in self._VOLATILE}

    def _assert_roundtrip(self, table):
        snap = table.to_json()
        rebuilt = Table.from_snapshot(snap).to_json()
        self.assertEqual(self._curated(rebuilt), self._curated(snap))

    def test_roundtrip_betting(self):
        t = Table()
        t.add_player("Alice", [1], 100, 0, 0, current_balance=5000)
        t.add_player("Bob", [3], 50, 10, 0, current_balance=3000)
        self._assert_roundtrip(t)

    def test_roundtrip_playing_with_split(self):
        t, seat = seat_and_deal(
            player_cards=[('8', '♠'), ('8', '♥')],
            dealer_cards=[('9', '♣'), ('5', '♦')],
            rest=[('3', '♦'), ('5', '♣')],   # post-split: 11 and 13, both playable
            bet=100, balance=10000,
        )
        t.execute_action("P", "split")
        self.assertEqual(t.game_state, "playing")
        self._assert_roundtrip(t)

    def test_roundtrip_game_over(self):
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('10', '♥')],
            dealer_cards=[('10', '♣'), ('8', '♦')],
            bet=100, balance=10000,
        )
        t.execute_action("P", "stand")
        self.assertEqual(t.game_state, "game_over")
        self._assert_roundtrip(t)


# =====================================================================
# 11. Per-round money invariant (quick sim) — the money-math regression guard
# =====================================================================

class TestMoneyInvariant(unittest.TestCase):

    def test_invariant_holds_over_many_rounds(self):
        from sim import run_sim
        result = run_sim(rounds=5000, bet=100, seed=7)
        # balance delta each round must equal (payout - staked) exactly
        self.assertTrue(result["invariant_ok"], result)
        # a short run should still land in a sane house-edge ballpark
        self.assertTrue(-0.05 < result["house_edge"] < 0.05, result)


# =====================================================================
# 12. Bot driver sanity (app.py _seed_bots / _run_bots)
# =====================================================================

def _import_app():
    """Import app.py with an in-memory DB so no file is written. Returns the
    module, or None if backend web deps are unavailable."""
    # FORCE (not setdefault): a dev shell may already export the real Neon
    # DATABASE_URL, and importing app runs db.create_all() against it.
    os.environ["DATABASE_URL"] = "sqlite://"
    try:
        import app  # noqa: F401
        return app
    except Exception:
        return None


class TestBots(unittest.TestCase):

    def setUp(self):
        self.app = _import_app()
        if self.app is None:
            self.skipTest("app.py (web deps) unavailable")

    def test_seed_bots_seats_and_bets(self):
        import random
        random.seed(99)
        t = Table()
        self.app._seed_bots(t, 2)
        self.assertEqual(len(t.bot_names), 2)
        occupied = [s for s in t.seats if s.occupied]
        self.assertEqual(len(occupied), 2)
        self.assertTrue(all(s.bet > 0 for s in occupied))

    def test_seed_bots_clamped_to_three(self):
        t = Table()
        self.app._seed_bots(t, 9)
        self.assertLessEqual(len(t.bot_names), 3)

    def test_bots_play_a_full_round_to_game_over(self):
        import random
        random.seed(2024)
        t = Table()
        self.app._seed_bots(t, 3)
        t.deal_initial()
        self.app._run_bots(t)                 # bots answer insurance + play out
        self.assertEqual(t.game_state, "game_over")
        for s in t.seats:
            if s.occupied:
                self.assertIsInstance(s.player.balance, int)
                self.assertGreaterEqual(s.player.balance, 0)


# =====================================================================
# 13. Settings (CONTRACTS.md §5) — engine-side behaviour
#     (frontend-side behaviour is audited by reading code: see QA_FINDINGS.md)
# =====================================================================

CONTRACT_SETTINGS_KEYS = {
    "numDecks", "dealerHitsSoft17", "countVisibility", "showStrategyHints",
    "showBustProb", "showWinProb", "dealSpeed", "audioEnabled", "tableTheme",
}


class TestSettings(unittest.TestCase):

    def test_schema_keys_match_contract(self):
        self.assertEqual(set(Table._normalize_settings({}).keys()), CONTRACT_SETTINGS_KEYS)

    def test_defaults(self):
        s = Table._normalize_settings({})
        self.assertEqual(s["numDecks"], 6)
        self.assertFalse(s["dealerHitsSoft17"])
        self.assertEqual(s["countVisibility"], "always")
        self.assertTrue(s["showStrategyHints"])
        self.assertTrue(s["showBustProb"])
        self.assertTrue(s["showWinProb"])
        self.assertEqual(s["dealSpeed"], "normal")
        self.assertFalse(s["audioEnabled"])
        self.assertEqual(s["tableTheme"], "green")

    def test_num_decks_sizes_the_shoe(self):
        # Every deck count the frontend offers (1,2,4,6,8) builds the right shoe.
        for n in (1, 2, 4, 6, 8):
            self.assertEqual(len(Table({"numDecks": n}).shoe.cards), 52 * n)

    def test_num_decks_falsy_falls_back_to_six(self):
        self.assertEqual(Table._normalize_settings({"numDecks": 0})["numDecks"], 6)
        self.assertEqual(Table._normalize_settings({"numDecks": None})["numDecks"], 6)

    def test_dealer_hits_soft17_is_coerced_to_bool(self):
        self.assertIs(Table._normalize_settings({"dealerHitsSoft17": 1})["dealerHitsSoft17"], True)
        self.assertIs(Table._normalize_settings({"dealerHitsSoft17": 0})["dealerHitsSoft17"], False)

    def test_settings_survive_snapshot_and_resize_shoe(self):
        t = Table({"numDecks": 2, "dealerHitsSoft17": True,
                   "tableTheme": "blue", "countVisibility": "hover"})
        r = Table.from_snapshot(t.to_json())
        self.assertEqual(r.settings, t.settings)
        self.assertEqual(len(r.shoe.cards), 104)

    def test_string_settings_are_not_validated(self):
        # Documented gap: dealSpeed/countVisibility/tableTheme accept any string.
        s = Table._normalize_settings({"dealSpeed": "warp", "countVisibility": "x",
                                       "tableTheme": "neon"})
        self.assertEqual((s["dealSpeed"], s["countVisibility"], s["tableTheme"]),
                         ("warp", "x", "neon"))


# =====================================================================
# 14. Frontend <-> backend strategy sync (CONTRACTS.md §5: "Frontend keeps
#     lib/strategy.js in sync with backend/strategy.py")
# =====================================================================

class TestFrontendStrategySync(unittest.TestCase):

    def test_strategy_js_matches_strategy_py_for_every_two_card_hand(self):
        import json
        import shutil
        import subprocess

        node = shutil.which("node")
        js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "..", "frontend", "src", "lib", "strategy.js")
        js_path = os.path.abspath(js_path)
        if not node:
            self.skipTest("node not installed")
        if not os.path.exists(js_path):
            self.skipTest("frontend strategy.js not found")

        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        dealer_ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']
        cases, expected = [], []
        for r1 in ranks:
            for r2 in ranks:
                hand = make_hand((r1, '♠'), (r2, '♥'))
                is_pair = hand.can_split()
                for d in dealer_ranks:
                    up = Card(d, '♦')
                    cases.append({
                        "total": hand.total(),
                        "isSoft": _is_soft_total(hand),
                        "isPair": is_pair,
                        "pairRank": r1 if is_pair else None,
                        "dealerVal": up.value(),   # A -> 11
                    })
                    expected.append(basic_strategy(hand, up))

        script = (
            "import { bestMove } from " + json.dumps("file:///" + js_path.replace("\\", "/")) + ";"
            "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{"
            "const cs=JSON.parse(d);"
            "console.log(JSON.stringify(cs.map(c=>bestMove(c,c.dealerVal))));});"
        )
        proc = subprocess.run([node, "--input-type=module", "-e", script],
                              input=json.dumps(cases), capture_output=True,
                              text=True, timeout=60)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        got = json.loads(proc.stdout)
        self.assertEqual(len(got), len(expected))
        diffs = [(c, e, g) for c, e, g in zip(cases, expected, got) if e != g]
        self.assertEqual(diffs, [], f"{len(diffs)} strategy.js/strategy.py mismatches: {diffs[:5]}")


# =====================================================================
# 15. KNOWN ENGINE BUGS — reported in QA_FINDINGS.md, intentionally NOT fixed
#     by QA. Each is marked expectedFailure so the suite stays green today and
#     turns into an "unexpected success" (loud) the moment Engine fixes it —
#     at which point simply delete the decorator.
# =====================================================================

class TestKnownBugs(unittest.TestCase):

    @unittest.expectedFailure
    def test_BUG_low_deck_shoe_must_flag_reshuffle_before_running_dry(self):
        # cut_card_position = len - randint(104,156) is <= 0 for 1 and 2 decks,
        # so reshuffle_needed never fires; the shoe empties MID-ROUND and
        # silently rebuilds (impossible duplicate cards, count not reset).
        for decks in (1, 2):
            for _ in range(20):
                shoe = Shoe(decks)
                self.assertGreater(shoe.cut_card_position, 0,
                                   f"{decks}-deck shoe has no usable cut card")

    @unittest.expectedFailure
    def test_BUG_rejected_actions_are_not_strategy_mistakes(self):
        # execute_action records a "mistake" BEFORE validating the action, so an
        # illegal split (non-pair) or a junk verb pollutes the review screen.
        t, seat = seat_and_deal(
            player_cards=[('10', '♠'), ('7', '♥')],
            dealer_cards=[('9', '♣'), ('8', '♦')],
            rest=[('2', '♠')] * 5,
        )
        t.execute_action("P", "split")      # illegal: not a pair -> no-op
        t.execute_action("P", "banana")     # nonsense verb -> no-op
        self.assertEqual(getattr(seat.hands[0], "pending_mistakes", []), [])

    @unittest.expectedFailure
    def test_BUG_insurance_bet_survives_snapshot_restore(self):
        # from_snapshot never restores seat.insurance_bet. The stake was already
        # deducted, so a restart mid-insurance forfeits the 2:1 payout.
        t = Table()
        t.add_player("A", [1], 100, 0, 0)
        t.add_player("B", [2], 100, 0, 0)
        # deal order: s1, s2, dealer, s1, s2, dealer  (dealer shows Ace)
        _stack(t, [('10', '♠'), ('10', '♥'), ('A', '♣'),
                   ('10', '♦'), ('7', '♠'), ('6', '♠')])
        t.deal_initial()
        self.assertEqual(t.game_state, "insurance")
        t.buy_insurance(1, True)            # seat 2 still undecided
        self.assertEqual(t.seats[0].insurance_bet, 50)
        restored = Table.from_snapshot(t.to_json())
        self.assertEqual(restored.seats[0].insurance_bet, 50)


class TestInputValidation(unittest.TestCase):
    """REVIEW E1/E7: client-supplied bets and seats must be validated."""

    def _table(self):
        return Table(settings={"numDecks": 6}, is_solo=True)

    def test_negative_side_bet_cannot_mint_chips(self):
        t = self._table()
        t.add_player("P", [4], 100, -900000, 0, current_balance=5000)
        self.assertFalse(t.seats[3].occupied)
        t.deal_initial()  # nothing to deal; balance must be untouched
        self.assertEqual([p.balance for p in t.get_unique_players()], [])

    def test_zero_or_negative_main_bet_rejected(self):
        for bad in (0, -50):
            t = self._table()
            t.add_player("P", [4], bad, 0, 0)
            self.assertFalse(t.seats[3].occupied)

    def test_out_of_range_and_duplicate_seats_rejected(self):
        for seats in ([0], [8], [3, 3], []):
            t = self._table()
            t.add_player("P", seats, 100, 0, 0)
            self.assertFalse(any(s.occupied for s in t.seats), seats)

    def test_non_numeric_input_rejected_without_crashing(self):
        t = self._table()
        t.add_player("P", [4], "abc", 0, 0)
        t.add_player("P", ["x"], 100, 0, 0)
        self.assertFalse(any(s.occupied for s in t.seats))

    def test_numeric_strings_still_accepted(self):
        t = self._table()
        t.add_player("P", ["4"], "100", "10", "0", current_balance=5000)
        self.assertTrue(t.seats[3].occupied)
        self.assertEqual(t.seats[3].bet, 100)


if __name__ == '__main__':
    unittest.main(verbosity=2)
