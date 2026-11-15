import random
from strategy import basic_strategy
from probability import bust_probability, player_win_probability, optimal_win_probability
from sidebets import check_perfect_pairs, check_21_plus_3

# =====================================================================
# --- CORE ENGINE CLASSES ---
# =====================================================================

class Card:
    def __init__(self, rank, suit):
        self.rank = rank
        self.suit = suit

    def value(self):
        if self.rank in ['J', 'Q', 'K']:
            return 10
        elif self.rank == 'A':
            return 11
        else:
            return int(self.rank)

    def __repr__(self):
        return f"{self.rank}{self.suit}"


SUITS = ['♠', '♥', '♦', '♣']
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']


def hi_lo(card):
    """Hi-Lo count tag for one card."""
    if card.rank in ('2', '3', '4', '5', '6'):
        return 1
    if card.rank in ('10', 'J', 'Q', 'K', 'A'):
        return -1
    return 0


class Shoe:
    # Penetration = share of the shoe dealt before the cut card comes out.
    # A fraction (not a fixed card count) so it scales with any deck count
    # (REVIEW E5/E6, QA B1). Jittered slightly, like a dealer placing the cut.
    PENETRATION = 0.75
    PENETRATION_JITTER = 0.03

    def __init__(self, num_decks=6):
        self.num_decks = num_decks
        self.cards = []
        self.cut_card_position = 0   # cards REMAINING when the cut card is reached
        self.reshuffle_needed = False
        self.build()

    def _full_deck(self):
        return [Card(rank, suit) for _ in range(self.num_decks)
                for suit in SUITS for rank in RANKS]

    def _place_cut_card(self):
        pen = self.PENETRATION + random.uniform(-self.PENETRATION_JITTER,
                                                self.PENETRATION_JITTER)
        # Always at least one card behind the cut card, so the flag can fire.
        self.cut_card_position = max(1, len(self.cards) - int(len(self.cards) * pen))

    def build(self, cut_fraction=None):
        self.cards = self._full_deck()
        random.shuffle(self.cards)
        # Player cut: rotate the shuffled shoe at the chosen point. Purely a
        # rotation of an already-uniform shuffle — game math is unaffected.
        if cut_fraction is not None:
            k = int(len(self.cards) * min(max(float(cut_fraction), 0.05), 0.95))
            self.cards = self.cards[k:] + self.cards[:k]
        self._place_cut_card()
        self.reshuffle_needed = False

    def rebuild_without(self, in_play):
        """Emergency mid-round reshuffle: shuffle every card that is NOT on
        the table (i.e. the discards plus what was left). Never duplicates a
        card that is in play. The cut card is placed as usual."""
        remaining = {}
        for c in in_play:
            remaining[(c.rank, c.suit)] = remaining.get((c.rank, c.suit), 0) + 1
        cards = []
        for c in self._full_deck():
            key = (c.rank, c.suit)
            if remaining.get(key):
                remaining[key] -= 1
            else:
                cards.append(c)
        random.shuffle(cards)
        self.cards = cards
        self._place_cut_card()
        self.reshuffle_needed = False

    def deal(self):
        if not self.cards:
            # Table.deal_card handles exhaustion honestly; this is a last
            # resort for callers using a bare Shoe.
            self.build()
        card = self.cards.pop(0)
        if len(self.cards) <= self.cut_card_position and not self.reshuffle_needed:
            self.reshuffle_needed = True
        return card

    def reshuffle_if_needed(self, cut_fraction=None):
        if self.reshuffle_needed:
            self.build(cut_fraction)

    def to_dict(self):
        return {
            "numDecks": self.num_decks,
            "cards": [str(c) for c in self.cards],
            "cutCardPosition": self.cut_card_position,
            "reshuffleNeeded": self.reshuffle_needed,
        }

    @classmethod
    def from_dict(cls, data):
        shoe = cls.__new__(cls)
        shoe.num_decks = int(data.get("numDecks", 6))
        shoe.cards = [Card(s[:-1], s[-1]) for s in data.get("cards", []) if s]
        shoe.cut_card_position = int(data.get("cutCardPosition", 0))
        shoe.reshuffle_needed = bool(data.get("reshuffleNeeded", False))
        return shoe


class Hand:
    def __init__(self, bet=0):
        self.cards = []
        self.bet = bet
        self.from_split = False
        self.from_split_aces = False
        # Filled in at resolution so the table chips can show the result.
        self.outcome = None      # "win" | "loss" | "push" | "blackjack" | None
        self.payout = 0          # total chips returned to the player for this hand

    def add(self, card):
        self.cards.append(card)

    def total(self):
        total = 0
        aces = 0
        for card in self.cards:
            total += card.value()
            if card.rank == 'A':
                aces += 1
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return total

    def is_bust(self):
        return self.total() > 21

    def is_blackjack(self):
        return len(self.cards) == 2 and self.total() == 21 and not self.from_split

    def can_split(self):
        if len(self.cards) != 2:
            return False
        if self.from_split_aces:
            return False
        return self.cards[0].value() == self.cards[1].value()

    def is_ace_split(self):
        return (len(self.cards) == 2 and
                self.cards[0].rank == 'A' and
                self.cards[1].rank == 'A')

    def __repr__(self):
        return f"{self.cards} Total: {self.total()}"


class Player:
    def __init__(self, name, balance=5000):
        self.name = name
        self.balance = balance

    def can_afford(self, amount):
        return self.balance >= amount

    def deduct(self, amount):
        self.balance -= int(amount)

    def add(self, amount):
        self.balance += int(amount)

    def __repr__(self):
        return f"{self.name} (Balance: {self.balance})"


class Seat:
    def __init__(self, number):
        self.number = number
        self.player = None
        self.bet = 0
        self.hands = []
        self.occupied = False
        self.perfect_pairs_amount = 0
        self.twentyone_plus_3_amount = 0
        self.insurance_bet = 0
        self.sidebet_results = {"pp": None, "t3": None}

    def occupy(self, player):
        self.player = player
        self.occupied = True

    def vacate(self):
        self.player = None
        self.bet = 0
        self.hands = []
        self.occupied = False
        self.perfect_pairs_amount = 0
        self.twentyone_plus_3_amount = 0
        self.insurance_bet = 0
        self.sidebet_results = {"pp": None, "t3": None}


# =====================================================================
# --- TABLE: THE GAME ENGINE ---
# =====================================================================

class Table:
    def __init__(self, settings=None, is_public=False, host_name=None, room_name=None, is_solo=False):
        self.settings = self._normalize_settings(settings)
        self.is_public = bool(is_public)
        self.is_solo = bool(is_solo)   # solo "Play" table — no seat cap
        self.host_name = host_name
        self.room_name = room_name
        self.shoe = Shoe(self.settings["numDecks"])
        self.dealer_hand = Hand()
        self.seats = [Seat(i + 1) for i in range(7)]  # 7 seats (classic layout)
        self.active_seat_numbers = []
        self.current_seat_turn_idx = 0
        self.current_hand_idx = 0
        self.insurance_responses = {}
        self.ready_players = []
        self.logs = []
        self.game_state = "betting"
        self.running_count = 0
        self.player_stats = {}
        self.round_mistakes = []
        self.bot_names = []  # names of computer players seated at this table

    @staticmethod
    def _normalize_settings(settings=None):
        settings = settings or {}
        return {
            "numDecks": int(settings.get("numDecks", 6) or 6),
            "dealerHitsSoft17": bool(settings.get("dealerHitsSoft17", False)),
            "countVisibility": settings.get("countVisibility", "always"),
            "showStrategyHints": bool(settings.get("showStrategyHints", True)),
            "showBustProb": bool(settings.get("showBustProb", True)),
            "showWinProb": bool(settings.get("showWinProb", True)),
            "dealSpeed": settings.get("dealSpeed", "normal"),
            "audioEnabled": bool(settings.get("audioEnabled", False)),
            "tableTheme": settings.get("tableTheme", "green"),
        }

    def log(self, message):
        self.logs.append(message)
        if len(self.logs) > 20:
            self.logs.pop(0)

    def init_player_stats(self, player_name):
        if player_name not in self.player_stats:
            self.player_stats[player_name] = {
                "hands_won": 0,
                "hands_lost": 0,
                "hands_push": 0,
                "blackjacks": 0,
                "total_earned": 0,
                "mistakes_count": 0,
                "lucky_mistakes_count": 0,
                "mistakes_history": []
            }

    def _cards_in_play(self):
        cards = list(self.dealer_hand.cards)
        for seat in self.seats:
            for h in seat.hands:
                cards.extend(h.cards)
        return cards

    def deal_card(self):
        if not self.shoe.cards:
            # Shoe ran dry mid-round (possible only on a very full 1-deck
            # table). Shuffle the discards — never the cards on the table — and
            # restart the count from what is visible in play.
            in_play = self._cards_in_play()
            self.shoe.rebuild_without(in_play)
            self.running_count = sum(hi_lo(c) for c in in_play)
            self.log("Shoe exhausted — discards reshuffled.")
        card = self.shoe.deal()
        self.running_count += hi_lo(card)
        return card

    # Cards held back for the next round: deal a fresh shoe instead of
    # starting a round that would likely run the shoe dry.
    CARDS_RESERVED_PER_HAND = 4

    def _cards_reserve(self, seat_count):
        return (seat_count + 1) * self.CARDS_RESERVED_PER_HAND

    def _flag_reshuffle_if_short(self, seat_count):
        if len(self.shoe.cards) < self._cards_reserve(seat_count):
            self.shoe.reshuffle_needed = True

    def get_unique_players(self):
        seen = []
        for seat in self.seats:
            if seat.occupied and seat.player not in seen:
                seen.append(seat.player)
        return seen

    # ----------------------------------------------------------------
    # BETTING PHASE
    # ----------------------------------------------------------------

    MAX_SEATS_PER_PLAYER = 3

    def add_player(self, player_name, seat_numbers, main_bet, pp_bet, t3_bet, current_balance=5000):
        if self.game_state != "betting":
            return

        # Input validation (REVIEW E1/E7): bets and seats come straight from the
        # client. A negative side bet used to be deducted as a negative cost,
        # minting chips; out-of-range seats wrapped (seat 0 -> seat 7) or crashed.
        try:
            main_bet, pp_bet, t3_bet = int(main_bet), int(pp_bet), int(t3_bet)
            seat_numbers = [int(n) for n in seat_numbers]
        except (TypeError, ValueError):
            self.log("Invalid bet or seat.")
            return
        if main_bet <= 0 or pp_bet < 0 or t3_bet < 0:
            self.log("Bets must be positive.")
            return
        if not seat_numbers or len(set(seat_numbers)) != len(seat_numbers) or \
                any(not 1 <= n <= len(self.seats) for n in seat_numbers):
            self.log("Invalid seat selection.")
            return

        # Cap applies to multiplayer rooms only — solo play is uncapped.
        if not self.is_solo:
            already_held = {s.number for s in self.seats
                            if s.occupied and s.player.name == player_name}
            if len(already_held | set(seat_numbers)) > self.MAX_SEATS_PER_PLAYER:
                self.log(f"Max {self.MAX_SEATS_PER_PLAYER} seats per player.")
                return

        pp_bet = min(pp_bet, main_bet)
        t3_bet = min(t3_bet, main_bet)

        num_seats = len(seat_numbers)
        total_commitment = (main_bet + pp_bet + t3_bet) * num_seats

        existing = next((p for p in self.get_unique_players() if p.name == player_name), None)
        player = existing if existing else Player(player_name, current_balance)

        # Sync balance from DB if player reconnects
        if existing:
            existing.balance = current_balance

        if not player.can_afford(total_commitment):
            self.log(f"Insufficient funds. Need ${total_commitment}, have ${player.balance}.")
            return

        for num in seat_numbers:
            seat = self.seats[num - 1]
            if seat.occupied and seat.player.name != player_name:
                self.log(f"Seat {num} is already taken.")
                return

        for num in seat_numbers:
            seat = self.seats[num - 1]
            seat.occupy(player)
            seat.bet = main_bet
            seat.perfect_pairs_amount = pp_bet
            seat.twentyone_plus_3_amount = t3_bet

        if player.name not in self.ready_players:
            self.ready_players.append(player.name)
        self.log(f"{player.name} locked bets on seats {seat_numbers}.")

    def leave_player(self, player_name):
        if self.game_state != "betting":
            return
        player_seats = [s for s in self.seats if s.occupied and s.player.name == player_name]
        for seat in player_seats:
            seat.vacate()
        if player_name in self.ready_players:
            self.ready_players.remove(player_name)
        self.log(f"{player_name} left the table.")

    RELOAD_TO = 5000

    def reload_player_bankroll(self, player_name):
        """Top a player back up to the reload amount. Only ever raises the
        balance — reloading while already above the threshold does nothing."""
        player = next((p for p in self.get_unique_players() if p.name == player_name), None)
        if player and player.balance < self.RELOAD_TO:
            player.balance = self.RELOAD_TO
            self.log(f"{player_name} topped up to ${self.RELOAD_TO:,}.")
            return True
        return False

    # ----------------------------------------------------------------
    # DEAL PHASE
    # ----------------------------------------------------------------

    def deal_initial(self, cut_fraction=None):
        if self.game_state != "betting":
            return

        unique_players = self.get_unique_players()
        if not unique_players:
            self.log("No players at the table.")
            return

        self.logs.clear()
        self.active_seat_numbers = [s.number for s in self.seats if s.occupied and s.bet > 0]
        self.active_seat_numbers.sort()

        if not self.active_seat_numbers:
            self.log("No active bets to deal.")
            return

        if not self._collect_round_bets():
            return

        self._flag_reshuffle_if_short(len(self.active_seat_numbers))
        if self.shoe.reshuffle_needed:
            self.running_count = 0
            self.log("Shoe reshuffled." + (" Player cut the deck." if cut_fraction is not None else ""))
        self.shoe.reshuffle_if_needed(cut_fraction)

        self.dealer_hand = Hand()
        self.insurance_responses = {}
        self.round_mistakes = []
        self.player_stats.clear()

        for num in self.active_seat_numbers:
            self.seats[num - 1].hands = [Hand(bet=self.seats[num - 1].bet)]
            self.seats[num - 1].insurance_bet = 0
            self.seats[num - 1].sidebet_results = {"pp": None, "t3": None}
            self.init_player_stats(self.seats[num - 1].player.name)

        for _ in range(2):
            for num in self.active_seat_numbers:
                self.seats[num - 1].hands[0].add(self.deal_card())
            self.dealer_hand.add(self.deal_card())

        self.log("Cards dealt.")
        self.resolve_sidebets()

        if self.dealer_hand.cards[0].rank == 'A':
            self.game_state = "insurance"
            self.log("Dealer shows Ace — insurance is open.")
        else:
            self.check_initial_blackjacks()

    def _collect_round_bets(self):
        """Deduct main + side bets for every active seat before each deal."""
        affordable = []
        for num in self.active_seat_numbers:
            seat = self.seats[num - 1]
            cost = seat.bet + seat.perfect_pairs_amount + seat.twentyone_plus_3_amount
            if seat.player.can_afford(cost):
                seat.player.deduct(cost)
                affordable.append(num)
            else:
                self.log(f"S{num} — {seat.player.name} can't cover ${cost}. Seat vacated.")
                seat.vacate()

        self.active_seat_numbers = affordable
        if not self.active_seat_numbers:
            self.log("No seats could cover their bets.")
            return False
        return True

    def _check_dealer_blackjack_peek(self):
        """Compatibility shim: this table intentionally does not peek on 10."""
        return False

    def resolve_sidebets(self):
        """Side bets resolve the instant cards are dealt (Stake behaviour).

        The result is written into seat.sidebet_results so the chip on the
        table communicates the outcome directly: a winning side bet shows the
        total returned (stake + winnings), a losing side bet is set to 0 so its
        chip disappears.
        """
        for num in self.active_seat_numbers:
            seat = self.seats[num - 1]
            hand = seat.hands[0]
            upcard = self.dealer_hand.cards[0]

            if seat.perfect_pairs_amount > 0:
                pair_type = check_perfect_pairs(hand)
                if pair_type:
                    payouts = {'perfect': 25, 'colored': 12, 'mixed': 6}
                    gain = seat.perfect_pairs_amount * payouts[pair_type]
                    total_return = gain + seat.perfect_pairs_amount
                    seat.player.add(total_return)
                    seat.sidebet_results["pp"] = total_return
                    self.log(f"S{seat.number} {pair_type.capitalize()} Pair! +${gain}")
                else:
                    seat.sidebet_results["pp"] = 0
                    self.log(f"S{seat.number} No pair — PP lost.")

            if seat.twentyone_plus_3_amount > 0:
                result = check_21_plus_3(hand, upcard)
                if result:
                    payouts = {'suited_trips': 100, 'straight_flush': 40,
                               'three_of_a_kind': 30, 'straight': 10, 'flush': 5}
                    gain = seat.twentyone_plus_3_amount * payouts[result]
                    total_return = gain + seat.twentyone_plus_3_amount
                    seat.player.add(total_return)
                    seat.sidebet_results["t3"] = total_return
                    self.log(f"S{seat.number} {result.replace('_',' ').title()}! +${gain}")
                else:
                    seat.sidebet_results["t3"] = 0
                    self.log(f"S{seat.number} No 21+3 — sidebet lost.")

    # ----------------------------------------------------------------
    # INSURANCE PHASE
    # ----------------------------------------------------------------

    def buy_insurance(self, seat_number, wants_insurance):
        if self.game_state != "insurance":
            return
        # Exactly one decision per seat that is in this round (REVIEW E2/E3):
        # a repeat call used to deduct again, and an answer for a seat not in
        # the round could close the phase before real players decided.
        try:
            seat_number = int(seat_number)
        except (TypeError, ValueError):
            return
        if seat_number not in self.active_seat_numbers:
            self.log(f"S{seat_number} is not in this round.")
            return
        if str(seat_number) in self.insurance_responses:
            return
        seat = self.seats[seat_number - 1]
        wants_insurance = bool(wants_insurance)
        if wants_insurance:
            cost = seat.bet // 2
            if seat.player.can_afford(cost):
                seat.player.deduct(cost)
                seat.insurance_bet = cost
                self.log(f"S{seat_number} bought insurance for ${cost}.")
            else:
                seat.insurance_bet = 0
                self.log(f"S{seat_number} can't afford insurance.")
        else:
            seat.insurance_bet = 0

        self.insurance_responses[str(seat_number)] = seat.insurance_bet > 0
        if all(str(n) in self.insurance_responses for n in self.active_seat_numbers):
            self.resolve_insurance_phase()

    def resolve_insurance_phase(self):
        dealer_bj = self.dealer_hand.is_blackjack()
        for num in self.active_seat_numbers:
            seat = self.seats[num - 1]
            if seat.insurance_bet > 0:
                if dealer_bj:
                    payout = seat.insurance_bet * 3
                    seat.player.add(payout)
                    self.log(f"S{num} insurance won! +${payout}")
                else:
                    self.log(f"S{num} insurance lost.")

        if dealer_bj:
            self.log("Dealer has blackjack!")
            self.game_state = "game_over"
            self.resolve_game()
        else:
            self.log("No dealer blackjack. Play continues.")
            self.check_initial_blackjacks()

    # ----------------------------------------------------------------
    # PLAYING PHASE
    # ----------------------------------------------------------------

    def check_initial_blackjacks(self):
        self.game_state = "playing"
        self.current_seat_turn_idx = 0
        self.current_hand_idx = 0
        self.skip_unplayable_hands()

    def skip_unplayable_hands(self):
        while self.current_seat_turn_idx < len(self.active_seat_numbers):
            curr_num = self.active_seat_numbers[self.current_seat_turn_idx]
            current_seat = self.seats[curr_num - 1]
            current_hand = current_seat.hands[self.current_hand_idx]

            if current_hand.is_blackjack():
                self.log(f"S{current_seat.number} Blackjack!")
                self.advance_indices()
            elif current_hand.total() >= 21:
                self.advance_indices()
            elif current_hand.from_split_aces and len(current_hand.cards) >= 2:
                self.log(f"S{current_seat.number} split aces — auto stand.")
                self.advance_indices()
            else:
                return
        self.finish_playing_phase()

    def advance_indices(self):
        curr_num = self.active_seat_numbers[self.current_seat_turn_idx]
        current_seat = self.seats[curr_num - 1]
        self.current_hand_idx += 1
        if self.current_hand_idx >= len(current_seat.hands):
            self.current_seat_turn_idx += 1
            self.current_hand_idx = 0

    ACTIONS = ("hit", "stand", "double", "split")

    @staticmethod
    def _legal_actions(seat, hand):
        """The moves the engine will actually perform for this hand now."""
        legal = {"stand"}
        if hand.from_split_aces:
            return legal
        legal.add("hit")
        can_pay = seat.player.can_afford(hand.bet)
        if len(hand.cards) == 2 and can_pay:
            legal.add("double")
        if len(seat.hands) < 4 and hand.can_split() and can_pay:
            legal.add("split")
        return legal

    def _recommended_action(self, seat, hand, upcard):
        """Basic strategy restricted to legal moves. Returns None when the
        book play is an unavailable split (no fallback is graded then)."""
        rec = basic_strategy(hand, upcard)
        legal = self._legal_actions(seat, hand)
        if rec in legal:
            return rec
        if rec == "double":
            # Standard chart: soft 18/19 "double, else stand"; others "else hit".
            return "stand" if self._is_soft(hand) and hand.total() >= 18 else "hit"
        return None

    def execute_action(self, username, action):
        """Primary action handler. Validates username owns the active seat."""
        if self.game_state != "playing":
            return
        if self.current_seat_turn_idx >= len(self.active_seat_numbers):
            return

        curr_num = self.active_seat_numbers[self.current_seat_turn_idx]
        current_seat = self.seats[curr_num - 1]

        # Enforce turn ownership
        if current_seat.player.name != username:
            return

        current_hand = current_seat.hands[self.current_hand_idx]
        upcard = self.dealer_hand.cards[0]

        # Reject anything that is not a legal move right now BEFORE grading it
        # (REVIEW E8 / QA B2): a no-op must never show up as a "mistake".
        if action not in self._legal_actions(current_seat, current_hand):
            return

        # Track strategy mistakes (graded against the best LEGAL play).
        recommendation = self._recommended_action(current_seat, current_hand, upcard)
        if recommendation is not None and action != recommendation:
            if not hasattr(current_hand, 'pending_mistakes'):
                current_hand.pending_mistakes = []
            current_hand.pending_mistakes.append({
                "player_total": current_hand.total(),
                "dealer_upcard": str(upcard),
                "user_action": action.upper(),
                "recommended_action": recommendation.upper(),
                # extra context for the review screen (presentation only)
                "is_soft": self._is_soft(current_hand),
                "is_pair": current_hand.can_split(),
                "cards": [str(c) for c in current_hand.cards],
            })

        if action == "hit":
            current_hand.add(self.deal_card())
            if current_hand.is_bust():
                self.log(f"S{current_seat.number} busts ({current_hand.total()}).")
                self.advance_indices()
                self.skip_unplayable_hands()
            elif current_hand.total() == 21:
                self.advance_indices()
                self.skip_unplayable_hands()

        elif action == "stand":
            self.log(f"S{current_seat.number} stands on {current_hand.total()}.")
            self.advance_indices()
            self.skip_unplayable_hands()

        elif action == "double":
            if len(current_hand.cards) == 2 and current_seat.player.can_afford(current_hand.bet):
                current_seat.player.deduct(current_hand.bet)
                current_hand.bet *= 2
                current_hand.add(self.deal_card())
                self.log(f"S{current_seat.number} doubles — {current_hand.total()}.")
                if current_hand.is_bust():
                    self.log(f"S{current_seat.number} busts on double.")
                self.advance_indices()
                self.skip_unplayable_hands()

        elif action == "split":
            if (len(current_seat.hands) >= 4 or current_hand.from_split_aces
                    or not current_hand.can_split()
                    or not current_seat.player.can_afford(current_hand.bet)):
                return
            current_seat.player.deduct(current_hand.bet)
            was_aces = current_hand.cards[0].rank == 'A'
            new_hand = Hand(bet=current_hand.bet)
            new_hand.from_split = True
            new_hand.from_split_aces = was_aces
            new_hand.add(current_hand.cards.pop())
            current_hand.from_split = True
            current_hand.from_split_aces = was_aces
            current_hand.add(self.deal_card())
            new_hand.add(self.deal_card())
            current_seat.hands.insert(self.current_hand_idx + 1, new_hand)
            self.log(f"S{current_seat.number} splits — {len(current_seat.hands)} hands.")
            self.skip_unplayable_hands()

    def finish_playing_phase(self):
        all_busted = True
        for num in self.active_seat_numbers:
            for h in self.seats[num - 1].hands:
                if not h.is_bust() and not h.is_blackjack():
                    all_busted = False

        if all_busted:
            self.game_state = "game_over"
            self.resolve_game()
        else:
            self.game_state = "dealer_turn"
            self.play_dealer()

    # ----------------------------------------------------------------
    # DEALER & RESOLUTION
    # ----------------------------------------------------------------

    def play_dealer(self):
        self.log(f"Dealer reveals: {[str(c) for c in self.dealer_hand.cards]}")
        while self.dealer_hand.total() < 17 or (
            self.settings.get("dealerHitsSoft17") and
            self.dealer_hand.total() == 17 and
            self._is_soft(self.dealer_hand)
        ):
            self.dealer_hand.add(self.deal_card())
        self.log(f"Dealer stands on {self.dealer_hand.total()}.")
        self.game_state = "game_over"
        self.resolve_game()

    @staticmethod
    def _is_soft(hand):
        """A hand is soft if, in its best total, an ace is still counted as 11."""
        total = 0
        aces = 0
        for card in hand.cards:
            total += card.value()
            if card.rank == 'A':
                aces += 1
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return aces > 0

    def resolve_game(self):
        d_total = self.dealer_hand.total()
        d_bj = self.dealer_hand.is_blackjack()
        self.log(f"--- Round Over — Dealer: {d_total} ---")

        for num in self.active_seat_numbers:
            seat = self.seats[num - 1]
            player_name = seat.player.name
            self.init_player_stats(player_name)
            stats = self.player_stats[player_name]

            for i, hand in enumerate(seat.hands):
                label = f"S{num}" if len(seat.hands) == 1 else f"S{num}H{i+1}"
                p_total = hand.total()
                p_bj = hand.is_blackjack()
                bet = hand.bet
                outcome = "loss"
                payout = 0  # total chips returned to the player for this hand

                if hand.is_bust():
                    outcome = "loss"
                    self.log(f"{label} bust — lost ${bet}.")
                elif d_bj and not p_bj:
                    outcome = "loss"
                    self.log(f"{label} dealer BJ — lost ${bet}.")
                elif p_bj and d_bj:
                    outcome = "push"
                    payout = bet
                    seat.player.add(bet)
                    self.log(f"{label} both BJ — push ${bet}.")
                elif p_bj:
                    outcome = "blackjack"
                    gain = int(bet * 2.5)
                    payout = gain
                    seat.player.add(gain)
                    self.log(f"{label} Blackjack! +${gain}")
                elif d_total > 21 or p_total > d_total:
                    outcome = "win"
                    gain = bet * 2
                    payout = gain
                    seat.player.add(gain)
                    self.log(f"{label} wins {p_total}v{d_total} +${gain}")
                elif p_total == d_total:
                    outcome = "push"
                    payout = bet
                    seat.player.add(bet)
                    self.log(f"{label} push {p_total} — ${bet} back.")
                else:
                    outcome = "loss"
                    self.log(f"{label} loses {p_total}v{d_total}.")

                hand.outcome = outcome
                hand.payout = payout

                net = 0
                if outcome == "blackjack":
                    net = int(bet * 1.5)
                elif outcome == "win":
                    net = bet
                elif outcome == "loss":
                    net = -bet
                stats["total_earned"] += net

                if outcome in ["win", "blackjack"]:
                    stats["hands_won"] += 1
                    if outcome == "blackjack":
                        stats["blackjacks"] += 1
                elif outcome == "loss":
                    stats["hands_lost"] += 1
                elif outcome == "push":
                    stats["hands_push"] += 1

                # Finalize mistake records with outcome
                if hasattr(hand, 'pending_mistakes') and hand.pending_mistakes:
                    for mis in hand.pending_mistakes:
                        mis["hand_outcome"] = outcome.upper()
                        stats["mistakes_count"] += 1
                        if outcome in ["win", "blackjack"]:
                            stats["lucky_mistakes_count"] += 1
                        stats["mistakes_history"].append(mis)
                        self.round_mistakes.append({**mis, "username": player_name})

    # ----------------------------------------------------------------
    # RESET
    # ----------------------------------------------------------------

    def reset_round(self):
        if self.game_state != "game_over":
            return
        for s in self.seats:
            s.hands = []
            s.insurance_bet = 0
        self.dealer_hand = Hand()
        self.active_seat_numbers = []
        self.ready_players = []
        self.current_seat_turn_idx = 0
        self.current_hand_idx = 0
        self.game_state = "betting"
        # Surface a pending shuffle now (shoePendingShuffle) so the UI can
        # offer the cut before the next deal.
        self._flag_reshuffle_if_short(sum(1 for s in self.seats if s.occupied))
        self.log("Round reset — place your bets.")

    # ----------------------------------------------------------------
    # SERIALIZATION
    # ----------------------------------------------------------------

    @staticmethod
    def _parse_card(card_str):
        if not card_str:
            return None
        suit = card_str[-1]
        rank = card_str[:-1]
        return Card(rank, suit)

    # Key of the server-only block in a persisted snapshot. It holds the shoe
    # order (and other engine internals) and must NEVER be sent to a client.
    PRIVATE_KEY = "engine"

    def to_snapshot(self):
        """Full persisted state: the public to_json() view plus a private
        `engine` block (shoe order, insurance decisions, ungraded mistakes).
        from_snapshot(to_snapshot()) round-trips the table exactly
        (REVIEW E4, QA B3/B4). Strip PRIVATE_KEY before sending to clients."""
        snap = self.to_json()
        pending = {}
        for seat in self.seats:
            per_hand = [list(getattr(h, 'pending_mistakes', [])) for h in seat.hands]
            if any(per_hand):
                pending[str(seat.number)] = per_hand
        snap[self.PRIVATE_KEY] = {
            "shoe": self.shoe.to_dict(),
            "insuranceResponses": dict(self.insurance_responses),
            "readyPlayers": list(self.ready_players),
            "pendingMistakes": pending,
        }
        return snap

    @classmethod
    def public_view(cls, snapshot):
        """A persisted snapshot with the server-only block removed."""
        return {k: v for k, v in (snapshot or {}).items() if k != cls.PRIVATE_KEY}

    @classmethod
    def from_snapshot(cls, snapshot):
        """Rebuild a Table from a persisted to_snapshot() (or legacy to_json())."""
        table = cls()
        if not snapshot:
            return table

        table.settings = cls._normalize_settings(snapshot.get("settings"))
        table.is_public = bool(snapshot.get("isPublic", False))
        table.is_solo = bool(snapshot.get("isSolo", False))
        table.host_name = snapshot.get("hostName")
        table.room_name = snapshot.get("roomName")

        private = snapshot.get(cls.PRIVATE_KEY) or {}
        if private.get("shoe"):
            table.shoe = Shoe.from_dict(private["shoe"])
            table.running_count = snapshot.get("cardCounting", {}).get("runningCount", 0)
        else:
            # Legacy snapshot without a shoe: a fresh shoe means a fresh count.
            if table.shoe.num_decks != table.settings["numDecks"]:
                table.shoe = Shoe(table.settings["numDecks"])
            table.running_count = 0

        table.game_state = snapshot.get("gameState", "betting")
        table.bot_names = list(snapshot.get("botNames", []))
        table.logs = list(snapshot.get("logs", []))
        table.round_mistakes = list(snapshot.get("roundMistakes", []))
        table.current_hand_idx = snapshot.get("activeHandIndex", 0)
        table.current_seat_turn_idx = snapshot.get("activeSeatTurnIdx", 0)
        table.active_seat_numbers = list(snapshot.get("activeSeatNumbers", []))

        # One Player object per name, shared by all of that player's seats.
        players = {}
        for p in snapshot.get("players", []):
            players[p["name"]] = Player(p["name"], p.get("balance", 5000))
            if p.get("isReady") and p["name"] not in table.ready_players:
                table.ready_players.append(p["name"])
        if "readyPlayers" in private:
            table.ready_players = list(private["readyPlayers"])

        pending = private.get("pendingMistakes", {})
        for seat_data in snapshot.get("seats", []):
            # Skip seats beyond the current table size (e.g. old 7-seat snapshots).
            if not (1 <= seat_data["number"] <= len(table.seats)):
                continue
            seat = table.seats[seat_data["number"] - 1]
            if seat_data.get("isOccupied"):
                name = seat_data.get("playerName")
                if name not in players:
                    bal = seat_data.get("balance")
                    players[name] = Player(name, 5000 if bal is None else bal)
                seat.occupy(players[name])
                seat.bet = seat_data.get("bet", 0)
                seat.perfect_pairs_amount = seat_data.get("ppBet", 0)
                seat.twentyone_plus_3_amount = seat_data.get("t3Bet", 0)
                seat.insurance_bet = seat_data.get("insuranceBet", 0)
                seat.sidebet_results = seat_data.get("sidebetResults") or {"pp": None, "t3": None}
                seat_pending = pending.get(str(seat.number), [])
                for i, h_data in enumerate(seat_data.get("hands", [])):
                    hand = Hand(bet=h_data.get("bet", seat.bet))
                    hand.from_split = h_data.get("fromSplit", False)
                    hand.from_split_aces = h_data.get("fromSplitAces", False)
                    hand.outcome = h_data.get("outcome")
                    hand.payout = h_data.get("payout", 0)
                    for c_str in h_data.get("cards", []):
                        card = cls._parse_card(c_str)
                        if card:
                            hand.add(card)
                    # (fromSplitAces is always persisted; it used to be inferred
                    # from an A,A hand, which wrongly froze an unsplit pair.)
                    if i < len(seat_pending) and seat_pending[i]:
                        hand.pending_mistakes = list(seat_pending[i])
                    seat.hands.append(hand)
                if "insuranceResponses" not in private and seat_data.get("insuranceDecisionMade"):
                    # Legacy: only "decided" was stored; infer the choice.
                    table.insurance_responses[str(seat.number)] = seat.insurance_bet > 0
        if "insuranceResponses" in private:
            table.insurance_responses = dict(private["insuranceResponses"])

        dealer_data = snapshot.get("dealerHand", {})
        for c_str in dealer_data.get("cards", []):
            card = cls._parse_card(c_str)
            if card:
                table.dealer_hand.add(card)

        if snapshot.get("playerStats"):
            table.player_stats = snapshot["playerStats"]

        return table

    def to_json(self):
        seats_data = []
        for seat in self.seats:
            hands_data = []
            for h in seat.hands:
                hands_data.append({
                    "cards": [str(c) for c in h.cards],
                    "total": h.total(),
                    "bet": h.bet,
                    "isBust": h.is_bust(),
                    "isBlackjack": h.is_blackjack(),
                    "canDouble": len(h.cards) == 2 and not h.from_split_aces and seat.occupied and seat.player.can_afford(h.bet),
                    "canSplit": h.can_split() and len(seat.hands) < 4 and seat.occupied and seat.player.can_afford(h.bet),
                    "canHit": not h.from_split_aces,
                    "fromSplit": h.from_split,
                    "fromSplitAces": h.from_split_aces,
                    "outcome": h.outcome,
                    "payout": h.payout
                })

            is_active_turn = False
            if self.game_state == "playing" and self.active_seat_numbers:
                if self.current_seat_turn_idx < len(self.active_seat_numbers):
                    if self.active_seat_numbers[self.current_seat_turn_idx] == seat.number:
                        is_active_turn = True

            seats_data.append({
                "number": seat.number,
                "isOccupied": seat.occupied,
                "playerName": seat.player.name if seat.occupied else None,
                "balance": seat.player.balance if seat.occupied else 0,
                "bet": seat.bet,
                "ppBet": seat.perfect_pairs_amount,
                "t3Bet": seat.twentyone_plus_3_amount,
                "insuranceBet": seat.insurance_bet,
                "ppDisplay": seat.sidebet_results["pp"] if seat.sidebet_results.get("pp") is not None else seat.perfect_pairs_amount,
                "t3Display": seat.sidebet_results["t3"] if seat.sidebet_results.get("t3") is not None else seat.twentyone_plus_3_amount,
                "sidebetResults": seat.sidebet_results,
                "hands": hands_data,
                "isActiveTurn": is_active_turn,
                "insuranceDecisionMade": str(seat.number) in self.insurance_responses
            })

        players_data = []
        for player in self.get_unique_players():
            player_seats = [s.number for s in self.seats if s.occupied and s.player == player]
            players_data.append({
                "name": player.name,
                "balance": player.balance,
                "seats": player_seats,
                "isReady": player.name in self.ready_players,
            })

        # Build learner panel for active hand
        learner_panel = None
        if self.game_state == "playing" and self.active_seat_numbers:
            if self.current_seat_turn_idx < len(self.active_seat_numbers):
                curr_num = self.active_seat_numbers[self.current_seat_turn_idx]
                current_seat = self.seats[curr_num - 1]
                if self.current_hand_idx < len(current_seat.hands):
                    current_hand = current_seat.hands[self.current_hand_idx]
                    if self.dealer_hand.cards:
                        upcard = self.dealer_hand.cards[0]
                        # Same legal-move advice the mistake tracker grades by.
                        suggestion = (self._recommended_action(current_seat, current_hand, upcard)
                                      or basic_strategy(current_hand, upcard))
                        bust_p = bust_probability(current_hand.total())
                        win_stand_p = player_win_probability(current_hand.total(), upcard.value())
                        optimal_p = optimal_win_probability(current_hand, upcard.value())

                        # Several phrasings per situation, picked deterministically
                        # (same hand + upcard = same line, so text never flickers).
                        p_total = current_hand.total()
                        up_rank = upcard.rank
                        variant = (p_total + upcard.value()) % 3
                        reasoning_variants = {
                            "hit": ([f"Dealer {up_rank} is strong — standing loses long-term.",
                                     f"A {up_rank} makes 17+ too often. Your {p_total} has to improve.",
                                     f"Standing on {p_total} into a {up_rank} is surrender — draw."]
                                    if upcard.value() >= 7 else
                                    [f"Your {p_total} is too low to win standing.",
                                     f"{p_total} can't bust — take the free card.",
                                     f"No total this small wins on its own. Build it."]),
                            "stand": ([f"Dealer {up_rank} is weak — let them bust.",
                                       f"The {up_rank} is a bust card. Make the dealer do the dying.",
                                       f"Don't rescue a dealer {up_rank} — stand and wait."]
                                      if upcard.value() <= 6 else
                                      [f"Your {p_total} is strong enough — protect it.",
                                       f"{p_total} already beats most dealer finishes. Lock it in.",
                                       f"Drawing here risks a made hand. Hold {p_total}."]),
                            "double": [f"High EV total against a vulnerable dealer {up_rank} — maximize now.",
                                       f"You're the favourite vs a {up_rank}. Get the money in.",
                                       "Prime double: one strong card, twice the profit."],
                            "split": ["Breaking up this pair opens two positive EV paths.",
                                      "This pair plays far better as two fresh hands.",
                                      "Split — one awkward hand becomes two live ones."],
                        }
                        reasoning_map = {k: v[variant % len(v)] for k, v in reasoning_variants.items()}
                        learner_panel = {
                            "suggestion": suggestion.upper(),
                            "activeSeat": curr_num,
                            "activePlayer": current_seat.player.name,
                            "reasoning": reasoning_map.get(suggestion, ""),
                            "bustIfHit": round(bust_p * 100, 1),
                            "winIfStand": {
                                "win": round(win_stand_p['win'] * 100, 1),
                                "lose": round(win_stand_p['lose'] * 100, 1),
                                "push": round(win_stand_p['push'] * 100, 1)
                            },
                            "optimalPlay": {
                                "win": round(optimal_p['win'] * 100, 1),
                                "lose": round(optimal_p['lose'] * 100, 1),
                                "push": round(optimal_p['push'] * 100, 1)
                            }
                        }

        remaining_cards = len(self.shoe.cards)
        remaining_decks = max(0.5, round(remaining_cards / 52, 1))
        true_count = round(self.running_count / remaining_decks, 1)

        return {
            "gameState": self.game_state,
            "isPublic": self.is_public,
            "isSolo": self.is_solo,
            "shoePendingShuffle": self.shoe.reshuffle_needed,
            "roundMistakes": self.round_mistakes,
            "botNames": self.bot_names,
            "hostName": self.host_name,
            "roomName": self.room_name,
            "logs": self.logs,
            "seats": seats_data,
            "players": players_data,
            "playerStats": self.player_stats,
            "activeHandIndex": self.current_hand_idx,
            "activeSeatTurnIdx": self.current_seat_turn_idx,
            "activeSeatNumbers": self.active_seat_numbers,
            "learnerPanel": learner_panel,
            "cardCounting": {
                "runningCount": self.running_count,
                "trueCount": true_count,
                "remainingCards": remaining_cards
            },
            "settings": self.settings,
            "dealerHand": {
                "cards": [str(c) for c in self.dealer_hand.cards],
                "total": self.dealer_hand.total()
            }
        }
