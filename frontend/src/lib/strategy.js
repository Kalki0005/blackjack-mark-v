// Exact JS port of backend/strategy.py — used for the Learning Hub chart,
// the move-trainer quiz and the assessment explanations. Keys are the
// dealer's value (A = 11). Values: 'hit' | 'stand' | 'double' | 'split'.

export const DEALER_KEYS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export const PAIR_STRATEGY = {
  'A':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'split',8:'split',9:'split',10:'split',11:'split' },
  '9':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'stand',8:'split',9:'split',10:'stand',11:'stand' },
  '8':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'split',8:'split',9:'split',10:'split',11:'split' },
  '7':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'split',8:'hit',9:'hit',10:'hit',11:'hit' },
  '6':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  '5':  { 2:'double',3:'double',4:'double',5:'double',6:'double',7:'double',8:'double',9:'double',10:'hit',11:'hit' },
  '4':  { 2:'hit',3:'hit',4:'hit',5:'split',6:'split',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  '3':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'split',8:'hit',9:'hit',10:'hit',11:'hit' },
  '2':  { 2:'split',3:'split',4:'split',5:'split',6:'split',7:'split',8:'hit',9:'hit',10:'hit',11:'hit' },
  '10': { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand' },
}

export const SOFT_STRATEGY = {
  20: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand' },
  19: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'double',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand' },
  18: { 2:'double',3:'double',4:'double',5:'double',6:'double',7:'stand',8:'stand',9:'hit',10:'hit',11:'hit' },
  17: { 2:'hit',3:'double',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  16: { 2:'hit',3:'hit',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  15: { 2:'hit',3:'hit',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  14: { 2:'hit',3:'hit',4:'hit',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  13: { 2:'hit',3:'hit',4:'hit',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
}

export const HARD_STRATEGY = {
  17: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'stand',8:'stand',9:'stand',10:'stand',11:'stand' },
  16: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  15: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  14: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  13: { 2:'stand',3:'stand',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  12: { 2:'hit',3:'hit',4:'stand',5:'stand',6:'stand',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  11: { 2:'double',3:'double',4:'double',5:'double',6:'double',7:'double',8:'double',9:'double',10:'double',11:'hit' },
  10: { 2:'double',3:'double',4:'double',5:'double',6:'double',7:'double',8:'double',9:'double',10:'hit',11:'hit' },
  9:  { 2:'hit',3:'double',4:'double',5:'double',6:'double',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
  8:  { 2:'hit',3:'hit',4:'hit',5:'hit',6:'hit',7:'hit',8:'hit',9:'hit',10:'hit',11:'hit' },
}

// Mirrors strategy.py exactly: pairs → soft table → hard table.
export function bestMove({ total, isSoft = false, isPair = false, pairRank = null }, dealerVal) {
  if (isPair && pairRank) {
    let rank = ['J', 'Q', 'K'].includes(pairRank) ? '10' : pairRank
    if (PAIR_STRATEGY[rank]) return PAIR_STRATEGY[rank][dealerVal] || 'hit'
  }
  if (isSoft) return (SOFT_STRATEGY[total] || {})[dealerVal] || 'hit'
  if (total >= 17) return 'stand'
  if (total <= 8) return 'hit'
  return (HARD_STRATEGY[total] || {})[dealerVal] || 'hit'
}

// Card-string helpers ('K♥', '10♠', 'A♦' …)
export const cardRank = (c) => c.slice(0, -1)
export const cardValue = (c) => {
  const r = cardRank(c)
  if (r === 'A') return 11
  if (['K', 'Q', 'J'].includes(r)) return 10
  return parseInt(r, 10)
}
export const upcardValue = (c) => cardValue(c)
export const upcardLabel = (c) => (cardRank(c) === 'A' ? 'Ace' : cardRank(c))

// Chance of busting on the next hit, by CURRENT hard total (uniform-rank approx,
// matches the numbers the engine's learner panel is built on).
export const BUST_IF_HIT = {
  11: 0, 12: 31, 13: 39, 14: 46, 15: 54, 16: 62, 17: 69, 18: 77, 19: 85, 20: 92, 21: 100,
}

// How often the dealer eventually busts, by upcard (standard S17 figures).
export const DEALER_BUST_PCT = {
  2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 21, 11: 17,
}

// ── Severity + explanation for the assessment review ───────────────────────
// m: { player_total, dealer_upcard, user_action, recommended_action,
//      is_soft?, is_pair?, cards?, hand_outcome? }

export function classifyMistake(m) {
  const t = m.player_total
  const soft = !!m.is_soft
  const up = upcardValue(m.dealer_upcard)
  const you = m.user_action, best = m.recommended_action

  // Catastrophic, always-wrong plays
  if (you === 'HIT' && !soft && t >= 17) return 'blunder'
  if (you === 'STAND' && t <= 11) return 'blunder'
  if (best === 'SPLIT' && m.cards && ['A', '8'].includes(cardRank(m.cards[0]))) return 'blunder'
  if (you === 'SPLIT' && m.cards && ['10', 'J', 'Q', 'K', '5'].includes(cardRank(m.cards[0]))) return 'blunder'
  if (you === 'DOUBLE' && !soft && t >= 13) return 'blunder'
  if (you === 'DOUBLE' && best === 'STAND') return 'blunder'

  // Known razor-thin spots — barely wrong
  const borderline =
    (!soft && t === 16 && up === 10 && ((you === 'STAND' && best === 'HIT') || (you === 'HIT' && best === 'STAND'))) ||
    (!soft && t === 12 && [2, 3].includes(up)) ||
    (soft && t === 18 && [2, 7, 8].includes(up)) ||
    (best === 'DOUBLE' && you === 'HIT' && (t === 9 || (soft && t <= 18)))
  if (borderline) return 'inaccuracy'

  return 'mistake'
}

export const SEVERITY_META = {
  blunder:    { label: 'Blunder',    icon: '??', color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.35)' },
  mistake:    { label: 'Mistake',    icon: '?',  color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.32)' },
  inaccuracy: { label: 'Inaccuracy', icon: '?!', color: '#a3e635', bg: 'rgba(163,230,53,0.07)',  border: 'rgba(163,230,53,0.28)' },
}

// Deterministic phrase picker: the same situation always reads the same,
// but different situations pull different phrasings — keeps reviews fresh.
export function pickPhrase(seed, variants) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 2654435761)
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13
  return variants[(h >>> 0) % variants.length]
}

export function explainMistake(m) {
  const t = m.player_total
  const soft = !!m.is_soft
  const up = upcardValue(m.dealer_upcard)
  const upLbl = upcardLabel(m.dealer_upcard)
  const you = m.user_action, best = m.recommended_action
  const bust = BUST_IF_HIT[t]
  const dBust = DEALER_BUST_PCT[up]
  const handName = `${soft ? 'soft' : 'hard'} ${t}`
  const seed = `${you}|${best}|${t}|${up}|${soft}`
  const P = (variants) => pickPhrase(seed, variants)

  if (best === 'SPLIT') {
    const r = m.cards ? cardRank(m.cards[0]) : null
    if (r === 'A') return P([
      `A pair of Aces is two chances at 21 — played as a soft 12 it's one of the weakest hands you can hold. Always split Aces, against every upcard.`,
      `Two Aces together are a clumsy 12; apart, each is the best starting card in the game. There is no upcard that makes keeping them right.`,
    ])
    if (r === '8') return P([
      `16 is the worst total in blackjack. Splitting the 8s turns one terrible hand into two playable hands that each start from 8. Always split 8s.`,
      `Nothing good ever happens to a 16. Two hands from 8 lose less (and win more) than one doomed hand from 16 — split 8s, always, everywhere.`,
    ])
    return P([
      `This pair plays better as two hands against a dealer ${upLbl}. Keeping it as ${handName} throws away the value the split creates.`,
      `Against a ${upLbl}, the book splits this pair — two fresh starts outperform one ${handName} here.`,
    ])
  }

  if (you === 'SPLIT') {
    const r = m.cards ? cardRank(m.cards[0]) : null
    if (r && ['10', 'J', 'Q', 'K'].includes(r)) return P([
      `A pair of tens is a made 20 — it wins the vast majority of hands outright. Splitting breaks a near-certain winner into two mediocre hands and doubles your money at risk.`,
      `You had 20. That hand wins ~85% of the time as-is. Splitting it is trading a locked-in favourite for two coin-flips at double the stake.`,
    ])
    if (r === '5') return P([
      `Two 5s are a hard 10 — a prime doubling hand. Split them and you start two weak hands from 5 instead. ${best === 'DOUBLE' ? 'Double instead.' : 'Never split 5s.'}`,
      `5-5 isn't a pair, it's a 10 in disguise — one of the best totals in the game. Two hands built from 5s are two of the worst. ${best === 'DOUBLE' ? 'The right move was to double.' : 'Keep them together.'}`,
    ])
    return P([
      `Splitting here puts a second bet on a spot where the pair plays better as a single ${handName}. Best is ${best.toLowerCase()} against a ${upLbl}.`,
      `The extra bet isn't earning anything: vs a ${upLbl} this pair does better played as ${handName}. The book says ${best.toLowerCase()}.`,
    ])
  }

  if (best === 'DOUBLE' && you === 'HIT') return P([
    `Right card, wrong bet. ${soft ? `Soft ${t}` : t} against a dealer ${upLbl} is a clear-favourite spot — the dealer busts about ${dBust}% of the time from a ${upLbl}. Doubling puts maximum money in while the edge is yours; just hitting wins the same hands for half the profit.`,
    `You took the card but left the money behind. ${soft ? `Soft ${t}` : `A ${t}`} vs ${upLbl} is exactly when you press: same draw, double the bet, and the dealer busting ~${dBust}% of the time pays for it.`,
    `Hitting wasn't wrong — under-betting was. This is a paid opportunity: double ${soft ? `soft ${t}` : t} into a ${upLbl} and you win the same hands for twice as much.`,
  ])
  if (best === 'DOUBLE' && you === 'STAND') return P([
    `${soft ? `Soft ${t}` : `${t}`} vs ${upLbl} wants MORE action, not less: draw one strong card while the dealer is likely to bust (~${dBust}% from a ${upLbl}). Standing declines both the extra card and the extra bet.`,
    `Standing here waves off a favourite. The play is one confident card with double the money — the ${upLbl} folds ~${dBust}% of the time and your draw can't ruin a ${handName}.`,
  ])

  if (you === 'DOUBLE') {
    if (best === 'STAND') return P([
      `${handName} vs ${upLbl} wants NO more cards — doubling forces you to draw exactly one with twice the money at stake. ${bust != null ? `That draw busts you ${bust}% of the time.` : ''} Doubling a standing hand turns a winner into a coin-flip at double the price.`,
      `You doubled a hand that was already finished. ${handName} beats a ${upLbl} by standing pat; the forced card ${bust != null ? `busts ${bust}% of the time` : 'risks the whole hand'} — with double the chips riding on it.`,
    ])
    return P([
      `Doubling locks you into exactly one card with double the money on a spot that isn't a favourite. ${handName} vs ${upLbl} sometimes needs a second draw or simply isn't strong enough for 2× the bet — take the free ${best.toLowerCase()} instead.`,
      `The double costs you flexibility you needed: vs a ${upLbl}, ${handName} isn't strong enough to pay double for one card. A plain ${best.toLowerCase()} keeps every option open at the original price.`,
    ])
  }

  if (you === 'HIT' && best === 'STAND') {
    if (up <= 6) return P([
      `The dealer's ${upLbl} is a bust card — from it the dealer busts about ${dBust}% of the time. With ${handName} you ${bust != null ? `bust ${bust}% of the time if you hit` : 'risk busting'}, so the winning line is to stand and let the dealer take the risk.`,
      `Patience pays here: a ${upLbl} up means the dealer self-destructs ~${dBust}% of the time. Hitting your ${handName} ${bust != null ? `(${bust}% bust risk) ` : ''}volunteers to lose first.`,
      `You did the dealer's dirty work. Against a ${upLbl} the plan is simple — stand on ${handName} and let their forced draws (~${dBust}% bust rate) hand you the pot.`,
    ])
    return P([
      `${handName} is strong enough to protect. Hitting ${bust != null ? `busts ${bust}% of the time` : 'risks a bust'} and destroys a hand that already beats most dealer outcomes.`,
      `That hand was already made. ${handName} holds up against most dealer finishes; the hit ${bust != null ? `torches it ${bust}% of the time` : 'gambles it away'} for very little upside.`,
    ])
  }

  if (you === 'STAND' && best === 'HIT') {
    if (t <= 11) return P([
      `You cannot bust a ${t} — every card in the shoe improves it. Standing on ${t} gives the dealer a free pass.`,
      `Standing on ${t} is the one truly free mistake: no card in the shoe can bust you, so there was zero risk in drawing and zero chance of winning without it.`,
    ])
    return P([
      `Standing on ${handName} only wins if the dealer busts, and from a ${upLbl} that happens just ~${dBust}% of the time. Hitting is scary (${bust != null ? `${bust}% bust risk` : 'real bust risk'}) but it loses less in the long run — you must improve against a strong upcard.`,
      `Against a ${upLbl}, your ${handName} standing pat is drawing dead ~${100 - dBust}% of the time. Yes, the hit ${bust != null ? `busts ${bust}% of the time` : 'can bust'} — the book plays it anyway because it loses less money over thousands of hands.`,
      `A ${upLbl} makes a hand too often for ${handName} to sit still. The hit hurts sometimes; standing hurts more often. Math over comfort.`,
    ])
  }

  return P([
    `Basic strategy plays ${best.toLowerCase()} with ${handName} against a dealer ${upLbl}. Every deviation gives edge back to the house over time.`,
    `The book line here is ${best.toLowerCase()} — ${handName} vs ${upLbl} has one right answer, and each detour from it quietly feeds the house edge.`,
  ])
}

// Chess.com-style grade from an accuracy percentage.
export function accuracyGrade(pct) {
  if (pct >= 99.9) return { label: 'Flawless', color: '#e8d48b' }
  if (pct >= 90) return { label: 'Sharp', color: '#5be39a' }
  if (pct >= 75) return { label: 'Solid', color: '#4ade80' }
  if (pct >= 55) return { label: 'Loose', color: '#fbbf24' }
  return { label: 'Reckless', color: '#f87171' }
}
