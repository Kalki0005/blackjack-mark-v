// ─────────────────────────────────────────────────────────────────────────────
// Premium fixed-view blackjack table v5 — Evolution-style framing:
//   • wide, GENTLE player-side arc: the 7 spots sit in a near-straight,
//     slightly bowed line (outer seats only slightly higher than center)
//   • zoomed, slightly-elevated camera: the felt's near edge dips BELOW the
//     frame at bottom-center and the side arcs sweep off the bottom corners
//   • flat dealer edge high in frame — everything above is free for the
//     themed background / dealer video layer
//   • RIGHT-TO-LEFT play: seat 1 renders rightmost (player POV), so the
//     engine's ascending deal/turn order plays out right → left like every
//     live blackjack. Pure anchor mapping — engine order untouched.
//   • side bets are crescents hugging the main circle (Evolution layout):
//     21+3 on the LEFT, PERFECT PAIRS on the RIGHT
// Exports SEAT_ANCHORS (main + pp + 21+3, % of the viewBox), DEALER_CARD_ANCHOR
// and SHOE_ANCHOR so the game pins live chips/cards onto the printed felt.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'

export const TABLE_VIEW = { w: 1600, h: 900 }

// Ease a numeric prop toward its target so the shoe deck shrinks and the
// discard stack rises smoothly instead of snapping between rounds.
function useSmoothed(target, ms = 900) {
  const [val, setVal] = useState(target)
  const valRef = useRef(target)
  valRef.current = val
  useEffect(() => {
    const from = valRef.current
    if (Math.abs(target - from) < 0.002) return
    const t0 = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(from + (target - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

// Felt geometry (v6): a COMPLETE, contained oval table sitting in the lower
// half of the frame with clear margins left/right — the top half is free for
// the themed studio + dealer. Foreshortened (RY < RX) for the angled look.
const CX = 800
const FLAT_Y = 510          // dealer (flat) edge — pushed down so the table hugs
const RX = 560              // half-width → ~240px margin each side (rounded ends)
const FELT_RY = 340         // arc depth → near edge at y≈850 (just above bottom)

// Spots on a concentric inner arc — gentle bow, flatter ellipses for depth.
// Seat 1 is RIGHTMOST (x_rel descending) so play flows right → left on screen.
const SPOT_RX = 468
const SPOT_RY = 250
const SEAT_X_REL = [430, 287, 143, 0, -143, -287, -430] // seats 1..7, right→left

const pct = (p) => ({ xPct: (p.x / TABLE_VIEW.w) * 100, yPct: (p.y / TABLE_VIEW.h) * 100 })

export const SEAT_ANCHORS = SEAT_X_REL.map((xr, i) => {
  const x = CX + xr
  const y = FLAT_Y + SPOT_RY * Math.sqrt(Math.max(0, 1 - (xr / SPOT_RX) ** 2))
  return {
    seat: i + 1,
    x, y, ...pct({ x, y }),
    // side-bet crescents hug the main circle: 21+3 left, Perfect Pairs right
    pp: pct({ x: x + 44, y: y - 2 }),
    t3: pct({ x: x - 44, y: y - 2 }),
  }
})

export const DEALER_CARD_ANCHOR = pct({ x: 800, y: 588 })

// Where the dealing shoe sits — cards animate FROM here to their seat.
export const SHOE_ANCHOR = pct({ x: 1205, y: 556 })

// Half-ellipse felt (cubic approximation, kappa ≈ 0.552).
const K = 0.552
const feltPath = (rx, ry, dy = 0) =>
  `M ${CX - rx} ${FLAT_Y + dy} ` +
  `C ${CX - rx} ${FLAT_Y + K * ry + dy}, ${CX - K * rx} ${FLAT_Y + ry + dy}, ${CX} ${FLAT_Y + ry + dy} ` +
  `C ${CX + K * rx} ${FLAT_Y + ry + dy}, ${CX + rx} ${FLAT_Y + K * ry + dy}, ${CX + rx} ${FLAT_Y + dy}`

const FELT = feltPath(RX, FELT_RY) + ' Z'
const RIM = feltPath(RX, FELT_RY, 24) + ' Z'           // table thickness under-rim
const RAIL_ARC = feltPath(RX + 8, FELT_RY + 12)         // padded rail along the curve

const THEMES = {
  green: {
    feltIn: '#1e9e60', feltMid: '#107a45', feltOut: '#07472a',
    railHi: '#7d5a3a', railMid: '#503722', railLo: '#241708',
    railRim: 'rgba(255,214,160,0.4)', rim: '#1b1208',
    text: '#f3f1e6', textDim: 'rgba(243,241,230,0.82)',
    ring: 'rgba(255,255,255,0.62)', ringInner: 'rgba(255,255,255,0.20)',
    side: 'rgba(150,220,175,0.68)', sideText: 'rgba(220,255,230,0.92)',
    line: 'rgba(255,255,255,0.46)',
    bg: '#0a1a11',
  },
  blue: {
    feltIn: '#2a5080', feltMid: '#1a3763', feltOut: '#0b1c38',
    railHi: '#d9b268', railMid: '#a8803a', railLo: '#5c431a',
    railRim: 'rgba(255,240,200,0.5)', rim: '#241a08',
    text: '#f1ecdd', textDim: 'rgba(241,236,221,0.82)',
    ring: 'rgba(255,255,255,0.58)', ringInner: 'rgba(255,255,255,0.18)',
    side: 'rgba(217,178,104,0.75)', sideText: 'rgba(255,238,195,0.92)',
    line: 'rgba(255,255,255,0.42)',
    bg: '#0a111c',
  },
}

// Acrylic dealing shoe, pseudo-3D; the red deck shrinks as the shoe depletes.
function Shoe({ fill = 0.85 }) {
  const deckW = Math.max(12, 78 * fill)
  const x1 = 104 - deckW
  const topY = (x) => 6 - (x + 56) * 0.2439
  const botY = (x) => 44 - (x + 56) * 0.0854
  return (
    <g transform="translate(1150,556) rotate(7) scale(0.66)">
      <ellipse cx="30" cy="52" rx="92" ry="12" fill="#000" opacity="0.33" />
      <path d="M -60 36 L 118 30 L 130 46 L -48 50 Z" fill="#20242c" stroke="#0c0e12" strokeWidth="1.5" />
      <path d={`M ${x1} ${topY(x1) + 3} L 104 ${topY(104) + 3} L 104 ${botY(104) - 3} L ${x1} ${botY(x1) - 3} Z`}
        fill="#9c2033" />
      <path d={`M ${x1} ${topY(x1) + 3} L 104 ${topY(104) + 3}`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" fill="none" />
      <path d="M 108 -34 L 130 -22 L 130 42 L 108 30 Z" fill="rgba(200,222,238,0.28)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
      <path d="M -56 6 L 108 -34 L 108 30 L -56 44 Z" fill="rgba(214,232,244,0.20)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
      <path d="M -56 6 L 108 -34 L 130 -22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
      <path d="M -56 26 L -22 18 L -22 41 L -56 44 Z" fill="rgba(245,246,240,0.92)" />
      <ellipse cx="-39" cy="22" rx="8" ry="4.5" fill="#8b93a0" stroke="#3c414b" strokeWidth="1.2" />
    </g>
  )
}

// Acrylic discard rack; the card stack grows as rounds are played.
function DiscardRack({ fill = 0.15 }) {
  const h = Math.max(4, 44 * fill)
  return (
    <g transform="translate(430,556) rotate(-7) scale(0.66)">
      <ellipse cx="0" cy="52" rx="76" ry="12" fill="#000" opacity="0.33" />
      <path d="M -58 36 L 58 36 L 70 50 L -46 50 Z" fill="#20242c" stroke="#0c0e12" strokeWidth="1.5" />
      <g>
        <path d={`M -44 ${34 - h} L 44 ${30 - h} L 56 ${42 - h} L -32 ${46 - h} Z`} fill="#a72538" />
        <path d={`M -44 ${34 - h} L -44 34 L -32 46 L -32 ${46 - h} Z`} fill="#7c1a29" />
        <path d={`M -32 ${46 - h} L 56 ${42 - h} L 56 42 L -32 46 Z`} fill="#8e1f2f" />
        <path d={`M -44 ${34 - h} L 44 ${30 - h}`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
      </g>
      <path d="M -46 -26 L 58 -30 L 58 40 L -46 44 Z" fill="rgba(214,232,244,0.14)" stroke="rgba(255,255,255,0.42)" strokeWidth="1.4" />
      <path d="M -46 -26 L 58 -30" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" fill="none" />
    </g>
  )
}

// ── Evolution-style bet spot: main circle + two crescents hugging it ────────
const rad = (d) => (d * Math.PI) / 180
const ePt = (cx, cy, rx, ry, deg) =>
  `${(cx + rx * Math.cos(rad(deg))).toFixed(1)} ${(cy + ry * Math.sin(rad(deg))).toFixed(1)}`
// Annular crescent between two concentric ellipses spanning [a0..a1] degrees.
const crescentPath = (cx, cy, rIx, rIy, rOx, rOy, a0, a1) =>
  `M ${ePt(cx, cy, rIx, rIy, a0)} A ${rIx} ${rIy} 0 0 1 ${ePt(cx, cy, rIx, rIy, a1)} ` +
  `L ${ePt(cx, cy, rOx, rOy, a1)} A ${rOx} ${rOy} 0 0 0 ${ePt(cx, cy, rOx, rOy, a0)} Z`

function BetSpot({ x, y, t }) {
  // main circle sized to a chip; crescents are small and hug it tightly
  const rx = 27, ry = 15
  const rIx = 31, rIy = 18, rOx = 43, rOy = 25
  return (
    <g>
      {/* main circle */}
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="rgba(0,0,0,0.12)" stroke={t.ring} strokeWidth="2" />
      <ellipse cx={x} cy={y} rx={rx - 4} ry={ry - 2.6} fill="none" stroke={t.ringInner} strokeWidth="1" />
      {/* 21+3 — left crescent */}
      <path d={crescentPath(x, y, rIx, rIy, rOx, rOy, 118, 242)}
        fill="rgba(0,0,0,0.12)" stroke={t.side} strokeWidth="1.2" />
      <text x={x - 40} y={y + 2} fill={t.sideText} fontSize="6" textAnchor="middle"
        fontFamily="Inter, sans-serif" fontWeight="800">21+3</text>
      {/* Perfect Pairs — right crescent */}
      <path d={crescentPath(x, y, rIx, rIy, rOx, rOy, -62, 62)}
        fill="rgba(0,0,0,0.12)" stroke={t.side} strokeWidth="1.2" />
      <text x={x + 40} y={y + 2} fill={t.sideText} fontSize="5.2" textAnchor="middle"
        fontFamily="Inter, sans-serif" fontWeight="800" letterSpacing="0.2">PAIRS</text>
    </g>
  )
}

export function Table2D({ theme = 'green', shoeFill = 0.85, discardFill = 0.15, className = '', style }) {
  const t = THEMES[theme] || THEMES.green
  const smoothShoe = useSmoothed(shoeFill)
  const smoothDiscard = useSmoothed(discardFill)

  return (
    <svg className={className} style={style} viewBox={`0 0 ${TABLE_VIEW.w} ${TABLE_VIEW.h}`}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`felt-${theme}`} cx="50%" cy="18%" r="95%">
          <stop offset="0%" stopColor={t.feltIn} />
          <stop offset="48%" stopColor={t.feltMid} />
          <stop offset="100%" stopColor={t.feltOut} />
        </radialGradient>
        <linearGradient id={`rail-${theme}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.railHi} />
          <stop offset="55%" stopColor={t.railMid} />
          <stop offset="100%" stopColor={t.railLo} />
        </linearGradient>
        <pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="0.6" fill="rgba(0,0,0,0.06)" />
          <circle cx="4.4" cy="4.4" r="0.6" fill="rgba(255,255,255,0.03)" />
        </pattern>
        {/* lettering arcs — in the clear band between dealer + player spots */}
        <path id="arcBJ" d="M 486 638 Q 800 700 1114 638" fill="none" />
        <path id="arcSub" d="M 524 666 Q 800 720 1076 666" fill="none" />
        <path id="arcIns" d="M 540 690 Q 800 740 1060 690" fill="none" />
      </defs>

      {/* table thickness (under-rim) */}
      <path d={RIM} fill={t.rim} />
      {/* felt */}
      <path d={FELT} fill={`url(#felt-${theme})`} />
      <path d={FELT} fill="url(#weave)" />
      {/* inner shading against the rail */}
      <path d={RAIL_ARC} fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="30" style={{ filter: 'blur(10px)' }} />

      {/* padded rail along the player curve */}
      <path d={RAIL_ARC} fill="none" stroke={`url(#rail-${theme})`} strokeWidth="34" strokeLinecap="round" />
      <path d={RAIL_ARC} fill="none" stroke={t.railRim} strokeWidth="2.5" transform="translate(0,-15)" opacity="0.85" />

      {/* dealer-side edge strip */}
      <path d={`M ${CX - RX} ${FLAT_Y} L ${CX + RX} ${FLAT_Y}`} stroke={`url(#rail-${theme})`} strokeWidth="16" />
      <path d={`M ${CX - RX} ${FLAT_Y - 7} L ${CX + RX} ${FLAT_Y - 7}`} stroke={t.railRim} strokeWidth="1.6" opacity="0.7" />

      {/* insurance demarcation arc just below the dealer edge */}
      <path d="M 470 572 Q 800 622 1130 572" fill="none" stroke={t.line} strokeWidth="1.8" />

      {/* felt lettering */}
      <text fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fill={t.text}>
        <textPath href="#arcBJ" startOffset="50%" textAnchor="middle"
          style={{ fontSize: 30, letterSpacing: '2px' }}>BLACKJACK PAYS 3 TO 2</textPath>
      </text>
      <text fontFamily="Georgia, serif" fill={t.textDim}>
        <textPath href="#arcSub" startOffset="50%" textAnchor="middle"
          style={{ fontSize: 14.5 }}>Dealer must stand on 17 and must draw to 16</textPath>
      </text>
      <text fontFamily="Georgia, serif" fontWeight="700" fill={t.text}>
        <textPath href="#arcIns" startOffset="50%" textAnchor="middle"
          style={{ fontSize: 18, letterSpacing: '1.4px' }}>INSURANCE PAYS 2 TO 1</textPath>
      </text>

      {/* dealing shoe + discard rack */}
      <Shoe fill={smoothShoe} />
      <DiscardRack fill={smoothDiscard} />

      {/* 7 betting spots */}
      {SEAT_ANCHORS.map((s) => <BetSpot key={s.seat} x={s.x} y={s.y} t={t} />)}
    </svg>
  )
}

// Standalone viewer (`?table` or `?table&theme=blue`).
export default function Table2DViewer() {
  const theme = new URLSearchParams(window.location.search).get('theme') || 'green'
  const t = THEMES[theme] || THEMES.green
  return (
    <div style={{ position: 'fixed', inset: 0, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Table2D theme={theme} style={{ width: 'min(100vw, 160vh)', height: 'auto' }} />
    </div>
  )
}
