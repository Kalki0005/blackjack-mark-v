def offer_insurance(seats, dealer_hand, auto_play = False):
    if dealer_hand.cards[0].rank != 'A':
        return {}

    print("\nDealer shows Ace — Insurance available!")
    insurance_bets = {}

    for seat in seats:
        if auto_play:
            insurance_bets[seat.number] = 0
            continue
        while True:
            decision = input(f"{seat.player.name} Seat {seat.number} — Take insurance for {seat.bet // 2}? (yes/no): ").lower()
            if decision == 'yes':
                insurance_amount = seat.bet // 2
                if seat.player.can_afford(insurance_amount):
                    seat.player.deduct(insurance_amount)
                    insurance_bets[seat.number] = insurance_amount
                    print(f"Insurance placed: {insurance_amount}, Balance: {seat.player.balance}")
                else:
                    print("Insufficient balance, insurance declined")
                    insurance_bets[seat.number] = 0
                break
            elif decision == 'no':
                insurance_bets[seat.number] = 0
                break
            else:
                print("yes or no only")

    return insurance_bets


def resolve_insurance(seats, insurance_bets, dealer_has_blackjack):
    if not insurance_bets:
        return
    for seat in seats:
        insurance_amount = insurance_bets.get(seat.number, 0)
        if insurance_amount == 0:
            continue
        if dealer_has_blackjack:
            payout = insurance_amount * 3
            seat.player.add(payout)
            print(f"{seat.player.name} Seat {seat.number} — Insurance won! +{payout}, Balance: {seat.player.balance}")
        else:
            print(f"{seat.player.name} Seat {seat.number} — Insurance lost. Balance: {seat.player.balance}")


def check_perfect_pairs(hand):
    if len(hand.cards) != 2:
        return None
    c1, c2 = hand.cards[0], hand.cards[1]
    if c1.rank != c2.rank:
        return None
    if c1.suit == c2.suit:
        return 'perfect'
    if {c1.suit, c2.suit} in [{'♠', '♣'}, {'♥', '♦'}]:
        return 'colored'
    return 'mixed'


def resolve_perfect_pairs(seat, pair_type, sidebet):
    if pair_type is None:
        print(f"{seat.player.name} Seat {seat.number} — No pair. Balance: {seat.player.balance}")
        return
    payouts = {'perfect': 25, 'colored': 12, 'mixed': 6}
    gain = sidebet * payouts[pair_type]
    seat.player.add(gain)
    print(f"{seat.player.name} Seat {seat.number} — {pair_type.capitalize()} Pair! Won: {gain}, Balance: {seat.player.balance}")


def check_21_plus_3(hand, dealer_upcard):
    if len(hand.cards) != 2:
        return None
    cards = [hand.cards[0], hand.cards[1], dealer_upcard]
    ranks = [c.rank for c in cards]
    suits = [c.suit for c in cards]
    rank_order = {'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
                  '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13}
    values = sorted([rank_order[c.rank] for c in cards])

    all_same_suit = len(set(suits)) == 1
    is_three_of_a_kind = len(set(ranks)) == 1

    # check straight including A-2-3 and A as high (Q-K-A)
    def is_straight_check(vals):
        return (vals[2] - vals[0] == 2 and vals[1] - vals[0] == 1)

    # also check ace high: treat A as 14 for Q-K-A
    high_values = sorted([14 if r == 'A' else rank_order[r] for r in ranks])
    is_straight = is_straight_check(values) or is_straight_check(high_values)

    if is_three_of_a_kind and all_same_suit:
        return 'suited_trips'
    if is_straight and all_same_suit:
        return 'straight_flush'
    if is_three_of_a_kind:
        return 'three_of_a_kind'
    if all_same_suit:
        return 'flush'
    if is_straight:
        return 'straight'
    return None


def resolve_21_plus_3(seat, result, sidebet):
    if result is None:
        print(f"{seat.player.name} Seat {seat.number} — No 21+3. Balance: {seat.player.balance}")
        return
    payouts = {'suited_trips': 100, 'straight_flush': 40,
               'three_of_a_kind': 30, 'straight': 10, 'flush': 5}
    gain = sidebet * payouts[result]
    seat.player.add(gain)
    print(f"{seat.player.name} Seat {seat.number} — {result.replace('_', ' ').title()}! Won: {gain}, Balance: {seat.player.balance}")