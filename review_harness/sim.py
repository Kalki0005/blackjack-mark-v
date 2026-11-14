"""Independent audit harness for backend/game.py. Usage: sim.py <backend_dir> <mode> [n] [seed]"""
import sys, random, math, time
sys.path.insert(0, sys.argv[1])
from game import Table, Card, Hand
from strategy import basic_strategy

BET = 100

# ---------- independent re-implementation of hand maths (does not call engine) ----------
def my_total(cards):
    t, a = 0, 0
    for c in cards:
        if c.rank == 'A': t += 11; a += 1
        elif c.rank in ('J', 'Q', 'K', '10'): t += 10
        else: t += int(c.rank)
    while t > 21 and a: t -= 10; a -= 1
    return t, a > 0

def my_payout(hand, n_hands, dealer_cards):
    """Expected total chips returned for a hand, by the stated rules."""
    pt, _ = my_total(hand.cards)
    dt, _ = my_total(dealer_cards)
    p_bj = len(hand.cards) == 2 and pt == 21 and n_hands == 1
    d_bj = len(dealer_cards) == 2 and dt == 21
    if pt > 21: return 0
    if d_bj: return hand.bet if p_bj else 0
    if p_bj: return hand.bet * 5 // 2
    if dt > 21 or pt > dt: return hand.bet * 2
    if pt == dt: return hand.bet
    return 0

def legalize(action, hand, seat):
    if action == 'double' and (len(hand.cards) != 2 or hand.from_split_aces or not seat.player.can_afford(hand.bet)):
        t, soft = my_total(hand.cards)
        if soft: return 'stand' if t >= 18 else 'hit'
        return 'hit'
    if action == 'split' and (len(seat.hands) >= 4 or not hand.can_split() or not seat.player.can_afford(hand.bet)):
        # fall back to the non-pair play
        t, soft = my_total(hand.cards)
        if hand.cards[0].rank == 'A': return 'hit'
        if t >= 17: return 'stand'
        if t <= 11: return 'hit'
        if t == 12: return 'stand' if hand_up[0] in (4, 5, 6) else 'hit'
        return 'stand' if hand_up[0] <= 6 else 'hit'
    return action

hand_up = [0]

def engine_policy(hand, up, seat):
    return basic_strategy(hand, up)

def fixed_policy(hand, up, seat):
    """Engine table + corrections for THIS rule set (S17, no-peek-on-10 with full loss)."""
    a = basic_strategy(hand, up)
    uv = 11 if up.rank == 'A' else up.value()
    t, soft = my_total(hand.cards)
    pair = hand.can_split() and len(hand.cards) == 2
    if uv == 10:
        if pair and hand.cards[0].rank == '8': return 'hit'
        if not soft and t == 11 and a == 'double': return 'hit'
    if soft and not pair:
        if t == 19 and uv == 6: return 'stand'
        if t == 18 and uv == 2: return 'stand'
    return a

def play_round(t, policy, bal, rig=None, first_action=None, check=True):
    t.add_player("P", [1], BET, 0, 0, current_balance=bal)
    if rig:
        rig(t)
    t.deal_initial()
    seat = t.seats[0]
    up = t.dealer_hand.cards[0]
    hand_up[0] = 11 if up.rank == 'A' else up.value()
    if t.game_state == 'insurance':
        t.buy_insurance(1, False)
    guard = 0
    first = True
    while t.game_state == 'playing':
        guard += 1
        if guard > 60: raise RuntimeError("stuck: " + repr(seat.hands))
        hand = seat.hands[t.current_hand_idx]
        a = first_action if (first and first_action) else policy(hand, up, seat)
        first = False
        a = legalize(a, hand, seat)
        t.execute_action("P", a)
    assert t.game_state == 'game_over', t.game_state
    new_bal = seat.player.balance
    staked = sum(h.bet for h in seat.hands)
    info = None
    if check:
        exp = sum(my_payout(h, len(seat.hands), t.dealer_hand.cards) for h in seat.hands)
        eng = sum(h.payout for h in seat.hands)
        dt, dsoft = my_total(t.dealer_hand.cards)
        live = any(my_total(h.cards)[0] <= 21 and not (len(seat.hands) == 1 and len(h.cards) == 2 and my_total(h.cards)[0] == 21) for h in seat.hands)
        d_bj = len(t.dealer_hand.cards) == 2 and dt == 21
        problems = []
        if new_bal - bal != exp - staked: problems.append(f"balance delta {new_bal-bal} != expected {exp-staked}")
        if eng != exp: problems.append(f"hand.payout sum {eng} != expected {exp}")
        if live and not d_bj and dt < 17: problems.append(f"dealer stopped on {dt}")
        if live and len(t.dealer_hand.cards) > 2:
            pt, ps = my_total(t.dealer_hand.cards[:-1])
            if pt >= 17: problems.append(f"dealer drew on {pt} soft={ps}")
        if len(seat.hands) > 4: problems.append("more than 4 hands")
        for h in seat.hands:
            if h.from_split_aces and len(h.cards) != 2: problems.append("split ace hand with !=2 cards")
        info = (problems, d_bj, staked, len(seat.hands), dt)
    t.reset_round()
    return new_bal, staked, info

def run_edge(n, policy, seed):
    random.seed(seed)
    t = Table(is_solo=True)
    bal = 10**12
    start = bal
    tot_staked = 0
    sq = 0.0
    bad = []
    n_dbj_extra = 0; extra_lost = 0; dbust = 0; dlive = 0; splits = 0; doubles = 0; pbj = 0
    for i in range(n):
        nb, staked, info = play_round(t, policy, bal)
        d = nb - bal
        sq += d * d
        tot_staked += staked
        problems, d_bj, st, nh, dt = info
        if problems and len(bad) < 10: bad.append((i, problems))
        if d_bj and st > BET: n_dbj_extra += 1; extra_lost += st - BET
        if nh > 1: splits += 1
        if st > BET * nh: doubles += 1
        if dt > 21: dbust += 1
        if d == BET * 3 // 2: pbj += 1
        bal = nb
    net = bal - start
    mean = net / n / BET
    sd = math.sqrt(sq / n / BET / BET - mean * mean)
    se = sd / math.sqrt(n)
    print(f"rounds={n} seed={seed} policy={policy.__name__}")
    print(f"  net={net}  EV/initial bet = {mean*100:+.4f}%  (house edge {-mean*100:.4f}%)  SE={se*100:.4f}%  95%CI=[{(-mean-1.96*se)*100:.3f}%, {(-mean+1.96*se)*100:.3f}%]")
    print(f"  per-unit SD={sd:.4f}  avg staked/round={tot_staked/n/BET:.4f}  EV/total staked={net/tot_staked*100:+.4f}%")
    print(f"  player BJ paid rate={pbj/n*100:.3f}%  dealer bust rate(all rounds)={dbust/n*100:.2f}%  split rounds={splits/n*100:.2f}%  double rounds={doubles/n*100:.2f}%")
    print(f"  rounds where dealer BJ took extra (double/split) money: {n_dbj_extra} ({n_dbj_extra/n*100:.3f}%), extra units lost={extra_lost/BET:.0f} = {extra_lost/BET/n*100:.4f}% of initial bets")
    print(f"  invariant violations: {len(bad)}", bad[:5])

def make_rig(pcards, upcard):
    """Put player's two cards + dealer upcard at the front of a freshly shuffled shoe (hole card random)."""
    suits = ['♠', '♥', '♦', '♣']
    ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
    master = [Card(r, s) for _ in range(6) for s in suits for r in ranks]
    picked = []
    for r in (pcards[0], upcard, pcards[1]):
        for j, c in enumerate(master):
            if c.rank == r:
                picked.append(master.pop(j)); break
    def rig(t):
        # fresh 6-deck shoe every trial: fixed P1, D-up, P2, then 45 uniformly random
        # cards from the other 309 (hole card + all draws). Deal order: P1, D-up, P2, D-hole.
        t.shoe.cards = picked + random.sample(master, 45)
        t.shoe.cut_card_position = -1
        t.shoe.reshuffle_needed = False
    return rig

def run_spot(n, pcards, upcard, actions, seed, policy=fixed_policy):
    print(f"spot {pcards} vs {upcard}, n={n} each, continuation policy={policy.__name__}")
    res = {}
    for a in actions:
        random.seed(seed)
        t = Table(is_solo=True)
        rig = make_rig(pcards, upcard)
        bal = 10**12; start = bal; sq = 0.0
        for i in range(n):
            nb, _, _ = play_round(t, policy, bal, rig=rig, first_action=a, check=False)
            d = (nb - bal) / BET; sq += d * d; bal = nb
        m = (bal - start) / BET / n
        se = math.sqrt(max(sq / n - m * m, 0) / n)
        res[a] = (m, se)
        print(f"  {a:7s} EV = {m:+.4f} ± {se:.4f}")
    return res

if __name__ == '__main__':
    mode = sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 100000
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    t0 = time.time()
    if mode == 'edge':
        run_edge(n, engine_policy, seed)
    elif mode == 'edgefixed':
        run_edge(n, fixed_policy, seed)
    elif mode == 'spots':
        run_spot(n, ('6', '5'), '10', ['double', 'hit'], seed)
        run_spot(n, ('8', '8'), '10', ['split', 'hit'], seed)
        run_spot(n, ('A', 'A'), '10', ['split', 'hit'], seed)
        run_spot(n, ('A', '8'), '6', ['double', 'stand'], seed)
        run_spot(n, ('A', '7'), '2', ['double', 'stand'], seed)
        run_spot(n, ('6', '4'), '10', ['double', 'hit'], seed)
    print(f"elapsed {time.time()-t0:.1f}s")
