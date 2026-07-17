import { CardRow } from './PlayingCard'

function Croupier({ dealing }) {
  return (
    <svg viewBox="0 0 140 130" className={`croupier ${dealing ? 'croupier--dealing' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id="cSpot" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#1b2740" />
          <stop offset="100%" stopColor="#080b12" />
        </radialGradient>
        <linearGradient id="cSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3d3b6" />
          <stop offset="100%" stopColor="#d9a87f" />
        </linearGradient>
        <linearGradient id="cSuit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171b26" />
          <stop offset="100%" stopColor="#05070b" />
        </linearGradient>
      </defs>

      {/* spotlight halo */}
      <ellipse cx="70" cy="60" rx="62" ry="58" fill="url(#cSpot)" opacity="0.55" />

      {/* dealing arms */}
      <g className="croupier-arms">
        <path d="M34 118 Q46 86 64 80 L70 92 Q52 100 46 122 Z" fill="url(#cSuit)" />
        <path d="M106 118 Q94 86 76 80 L70 92 Q88 100 94 122 Z" fill="url(#cSuit)" />
        <ellipse className="croupier-hand" cx="66" cy="82" rx="7" ry="5" fill="url(#cSkin)" />
        <ellipse className="croupier-hand" cx="74" cy="82" rx="7" ry="5" fill="url(#cSkin)" />
      </g>

      {/* body / suit */}
      <g className="croupier-body">
        <path d="M70 60 Q40 64 30 122 L110 122 Q100 64 70 60 Z" fill="url(#cSuit)" />
        {/* lapels */}
        <path d="M70 64 L56 120 L66 120 L70 78 Z" fill="#20283a" />
        <path d="M70 64 L84 120 L74 120 L70 78 Z" fill="#20283a" />
        {/* shirt + bowtie */}
        <path d="M70 66 L64 96 L76 96 Z" fill="#f4f1e9" />
        <path d="M64 72 L70 76 L64 80 Z M76 72 L70 76 L76 80 Z" fill="#c01f3a" />
        <circle cx="70" cy="76" r="1.6" fill="#8a1226" />

        {/* neck */}
        <rect x="63" y="52" width="14" height="14" rx="5" fill="#d9a87f" />

        {/* head */}
        <g className="croupier-head">
          <ellipse cx="70" cy="38" rx="18" ry="20" fill="url(#cSkin)" />
          {/* hair */}
          <path d="M51 38 Q50 16 70 15 Q90 16 89 38 Q86 26 70 25 Q54 26 51 38 Z" fill="#241a12" />
          <path d="M51 38 Q49 30 52 27 L55 40 Z M89 38 Q91 30 88 27 L85 40 Z" fill="#241a12" />
          {/* ears */}
          <circle cx="52" cy="40" r="3.2" fill="#d9a87f" />
          <circle cx="88" cy="40" r="3.2" fill="#d9a87f" />
          {/* eyes */}
          <g className="croupier-eyes" fill="#2a1d16">
            <ellipse cx="62" cy="38" rx="2.4" ry="2.8" />
            <ellipse cx="78" cy="38" rx="2.4" ry="2.8" />
          </g>
          {/* brows */}
          <path d="M58 33 Q62 31 66 33" stroke="#2a1d16" strokeWidth="1.3" fill="none" />
          <path d="M74 33 Q78 31 82 33" stroke="#2a1d16" strokeWidth="1.3" fill="none" />
          {/* smile */}
          <path d="M63 47 Q70 51 77 47" stroke="#b06a4a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}

export function DealerArea({ dealer, hideHole }) {
  const hasCards = dealer.cards?.length > 0

  return (
    <div className="dealer-area">
      <div className="dealer-stage">
        <Croupier dealing={hasCards && hideHole} />
      </div>

      {hasCards && (
        <div className="dealer-hand-wrap">
          <CardRow cards={dealer.cards} hideSecond={hideHole} size="md" dealAnim />
          <div className="dealer-total-badge">
            {hideHole ? (
              <span className="text-white/60">Showing {dealer.cards[0]}</span>
            ) : (
              <span className={dealer.total > 21 ? 'text-red-400' : 'text-white'}>
                {dealer.total > 21 ? `Bust ${dealer.total}` : dealer.total}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
