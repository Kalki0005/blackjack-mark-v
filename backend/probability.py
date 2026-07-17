from functools import lru_cache

CARD_VALUES = [2,3,4,5,6,7,8,9,10,10,10,10,11]

def bust_probability(player_total):
    if player_total >= 21:
        return 0.0
    bust_cards = sum(1 for v in CARD_VALUES if player_total + v > 21 and not (v == 11 and player_total + 1 <= 21))
    return round(bust_cards / 13, 4)

@lru_cache(maxsize=None)
def dealer_outcome_distribution(total, is_soft):
    if total > 21:
        if is_soft:
            return dealer_outcome_distribution(total - 10, False)
        return {'bust': 1.0}
    if total >= 17:
        return {total: 1.0}

    result = {}
    for card in CARD_VALUES:
        prob = 1 / 13
        new_total = total + card
        new_soft = is_soft or card == 11

        if new_total > 21 and new_soft:
            new_total -= 10
            new_soft = False

        sub = dealer_outcome_distribution(new_total, new_soft)
        for outcome, p in sub.items():
            result[outcome] = result.get(outcome, 0) + prob * p

    return result

def dealer_bust_probability(upcard_value):
    is_soft = upcard_value == 11
    dist = dealer_outcome_distribution(upcard_value, is_soft)
    return round(dist.get('bust', 0.0), 4)

def player_win_probability(player_total, upcard_value):
    if player_total > 21:
        return {'win': 0.0, 'lose': 1.0, 'push': 0.0}

    is_soft = upcard_value == 11
    dist = dealer_outcome_distribution(upcard_value, is_soft)

    win = 0.0
    lose = 0.0
    push = 0.0

    for outcome, prob in dist.items():
        if outcome == 'bust':
            win += prob
        elif outcome < player_total:
            win += prob
        elif outcome == player_total:
            push += prob
        else:
            lose += prob

    return {
        'win': round(win, 4),
        'lose': round(lose, 4),
        'push': round(push, 4)
    }

def optimal_win_probability(player_hand, dealer_upcard_value):
    """Calculates the true mathematical expectation by maximizing Net Expected Value (Win - Lose) at every branch node."""
    
    def simulate(hand_total, is_soft, depth=0):
        if hand_total >= 21:
            return player_win_probability(hand_total, dealer_upcard_value)
            
        # Branch A: Stand evaluation snapshot
        stand_probs = player_win_probability(hand_total, dealer_upcard_value)
        
        if depth > 4: 
            return stand_probs
            
        # Branch B: Hit evaluation recursive allocation loop
        hit_probs = {'win': 0.0, 'lose': 0.0, 'push': 0.0}
        for card_val in CARD_VALUES:
            new_total = hand_total + card_val
            new_soft = is_soft or card_val == 11
            
            if new_total > 21 and new_soft:
                new_total -= 10
                new_soft = False
                
            if new_total > 21:
                hit_probs['lose'] += 1/13
            else:
                sub = simulate(new_total, new_soft, depth + 1)
                for k in hit_probs:
                    hit_probs[k] += (1/13) * sub[k]
                    
        # FIXED: Core matrix optimization switch evaluates true Expected Value (EV = Wins - Losses)
        stand_ev = stand_probs['win'] - stand_probs['lose']
        hit_ev = hit_probs['win'] - hit_probs['lose']
        
        if stand_ev >= hit_ev:
            return stand_probs
        else:
            return hit_probs
            
    total = player_hand.total()
    is_soft = _is_soft_total(player_hand)
    return simulate(total, is_soft)

def _is_soft_total(player_hand):
    total = 0
    aces = 0
    for card in player_hand.cards:
        if card.rank == 'A':
            aces += 1
            total += 11
        else:
            total += card.value()
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return aces > 0