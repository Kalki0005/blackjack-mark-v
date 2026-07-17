const SUIT_COLOR = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' }

// ── Pip layouts (viewBox 0 0 100 140) ──────────────────────────────────────
// Each entry is [x, y]; pips below the centre line are auto-rotated 180°.
const COL = { L: 28, C: 50, R: 72 }
const PIP_LAYOUTS = {
  '2':  [[COL.C, 28], [COL.C, 112]],
  '3':  [[COL.C, 28], [COL.C, 70], [COL.C, 112]],
  '4':  [[COL.L, 28], [COL.R, 28], [COL.L, 112], [COL.R, 112]],
  '5':  [[COL.L, 28], [COL.R, 28], [COL.C, 70], [COL.L, 112], [COL.R, 112]],
  '6':  [[COL.L, 28], [COL.R, 28], [COL.L, 70], [COL.R, 70], [COL.L, 112], [COL.R, 112]],
  '7':  [[COL.L, 28], [COL.R, 28], [COL.C, 49], [COL.L, 70], [COL.R, 70], [COL.L, 112], [COL.R, 112]],
  '8':  [[COL.L, 28], [COL.R, 28], [COL.C, 49], [COL.L, 70], [COL.R, 70], [COL.C, 91], [COL.L, 112], [COL.R, 112]],
  '9':  [[COL.L, 26], [COL.R, 26], [COL.L, 54], [COL.R, 54], [COL.C, 70], [COL.L, 86], [COL.R, 86], [COL.L, 114], [COL.R, 114]],
  '10': [[COL.L, 26], [COL.R, 26], [COL.C, 44], [COL.L, 54], [COL.R, 54], [COL.L, 86], [COL.R, 86], [COL.C, 96], [COL.L, 114], [COL.R, 114]],
}

const SUIT_PATHS = {
  // Compact suit glyphs centred on (0,0), drawn at ~20px tall
  '♠': 'M0,-10 C5,-3 11,-1 11,4 C11,9 6,11 2,8 C3,11 4,12 5,13 L-5,13 C-4,12 -3,11 -2,8 C-6,11 -11,9 -11,4 C-11,-1 -5,-3 0,-10 Z',
  '♥': 'M0,13 C-2,9 -11,4 -11,-3 C-11,-9 -3,-11 0,-5 C3,-11 11,-9 11,-3 C11,4 2,9 0,13 Z',
  '♦': 'M0,-13 C4,-6 8,-2 11,0 C8,2 4,6 0,13 C-4,6 -8,2 -11,0 C-8,-2 -4,-6 0,-13 Z',
  '♣': 'M0,13 C1,9 2,7 4,5 C9,8 13,3 11,-2 C9,-6 4,-6 2,-3 C4,-7 3,-12 -0,-12 C-3,-12 -4,-7 -2,-3 C-4,-6 -9,-6 -11,-2 C-13,3 -9,8 -4,5 C-2,7 -1,9 0,13 Z',
}

function Pip({ x, y, suit, fill, scale = 1 }) {
  const flip = y > 70
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) ${flip ? 'rotate(180)' : ''}`}>
      <path d={SUIT_PATHS[suit]} fill={fill} />
    </g>
  )
}

function CardFace({ rank, suit }) {
  const fill = SUIT_COLOR[suit] === 'red' ? '#c8102e' : '#15161c'
  const isCourt = ['J', 'Q', 'K'].includes(rank)
  const isAce = rank === 'A'
  const pips = PIP_LAYOUTS[rank]

  return (
    <svg viewBox="0 0 100 140" className="card-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="cardSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#fbf8f0" />
          <stop offset="100%" stopColor="#efe9da" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill="url(#cardSheen)" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />

      {/* Corner indices */}
      <g fill={fill}>
        <text x="11" y="22" className="card-index">{rank}</text>
        <g transform="translate(11 27) scale(0.5)"><path d={SUIT_PATHS[suit]} fill={fill} /></g>
        <g transform="translate(89 118) rotate(180)">
          <text x="0" y="0" className="card-index" textAnchor="middle">{rank}</text>
          <g transform="translate(0 5) scale(0.5)"><path d={SUIT_PATHS[suit]} fill={fill} /></g>
        </g>
      </g>

      {/* Body */}
      {isAce && <Pip x={50} y={70} suit={suit} fill={fill} scale={2.6} />}

      {pips && pips.map(([x, y], i) => (
        <Pip key={i} x={x} y={y} suit={suit} fill={fill} scale={1.05} />
      ))}

      {isCourt && (
        <g>
          <rect x="22" y="24" width="56" height="92" rx="5"
            fill={SUIT_COLOR[suit] === 'red' ? '#fdeef0' : '#eef0f5'}
            stroke={fill} strokeWidth="1.3" />
          <text x="50" y="74" className="card-court" textAnchor="middle" fill={fill}>{rank}</text>
          <g transform="translate(50 44) scale(1.1)"><path d={SUIT_PATHS[suit]} fill={fill} /></g>
          <g transform="translate(50 100) rotate(180) scale(1.1)"><path d={SUIT_PATHS[suit]} fill={fill} /></g>
        </g>
      )}
    </svg>
  )
}

export function PlayingCard({ cardStr, size = 'md', hidden = false, dealAnim = false, style = {} }) {
  if (hidden) {
    return (
      <div
        className={`playing-card playing-card--hidden playing-card--${size} ${dealAnim ? 'playing-card--deal' : ''}`}
        style={style}
      >
        <div className="card-back-pattern" />
      </div>
    )
  }

  if (!cardStr) return null

  const suit = cardStr.slice(-1)
  const rank = cardStr.slice(0, -1)

  return (
    <div
      className={`playing-card playing-card--face playing-card--${size} ${dealAnim ? 'playing-card--deal' : ''} select-none`}
      style={style}
    >
      <CardFace rank={rank} suit={suit} />
    </div>
  )
}

// Round-robin deal timing: the initial two cards of every hand animate in the
// real casino order (seat 1, seat 2, …, dealer — then the second round), driven
// by dealOrder (this hand's position in the rotation) and dealCount (number of
// active seats). Cards drawn later (hits) fly immediately; extra DEALER cards
// (the reveal draw-out) play one by one.
export function CardRow({
  cards, hideSecond = false, size = 'md', dealAnim = false,
  dealOrder = 0, dealCount = 0, isDealer = false, dealStep = 0.16,
}) {
  const delayFor = (i) => {
    if (dealCount > 0 && i < 2) {
      const slot = i * (dealCount + 1) + (isDealer ? dealCount : dealOrder)
      return slot * dealStep
    }
    if (isDealer && i >= 2) return 0.2 + (i - 2) * 0.45
    return i < 2 ? i * 0.08 : 0.03
  }
  return (
    <div className="card-row">
      {cards.map((c, i) => (
        <PlayingCard
          key={`${c}-${i}`}
          cardStr={c}
          size={size}
          hidden={hideSecond && i === 1}
          dealAnim={dealAnim}
          style={{ animationDelay: `${delayFor(i)}s`, marginLeft: i === 0 ? 0 : '-14px', zIndex: i }}
        />
      ))}
    </div>
  )
}
