import { useEffect, useMemo, useRef, useState } from 'react'
import { PlayingCard } from './casino/PlayingCard'
import {
  DEALER_KEYS, PAIR_STRATEGY, SOFT_STRATEGY, HARD_STRATEGY,
  bestMove, DEALER_BUST_PCT,
} from '../lib/strategy'

// ─── shared bits ─────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣']
const randSuit = () => SUITS[Math.floor(Math.random() * SUITS.length)]
const rankValue = (r) => (r === 'A' ? 11 : ['K', 'Q', 'J'].includes(r) ? 10 : parseInt(r, 10))
const dealerLabel = (v) => (v === 11 ? 'A' : String(v))

function handTotal(ranks) {
  let total = 0, aces = 0
  ranks.forEach(r => { total += rankValue(r); if (r === 'A') aces += 1 })
  while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
  return { total, soft: aces > 0 }
}

const MOVE_META = {
  hit:    { code: 'H', label: 'Hit',    color: '#5be39a', bg: 'rgba(30,160,90,0.55)' },
  stand:  { code: 'S', label: 'Stand',  color: '#ff8585', bg: 'rgba(180,35,35,0.55)' },
  double: { code: 'D', label: 'Double', color: '#f5b042', bg: 'rgba(200,120,10,0.55)' },
  split:  { code: 'P', label: 'Split',  color: '#7fb2ff', bg: 'rgba(45,100,220,0.5)' },
}

function Kicker({ children }) { return <div className="lh-kicker">{children}</div> }
function H2({ children }) { return <h2 className="lh-h2 font-display">{children}</h2> }
function Card({ children, className = '' }) { return <div className={`lh-card ${className}`}>{children}</div> }

// ─── SECTION: BASICS ─────────────────────────────────────────────────────────

function HandBuilder() {
  const [cards, setCards] = useState([{ r: 'A', s: '♠' }, { r: '7', s: '♥' }])
  const { total, soft } = handTotal(cards.map(c => c.r))
  const isBJ = cards.length === 2 && total === 21
  const bust = total > 21
  return (
    <Card>
      <Kicker>Try it — build a hand</Kicker>
      <p className="lh-p">Tap ranks to add cards and watch the total. Aces flip from 11 to 1 automatically when they'd bust you — that's the difference between a <b className="text-white">soft</b> and a <b className="text-white">hard</b> hand.</p>
      <div className="lh-rank-palette">
        {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(r => (
          <button key={r} className="lh-rank-btn" disabled={bust}
            onClick={() => setCards(c => c.length >= 8 ? c : [...c, { r, s: randSuit() }])}>{r}</button>
        ))}
        <button className="lh-rank-btn lh-rank-btn--clear" onClick={() => setCards([])}>Clear</button>
      </div>
      <div className="lh-hand-stage">
        <div className="flex items-end min-h-[74px]">
          {cards.map((c, i) => (
            <PlayingCard key={i} cardStr={`${c.r}${c.s}`} size="sm" dealAnim style={{ marginLeft: i === 0 ? 0 : '-12px', zIndex: i }} />
          ))}
          {cards.length === 0 && <span className="lh-dim text-sm">No cards yet…</span>}
        </div>
        {cards.length > 0 && (
          <div className={`lh-total-badge ${bust ? 'lh-total-badge--bust' : isBJ ? 'lh-total-badge--bj' : ''}`}>
            {bust ? `BUST — ${total}` : isBJ ? 'BLACKJACK!' : `${soft ? 'Soft' : 'Hard'} ${total}`}
          </div>
        )}
      </div>
      {soft && !bust && !isBJ && <p className="lh-note">Soft = an Ace is still counting as 11, so you cannot bust on the next card.</p>}
      {bust && <p className="lh-note">Busted — in a real round the hand is over the instant you pass 21 and the bet is gone. Clear the cards to try again.</p>}
    </Card>
  )
}

const FLOW_STEPS = [
  { title: 'Place your bets', body: 'Choose a seat and stack chips on the main spot (plus the two optional side bets). Betting closes when the deal starts.', icon: '🪙' },
  { title: 'The deal', body: 'Everyone gets two cards face up. The dealer gets one card face up (the "upcard") and one face down.', icon: '🃏' },
  { title: 'Your decisions', body: 'In turn, each hand chooses: Hit, Stand, Double or Split. Bust (over 21) and the bet is lost immediately.', icon: '🤔' },
  { title: 'Dealer plays', body: 'The dealer reveals the hole card, then must draw to 16 and stand on 17 — no choices, pure procedure.', icon: '🎩' },
  { title: 'Payouts', body: 'Beat the dealer: 1:1. Blackjack (A + ten in your first two cards): 3:2. Tie: push, bet returned. Dealer closer to 21: bet lost.', icon: '💰' },
]

function RoundFlow() {
  const [step, setStep] = useState(0)
  return (
    <Card>
      <Kicker>How a round works</Kicker>
      <div className="lh-flow">
        {FLOW_STEPS.map((s, i) => (
          <button key={i} className={`lh-flow-dot ${i === step ? 'lh-flow-dot--on' : i < step ? 'lh-flow-dot--done' : ''}`} onClick={() => setStep(i)}>{i + 1}</button>
        ))}
      </div>
      <div className="lh-flow-body" key={step}>
        <div className="lh-flow-icon">{FLOW_STEPS[step].icon}</div>
        <div>
          <div className="text-white font-bold text-sm mb-1">{step + 1}. {FLOW_STEPS[step].title}</div>
          <p className="lh-p mb-0">{FLOW_STEPS[step].body}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button className="lh-btn" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Back</button>
        <button className="lh-btn lh-btn--gold" disabled={step === FLOW_STEPS.length - 1} onClick={() => setStep(s => s + 1)}>Next →</button>
      </div>
    </Card>
  )
}

function BasicsSection() {
  return (
    <>
      <H2>The Basics</H2>
      <p className="lh-lead">One goal: finish <b className="text-white">closer to 21 than the dealer without going over</b>. You're never playing against other players — only the house.</p>

      <Card>
        <Kicker>Card values</Kicker>
        <div className="lh-values">
          <div className="lh-value-group">
            <div className="flex">{['2♠', '6♥', '9♦'].map((c, i) => <PlayingCard key={c} cardStr={c} size="sm" style={{ marginLeft: i ? '-14px' : 0, zIndex: i }} />)}</div>
            <div><b className="text-white">2 – 10</b><span className="lh-dim"> · face value</span></div>
          </div>
          <div className="lh-value-group">
            <div className="flex">{['J♣', 'Q♥', 'K♠'].map((c, i) => <PlayingCard key={c} cardStr={c} size="sm" style={{ marginLeft: i ? '-14px' : 0, zIndex: i }} />)}</div>
            <div><b className="text-white">J · Q · K</b><span className="lh-dim"> · always 10</span></div>
          </div>
          <div className="lh-value-group">
            <div className="flex"><PlayingCard cardStr="A♦" size="sm" /></div>
            <div><b className="text-white">Ace</b><span className="lh-dim"> · 11 or 1, whichever helps</span></div>
          </div>
        </div>
      </Card>

      <Card>
        <Kicker>The premium hand</Kicker>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex">
            <PlayingCard cardStr="A♠" size="md" dealAnim />
            <PlayingCard cardStr="K♥" size="md" dealAnim style={{ marginLeft: '-16px', zIndex: 1 }} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-white font-bold text-sm mb-1">Blackjack — an Ace + any ten-value card, dealt as your first two.</div>
            <p className="lh-p mb-0">It pays <b className="gold-text">3 : 2</b> — bet $100, win $150 — and only loses to nothing (a dealer blackjack pushes). A 21 you reach by hitting is just a 21: it pays 1:1 and ties a dealer 21.</p>
          </div>
        </div>
      </Card>

      <HandBuilder />
      <RoundFlow />

      <Card>
        <Kicker>The dealer has no choices</Kicker>
        <p className="lh-p mb-2">The dealer follows a fixed script: <b className="text-white">draw on 16 or less, stand on 17 or more</b>. No hunches, no reads. This is why strategy works — the dealer's play is 100% predictable, so every one of your decisions has a mathematically best answer.</p>
        <div className="lh-bust-chart">
          {DEALER_KEYS.map(v => (
            <div key={v} className="lh-bust-col">
              <div className="lh-bust-bar-wrap"><div className="lh-bust-bar" style={{ height: `${DEALER_BUST_PCT[v] * 2}%` }} /></div>
              <div className="lh-bust-pct">{DEALER_BUST_PCT[v]}%</div>
              <div className="lh-bust-lbl">{dealerLabel(v)}</div>
            </div>
          ))}
        </div>
        <p className="lh-note">How often the dealer eventually busts, by upcard. A 5 or 6 up is the dealer at their weakest — remember this, it drives half of basic strategy.</p>
      </Card>
    </>
  )
}

// ─── SECTION: PLAYER OPTIONS ─────────────────────────────────────────────────

const OPTIONS = [
  {
    key: 'hit', name: 'Hit', color: MOVE_META.hit.color,
    what: 'Take one more card. You can keep hitting until you stand or bust.',
    when: 'Your total is low (11 or less can never bust) or the dealer shows a strong card (7–A) and your 12–16 must improve.',
    demo: { cards: ['8♠', '5♥'], up: '10♦', verdict: 'Hard 13 vs 10 — hit. Standing only wins if the dealer busts (~21%).' },
  },
  {
    key: 'stand', name: 'Stand', color: MOVE_META.stand.color,
    what: 'Take no more cards. Your total is locked in — now the dealer has to beat it.',
    when: 'You have 17+ (hard), or a modest 12–16 against a weak dealer upcard (2–6) that will often bust.',
    demo: { cards: ['10♣', '3♥'], up: '5♦', verdict: 'Hard 13 vs 5 — stand. The dealer busts 42% of the time from a 5. Let them.' },
  },
  {
    key: 'double', name: 'Double Down', color: MOVE_META.double.color,
    what: 'Double your bet, receive exactly one more card, then stand automatically. Only allowed on your first two cards.',
    when: 'You are a clear favourite: 11 vs anything but an Ace, 10 vs 2–9, 9 or soft 15–18 vs dealer bust cards.',
    demo: { cards: ['6♠', '5♥'], up: '6♦', verdict: '11 vs 6 — double. Any ten makes 21 while the dealer is at their weakest.' },
  },
  {
    key: 'split', name: 'Split', color: MOVE_META.split.color,
    what: 'A pair can be split into two hands, each getting a new second card — and a second bet equal to your first.',
    when: 'Always with A-A and 8-8. Other pairs depend on the upcard (see the Strategy section). Never with 10s or 5s.',
    demo: { cards: ['8♠', '8♥'], up: '6♦', verdict: '8-8 = a terrible 16. Split into two hands starting from 8 each.' },
  },
]

function OptionsSection() {
  const [active, setActive] = useState('hit')
  const opt = OPTIONS.find(o => o.key === active)
  return (
    <>
      <H2>Your Four Weapons</H2>
      <p className="lh-lead">Every decision in blackjack is one of these four moves. Learn what each does, then the Strategy section tells you exactly when.</p>
      <div className="lh-opt-tabs">
        {OPTIONS.map(o => (
          <button key={o.key} onClick={() => setActive(o.key)}
            className={`lh-opt-tab ${active === o.key ? 'lh-opt-tab--on' : ''}`}
            style={active === o.key ? { borderColor: o.color, color: o.color } : {}}>
            {o.name}
          </button>
        ))}
      </div>
      <Card key={opt.key} className="lh-fade-in">
        <div className="lh-opt-grid">
          <div>
            <Kicker>What it is</Kicker>
            <p className="lh-p">{opt.what}</p>
            <Kicker>When to use it</Kicker>
            <p className="lh-p mb-0">{opt.when}</p>
          </div>
          <div className="lh-opt-demo">
            <div className="lh-scene-row">
              <div>
                <div className="lh-scene-lbl">You</div>
                <div className="flex">{opt.demo.cards.map((c, i) => <PlayingCard key={c} cardStr={c} size="sm" dealAnim style={{ marginLeft: i ? '-12px' : 0, zIndex: i }} />)}</div>
              </div>
              <span className="lh-vs">vs</span>
              <div>
                <div className="lh-scene-lbl">Dealer</div>
                <PlayingCard cardStr={opt.demo.up} size="sm" dealAnim />
              </div>
            </div>
            <div className="lh-verdict" style={{ borderColor: opt.color }}>{opt.demo.verdict}</div>
          </div>
        </div>
      </Card>
      <Card>
        <Kicker>Which option when? — the decision order</Kicker>
        <p className="lh-p">Pros run the same three questions on every hand, in this exact order. Answer one "yes" and you're done:</p>
        <div className="lh-decision-flow">
          {[
            ['1', 'Is it a pair I should split?', 'Only pairs qualify. A-A and 8-8 are automatic; the rest depend on the dealer card (see the Strategy chart).'],
            ['2', 'Should I double down?', 'Only on your first two cards. Think 9, 10, 11 and strong soft hands against a weak dealer.'],
            ['3', 'Hit or stand?', 'Everything else comes down to this — your total vs the dealer\'s upcard decides it.'],
          ].map(([n, q, a]) => (
            <div key={n} className="lh-decision-step">
              <span className="lh-decision-num">{n}</span>
              <div>
                <div className="text-white font-bold text-[13px]">{q}</div>
                <div className="lh-dim text-[12px] leading-relaxed mt-0.5">{a}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Kicker>Beginner traps — the moves that quietly bleed money</Kicker>
        <div className="lh-rules-grid">
          {[
            ['Playing "no bust"', 'Standing on every 12–16 so you never bust feels safe — and hands the house ~4% extra edge. Sometimes you MUST draw.'],
            ['Mimicking the dealer', 'Hitting to 17 no matter what ignores the one advantage you have: the dealer can\'t choose, you can.'],
            ['Doubling any 12+', 'Doubling is for totals that can\'t bust on one card (or strong soft hands). A doubled hard 12+ risks 2× the bet on a coin-flip.'],
            ['Betting bigger after losses', 'Martingale feels clever until one cold streak eats the bankroll. Bet size should follow the count, never frustration.'],
          ].map(([trap, why]) => (
            <div key={trap} className="lh-rule">
              <div className="text-white font-bold text-[13px] mb-1">✗ {trap}</div>
              <div className="lh-dim text-[12px] leading-relaxed">{why}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ─── SECTION: SIDE BETS ──────────────────────────────────────────────────────

const PP_ROWS = [
  { name: 'Perfect Pair', detail: 'Same rank, same suit', pay: '25:1', ex: ['K♠', 'K♠'] },
  { name: 'Colored Pair', detail: 'Same rank, same colour', pay: '12:1', ex: ['K♠', 'K♣'] },
  { name: 'Mixed Pair', detail: 'Same rank, different colour', pay: '6:1', ex: ['K♠', 'K♥'] },
]
const T3_ROWS = [
  { name: 'Suited Trips', detail: 'Three of a kind, all one suit', pay: '100:1', ex: ['Q♥', 'Q♥', 'Q♥'] },
  { name: 'Straight Flush', detail: 'Sequence in one suit', pay: '40:1', ex: ['6♦', '7♦', '8♦'] },
  { name: 'Three of a Kind', detail: 'Same rank, mixed suits', pay: '30:1', ex: ['9♠', '9♥', '9♦'] },
  { name: 'Straight', detail: 'Sequence, any suits', pay: '10:1', ex: ['4♠', '5♥', '6♣'] },
  { name: 'Flush', detail: 'Any three of one suit', pay: '5:1', ex: ['2♣', '8♣', 'J♣'] },
]

function SideBetTable({ title, sub, rows, note }) {
  return (
    <Card>
      <Kicker>{title}</Kicker>
      <p className="lh-p">{sub}</p>
      <div className="lh-paytable">
        {rows.map(r => (
          <div key={r.name} className="lh-payrow">
            <div className="flex shrink-0">{r.ex.map((c, i) => <PlayingCard key={i} cardStr={c} size="sm" style={{ marginLeft: i ? '-24px' : 0, zIndex: i }} />)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-[13px]">{r.name}</div>
              <div className="lh-dim text-[11px]">{r.detail}</div>
            </div>
            <div className="lh-pay gold-text font-display">{r.pay}</div>
          </div>
        ))}
      </div>
      {note && <p className="lh-note">{note}</p>}
    </Card>
  )
}

function SideBetsSection() {
  return (
    <>
      <H2>Side Bets & Payouts</H2>
      <p className="lh-lead">Two optional bets sit next to your main spot. They resolve the instant the cards land — big paydays, but the house edge is far higher than the main game. Treat them as spice, not strategy.</p>
      <SideBetTable
        title="Perfect Pairs" rows={PP_ROWS}
        sub="Wins if YOUR first two cards are a pair. Graded by how perfectly they match."
        note="House edge ≈ 3–7% depending on decks — versus ~0.5% on the main game played with basic strategy." />
      <SideBetTable
        title="21 + 3" rows={T3_ROWS}
        sub="Your two cards + the dealer's upcard form a three-card poker hand."
        note="Any winning combo pays on the spot — you'll see the winning chip stack appear the moment the cards are dealt." />
      <Card>
        <Kicker>Insurance — the famous sucker bet</Kicker>
        <p className="lh-p mb-0">When the dealer shows an Ace you'll be offered <b className="text-white">insurance</b>: a side bet of half your stake, paying 2:1 if the dealer has blackjack. It sounds protective, but only ~31% of cards are ten-valued — you'd need 33.3% to break even. Unless you're counting cards and the true count is +3 or better, <b className="text-white">always decline</b>.</p>
      </Card>
      <Card>
        <Kicker>The honest math</Kicker>
        <p className="lh-p mb-0">Side bets exist because they're profitable — <b className="text-white">for the casino</b>. They can't be beaten with strategy and the counts that beat the main game barely move them. Play them for fun in small amounts, and never let them eat the bankroll that funds your main bet. On this table a side bet can never exceed your main bet.</p>
      </Card>
    </>
  )
}

// ─── SECTION: STRATEGY (chart + guides + trainer) ────────────────────────────

function explainCell(kind, rowLabel, dealerVal, move) {
  const d = dealerLabel(dealerVal)
  const weak = dealerVal >= 2 && dealerVal <= 6
  const dBust = DEALER_BUST_PCT[dealerVal]
  // Rotate variants by row+column so NEIGHBOURING cells never read the same —
  // clicking across the chart always feels fresh.
  const rowNum = parseInt(String(rowLabel).replace(/[^0-9]/g, '') || '0', 10)
  const P = (variants) => variants[(rowNum + dealerVal) % variants.length]
  const base = {
    hit: weak ? P([
      `Even against a weak ${d}, this total is too low to win by standing — improve it.`,
      `A ${d} is beatable, but not by this total sitting still. Draw first, then reassess.`,
      `The dealer's ${d} is shaky, sure — but this hand can't cash in without getting stronger. Take a card.`,
    ]) : P([
      `Dealer ${d} makes a strong hand too often. This total must improve to compete.`,
      `Against a ${d} the finish line is 17+. Standing short of it is just waiting to lose.`,
      `A ${d} up rarely busts — you can't win this by watching. Hit and catch up.`,
    ]),
    stand: weak ? P([
      `Dealer ${d} busts ${dBust}% of the time. Don't risk busting first — make the dealer do the dying.`,
      `The ${d} is one of the dealer's worst cards (${dBust}% bust rate). Stand back and let gravity work.`,
      `Why gamble when the dealer has to? From a ${d} they collapse ${dBust}% of the time — your job is simply to still be standing.`,
    ]) : P([
      `This hand is strong enough to protect. Hitting risks destroying a likely winner.`,
      `You're holding a made hand — one more card mostly subtracts value. Lock it in.`,
      `The work is done. Against a ${d}, this total wins its share as-is; drawing again only invites the bust.`,
    ]),
    double: P([
      `You're a favourite here and you only get this chance once: put maximum money in while the edge is yours${weak ? ` — dealer ${d} busts ${dBust}% of the time` : ''}.`,
      `This is a green-light hand. One strong card finishes it, and doubling means the win pays twice${weak ? ` while the ${d} busts ${dBust}% of the time` : ''}.`,
      `Textbook double: the odds tilt your way${weak ? ` (the ${d} folds ${dBust}% of the time)` : ''}, so make the bet match the edge.`,
      `When the game hands you a favourite, press it. Double here — a single card, twice the money, exactly when it's worth it.`,
    ]),
    split: P([
      `Two hands starting fresh beat one awkward total. Each new hand is a favourite (or far less of an underdog) against a ${d}.`,
      `This pair is worth more apart than together — split it and play two live hands into the ${d}.`,
      `One clunky total becomes two real chances. Against a ${d}, the split is where the value is.`,
    ]),
  }
  let extra = ''
  if (kind === 'pairs' && rowLabel === 'A,A') extra = ' Two Aces as one hand is a weak 12; split, and each Ace becomes the best starting card in the game.'
  if (kind === 'pairs' && rowLabel === '8,8') extra = ' 16 is the worst total in blackjack — anything is better, always.'
  if (kind === 'pairs' && rowLabel === '10,10') extra = ' A made 20 wins ~85% of resolved hands. Breaking it up is lighting money on fire.'
  if (kind === 'hard' && rowLabel === '16' && dealerVal >= 7) extra = ' Yes, you bust often — but standing wins ONLY when the dealer busts. Hitting simply loses less.'
  if (kind === 'soft') extra = ' You can\'t bust a soft hand with one card — that safety is what makes aggressive plays correct.'
  return base[move] + extra
}

function StrategyChart() {
  const [tab, setTab] = useState('hard')
  const [sel, setSel] = useState(null) // {rowLabel, dealerVal, move, kind}

  const tables = useMemo(() => ({
    hard: {
      label: 'Hard totals', rows: [
        { label: '17+', cells: DEALER_KEYS.map(d => 'stand') },
        ...[16, 15, 14, 13, 12, 11, 10, 9].map(t => ({ label: String(t), cells: DEALER_KEYS.map(d => HARD_STRATEGY[t][d]) })),
        { label: '8−', cells: DEALER_KEYS.map(() => 'hit') },
      ],
    },
    soft: {
      label: 'Soft totals', rows: [20, 19, 18, 17, 16, 15, 14, 13].map(t => ({
        label: `A,${t - 11}`, cells: DEALER_KEYS.map(d => SOFT_STRATEGY[t][d]),
      })),
    },
    pairs: {
      label: 'Pairs', rows: ['A', '10', '9', '8', '7', '6', '5', '4', '3', '2'].map(r => ({
        label: `${r},${r}`, cells: DEALER_KEYS.map(d => PAIR_STRATEGY[r][d]),
      })),
    },
  }), [])

  const t = tables[tab]
  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <Kicker>The chart — tap any cell to see WHY</Kicker>
        <div className="lh-chart-tabs">
          {['hard', 'soft', 'pairs'].map(k => (
            <button key={k} onClick={() => { setTab(k); setSel(null) }} className={`lh-chart-tab ${tab === k ? 'lh-chart-tab--on' : ''}`}>{tables[k].label}</button>
          ))}
        </div>
      </div>
      <div className="lh-legend">
        {Object.entries(MOVE_META).map(([k, m]) => (
          <span key={k} className="lh-legend-item"><span className="lh-legend-swatch" style={{ background: m.bg, color: m.color }}>{m.code}</span>{m.label}</span>
        ))}
      </div>
      <div className="lh-chart-scroll">
        <table className="lh-chart">
          <thead>
            <tr>
              <th className="lh-chart-corner">You ↓ · Dealer →</th>
              {DEALER_KEYS.map(d => <th key={d}>{dealerLabel(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.map(row => (
              <tr key={row.label}>
                <td className="lh-chart-rowlbl">{row.label}</td>
                {row.cells.map((move, i) => {
                  const dealerVal = DEALER_KEYS[i]
                  const on = sel && sel.rowLabel === row.label && sel.dealerVal === dealerVal
                  return (
                    <td key={i}>
                      <button
                        className={`lh-cell ${on ? 'lh-cell--on' : ''}`}
                        style={{ background: MOVE_META[move].bg, color: '#fff' }}
                        onClick={() => setSel(on ? null : { rowLabel: row.label, dealerVal, move, kind: tab })}>
                        {MOVE_META[move].code}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="lh-cell-explain lh-fade-in">
          <b style={{ color: MOVE_META[sel.move].color }}>{sel.rowLabel} vs {dealerLabel(sel.dealerVal)} → {MOVE_META[sel.move].label}.</b>{' '}
          {explainCell(sel.kind, sel.rowLabel, sel.dealerVal, sel.move)}
        </div>
      )}
    </Card>
  )
}

const GOLDEN_RULES = [
  ['Always split Aces & 8s', 'A-A is two shots at blackjack; 8-8 escapes the worst total in the game.'],
  ['Never split 10s or 5s', 'A 20 is nearly unbeatable; two 5s are a hard 10 that wants to double.'],
  ['Double 11 vs everything but an Ace', 'More tens in the shoe than anything else — strike while ahead.'],
  ['12–16 vs dealer 2–6: stand', 'The dealer\'s bust cards. Don\'t bust first; they will, ~40% of the time.'],
  ['12–16 vs dealer 7–A: hit', 'The dealer makes 17+ too often. Your stiff hand must improve.'],
  ['Never take insurance', 'It\'s a disguised bad bet on the dealer\'s hole card. Decline, every time.'],
]

function generateQuiz() {
  const kind = ['hard', 'soft', 'pair'][Math.floor(Math.random() * 3)]
  let cards, total, isSoft = false, isPair = false, pairRank = null
  if (kind === 'pair') {
    const r = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][Math.floor(Math.random() * 13)]
    const s1 = randSuit(); let s2 = randSuit()
    if (r !== '10' && s1 === s2) s2 = SUITS[(SUITS.indexOf(s2) + 1) % 4]
    cards = [`${r}${s1}`, `${r}${s2}`]
    isPair = true; pairRank = ['J', 'Q', 'K'].includes(r) ? '10' : r
    total = handTotal([r, r]).total
    isSoft = r === 'A'
  } else if (kind === 'soft') {
    const others = ['2', '3', '4', '5', '6', '7', '8', '9']
    const o = others[Math.floor(Math.random() * others.length)]
    cards = [`A${randSuit()}`, `${o}${randSuit()}`]
    total = 11 + rankValue(o); isSoft = true
  } else {
    // two-card hard totals 9–16 (the interesting zone)
    const target = 9 + Math.floor(Math.random() * 8)
    let a = 2 + Math.floor(Math.random() * Math.min(9, target - 3))
    let b = target - a
    if (b > 10) { b = 10; a = target - 10 }
    if (a === b) { a += 1; b -= 1 } // avoid accidental pairs
    if (b === 11 || a < 2) { a = target - 9; b = 9 }
    cards = [`${a}${randSuit()}`, `${b === 10 ? ['10', 'J', 'Q', 'K'][Math.floor(Math.random() * 4)] : b}${randSuit()}`]
    total = target
  }
  const dealerVal = DEALER_KEYS[Math.floor(Math.random() * DEALER_KEYS.length)]
  const up = `${dealerLabel(dealerVal) === 'A' ? 'A' : dealerLabel(dealerVal) === '10' ? ['10', 'J', 'Q', 'K'][Math.floor(Math.random() * 4)] : dealerLabel(dealerVal)}${randSuit()}`
  const answer = bestMove({ total, isSoft, isPair, pairRank }, dealerVal)
  return { cards, up, dealerVal, total, isSoft, isPair, pairRank, answer, kind }
}

function MoveTrainer() {
  const [q, setQ] = useState(generateQuiz)
  const [picked, setPicked] = useState(null)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(0)
  const right = picked === q.answer
  const pick = (m) => {
    if (picked) return
    setPicked(m)
    setStreak(s => {
      const n = m === q.answer ? s + 1 : 0
      setBest(b => Math.max(b, n))
      return n
    })
  }
  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Kicker>Move trainer — beat your streak</Kicker>
        <div className="lh-streak">Streak <b className="gold-text">{streak}</b><span className="lh-dim"> · best {best}</span></div>
      </div>
      <div className="lh-scene-row justify-center my-4">
        <div>
          <div className="lh-scene-lbl">Your hand · {q.isPair ? 'pair' : q.isSoft ? `soft ${q.total}` : `hard ${q.total}`}</div>
          <div className="flex">{q.cards.map((c, i) => <PlayingCard key={`${c}-${i}`} cardStr={c} size="md" dealAnim style={{ marginLeft: i ? '-16px' : 0, zIndex: i }} />)}</div>
        </div>
        <span className="lh-vs">vs</span>
        <div>
          <div className="lh-scene-lbl">Dealer shows</div>
          <PlayingCard cardStr={q.up} size="md" dealAnim />
        </div>
      </div>
      <div className="lh-quiz-btns">
        {Object.entries(MOVE_META).map(([k, m]) => {
          const isAnswer = picked && k === q.answer
          const isWrongPick = picked === k && !right
          return (
            <button key={k} onClick={() => pick(k)}
              className={`lh-quiz-btn ${isAnswer ? 'lh-quiz-btn--right' : ''} ${isWrongPick ? 'lh-quiz-btn--wrong' : ''}`}
              style={{ '--qc': m.color }}>
              {m.label}
            </button>
          )
        })}
      </div>
      {picked && (
        <div className={`lh-quiz-result lh-fade-in ${right ? 'lh-quiz-result--right' : 'lh-quiz-result--wrong'}`}>
          <b>{right ? 'Correct.' : `Not quite — best is ${MOVE_META[q.answer].label}.`}</b>{' '}
          {explainCell(q.isPair ? 'pairs' : q.isSoft ? 'soft' : 'hard',
            q.isPair ? `${q.pairRank},${q.pairRank}` : String(q.total), q.dealerVal, q.answer)}
        </div>
      )}
      <button className="lh-btn lh-btn--gold w-full mt-3" onClick={() => { setQ(generateQuiz()); setPicked(null) }}>
        {picked ? 'Next hand →' : 'Skip hand'}
      </button>
    </Card>
  )
}

function StrategySection() {
  return (
    <>
      <H2>Basic Strategy</H2>
      <p className="lh-lead">For every hand you can hold against every dealer upcard, there is exactly one mathematically best move. Play it every time and the house edge drops to roughly <b className="text-white">0.5%</b> — the best odds on any casino floor. This chart drives the engine's recommendations: Learner mode and your post-game reviews grade you against it.</p>
      <StrategyChart />
      <Card>
        <Kicker>The golden rules — memorize these first</Kicker>
        <div className="lh-rules-grid">
          {GOLDEN_RULES.map(([rule, why]) => (
            <div key={rule} className="lh-rule">
              <div className="text-white font-bold text-[13px] mb-1">♠ {rule}</div>
              <div className="lh-dim text-[12px] leading-relaxed">{why}</div>
            </div>
          ))}
        </div>
      </Card>
      <MoveTrainer />
    </>
  )
}

// ─── SECTION: CARD COUNTING ──────────────────────────────────────────────────

const hiLoValue = (r) => (['2', '3', '4', '5', '6'].includes(r) ? 1 : ['7', '8', '9'].includes(r) ? 0 : -1)

function TrueCountLab() {
  const [rc, setRc] = useState(8)
  const [decks, setDecks] = useState(4)
  const tc = (rc / decks)
  const verdict = tc >= 2 ? { txt: 'Player edge — this is when counters raise their bets.', color: '#5be39a' }
    : tc >= 1 ? { txt: 'Slightly warm — edge is near neutral.', color: '#e8d48b' }
    : tc <= -2 ? { txt: 'Cold shoe — the house edge is amplified. Bet minimum.', color: '#f87171' }
    : { txt: 'Neutral — the house keeps its usual small edge.', color: '#cbd5e1' }
  return (
    <Card>
      <Kicker>True count lab</Kicker>
      <p className="lh-p">The running count alone is misleading: +8 with 6 decks left is weak, +8 with 2 decks left is huge. Divide by decks remaining to get the <b className="text-white">true count</b> — drag the sliders and watch.</p>
      <div className="lh-lab">
        <label className="lh-slider-row">
          <span className="lh-scene-lbl">Running count</span>
          <input type="range" min="-15" max="15" value={rc} onChange={e => setRc(+e.target.value)} />
          <b className="text-white w-10 text-right">{rc > 0 ? `+${rc}` : rc}</b>
        </label>
        <label className="lh-slider-row">
          <span className="lh-scene-lbl">Decks remaining</span>
          <input type="range" min="1" max="8" step="0.5" value={decks} onChange={e => setDecks(+e.target.value)} />
          <b className="text-white w-10 text-right">{decks}</b>
        </label>
        <div className="lh-tc-out">
          <span className="lh-scene-lbl">True count</span>
          <span className="lh-tc-val font-display" style={{ color: verdict.color }}>{tc >= 0 ? '+' : ''}{tc.toFixed(1)}</span>
          <span className="text-[12px]" style={{ color: verdict.color }}>{verdict.txt}</span>
        </div>
      </div>
    </Card>
  )
}

function CountingDrill() {
  const [phase, setPhase] = useState('idle')   // idle | run | answer | done
  const [speed, setSpeed] = useState(1100)
  const [seq, setSeq] = useState([])
  const [idx, setIdx] = useState(0)
  const [guess, setGuess] = useState('')
  const timer = useRef(null)

  const start = () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const s = Array.from({ length: 14 }, () => `${ranks[Math.floor(Math.random() * 13)]}${randSuit()}`)
    setSeq(s); setIdx(0); setGuess(''); setPhase('run')
  }
  useEffect(() => {
    if (phase !== 'run') return
    timer.current = setTimeout(() => {
      if (idx >= seq.length - 1) setPhase('answer')
      else setIdx(i => i + 1)
    }, speed)
    return () => clearTimeout(timer.current)
  }, [phase, idx, seq.length, speed])

  const trueCount = seq.reduce((s, c) => s + hiLoValue(c.slice(0, -1)), 0)
  const correct = parseInt(guess, 10) === trueCount

  return (
    <Card>
      <Kicker>Counting drill</Kicker>
      {phase === 'idle' && (
        <>
          <p className="lh-p">14 cards will flash one at a time. Keep the running count in your head (+1 for 2–6, 0 for 7–9, −1 for 10s and Aces), then enter your final count.</p>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span className="lh-scene-lbl">Speed</span>
            {[['Casual', 1500], ['Dealer', 1100], ['Vegas pro', 700]].map(([lbl, ms]) => (
              <button key={ms} className={`lh-btn ${speed === ms ? 'lh-btn--gold' : ''}`} onClick={() => setSpeed(ms)}>{lbl}</button>
            ))}
          </div>
          <button className="lh-btn lh-btn--gold w-full" onClick={start}>Deal the cards →</button>
        </>
      )}
      {phase === 'run' && (
        <div className="lh-drill-stage">
          <PlayingCard key={idx} cardStr={seq[idx]} size="lg" dealAnim />
          <div className="lh-dim text-[11px] mt-3">card {idx + 1} / {seq.length} — keep counting…</div>
        </div>
      )}
      {phase === 'answer' && (
        <div className="lh-drill-stage">
          <div className="text-white font-bold mb-3">What's the running count?</div>
          <div className="flex gap-2 justify-center">
            <input type="number" value={guess} onChange={e => setGuess(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && guess !== '' && setPhase('done')}
              className="lh-count-input" placeholder="0" />
            <button className="lh-btn lh-btn--gold" disabled={guess === ''} onClick={() => setPhase('done')}>Check</button>
          </div>
        </div>
      )}
      {phase === 'done' && (
        <div className="lh-drill-stage lh-fade-in">
          <div className={`text-2xl font-display font-bold ${correct ? 'text-emerald-300' : 'text-red-300'}`}>
            {correct ? 'Perfect count!' : `It was ${trueCount > 0 ? '+' : ''}${trueCount}`}
          </div>
          {!correct && <div className="lh-dim text-[12px] mt-1">You said {guess || '—'}. Replay the cards below and re-count.</div>}
          <div className="flex flex-wrap justify-center gap-1 mt-4 max-w-md mx-auto">
            {seq.map((c, i) => (
              <div key={i} className="lh-replay">
                <PlayingCard cardStr={c} size="sm" />
                <span className={hiLoValue(c.slice(0, -1)) > 0 ? 'text-emerald-300' : hiLoValue(c.slice(0, -1)) < 0 ? 'text-red-300' : 'text-slate-400'}>
                  {hiLoValue(c.slice(0, -1)) > 0 ? '+1' : hiLoValue(c.slice(0, -1)) < 0 ? '−1' : '0'}
                </span>
              </div>
            ))}
          </div>
          <button className="lh-btn lh-btn--gold mt-4" onClick={start}>Again →</button>
        </div>
      )}
    </Card>
  )
}

function CountingSection() {
  return (
    <>
      <H2>Card Counting — the Hi-Lo Course</H2>
      <p className="lh-lead">Counting isn't memorizing cards — it's tracking <b className="text-white">one running number</b> that tells you when the shoe is rich in tens and Aces. High cards favour you (more blackjacks, more dealer busts). This table's Learner mode shows the live count so you can practise against the truth.</p>
      <Card>
        <Kicker>Step 1 — the Hi-Lo values</Kicker>
        <div className="lh-hilo">
          {[
            { cards: ['2♣', '4♥', '6♠'], val: '+1', color: '#5be39a', note: 'Low cards leaving the shoe HELP you' },
            { cards: ['7♦', '8♣', '9♥'], val: '0', color: '#cbd5e1', note: 'Neutral — ignore them' },
            { cards: ['10♠', 'K♥', 'A♦'], val: '−1', color: '#f87171', note: 'High cards leaving HURT you' },
          ].map(g => (
            <div key={g.val} className="lh-hilo-col">
              <div className="flex justify-center">{g.cards.map((c, i) => <PlayingCard key={c} cardStr={c} size="sm" style={{ marginLeft: i ? '-18px' : 0, zIndex: i }} />)}</div>
              <div className="text-3xl font-black my-2" style={{ color: g.color }}>{g.val}</div>
              <div className="lh-dim text-[11px]">{g.note}</div>
            </div>
          ))}
        </div>
        <p className="lh-note">Every card that appears — yours, other players', the dealer's — adjusts the running count. Start at 0 on a fresh shoe.</p>
      </Card>
      <TrueCountLab />
      <Card>
        <Kicker>Step 3 — turning the count into money</Kicker>
        <div className="lh-ramp">
          {[
            ['TC ≤ +1', 'Minimum bet', 'No edge — pay as little as possible to wait.'],
            ['TC +2', '2× minimum', 'Roughly break-even to slightly ahead.'],
            ['TC +3', '4× minimum', 'A real player edge (~1%). This is the profit zone.'],
            ['TC +4 or more', '6–8× minimum', 'Rare and precious. Maximum aggression.'],
          ].map(([tc, bet, why]) => (
            <div key={tc} className="lh-ramp-row">
              <span className="lh-ramp-tc">{tc}</span>
              <span className="text-white font-bold text-[13px]">{bet}</span>
              <span className="lh-dim text-[12px]">{why}</span>
            </div>
          ))}
        </div>
        <p className="lh-note">Also: at TC +3 or better, insurance actually becomes a GOOD bet — the only time it ever is.</p>
      </Card>
      <CountingDrill />
    </>
  )
}

// ─── SECTION: HOUSE RULES ────────────────────────────────────────────────────

function RulesSection() {
  const rules = [
    ['Decks', '6-deck shoe (configurable 1–8 in Engine Settings)', 'More decks = slightly worse player odds and a slower count.'],
    ['Blackjack pays', '3 : 2', 'The full, fair payout — many real casinos have degraded to 6:5. Never play 6:5.'],
    ['Dealer', 'Stands on all 17s by default', 'Hit-soft-17 can be enabled in settings; it adds ~0.2% to the house edge.'],
    ['Dealer peek', 'Peek on Ace · NO peek on 10', 'Ace up: insurance is offered and a dealer blackjack ends the round immediately — you never double or split into it. Ten up: NO check happens, so a double or split lost to a late-revealed blackjack stays lost. Same rule set as Stake / Evolution live tables, and intentional here.'],
    ['Insurance', 'Offered on a dealer Ace, pays 2:1', 'Resolved before anyone plays their hand; see the Side Bets section for why to decline.'],
    ['Double down', 'Any first two cards, one card follows', 'No re-doubling. Doubling after split is allowed (except Aces).'],
    ['Splitting', 'Up to 4 hands per seat (3 splits)', 'Re-splitting non-Ace pairs (e.g. 10s, 8s) is allowed.'],
    ['Split Aces', 'One card each, forced stand', 'No re-split, no re-hit — and an Ace + ten after a split is a plain 21 (pays 1:1), NOT a blackjack.'],
    ['Shoe & cut', 'Cut card at ~75% penetration', 'When the cut card comes out, the round finishes and YOU cut the fresh shoe before the next deal.'],
    ['Seats', '3 per player in rooms · unlimited solo', 'Multiplayer seats are capped so friends always fit at the table.'],
    ['Decision timer', '30 seconds', 'If it expires the hand auto-stands (or plays your queued quick-action), so the table never stalls.'],
  ]
  return (
    <>
      <H2>This Table's House Rules</H2>
      <p className="lh-lead">Exactly how this room plays — including two deliberate rules that differ from the standard Vegas game. Know them before you bet.</p>
      <Card>
        <div className="lh-rulelist">
          {rules.map(([k, v, why]) => (
            <div key={k} className="lh-ruleitem">
              <div className="lh-ruleitem-head">
                <span className="lh-scene-lbl">{k}</span>
                <span className="text-white font-bold text-[13px] text-right">{v}</span>
              </div>
              <div className="lh-dim text-[12px] leading-relaxed">{why}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Kicker>Why the 10 "no peek" matters to your strategy</Kicker>
        <p className="lh-p mb-0">With an <b className="text-white">Ace up</b> you're protected: the blackjack check happens during insurance, before you invest another chip. With a <b className="text-white">10 up</b> there is no check — if you double or split and the dealer then flips an Ace, those extra bets lose with the rest. That's why basic strategy is naturally conservative against a 10 (no doubling 10 vs 10, no soft doubles), and your post-game review grades against exactly these rules.</p>
      </Card>
    </>
  )
}

// ─── THE HUB ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'basics', label: 'The Basics', sub: 'Goal · values · flow', icon: '♠', el: BasicsSection },
  { id: 'options', label: 'Player Options', sub: 'Hit · Stand · Double · Split', icon: '⚔', el: OptionsSection },
  { id: 'sidebets', label: 'Side Bets', sub: 'Perfect Pairs · 21+3', icon: '◈', el: SideBetsSection },
  { id: 'strategy', label: 'Basic Strategy', sub: 'The chart · trainer', icon: '▤', el: StrategySection },
  { id: 'counting', label: 'Card Counting', sub: 'The Hi-Lo course', icon: '𝚺', el: CountingSection },
  { id: 'rules', label: 'House Rules', sub: 'How this table plays', icon: '§', el: RulesSection },
]

export function LearningHub({ onBack, initialSection = 'basics' }) {
  const [active, setActive] = useState(initialSection)
  const scrollRef = useRef(null)
  const section = SECTIONS.find(s => s.id === active) || SECTIONS[0]
  const Body = section.el
  const idx = SECTIONS.indexOf(section)

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [active])

  return (
    <div className="lh-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="lh-shell">
        <aside className="lh-side">
          <button onClick={onBack} className="lh-back">← Menu</button>
          <div className="lh-brand">
            <div className="font-display gold-text text-xl font-bold tracking-[0.12em] uppercase">Learning Hub</div>
            <div className="lh-dim text-[10px] tracking-[0.25em] uppercase mt-1">From first hand to card counter</div>
          </div>
          <nav className="lh-nav">
            {SECTIONS.map((s, i) => (
              <button key={s.id} onClick={() => setActive(s.id)} className={`lh-nav-item ${active === s.id ? 'lh-nav-item--on' : ''}`}>
                <span className="lh-nav-icon">{s.icon}</span>
                <span className="flex-1 text-left">
                  <span className="block text-[13px] font-bold leading-tight">{i + 1}. {s.label}</span>
                  <span className="block text-[10px] opacity-60 leading-tight mt-0.5">{s.sub}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="lh-main" ref={scrollRef}>
          <div className="lh-content lh-fade-in" key={active}>
            <Body />
            <div className="lh-pager">
              {idx > 0
                ? <button className="lh-btn" onClick={() => setActive(SECTIONS[idx - 1].id)}>← {SECTIONS[idx - 1].label}</button>
                : <span />}
              {idx < SECTIONS.length - 1
                ? <button className="lh-btn lh-btn--gold" onClick={() => setActive(SECTIONS[idx + 1].id)}>{SECTIONS[idx + 1].label} →</button>
                : <button className="lh-btn lh-btn--gold" onClick={onBack}>To the tables →</button>}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
