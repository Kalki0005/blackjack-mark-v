import { useMemo, useState } from 'react'
import { PlayingCard } from './casino/PlayingCard'
import { classifyMistake, explainMistake, accuracyGrade, SEVERITY_META, upcardLabel } from '../lib/strategy'

// Animated accuracy ring (SVG, chess.com-style)
function AccuracyRing({ pct }) {
  const R = 52
  const C = 2 * Math.PI * R
  const grade = accuracyGrade(pct)
  return (
    <div className="assess-ring-wrap">
      <svg viewBox="0 0 128 128" className="assess-ring">
        <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle cx="64" cy="64" r={R} fill="none" stroke={grade.color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          transform="rotate(-90 64 64)"
          className="assess-ring-arc" />
        <text x="64" y="60" textAnchor="middle" className="assess-ring-pct" fill="#fff">{pct.toFixed(0)}%</text>
        <text x="64" y="78" textAnchor="middle" className="assess-ring-sub" fill="rgba(255,255,255,0.45)">ACCURACY</text>
      </svg>
      <div className="assess-grade" style={{ color: grade.color }}>{grade.label}</div>
    </div>
  )
}

const ACTION_COLOR = { HIT: '#5be39a', STAND: '#ff8585', DOUBLE: '#f5b042', SPLIT: '#7fb2ff' }

export function MistakeCard({ m, index }) {
  const [open, setOpen] = useState(index === 0)
  const sev = SEVERITY_META[classifyMistake(m)]
  const won = m.hand_outcome === 'WIN' || m.hand_outcome === 'BLACKJACK'
  const push = m.hand_outcome === 'PUSH'
  return (
    <div className="assess-mistake" style={{ background: sev.bg, borderColor: sev.border }}>
      <button className="assess-mistake-head" onClick={() => setOpen(o => !o)}>
        <span className="assess-sev-icon" style={{ color: sev.color, borderColor: sev.border }}>{sev.icon}</span>
        <span className="assess-mistake-title">
          {m.is_soft ? 'Soft' : m.is_pair ? 'Pair —' : 'Hard'} {m.is_pair && m.cards ? `${m.cards.map(c => c.slice(0, -1)).join(' & ')}` : m.player_total}
          <span className="assess-vs"> vs dealer {upcardLabel(m.dealer_upcard)}</span>
        </span>
        <span className="assess-sev-label" style={{ color: sev.color }}>{sev.label}</span>
        <span className={`assess-outcome ${won ? 'assess-outcome--lucky' : push ? 'assess-outcome--push' : 'assess-outcome--lost'}`}>
          {won ? 'Won anyway' : push ? 'Pushed' : 'Lost'}
        </span>
        <span className="assess-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="assess-mistake-body">
          <div className="assess-scene">
            {m.cards?.length > 0 && (
              <div className="assess-scene-hand">
                <div className="assess-scene-lbl">Your hand</div>
                <div className="flex">
                  {m.cards.map((c, i) => (
                    <PlayingCard key={`${c}-${i}`} cardStr={c} size="sm" style={{ marginLeft: i === 0 ? 0 : '-12px', zIndex: i }} />
                  ))}
                </div>
              </div>
            )}
            <div className="assess-scene-hand">
              <div className="assess-scene-lbl">Dealer showed</div>
              <PlayingCard cardStr={m.dealer_upcard} size="sm" />
            </div>
            <div className="assess-plays">
              <div className="assess-play">
                <span className="assess-scene-lbl">You played</span>
                <span className="assess-play-val" style={{ color: ACTION_COLOR[m.user_action] || '#fff' }}>{m.user_action}</span>
              </div>
              <div className="assess-play">
                <span className="assess-scene-lbl">Best move</span>
                <span className="assess-play-val assess-play-val--best">{m.recommended_action}</span>
              </div>
            </div>
          </div>
          <p className="assess-why">{explainMistake(m)}</p>
          {won && (
            <p className="assess-luck">
              This hand won anyway — that's variance, not strategy. Over thousands of hands this play costs you money.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Chess.com-style session review.
 * review: { hands, wins, losses, pushes, blackjacks, net, mistakes: [...] }
 * mode: 'shoe' (cut card reached) | 'exit' (leaving the table)
 */
export function AssessmentOverlay({ review, mode = 'exit', onClose, closeLabel }) {
  const { hands, wins, losses, pushes, blackjacks, net, mistakes } = review

  const counts = useMemo(() => {
    const c = { blunder: 0, mistake: 0, inaccuracy: 0 }
    mistakes.forEach(m => { c[classifyMistake(m)] += 1 })
    return c
  }, [mistakes])

  // Weighted accuracy over hands played (a blunder hurts more than an inaccuracy).
  const penalty = counts.blunder * 1 + counts.mistake * 0.6 + counts.inaccuracy * 0.25
  const accuracy = hands > 0 ? Math.max(0, ((hands - penalty) / hands) * 100) : 100
  const lucky = mistakes.filter(m => m.hand_outcome === 'WIN' || m.hand_outcome === 'BLACKJACK').length

  return (
    <div className="assess-backdrop">
      <div className="assess-panel">
        <div className="assess-header">
          <div>
            <div className="panel-section-title">{mode === 'shoe' ? 'Cut card reached · shoe complete' : 'Table session'}</div>
            <div className="assess-title font-display">{mode === 'shoe' ? 'Shoe Review' : 'Game Review'}</div>
          </div>
          <AccuracyRing pct={accuracy} />
        </div>

        {/* KPI strip */}
        <div className="assess-kpis">
          <div className="assess-kpi"><span className="assess-kpi-val">{hands}</span><span className="assess-kpi-lbl">Hands</span></div>
          <div className="assess-kpi">
            <span className="assess-kpi-val">
              <b style={{ color: '#5be39a' }}>{wins}</b>–<b style={{ color: '#ff8585' }}>{losses}</b>–<b style={{ color: '#cbd5e1' }}>{pushes}</b>
            </span>
            <span className="assess-kpi-lbl">W–L–P</span>
          </div>
          <div className="assess-kpi"><span className="assess-kpi-val" style={{ color: '#e8d48b' }}>{blackjacks}</span><span className="assess-kpi-lbl">Blackjacks</span></div>
          <div className="assess-kpi">
            <span className="assess-kpi-val" style={{ color: net >= 0 ? '#5be39a' : '#ff8585' }}>
              {net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}
            </span>
            <span className="assess-kpi-lbl">Net</span>
          </div>
        </div>

        {/* Severity summary */}
        <div className="assess-sev-row">
          {['blunder', 'mistake', 'inaccuracy'].map(k => (
            <div key={k} className="assess-sev-chip" style={{ borderColor: SEVERITY_META[k].border, opacity: counts[k] ? 1 : 0.35 }}>
              <span className="assess-sev-icon" style={{ color: SEVERITY_META[k].color, borderColor: SEVERITY_META[k].border }}>{SEVERITY_META[k].icon}</span>
              <b style={{ color: SEVERITY_META[k].color }}>{counts[k]}</b>
              <span>{SEVERITY_META[k].label}{counts[k] === 1 ? '' : 's'}</span>
            </div>
          ))}
          {lucky > 0 && (
            <div className="assess-sev-chip" style={{ borderColor: 'rgba(201,162,39,0.4)' }}>
              <b style={{ color: '#e8d48b' }}>{lucky}</b><span>won despite the mistake</span>
            </div>
          )}
        </div>

        {/* Mistake list / perfect state */}
        <div className="assess-list">
          {mistakes.length === 0 ? (
            <div className="assess-perfect">
              <div className="assess-perfect-icon">♠</div>
              <div className="font-display assess-perfect-title">Flawless Strategy</div>
              <p>Every decision matched basic strategy. The cards decide the rest — you played the long game perfectly.</p>
            </div>
          ) : (
            mistakes.map((m, i) => <MistakeCard key={i} m={m} index={i} />)
          )}
        </div>

        <button onClick={onClose} className="action-btn action-btn--deal w-full py-3.5 mt-4">
          {closeLabel || (mode === 'shoe' ? 'Continue Playing' : 'Back to Lobby')}
        </button>
      </div>
    </div>
  )
}
