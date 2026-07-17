from probability import _is_soft_total

def basic_strategy(player_hand, dealer_upcard):
    dealer = dealer_upcard.rank
    dealer_val = dealer_upcard.value() if dealer != 'A' else 11

    cards = player_hand.cards
    total = player_hand.total()
    is_soft = _is_soft_total(player_hand)
    is_pair = player_hand.can_split()

    # pairs table
    if is_pair:
        rank = cards[0].rank
        pair_strategy = {
            'A': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['split'],8:['split'],9:['split'],10:['split'],11:['split']},
            '9': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['stand'],8:['split'],9:['split'],10:['stand'],11:['stand']},
            '8': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['split'],8:['split'],9:['split'],10:['split'],11:['split']},
            '7': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['split'],8:['hit'],9:['hit'],10:['hit'],11:['hit']},
            '6': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['hit'],8:['hit'],9:['hit'],10:['hit'],11:['hit']},
            '5': {2:['double'],3:['double'],4:['double'],5:['double'],6:['double'],7:['double'],8:['double'],9:['double'],10:['hit'],11:['hit']},
            '4': {2:['hit'],3:['hit'],4:['hit'],5:['split'],6:['split'],7:['hit'],8:['hit'],9:['hit'],10:['hit'],11:['hit']},
            '3': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['split'],8:['hit'],9:['hit'],10:['hit'],11:['hit']},
            '2': {2:['split'],3:['split'],4:['split'],5:['split'],6:['split'],7:['split'],8:['hit'],9:['hit'],10:['hit'],11:['hit']},
        }
        # face cards all treated as 10
        if rank in ['J', 'Q', 'K']:
            rank = '10'
        if rank in pair_strategy:
            move = pair_strategy[rank].get(dealer_val, ['hit'])
            return move[0]

    # soft totals table (hand with ace counted as 11)
    if is_soft:
        soft_strategy = {
            20: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand'},
            19: {2:'stand',3:'stand',4:'stand',5:'stand',6:'double',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand'},
            18: {2:'double',3:'double',4:'double',5:'double',6:'double',7:'stand',8:'stand',9:'hit',10:'hit',11:'hit'},
            17: {2:'hit',3:'double',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
            16: {2:'hit',3:'hit',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
            15: {2:'hit',3:'hit',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
            14: {2:'hit',3:'hit',4:'hit',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
            13: {2:'hit',3:'hit',4:'hit',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        }
        return soft_strategy.get(total, {}).get(dealer_val, 'hit')

    # hard totals table
    hard_strategy = {
        17: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand'},
        16: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        15: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        14: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        13: {2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        12: {2:'hit',3:'hit',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        11: {2:'double',3:'double',4:'double',5:'double',6:'double',7:'double',8:'double',9:'double',10:'double',11:'hit'},
        10: {2:'double',3:'double',4:'double',5:'double',6:'double',7:'double',8:'double',9:'double',10:'hit',11:'hit'},
        9:  {2:'hit',3:'double',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
        8:  {2:'hit',3:'hit',4:'hit',5:'hit',6:'hit',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit'},
    }

    if total >= 17:
        return 'stand'
    if total <= 8:
        return 'hit'
    return hard_strategy.get(total, {}).get(dealer_val, 'hit')