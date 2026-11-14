"""Targeted bug/exploit probes against backend/game.py. Usage: probes.py <backend_dir>"""
import sys, random
sys.path.insert(0, sys.argv[1])
from game import Table, Card, Hand, Shoe
from strategy import basic_strategy
from probability import bust_probability, player_win_probability, optimal_win_probability

def C(s): return Card(s[:-1], s[-1])
def H(*cs, bet=100):
    h = Hand(bet); [h.add(C(c)) for c in cs]; return h
def stack(t, *cs):
    t.shoe.cards = [C(c) for c in cs] + t.shoe.cards
    t.shoe.reshuffle_needed = False
def hdr(s): print("\n=== " + s)

hdr("1. negative side bet mints chips")
t = Table(is_solo=True)
t.add_player("P", [1], 100, -1000000, 0, current_balance=5000)
print(" seat ppBet:", t.seats[0].perfect_pairs_amount)
t.deal_initial()
print(" balance right after deal (started 5000, staked 100):", t.seats[0].player.balance)

hdr("2. insurance: repeat purchase / foreign seat / non-active seat")
t = Table()
t.add_player("A", [1], 100, 0, 0, current_balance=5000)
t.add_player("B", [2], 100, 0, 0, current_balance=5000)
stack(t, "9♠", "9♥", "A♠", "7♦", "7♣", "6♦")   # P1, P2, D-up=A, P1, P2, hole
t.deal_initial()
print(" state:", t.game_state, "A bal:", t.seats[0].player.balance)
t.buy_insurance(1, True); t.buy_insurance(1, True); t.buy_insurance(1, True)
print(" after 3x buy_insurance(seat 1): A bal:", t.seats[0].player.balance, "insurance_bet:", t.seats[0].insurance_bet, "state:", t.game_state)
t2 = Table()
t2.add_player("A", [1], 100, 0, 0, current_balance=5000)
t2.add_player("B", [2], 100, 0, 0, current_balance=5000)
stack(t2, "9♠", "9♥", "A♠", "7♦", "7♣", "6♦")
t2.deal_initial()
t2.buy_insurance(1, False)
t2.buy_insurance(5, False)   # empty seat 'answers'
print(" answering for an EMPTY seat 5 closes insurance without B answering -> state:", t2.game_state)
t3 = Table()
t3.add_player("A", [1], 100, 0, 0, current_balance=5000)
stack(t3, "9♠", "A♠", "7♦", "6♦")
t3.deal_initial()
try:
    t3.buy_insurance(4, True)
    print(" buy_insurance on empty seat 4 OK?? state", t3.game_state)
except Exception as e:
    print(" buy_insurance(empty seat, True) raises:", type(e).__name__, e)

hdr("3. seat index validation")
for seats in ([0], [8], ["1"], [1, 1, 1, 1]):
    t = Table()
    try:
        t.add_player("P", seats, 100, 0, 0, current_balance=5000)
        print(f" seats={seats!r}: accepted; occupied={[s.number for s in t.seats if s.occupied]}")
    except Exception as e:
        print(f" seats={seats!r}: raises {type(e).__name__}: {e}")

hdr("4. mistake tracker vs. legality")
t = Table(is_solo=True)
t.add_player("P", [1], 100, 0, 0, current_balance=5000)
stack(t, "5♠", "10♥", "2♦", "9♣", "4♣", "K♠", "8♦")   # P:5,2 D:10,9 ; hit 4 -> 11 (3 cards)
t.deal_initial()
t.execute_action("P", "hit")
h = t.seats[0].hands[0]
print(" hand", [str(c) for c in h.cards], "total", h.total(), "-> engine recommends:", basic_strategy(h, t.dealer_hand.cards[0]), "(double is illegal on 3 cards)")
t.execute_action("P", "hit")
print(" pending mistakes after correctly HITTING 3-card 11:", getattr(h, 'pending_mistakes', []))
t = Table(is_solo=True)
t.add_player("P", [1], 100, 0, 0, current_balance=5000)
stack(t, "10♠", "7♥", "6♦", "9♣")
t.deal_initial()
t.execute_action("P", "surrender"); t.execute_action("P", "banana")
h = t.seats[0].hands[0]
print(" garbage actions recorded as mistakes:", [m["user_action"] for m in getattr(h, 'pending_mistakes', [])], "state still:", t.game_state)
# soft 18 three cards
h = H("A♠", "3♥", "4♦"); print(" A,3,4 (soft 18, 3 cards) vs 5 ->", basic_strategy(h, C("5♣")), "| A,2,4 soft 17 vs 4 ->", basic_strategy(H("A♠","2♥","4♦"), C("4♣")))
h = H("A♠", "3♥", "4♦"); print(" A,3,4 soft 18 vs 2 ->", basic_strategy(h, C("2♣")), "(correct when double unavailable: STAND)")

hdr("5. double with insufficient funds / broke player")
t = Table(is_solo=True)
t.add_player("P", [1], 100, 0, 0, current_balance=150)
stack(t, "6♠", "5♥", "5♦", "9♣", "K♣")
t.deal_initial()
t.execute_action("P", "double")
h = t.seats[0].hands[0]
print(" after unaffordable double: cards", len(h.cards), "state", t.game_state, "mistakes:", [m["user_action"] + ' vs rec ' + m["recommended_action"] for m in getattr(h, 'pending_mistakes', [])])

hdr("6. snapshot round-trip")
t = Table()
t.add_player("A", [1, 2], 100, 0, 0, current_balance=5000)
stack(t, "9♠", "8♠", "6♥", "7♦", "7♣", "K♦")
t.deal_initial()
snap = t.to_json()
r = Table.from_snapshot(snap)
ups = r.get_unique_players()
print(" before: unique players", len(t.get_unique_players()), "balance", t.seats[0].player.balance)
print(" after restore: unique player objects", len(ups), [(p.name, p.balance) for p in ups], "same object across seats:", r.seats[0].player is r.seats[1].player)
print(" shoe cards before", len(t.shoe.cards), "after", len(r.shoe.cards), "| running count kept:", r.running_count, "(shoe is new => count is now wrong)")
r.execute_action("A", "stand"); r.execute_action("A", "stand")
print(" restored table finished round: state", r.game_state, "balances per seat-object:", [s.player.balance for s in r.seats[:2]])
print(" dealer hole card visible in broadcast during play:", snap["gameState"], snap["dealerHand"])

hdr("7. small shoes")
for nd in (1, 2, 4, 6, 8):
    s = Shoe(nd)
    print(f" {nd} decks: {len(s.cards)} cards, cut_card_position={s.cut_card_position} -> reshuffle after {len(s.cards)-s.cut_card_position} cards dealt ({(len(s.cards)-s.cut_card_position)/len(s.cards)*100:.0f}% penetration)")
random.seed(3)
t = Table({"numDecks": 1}, is_solo=True)
bal = 10**9; mid = 0
for i in range(300):
    t.add_player("P", list(range(1, 8)), 100, 0, 0, current_balance=bal)
    before_builds = id(t.shoe.cards)
    n0 = len(t.shoe.cards)
    t.deal_initial()
    if t.game_state == 'insurance':
        for k in range(1, 8): t.buy_insurance(k, False)
    g = 0
    while t.game_state == 'playing' and g < 200:
        g += 1
        seat = t.seats[t.active_seat_numbers[t.current_seat_turn_idx] - 1]
        hand = seat.hands[t.current_hand_idx]
        t.execute_action("P", 'stand' if hand.total() >= 12 else 'hit')
    used = sum(len(h.cards) for s in t.seats for h in s.hands) + len(t.dealer_hand.cards)
    if len(t.shoe.cards) > n0 - used: mid += 1
    bal = t.seats[0].player.balance
    t.reset_round()
print(f" 1 deck, 7 seats, 300 rounds: rounds with a silent MID-ROUND reshuffle (count not reset): {mid}; final running_count={t.running_count}")

hdr("8. rounding")
t = Table(is_solo=True)
t.add_player("P", [1], 5, 0, 0, current_balance=1000)
stack(t, "A♠", "9♥", "K♦", "9♣")
t.deal_initial()
print(" $5 blackjack: balance 1000 ->", t.seats[0].player.balance, "(3:2 should give 1007.5; engine floors)", "| insurance on $5 bet costs", 5 // 2)

hdr("9. learner-panel maths")
print(" bust_probability(17) used for SOFT 17 (A,6):", bust_probability(17), "(true: 0)")
print(" stand 18 vs Ace, panel:", player_win_probability(18, 11), " <- includes dealer-BJ branch (~30.8%) that is impossible after the peek")
print(" stand 18 vs 10, panel:", player_win_probability(18, 10))
print(" 'optimal' for hard 11 vs 6:", optimal_win_probability(H("6♠", "5♥"), 6), "(hit/stand only: ignores double & split)")
t = Table({"dealerHitsSoft17": True}, is_solo=True)
print(" H17 table: strategy for A,7 vs A ->", basic_strategy(H("A♠", "7♥"), C("A♣")), "; 11 vs A ->", basic_strategy(H("6♠", "5♥"), C("A♣")), "(H17 book: double) ; panel dealer model is always S17")

hdr("10. turn/ownership at engine level")
t = Table()
t.add_player("A", [1], 100, 0, 0, current_balance=5000)
t.add_player("B", [2], 100, 0, 0, current_balance=5000)
stack(t, "9♠", "9♥", "7♠", "7♦", "7♣", "K♦")
t.deal_initial()
t.execute_action("B", "stand")
print(" B acting on A's turn ignored:", t.current_seat_turn_idx == 0)
t.leave_player("A"); print(" leave mid-round ignored:", t.seats[0].occupied)
