import { CardRow } from './PlayingCard'
import { ChipStack } from './CasinoChip'

const QUICK_ACTIONS = [
  { id: 'double', sym: '2×', cls: 'double' },
  { id: 'hit', sym: '+', cls: 'hit' },
  { id: 'stand', sym: '–', cls: 'stand' },
  { id: 'split', sym: '⑂', cls: 'split' },
]

// A seat pinned onto a betting spot PRINTED on the felt. This widget draws no
// circles of its own — chips land directly on the felt's ellipse; an invisible
// ellipse is the click target, with glow states for open/selected/active.
// Side bets (PP / 21+3) are rendered by the game as separate overlays on their
// own printed ellipses.
export function SeatSpot({ seat, isMe, activeHandIndex, isSelected, onSelect, selectable,
                          gameState, pendingAction, onQuickAction, betTrail = null,
                          dealOrder = 0, dealCount = 0, dealStep = 0.16, isBot = false }) {
  const isActive = seat.isActiveTurn
  const isEmpty = !seat.isOccupied
  const hands = seat.hands || []

  // Aggregate outcome once the round is resolved.
  const resolved = hands.length > 0 && hands.every(h => h.outcome != null)
  const totalReturn = hands.reduce((sum, h) => sum + (h.payout || 0), 0)
  const totalBet = hands.reduce((sum, h) => sum + (h.bet || 0), 0) || seat.bet
  let mainResult = null
  if (resolved) {
    if (hands.some(h => h.outcome === 'win' || h.outcome === 'blackjack')) mainResult = 'win'
    else if (hands.every(h => h.outcome === 'push')) mainResult = 'push'
    else mainResult = 'loss'
  }

  const mainAmount = resolved ? totalReturn : (hands.length > 0 ? totalBet : seat.bet)

  // Per-seat quick actions (queue while waiting, or play live on your turn).
  const turnHand = isActive ? hands[activeHandIndex] : hands[0]
  const showQuick = isMe && gameState === 'playing' && hands.length > 0 && !resolved
  const avail = {
    hit: turnHand?.canHit !== false,
    stand: true,
    double: !!turnHand?.canDouble,
    split: !!turnHand?.canSplit,
  }

  return (
    <div className={`seat-spot ${isActive ? 'seat-spot--active' : ''}`}
      onClick={selectable && onSelect ? onSelect : undefined}
      style={{ cursor: selectable ? 'pointer' : 'default' }}>

      {hands.length > 0 && (
        <div className="seat-hands seat-hands--float">
          {hands.map((h, hIdx) => {
            const isThisHand = isActive && hIdx === activeHandIndex
            const badgeClass = h.outcome === 'win' || h.outcome === 'blackjack'
              ? 'hand-badge--win'
              : h.outcome === 'loss'
                ? 'hand-badge--bust'
                : h.isBlackjack
                  ? 'hand-badge--bj'
                  : h.isBust
                    ? 'hand-badge--bust'
                    : isThisHand ? 'hand-badge--active' : ''
            return (
              <div key={hIdx} className={`seat-hand ${isThisHand ? 'seat-hand--turn' : ''} ${h.outcome === 'loss' ? 'seat-hand--dim' : ''}`}>
                <CardRow cards={h.cards} size="sm" dealAnim
                  dealOrder={dealOrder} dealCount={dealCount} dealStep={dealStep} />
                <span className={`hand-badge ${badgeClass}`}>
                  {h.isBlackjack ? 'BJ' : h.total}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* invisible ellipse over the printed spot: click target + chips + glow */}
      <div className={`spot-zone ${isActive ? 'spot-zone--active' : ''} ${isSelected ? 'spot-zone--selected' : ''} ${isEmpty && selectable ? 'spot-zone--open' : ''}`}>
        {mainAmount > 0 && (
          <ChipStack amount={mainAmount} result={mainResult} originalBet={totalBet}
            chips={isMe && !resolved ? betTrail : null} maxChips={isMe && !resolved && betTrail ? 8 : 5} />
        )}
      </div>

      {!isEmpty && (
        <div className={`seat-nameplate ${isActive ? 'seat-nameplate--active' : ''}`}>
          {isBot && <span className="seat-bot-tag">BOT</span>}
          {seat.playerName?.slice(0, 10)}{isMe ? ' ●' : ''}
        </div>
      )}

      {showQuick && (
        <div className="seat-actions" onClick={e => e.stopPropagation()}>
          {QUICK_ACTIONS.map(a => {
            const enabled = avail[a.id]
            const on = pendingAction === a.id
            return (
              <button key={a.id} disabled={!enabled}
                onClick={() => enabled && onQuickAction(seat.number, a.id)}
                title={a.id}
                className={`seat-action-btn seat-action-btn--${a.cls} ${on ? 'seat-action-btn--on' : ''} ${!enabled ? 'seat-action-btn--off' : ''}`}>
                {a.sym}
              </button>
            )
          })}
        </div>
      )}

      {isMe && pendingAction && !isActive && gameState === 'playing' && (
        <div className="seat-queued">queued: {pendingAction}</div>
      )}
    </div>
  )
}
