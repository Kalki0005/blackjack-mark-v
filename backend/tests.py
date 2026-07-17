import unittest
from backend.models import *
from backend.strategy import *
from backend.probability import *
from backend.probability import _is_soft_total
from backend.sidebets import *
from unittest.mock import patch
from backend.game import Table


def make_hand(*cards):
    h = Hand()
    for rank, suit in cards:
        h.add(Card(rank, suit))
    return h


class TestHandTotal(unittest.TestCase):

    def test_simple_hand(self):
        h = make_hand(('8', '♠'), ('9', '♥'))
        self.assertEqual(h.total(), 17)

    def test_blackjack(self):
        h = make_hand(('A', '♠'), ('K', '♥'))
        self.assertEqual(h.total(), 21)
        self.assertTrue(h.is_blackjack())

    def test_ace_flips_to_one(self):
        h = make_hand(('A', '♠'), ('K', '♥'), ('5', '♦'))
        self.assertEqual(h.total(), 16)

    def test_two_aces(self):
        h = make_hand(('A', '♠'), ('A', '♥'))
        self.assertEqual(h.total(), 12)

    def test_two_aces_plus_nine(self):
        h = make_hand(('A', '♠'), ('A', '♥'), ('9', '♦'))
        self.assertEqual(h.total(), 21)

    def test_bust(self):
        h = make_hand(('K', '♠'), ('J', '♥'), ('5', '♦'))
        self.assertTrue(h.is_bust())
        self.assertEqual(h.total(), 25)

    def test_soft_seventeen(self):
        h = make_hand(('A', '♠'), ('6', '♥'))
        self.assertEqual(h.total(), 17)

    def test_face_cards_value_ten(self):
        h = make_hand(('J', '♠'), ('Q', '♥'))
        self.assertEqual(h.total(), 20)

    def test_not_blackjack_with_three_cards(self):
        h = make_hand(('7', '♠'), ('7', '♥'), ('7', '♦'))
        self.assertEqual(h.total(), 21)
        self.assertFalse(h.is_blackjack())

    def test_can_split(self):
        h = make_hand(('8', '♠'), ('8', '♥'))
        self.assertTrue(h.can_split())

    def test_cannot_split_different(self):
        h = make_hand(('8', '♠'), ('9', '♥'))
        self.assertFalse(h.can_split())

    def test_can_split_ten_value(self):
        h = make_hand(('K', '♠'), ('J', '♥'))
        self.assertTrue(h.can_split())

    def test_ace_split_detection(self):
        h = make_hand(('A', '♠'), ('A', '♥'))
        self.assertTrue(h.is_ace_split())

    def test_not_ace_split(self):
        h = make_hand(('8', '♠'), ('8', '♥'))
        self.assertFalse(h.is_ace_split())

    def test_split_blackjack_not_natural_blackjack(self):
        h = make_hand(('A', '♠'), ('K', '♥'))
        h.from_split = True

        self.assertFalse(h.is_blackjack())

    def test_regular_blackjack_still_counts(self):
        h = make_hand(('A', '♠'), ('K', '♥'))

        self.assertTrue(h.is_blackjack())

    def test_split_ace_flag_default_false(self):
        h = Hand()
        self.assertFalse(h.from_split_aces)

    def test_split_ace_flag_can_be_set(self):
        h = Hand()
        h.from_split_aces = True

        self.assertTrue(h.from_split_aces)


class TestIsSoft(unittest.TestCase):

    def test_soft_hand(self):
        h = make_hand(('A', '♠'), ('6', '♥'))
        self.assertTrue(_is_soft_total(h))

    def test_hard_hand(self):
        h = make_hand(('9', '♠'), ('6', '♥'))
        self.assertFalse(_is_soft_total(h))

    def test_ace_flipped_is_not_soft(self):
        h = make_hand(('A', '♠'), ('K', '♥'), ('5', '♦'))
        self.assertFalse(_is_soft_total(h))


class TestBustProbability(unittest.TestCase):

    def test_twelve(self):
        # cards that bust: 10,10,10,10 = 4 out of 13
        self.assertAlmostEqual(bust_probability(12), 4/13, places=3)

    def test_twenty(self):
        # only bust on 2-K (not ace since A+20=21 not bust)
        # cards that bust 20: 2,3,4,5,6,7,8,9,10,10,10,10 = 12 out of 13
        self.assertAlmostEqual(bust_probability(20), 12/13, places=3)

    def test_eleven(self):
        # no card busts 11
        self.assertEqual(bust_probability(11), 0.0)

    def test_twenty_one(self):
        self.assertEqual(bust_probability(21), 0.0)

    def test_ten(self):
        self.assertEqual(bust_probability(10), 0.0)


class TestDealerBustProbability(unittest.TestCase):

    def test_dealer_six_most_likely_bust(self):
        # dealer 6 has highest bust probability
        bust_6 = dealer_bust_probability(6)
        bust_7 = dealer_bust_probability(7)
        self.assertGreater(bust_6, bust_7)

    def test_dealer_ten_low_bust(self):
        bust_10 = dealer_bust_probability(10)
        bust_6 = dealer_bust_probability(6)
        self.assertGreater(bust_6, bust_10)

    def test_probability_between_zero_and_one(self):
        for val in [2,3,4,5,6,7,8,9,10,11]:
            p = dealer_bust_probability(val)
            self.assertGreaterEqual(p, 0.0)
            self.assertLessEqual(p, 1.0)

    def test_dealer_outcome_sums_to_one(self):
        dist = dealer_outcome_distribution(10, False)
        total = sum(dist.values())
        self.assertAlmostEqual(total, 1.0, places=5)


class TestPlayerWinProbability(unittest.TestCase):

    def test_win_lose_push_sum_to_one(self):
        for player_total in [12, 15, 17, 19, 20]:
            for upcard in [2, 6, 10, 11]:
                result = player_win_probability(player_total, upcard)
                total = result['win'] + result['lose'] + result['push']
                self.assertAlmostEqual(total, 1.0, places=3,
                    msg=f"Failed for player={player_total} upcard={upcard}")

    def test_bust_loses(self):
        result = player_win_probability(22, 6)
        self.assertEqual(result['win'], 0.0)
        self.assertEqual(result['lose'], 1.0)

    def test_twenty_vs_six_favors_player(self):
        result = player_win_probability(20, 6)
        self.assertGreater(result['win'], result['lose'])

    def test_twelve_vs_ten_favors_dealer(self):
        result = player_win_probability(12, 10)
        self.assertGreater(result['lose'], result['win'])


class TestPerfectPairs(unittest.TestCase):

    def test_perfect_pair(self):
        h = make_hand(('8', '♠'), ('8', '♠'))
        self.assertEqual(check_perfect_pairs(h), 'perfect')

    def test_colored_pair_black(self):
        h = make_hand(('8', '♠'), ('8', '♣'))
        self.assertEqual(check_perfect_pairs(h), 'colored')

    def test_colored_pair_red(self):
        h = make_hand(('8', '♥'), ('8', '♦'))
        self.assertEqual(check_perfect_pairs(h), 'colored')

    def test_mixed_pair(self):
        h = make_hand(('8', '♠'), ('8', '♥'))
        self.assertEqual(check_perfect_pairs(h), 'mixed')

    def test_no_pair(self):
        h = make_hand(('8', '♠'), ('9', '♥'))
        self.assertIsNone(check_perfect_pairs(h))


class Test21Plus3(unittest.TestCase):

    def test_suited_trips(self):
        hand = make_hand(('7', '♠'), ('7', '♠'))
        upcard = Card('7', '♠')
        self.assertEqual(check_21_plus_3(hand, upcard), 'suited_trips')

    def test_straight_flush(self):
        hand = make_hand(('7', '♠'), ('8', '♠'))
        upcard = Card('9', '♠')
        self.assertEqual(check_21_plus_3(hand, upcard), 'straight_flush')

    def test_three_of_a_kind(self):
        hand = make_hand(('7', '♠'), ('7', '♥'))
        upcard = Card('7', '♦')
        self.assertEqual(check_21_plus_3(hand, upcard), 'three_of_a_kind')

    def test_flush(self):
        hand = make_hand(('2', '♠'), ('7', '♠'))
        upcard = Card('K', '♠')
        self.assertEqual(check_21_plus_3(hand, upcard), 'flush')

    def test_straight(self):
        hand = make_hand(('7', '♠'), ('8', '♥'))
        upcard = Card('9', '♦')
        self.assertEqual(check_21_plus_3(hand, upcard), 'straight')

    def test_no_combination(self):
        hand = make_hand(('2', '♠'), ('7', '♥'))
        upcard = Card('K', '♦')
        self.assertIsNone(check_21_plus_3(hand, upcard))

    def test_broadway_straight(self):
        hand = make_hand(('J', '♠'), ('Q', '♥'))
        upcard = Card('K', '♦')
        self.assertEqual(check_21_plus_3(hand, upcard), 'straight')

    def test_ace_two_three_straight(self):
        hand = make_hand(('A', '♠'), ('2', '♥'))
        upcard = Card('3', '♦')

        self.assertEqual(check_21_plus_3(hand, upcard), 'straight')

    def test_ace_two_three_straight_flush(self):
        hand = make_hand(('A', '♠'), ('2', '♠'))
        upcard = Card('3', '♠')

        self.assertEqual(check_21_plus_3(hand, upcard), 'straight_flush')

    def test_qka_straight(self):
        hand = make_hand(('Q', '♠'), ('K', '♥'))
        upcard = Card('A', '♦')

        self.assertEqual(check_21_plus_3(hand, upcard), 'straight')

    def test_qka_straight_flush(self):
        hand = make_hand(('Q', '♠'), ('K', '♠'))
        upcard = Card('A', '♠')

        self.assertEqual(check_21_plus_3(hand, upcard), 'straight_flush')

class TestBasicStrategy(unittest.TestCase):

    def test_always_split_aces(self):
        h = make_hand(('A', '♠'), ('A', '♥'))
        for rank in ['2','3','4','5','6','7','8','9','10','A']:
            upcard = Card(rank, '♦')
            self.assertEqual(basic_strategy(h, upcard), 'split')

    def test_always_split_eights(self):
        h = make_hand(('8', '♠'), ('8', '♥'))
        for rank in ['2','3','4','5','6','7','8','9','10','A']:
            upcard = Card(rank, '♦')
            self.assertEqual(basic_strategy(h, upcard), 'split')

    def test_never_split_fives(self):
        h = make_hand(('5', '♠'), ('5', '♥'))
        upcard = Card('6', '♦')
        self.assertNotEqual(basic_strategy(h, upcard), 'split')

    def test_hard_17_always_stand(self):
        h = make_hand(('K', '♠'), ('7', '♥'))
        for rank in ['2','3','4','5','6','7','8','9','10','A']:
            upcard = Card(rank, '♦')
            self.assertEqual(basic_strategy(h, upcard), 'stand')

    def test_hard_11_vs_10_double(self):
        h = make_hand(('6', '♠'), ('5', '♥'))
        upcard = Card('10', '♦')
        self.assertEqual(basic_strategy(h, upcard), 'double')

    def test_soft_18_vs_9_hit(self):
        h = make_hand(('A', '♠'), ('7', '♥'))
        upcard = Card('9', '♦')
        self.assertEqual(basic_strategy(h, upcard), 'hit')

    def test_soft_18_vs_7_stand(self):
        h = make_hand(('A', '♠'), ('7', '♥'))
        upcard = Card('7', '♦')
        self.assertEqual(basic_strategy(h, upcard), 'stand')

    def test_hard_16_vs_10_hit(self):
        h = make_hand(('K', '♠'), ('6', '♥'))
        upcard = Card('10', '♦')
        self.assertEqual(basic_strategy(h, upcard), 'hit')

    def test_hard_12_vs_4_stand(self):
        h = make_hand(('7', '♠'), ('5', '♥'))
        upcard = Card('4', '♦')
        self.assertEqual(basic_strategy(h, upcard), 'stand')

class TestHandBetTracking(unittest.TestCase):

    def test_hand_stores_bet(self):
        hand = Hand(bet=100)
        self.assertEqual(hand.bet, 100)

    def test_split_hands_have_independent_bets(self):
        hand1 = Hand(bet=100)
        hand2 = Hand(bet=100)

        hand1.bet *= 2

        self.assertEqual(hand1.bet, 200)
        self.assertEqual(hand2.bet, 100)

class TestSplitAceRules(unittest.TestCase):

    def test_split_ace_hand_marked_correctly(self):
        hand = Hand()
        hand.from_split_aces = True

        self.assertTrue(hand.from_split_aces)

class TestPayouts(unittest.TestCase):

    def test_regular_win_pays_one_to_one(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        hand = Hand(bet=100)

        seat.resolve_bet('win', hand)

        self.assertEqual(player.balance, 1200)

    def test_push_returns_bet(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        hand = Hand(bet=100)

        seat.resolve_bet('push', hand)

        self.assertEqual(player.balance, 1100)

    def test_blackjack_pays_three_to_two(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        hand = Hand(bet=100)

        seat.resolve_bet('blackjack', hand)

        self.assertEqual(player.balance, 1250)

    def test_loss_pays_nothing(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        hand = Hand(bet=100)

        seat.resolve_bet('loss', hand)

        self.assertEqual(player.balance, 1000)

class TestInsurance(unittest.TestCase):

    def test_insurance_win(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        insurance_bets = {1: 50}

        resolve_insurance(
            [seat],
            insurance_bets,
            dealer_has_blackjack=True
        )

        self.assertEqual(player.balance, 1150)

    def test_insurance_loss(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        insurance_bets = {1: 50}

        resolve_insurance(
            [seat],
            insurance_bets,
            dealer_has_blackjack=False
        )

        self.assertEqual(player.balance, 1000)

class TestShoe(unittest.TestCase):

    def test_six_deck_shoe_size(self):
        shoe = Shoe(6)
        self.assertEqual(len(shoe.cards), 312)

    def test_deal_reduces_shoe_size(self):
        shoe = Shoe(6)

        before = len(shoe.cards)

        shoe.deal()

        after = len(shoe.cards)

        self.assertEqual(after, before - 1)

    def test_multiple_deals_reduce_size(self):
        shoe = Shoe(6)

        for _ in range(10):
            shoe.deal()

        self.assertEqual(len(shoe.cards), 302)

class TestDealerBlackjackSettlement(unittest.TestCase):

    def test_blackjack_push(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)

        player_hand = Hand(bet=100)
        player_hand.add(Card('A', '♠'))
        player_hand.add(Card('K', '♥'))

        dealer_hand = Hand()
        dealer_hand.add(Card('A', '♦'))
        dealer_hand.add(Card('K', '♣'))

        self.assertTrue(player_hand.is_blackjack())
        self.assertTrue(dealer_hand.is_blackjack())

    def test_twenty_loses_to_blackjack(self):
        player_hand = Hand()
        player_hand.add(Card('K', '♠'))
        player_hand.add(Card('Q', '♥'))

        dealer_hand = Hand()
        dealer_hand.add(Card('A', '♦'))
        dealer_hand.add(Card('K', '♣'))

        self.assertFalse(player_hand.is_blackjack())
        self.assertTrue(dealer_hand.is_blackjack())

class TestOptimalWinProbability(unittest.TestCase):

    def test_sums_to_one(self):
        h = make_hand(('K', '♠'), ('6', '♥'))
        upcard = Card('7', '♦')
        result = optimal_win_probability(h, upcard.value())
        total = result['win'] + result['lose'] + result['push']
        self.assertAlmostEqual(total, 1.0, places=3)

    def test_strong_hand_beats_weak_hand(self):
        strong = make_hand(('K', '♠'), ('9', '♥'))  # 19
        weak = make_hand(('6', '♠'), ('5', '♥'))    # 11
        upcard = Card('6', '♦')
        strong_result = optimal_win_probability(strong, upcard.value())
        weak_result = optimal_win_probability(weak, upcard.value())
        self.assertGreater(strong_result['win'], weak_result['win'])

    def test_bust_returns_full_loss(self):
        h = make_hand(('K', '♠'), ('J', '♥'), ('5', '♦'))  # 25, bust
        result = optimal_win_probability(h, 6)
        self.assertEqual(result['win'], 0.0)
        self.assertEqual(result['lose'], 1.0)


class TestResolveSidebets(unittest.TestCase):

    def test_perfect_pair_win_pays_correctly(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('8', '♠'), ('8', '♣'))  # colored pair, 12x
        sidebet = 50
        resolve_perfect_pairs(seat, check_perfect_pairs(hand), sidebet)
        self.assertEqual(player.balance, 1600)  # 1000 + 50*12

    def test_perfect_pair_loss_no_change(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('8', '♠'), ('9', '♥'))  # no pair
        sidebet = 50
        resolve_perfect_pairs(seat, check_perfect_pairs(hand), sidebet)
        self.assertEqual(player.balance, 1000)

    def test_21_plus_3_win_pays_correctly(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('7', '♠'), ('8', '♥'))
        upcard = Card('9', '♦')  # straight, 10x
        sidebet = 50
        resolve_21_plus_3(seat, check_21_plus_3(hand, upcard), sidebet)
        self.assertEqual(player.balance, 1500)  # 1000 + 50*10

    def test_21_plus_3_loss_no_change(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('2', '♠'), ('7', '♥'))
        upcard = Card('K', '♦')  # no combination
        sidebet = 50
        resolve_21_plus_3(seat, check_21_plus_3(hand, upcard), sidebet)
        self.assertEqual(player.balance, 1000)

    def test_suited_trips_pays_correctly(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('7', '♠'), ('7', '♠'))
        upcard = Card('7', '♠')  # suited trips, 100x
        sidebet = 10
        resolve_21_plus_3(seat, check_21_plus_3(hand, upcard), sidebet)
        self.assertEqual(player.balance, 2000)  # 1000 + 10*100

    def test_perfect_pair_pays_correctly(self):
        player = Player("Test", balance=1000)
        seat = Seat(1)
        seat.occupy(player)
        hand = make_hand(('8', '♠'), ('8', '♠'))  # perfect pair, 25x
        sidebet = 50
        resolve_perfect_pairs(seat, check_perfect_pairs(hand), sidebet)
        self.assertEqual(player.balance, 2250)  # 1000 + 50*25


class TestZAutoplaySimulation(unittest.TestCase):

    @patch('builtins.input')
    def test_twenty_five_round_autoplay(self, mock_input):

        inputs = [

            # setup_players()

            "3",

            "Sai",
            "2",
            "1",
            "3",

            "Kalki",
            "2",
            "2",
            "6",

            "Batman",
            "3",
            "4",
            "5",
            "7",

            # round 1 manage seats
            "done",

            # Sai
            "500",
            "yes",
            "50",
            "yes",
            "50",

            # Kalki
            "1000",
            "yes",
            "150",
            "yes",
            "150",

            # Batman
            "500",
            "yes",
            "50",
            "yes",
            "50",
        ]

        def fake_input(prompt=""):

            if inputs:
                return inputs.pop(0)

            prompt = prompt.lower()

            # future manage_seats() calls
            if "manage seats" in prompt:
                return "done"

            # future keep same bets calls
            if "keep same bets" in prompt:
                return "yes"

            # safety fallback
            return "yes"

        mock_input.side_effect = fake_input

        table = Table()
        table.auto_play = True

        table.setup_players()

        for _ in range(7):
            table.play_round()

        self.assertTrue(True)

if __name__ == '__main__':
    unittest.main(verbosity=2)
