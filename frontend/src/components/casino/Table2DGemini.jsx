// Table2D.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Premium fixed-view blackjack table — Privé Lounge (Pragmatic-style)
//   • Teal/Cyan felt with gold and white typography.
//   • Wide-angle, flat perspective wrapping around the screen.
//   • Clean, circular betting spots with user icons and side bet bubbles (21+3 / PP).
//   • Silver padded rail.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';

export const TABLE_VIEW = { w: 1600, h: 900 };

// Ease a numeric prop for smooth transitions (e.g., shoe and discard rack animations)
function useSmoothed(target, ms = 900) {
  const [val, setVal] = useState(target);
  const valRef = useRef(target);
  
  useEffect(() => {
    valRef.current = val;
  }, [val]);

  useEffect(() => {
    const from = valRef.current;
    if (Math.abs(target - from) < 0.002) return;
    
    const t0 = performance.now();
    let raf;
    
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  
  return val;
}

// Geometry for wide Pragmatic-style framing
const CX = 800;
const FLAT_Y = 460;          // Dealer edge
const RX = 780;              // Very wide table width
const FELT_RY = 420;         // Deep table curve

// Bet spots laid out on a wide, flattened arc
// Includes rotation so spots angle toward the dealer
const SEAT_X_REL = [560, 380, 190, 0, -190, -380, -560];
const SPOT_RX = 640;
const SPOT_RY = 310;

const pct = (p) => ({ xPct: (p.x / TABLE_VIEW.w) * 100, yPct: (p.y / TABLE_VIEW.h) * 100 });

export const SEAT_ANCHORS = SEAT_X_REL.map((xr, i) => {
  const x = CX + xr;
  // Ellipse equation for Y position
  const y = FLAT_Y + SPOT_RY * Math.sqrt(Math.max(0, 1 - (xr / SPOT_RX) ** 2));
  
  // Calculate angle toward the dealer center (800, 400) for spot rotation
  const dx = 800 - x;
  const dy = 400 - y;
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;

  return {
    seat: i + 1,
    x, y, 
    rot: angle * 0.4, // Dampen rotation for better readability
    ...pct({ x, y }),
  };
});

export const DEALER_CARD_ANCHOR = pct({ x: 800, y: 550 });
export const SHOE_ANCHOR = pct({ x: 1250, y: 530 });

// Felt cubic approximation
const K = 0.552;
const feltPath = (rx, ry, dy = 0) =>
  `M ${CX - rx} ${FLAT_Y + dy} ` +
  `C ${CX - rx} ${FLAT_Y + K * ry + dy}, ${CX - K * rx} ${FLAT_Y + ry + dy}, ${CX} ${FLAT_Y + ry + dy} ` +
  `C ${CX + K * rx} ${FLAT_Y + ry + dy}, ${CX + rx} ${FLAT_Y + K * ry + dy}, ${CX + rx} ${FLAT_Y + dy}`;

const FELT = feltPath(RX, FELT_RY) + ' Z';
const RIM = feltPath(RX, FELT_RY, 20) + ' Z';           
const RAIL_ARC = feltPath(RX + 12, FELT_RY + 16);         

// Color Palette matched to the Pragmatic reference image
const THEMES = {
  teal: {
    feltIn: '#1ca0a1', feltMid: '#168789', feltOut: '#0e6466',
    railHi: '#ececec', railMid: '#a9a9a9', railLo: '#5b5b5b',
    railRim: '#333333', rim: '#090909',
    text: '#ffffff', textDim: '#ffffff', textGold: '#e8b958',
    ring: '#ffffff', spotFill: '#0d5d5e', spotInner: '#178183',
    sideText: '#ffffff',
    line: '#e8b958',
    bg: '#000000',
  }
};

// Minimalistic clear/acrylic shoe (Right side)
const Shoe = ({ fill = 0.85 }) => {
  const deckW = Math.max(12, 78 * fill);
  const x1 = 104 - deckW;
  const topY = (x) => 6 - (x + 56) * 0.2439;
  const botY = (x) => 44 - (x + 56) * 0.0854;
  
  return (
    <g transform="translate(1250,530) rotate(12) scale(0.75)">
      <ellipse cx="30" cy="52" rx="92" ry="12" fill="#000" opacity="0.33" />
      <path d="M -60 36 L 118 30 L 130 46 L -48 50 Z" fill="#cfcfcf" stroke="#999" strokeWidth="1.5" />
      <path 
        d={`M ${x1} ${topY(x1) + 3} L 104 ${topY(104) + 3} L 104 ${botY(104) - 3} L ${x1} ${botY(x1) - 3} Z`}
        fill="#fcfcfc" 
        stroke="#ddd" 
        strokeWidth="1"
      />
      <path d="M 108 -34 L 130 -22 L 130 42 L 108 30 Z" fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
      <path d="M -56 6 L 108 -34 L 108 30 L -56 44 Z" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" />
      <path d="M -56 6 L 108 -34 L 130 -22" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
      <path d="M -56 26 L -22 18 L -22 41 L -56 44 Z" fill="rgba(0,0,0,0.8)" />
    </g>
  );
};

// Minimalistic clear/acrylic discard rack (Left side)
const DiscardRack = ({ fill = 0.15 }) => {
  const h = Math.max(4, 44 * fill);
  
  return (
    <g transform="translate(350,530) rotate(-12) scale(0.75)">
      <ellipse cx="0" cy="52" rx="76" ry="12" fill="#000" opacity="0.33" />
      <path d="M -58 36 L 58 36 L 70 50 L -46 50 Z" fill="#cfcfcf" stroke="#999" strokeWidth="1.5" />
      <g>
        <path d={`M -44 ${34 - h} L 44 ${30 - h} L 56 ${42 - h} L -32 ${46 - h} Z`} fill="#fcfcfc" />
        <path d={`M -44 ${34 - h} L -44 34 L -32 46 L -32 ${46 - h} Z`} fill="#e0e0e0" />
        <path d={`M -32 ${46 - h} L 56 ${42 - h} L 56 42 L -32 46 Z`} fill="#ececec" />
      </g>
      <path d="M -46 -26 L 58 -30 L 58 40 L -46 44 Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />
      <path d="M -46 -26 L 58 -30" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" fill="none" />
    </g>
  );
};

// User Icon SVG 
const UserIcon = ({ opacity = 1 }) => (
  <g opacity={opacity} fill="#ffffff">
    <circle cx="0" cy="-6" r="6.5" />
    <path d="M -11 12 C -11 3, 11 3, 11 12 Z" />
  </g>
);

// Betting Spot (Main circle + PP / 21+3 Side bets attached)
const BetSpot = ({ x, y, rot, t }) => {
  const mainR = 26;
  const sideR = 12;

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
      {/* Outer shadow */}
      <circle cx="0" cy="0" r={mainR + 2} fill="rgba(0,0,0,0.15)" />
      
      {/* Main Spot Fill */}
      <circle cx="0" cy="0" r={mainR} fill={t.spotFill} stroke={t.ring} strokeWidth="1.5" />
      
      {/* Inner Icon */}
      <UserIcon opacity="0.9" />

      {/* 21+3 Left Side Bet */}
      <g transform="translate(-28, 20)">
        <circle cx="0" cy="0" r={sideR} fill={t.spotInner} stroke={t.ring} strokeWidth="1" />
        <text x="0" y="3" fill={t.sideText} fontSize="7" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="bold">21+3</text>
      </g>

      {/* PP Right Side Bet */}
      <g transform="translate(28, 20)">
        <circle cx="0" cy="0" r={sideR} fill={t.spotInner} stroke={t.ring} strokeWidth="1" />
        <text x="0" y="3" fill={t.sideText} fontSize="7" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="bold">PP</text>
      </g>
    </g>
  );
};

export const Table2D = ({ theme = 'teal', shoeFill = 0.85, discardFill = 0.15, className = '', style }) => {
  const t = THEMES[theme] || THEMES.teal;
  const smoothShoe = useSmoothed(shoeFill);
  const smoothDiscard = useSmoothed(discardFill);

  return (
    <svg 
      className={className} 
      style={style} 
      viewBox={`0 0 ${TABLE_VIEW.w} ${TABLE_VIEW.h}`}
      xmlns="http://www.w3.org/2000/svg" 
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id={`felt-${theme}`} cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor={t.feltIn} />
          <stop offset="60%" stopColor={t.feltMid} />
          <stop offset="100%" stopColor={t.feltOut} />
        </radialGradient>
        <linearGradient id={`rail-${theme}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.railHi} />
          <stop offset="50%" stopColor={t.railMid} />
          <stop offset="100%" stopColor={t.railLo} />
        </linearGradient>

        {/* Text Arcs matched to the flattened perspective */}
        <path id="arcBJ" d="M 350 630 Q 800 740 1250 630" fill="none" />
        <path id="arcSub" d="M 380 660 Q 800 770 1220 660" fill="none" />
        <path id="arcIns" d="M 450 710 Q 800 810 1150 710" fill="none" />
      </defs>

      {/* Table rim base */}
      <path d={RIM} fill={t.rim} />
      
      {/* Main Felt */}
      <path d={FELT} fill={`url(#felt-${theme})`} />

      {/* Inner Rail Shading (Depth) */}
      <path d={RAIL_ARC} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="25" style={{ filter: 'blur(8px)' }} />

      {/* Silver Padded Rail */}
      <path d={RAIL_ARC} fill="none" stroke={`url(#rail-${theme})`} strokeWidth="38" strokeLinecap="round" />
      <path d={RAIL_ARC} fill="none" stroke={t.railRim} strokeWidth="2" transform="translate(0,-18)" opacity="0.4" />

      {/* Top Dealer Flat Edge */}
      <path d={`M ${CX - RX} ${FLAT_Y} L ${CX + RX} ${FLAT_Y}`} stroke={`url(#rail-${theme})`} strokeWidth="20" />
      <path d={`M ${CX - RX} ${FLAT_Y - 9} L ${CX + RX} ${FLAT_Y - 9}`} stroke={t.railRim} strokeWidth="2" opacity="0.5" />

      {/* PRIVÉ LOUNGE Logo Box */}
      <g transform="translate(800, 520)">
        <rect x="-100" y="-15" width="200" height="30" rx="15" fill="none" stroke={t.line} strokeWidth="1.5" opacity="0.6"/>
        <text x="0" y="4" fill={t.textDim} fontSize="14" textAnchor="middle" fontFamily="'Cinzel', Georgia, serif" letterSpacing="3px">
          • PRIVÉ LOUNGE •
        </text>
      </g>

      {/* Main Typography */}
      <text fontFamily="'Cinzel', 'Times New Roman', serif" fontWeight="600" fill={t.text} opacity="0.95">
        <textPath href="#arcBJ" startOffset="50%" textAnchor="middle" style={{ fontSize: 36, letterSpacing: '2.5px' }}>
          BLACKJACK PAYS 3 TO 2
        </textPath>
      </text>
      
      <text fontFamily="Arial, Helvetica, sans-serif" fill={t.textDim} opacity="0.85">
        <textPath href="#arcSub" startOffset="50%" textAnchor="middle" style={{ fontSize: 16, letterSpacing: '0.5px' }}>
          Dealer must draw to 16 and stand on all 17s
        </textPath>
      </text>
      
      <text fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fill={t.textGold}>
        <textPath href="#arcIns" startOffset="50%" textAnchor="middle" style={{ fontSize: 20, letterSpacing: '1.5px' }}>
          INSURANCE PAYS 2 TO 1
        </textPath>
      </text>

      {/* Dealing Shoe & Discard Rack */}
      <Shoe fill={smoothShoe} />
      <DiscardRack fill={smoothDiscard} />

      {/* 7 Betting Spots */}
      {SEAT_ANCHORS.map((s) => (
        <BetSpot key={s.seat} x={s.x} y={s.y} rot={s.rot} t={t} />
      ))}
    </svg>
  );
};

export default function Table2DViewer() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#051111', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Table2D style={{ width: 'min(100vw, 177vh)', height: 'auto' }} />
    </div>
  );
}