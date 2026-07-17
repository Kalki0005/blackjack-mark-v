import { useEffect, useMemo, useState } from 'react'
import { MistakeCard } from './Assessment'
import { classifyMistake, accuracyGrade, SEVERITY_META } from '../lib/strategy'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function Ring({ pct, label, color, sub }) {
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <div className="assess-ring-wrap">
      <svg viewBox="0 0 128 128" className="assess-ring">
        <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, pct) / 100)}
          transform="rotate(-90 64 64)"
          className="assess-ring-arc" />
        <text x="64" y="60" textAnchor="middle" className="assess-ring-pct" fill="#fff">{pct.toFixed(0)}%</text>
        <text x="64" y="78" textAnchor="middle" className="assess-ring-sub" fill="rgba(255,255,255,0.45)">{label}</text>
      </svg>
      {sub && <div className="assess-grade" style={{ color }}>{sub}</div>}
    </div>
  )
}

export function PlayerStats({ userProfile, onBack }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('all') // all | blunder | mistake | inaccuracy
  const PER_PAGE = 6

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/stats/${userProfile.username}`)
      .then(r => { if (!r.ok) throw new Error('Could not load your statistics.'); return r.json() })
      .then(d => { if (!cancelled) setStats(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [userProfile.username])

  const mistakes = useMemo(() => {
    const list = [...(stats?.mistakes_history || [])].reverse() // newest first
    return list.map(m => ({ ...m, _sev: classifyMistake(m) }))
  }, [stats])

  const sevCounts = useMemo(() => {
    const c = { blunder: 0, mistake: 0, inaccuracy: 0 }
    mistakes.forEach(m => { c[m._sev] += 1 })
    return c
  }, [mistakes])

  const filtered = filter === 'all' ? mistakes : mistakes.filter(m => m._sev === filter)
  const pageCount = Math.ceil(filtered.length / PER_PAGE)
  const pageItems = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  if (error) return (
    <div className="pg-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="pg-shell items-center justify-center flex">
        <div className="lh-card text-center">
          <p className="lh-p">{error}</p>
          <button onClick={onBack} className="lh-btn lh-btn--gold">← Back to Menu</button>
        </div>
      </div>
    </div>
  )

  if (!stats) return (
    <div className="pg-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="pg-shell flex items-center justify-center">
        <div className="text-white/50 font-display tracking-[0.3em] uppercase animate-pulse">Dealing your numbers…</div>
      </div>
    </div>
  )

  const totalHands = (stats.hands_won || 0) + (stats.hands_lost || 0) + (stats.hands_push || 0)
  const winRate = totalHands > 0 ? (stats.hands_won / totalHands) * 100 : 0
  const penalty = sevCounts.blunder * 1 + sevCounts.mistake * 0.6 + sevCounts.inaccuracy * 0.25
  const accuracy = totalHands > 0 ? Math.max(0, ((totalHands - penalty) / totalHands) * 100) : 100
  const grade = accuracyGrade(accuracy)
  const net = stats.total_earned || 0

  const dist = [
    { k: 'Won', v: stats.hands_won || 0, c: '#5be39a' },
    { k: 'Lost', v: stats.hands_lost || 0, c: '#f87171' },
    { k: 'Push', v: stats.hands_push || 0, c: '#94a3b8' },
  ]

  return (
    <div className="pg-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="pg-shell">
        <div className="pg-head">
          <button onClick={onBack} className="lh-back">← Menu</button>
          <div className="text-right">
            <h2 className="pg-title font-display gold-text">Player Statistics</h2>
            <p className="pg-sub">{userProfile.username} · lifetime record</p>
          </div>
        </div>

        {/* Hero: rings + bankroll */}
        <div className="pg-hero">
          <div className="lh-card pg-hero-card">
            <Ring pct={winRate} label="WIN RATE" color={winRate >= 45 ? '#5be39a' : '#f5b042'} />
            <div className="pg-hero-meta">
              <div className="pg-big font-display">{totalHands.toLocaleString()}</div>
              <div className="pg-lbl">hands played</div>
            </div>
          </div>
          <div className="lh-card pg-hero-card">
            <Ring pct={accuracy} label="ACCURACY" color={grade.color} sub={grade.label} />
            <div className="pg-hero-meta">
              <div className="pg-big font-display">{(stats.mistakes_count || 0).toLocaleString()}</div>
              <div className="pg-lbl">deviations logged</div>
            </div>
          </div>
          <div className="lh-card pg-hero-card pg-hero-card--money">
            <div>
              <div className="pg-lbl">Net earned · all time</div>
              <div className={`pg-money font-display ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="pg-lbl">Current balance</div>
              <div className="pg-money font-display gold-text">${(userProfile.balance || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="pg-lbl">Blackjacks hit</div>
              <div className="pg-money font-display text-white">{stats.blackjacks || 0}</div>
            </div>
          </div>
        </div>

        {/* Outcome distribution */}
        <div className="lh-card">
          <div className="lh-kicker">Outcome distribution</div>
          {totalHands === 0 ? (
            <p className="lh-p mb-0">No hands on record yet — go play a shoe and come back.</p>
          ) : (
            <>
              <div className="pg-dist">
                {dist.map(d => d.v > 0 && (
                  <div key={d.k} className="pg-dist-seg" style={{ width: `${(d.v / totalHands) * 100}%`, background: d.c }} />
                ))}
              </div>
              <div className="pg-dist-legend">
                {dist.map(d => (
                  <span key={d.k} className="pg-dist-item">
                    <span className="pg-dot" style={{ background: d.c }} />
                    <b style={{ color: d.c }}>{d.v.toLocaleString()}</b> {d.k} · {totalHands ? Math.round((d.v / totalHands) * 100) : 0}%
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Mistake history */}
        <div className="lh-card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="lh-kicker" style={{ marginBottom: 0 }}>Strategy deviations ({mistakes.length})</div>
            {(stats.lucky_mistakes_count || 0) > 0 && (
              <span className="assess-outcome assess-outcome--lucky">{stats.lucky_mistakes_count} won despite the mistake</span>
            )}
          </div>
          {mistakes.length > 0 && (
            <div className="pg-filters">
              {['all', 'blunder', 'mistake', 'inaccuracy'].map(f => (
                <button key={f} onClick={() => { setFilter(f); setPage(0) }}
                  className={`pg-filter ${filter === f ? 'pg-filter--on' : ''}`}
                  style={f !== 'all' && filter === f ? { color: SEVERITY_META[f].color, borderColor: SEVERITY_META[f].border } : {}}>
                  {f === 'all' ? 'All' : `${{ blunder: 'Blunders', mistake: 'Mistakes', inaccuracy: 'Inaccuracies' }[f]} · ${sevCounts[f]}`}
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="assess-perfect">
              <div className="assess-perfect-icon">♠</div>
              <div className="font-display assess-perfect-title">
                {mistakes.length === 0 ? 'Clean Sheet' : 'None in this category'}
              </div>
              {mistakes.length === 0 && <p>No recorded deviations from basic strategy. The house hates you already.</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {pageItems.map((m, i) => <MistakeCard key={`${page}-${i}`} m={m} index={-1} />)}
              </div>
              {pageCount > 1 && (
                <div className="flex justify-center items-center gap-3 mt-4">
                  <button className="lh-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <span className="text-white/45 text-xs font-bold">{page + 1} / {pageCount}</span>
                  <button className="lh-btn" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
