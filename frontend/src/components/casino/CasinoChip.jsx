// Stake-style chip palette keyed by denomination.
const CHIP_STYLES = {
  10:    { base: '#d8dde6', ring: '#ffffff', spot: '#9aa3b2', text: '#1d2230' },
  25:    { base: '#1f8a4c', ring: '#5be39a', spot: '#ffffff', text: '#eafff2' },
  50:    { base: '#1f5fae', ring: '#6fb2ff', spot: '#ffffff', text: '#eaf3ff' },
  100:   { base: '#181b22', ring: '#3a4150', spot: '#e7c65a', text: '#f3e4a8' },
  500:   { base: '#6d28d9', ring: '#b07bff', spot: '#ffffff', text: '#f1e7ff' },
  1000:  { base: '#c01f3a', ring: '#ff7d92', spot: '#ffffff', text: '#ffe9ed' },
  2500:  { base: '#0f7a44', ring: '#54e191', spot: '#ffffff', text: '#e9fff3' },
  5000:  { base: '#d2691e', ring: '#ffb066', spot: '#ffffff', text: '#fff0e0' },
  10000: { base: '#1166c4', ring: '#66aaff', spot: '#ffffff', text: '#e7f1ff' },
  25000: { base: '#0e2a52', ring: '#3f74c0', spot: '#cfe0ff', text: '#dcebff' },
}

const DENOMS = [25000, 10000, 5000, 2500, 1000, 500, 100, 50, 25, 10]

function nearestStyle(value) {
  if (CHIP_STYLES[value]) return CHIP_STYLES[value]
  const d = DENOMS.find(x => x <= value) || 10
  return CHIP_STYLES[d]
}

function fmt(value) {
  if (value >= 1000) {
    const k = value / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
  }
  return `${value}`
}

// A single realistic poker chip rendered as SVG. Always a <div> (with button
// semantics when clickable) so it can safely sit inside other buttons.
export function CasinoChip({ value, onClick, size = 'md', label }) {
  const s = nearestStyle(value)
  const spots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return { x: 50 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 41 }
  })

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={`casino-chip casino-chip--${size}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <svg viewBox="0 0 100 100" className="chip-svg">
        <defs>
          <radialGradient id={`cg-${value}`} cx="42%" cy="36%" r="70%">
            <stop offset="0%" stopColor={s.ring} stopOpacity="0.55" />
            <stop offset="42%" stopColor={s.base} />
            <stop offset="100%" stopColor="#05070b" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="49" fill="#05070b" />
        <circle cx="50" cy="50" r="48" fill={`url(#cg-${value})`} />
        {spots.map((p, i) => (
          <rect key={i} x={p.x - 5} y={p.y - 3.2} width="10" height="6.4" rx="2"
            transform={`rotate(${(i / 8) * 360} ${p.x} ${p.y})`}
            fill={s.spot} opacity="0.92" />
        ))}
        <circle cx="50" cy="50" r="35" fill="none" stroke={s.ring} strokeWidth="2.4" opacity="0.85" />
        <circle cx="50" cy="50" r="30" fill={s.base} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle cx="50" cy="50" r="30" fill="rgba(255,255,255,0.06)" />
        <text x="50" y="50" className="chip-text" fill={s.text} dominantBaseline="central" textAnchor="middle">
          {label || fmt(value)}
        </text>
      </svg>
    </div>
  )
}

// Greedy denomination breakdown of an amount (used for payouts and for
// seeding a bet trail when the original click sequence is unknown).
export function decomposeAmount(amount, maxChips = 5) {
  let remaining = amount
  const out = []
  for (const d of DENOMS) {
    while (remaining >= d && out.length < maxChips) {
      out.push(d)
      remaining -= d
    }
  }
  if (out.length === 0 && amount > 0) out.push(10)
  return out
}

// Bet display: a SINGLE representative chip labelled with the TOTAL amount
// (user's merge rule — 100 + 25 shows one 100-styled chip reading "125", never
// two separate chips). `chips`/`maxChips` are kept for call-site compatibility;
// only their sum matters now. Wins/pushes get a label pill + glow above.
export function ChipStack({ amount, chips: explicitChips = null, maxChips = 5, result = null, originalBet = 0 }) {
  const total = explicitChips && explicitChips.length && !result
    ? explicitChips.reduce((s, v) => s + v, 0)
    : amount
  if (!total || total <= 0) return null

  const won = result === 'win' || result === 'blackjack' || (result === 'sidebet' && total > originalBet)
  const push = result === 'push'

  return (
    <div className={`chip-stack-wrap ${won ? 'chip-stack-wrap--won' : ''} ${push ? 'chip-stack-wrap--push' : ''}`}>
      {(won || push) && (
        <div className={`chip-stack-label ${won ? 'chip-stack-label--win' : 'chip-stack-label--push'}`}>
          {won ? `$${total.toLocaleString()}` : 'Push'}
        </div>
      )}
      <CasinoChip value={total} size="sm" label={fmt(total)} />
    </div>
  )
}
