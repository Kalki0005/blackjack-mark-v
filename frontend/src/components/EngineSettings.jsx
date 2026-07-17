import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const DEFAULT_SETTINGS = {
  numDecks: 6,
  dealerHitsSoft17: false,
  countVisibility: 'always',
  showStrategyHints: true,
  showBustProb: true,
  showWinProb: true,
  dealSpeed: 'normal',
  audioEnabled: false,
  tableTheme: 'green',
}

function Row({ label, desc, children }) {
  return (
    <div className="pg-row">
      <div className="pg-row-text">
        <div className="text-white font-bold text-[13.5px]">{label}</div>
        <div className="lh-dim text-[11.5px] leading-relaxed mt-0.5">{desc}</div>
      </div>
      <div className="pg-row-ctrl">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} className={`pg-toggle ${on ? 'pg-toggle--on' : ''}`} role="switch" aria-checked={on}>
      <span className="pg-toggle-knob" />
    </button>
  )
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="pg-seg">
      {options.map(o => (
        <button key={o.val} onClick={() => onChange(o.val)} className={`pg-seg-opt ${value === o.val ? 'pg-seg-opt--on' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EngineSettings({ userProfile, onBack }) {
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bj_settings') || 'null') || DEFAULT_SETTINGS } catch { return DEFAULT_SETTINGS }
  })
  const [saveState, setSaveState] = useState('idle')

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/settings/${userProfile.username}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !cancelled) {
          setSettings(data)
          localStorage.setItem('bj_settings', JSON.stringify(data))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userProfile.username])

  const save = async (key, val) => {
    const next = { ...settings, [key]: val }
    setSettings(next)
    localStorage.setItem('bj_settings', JSON.stringify(next))
    setSaveState('saving')
    try {
      const res = await fetch(`${API_BASE}/api/settings/${userProfile.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) throw new Error('save failed')
      const saved = await res.json()
      setSettings(saved)
      localStorage.setItem('bj_settings', JSON.stringify(saved))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1400)
    } catch {
      setSaveState('offline')
    }
  }

  const saveText = {
    idle: 'Synced to your account',
    saving: 'Saving…',
    saved: '✓ Saved to your account',
    offline: 'Offline — saved locally',
  }[saveState]

  return (
    <div className="pg-screen">
      <div className="casino-bg" aria-hidden="true" />
      <div className="pg-shell pg-shell--narrow">
        <div className="pg-head">
          <button onClick={onBack} className="lh-back">← Menu</button>
          <div className="text-right">
            <h2 className="pg-title font-display gold-text">Engine Settings</h2>
            <p className={`pg-sub ${saveState === 'saved' ? 'text-emerald-300' : saveState === 'offline' ? 'text-amber-300' : ''}`}>{saveText}</p>
          </div>
        </div>

        <div className="lh-card">
          <div className="lh-kicker">Table</div>
          <Row label="Number of decks" desc="Shoe size for new tables. Fewer decks favour the player (and the counter).">
            <Segmented value={settings.numDecks} onChange={v => save('numDecks', v)}
              options={[1, 2, 4, 6, 8].map(n => ({ val: n, label: n }))} />
          </Row>
          <Row label="Dealer hits soft 17" desc="The nastier Vegas rule — adds ~0.2% to the house edge.">
            <Toggle on={!!settings.dealerHitsSoft17} onChange={v => save('dealerHitsSoft17', v)} />
          </Row>
          <Row label="Table theme" desc="Felt colour and matching studio ambiance.">
            <div className="pg-themes">
              {[['green', 'Emerald'], ['blue', 'Midnight']].map(([id, label]) => (
                <button key={id} onClick={() => save('tableTheme', id)}
                  className={`pg-theme pg-theme--${id} ${(settings.tableTheme || 'green') === id ? 'pg-theme--on' : ''}`}>
                  <span className="pg-theme-swatch" />
                  {label}
                </button>
              ))}
            </div>
          </Row>
        </div>

        <div className="lh-card">
          <div className="lh-kicker">Learner mode overlays</div>
          <Row label="Strategy hints" desc="Show the mathematically best move (and why) on your turn.">
            <Toggle on={settings.showStrategyHints !== false} onChange={v => save('showStrategyHints', v)} />
          </Row>
          <Row label="Bust probability" desc="Chance of busting if you hit, shown live.">
            <Toggle on={settings.showBustProb !== false} onChange={v => save('showBustProb', v)} />
          </Row>
          <Row label="Win probability" desc="Expected outcome distribution for standing.">
            <Toggle on={settings.showWinProb !== false} onChange={v => save('showWinProb', v)} />
          </Row>
          <Row label="Card count" desc="When the Hi-Lo running/true count HUD is visible.">
            <Segmented value={settings.countVisibility} onChange={v => save('countVisibility', v)}
              options={[{ val: 'always', label: 'Always' }, { val: 'hover', label: 'Hover' }, { val: 'hidden', label: 'Hidden' }]} />
          </Row>
        </div>

        <div className="lh-card">
          <div className="lh-kicker">Experience</div>
          <Row label="Deal speed" desc="Pace of card animations between actions.">
            <Segmented value={settings.dealSpeed} onChange={v => save('dealSpeed', v)}
              options={[{ val: 'fast', label: 'Fast' }, { val: 'normal', label: 'Normal' }, { val: 'slow', label: 'Cinematic' }]} />
          </Row>
          <Row label="Audio" desc="Chip clinks, card slides, win and bust cues.">
            <Toggle on={!!settings.audioEnabled} onChange={v => save('audioEnabled', v)} />
          </Row>
        </div>

        <p className="lh-note" style={{ maxWidth: 560 }}>
          Deck count and dealer rules apply to tables you create from now on — not to a round in progress.
          Everything here syncs to your account and follows you across devices.
        </p>
      </div>
    </div>
  )
}
