// The director turns an ordered event list into choreography: for every event
// it moves props along tweens and points the dealer's hands and eyes at them.
// Rule of thumb used throughout: THE PROP DRIVES, THE HAND FOLLOWS. A card or
// chip stack always reaches its exact spot; the hand tracks it as far as the
// arm can reach, which reads as a slide/pitch when the spot is out of range.
import * as THREE from 'three'
import { Timeline, ease } from './timeline.js'
import { makeCard, setCardFace, makeChipStack } from './props.js'
import {
  TABLE_Y, CHIP_H, cardSpot, betSpot, railSpot, DEALER_CARD_ORIGIN, DEALER_CARD_STEP,
  SHOE_MOUTH, SHOE_YAW, DISCARD_POS, TRAY_POS, HAND_REST, CAMERA_POS, SEAT_COUNT,
} from './layout.js'

const CARD_VALUE = { A: 11, K: 10, Q: 10, J: 10, T: 10 }
function handTotal(codes) {
  let total = 0, aces = 0
  for (const c of codes) {
    if (!c) continue
    total += CARD_VALUE[c[0]] ?? Number(c[0])
    if (c[0] === 'A') aces++
  }
  while (total > 21 && aces) { total -= 10; aces-- }
  return total
}

const LINES = {
  bets: 'Place your bets, please.',
  noMore: 'No more bets.',
  blackjack: 'Blackjack! Congratulations.',
  bust: 'Too many.',
  win: 'Winner.',
  push: 'Push.',
}

export class Director {
  constructor({ rig, sfx, onUi }) {
    this.rig = rig
    this.sfx = sfx
    this.onUi = onUi
    this.tl = new Timeline()
    this.group = new THREE.Group()
    this.focus = new THREE.Vector3(0, TABLE_Y, 0.3) // where the action is (camera nudges toward it)
    this.gen = 0
    this.handToken = { L: 0, R: 0 }
    this._blank()
  }

  _blank() {
    this.seats = Array.from({ length: SEAT_COUNT }, () => ({ cards: [], bet: null, amount: 0, status: '' }))
    this.dealer = { cards: [], revealed: true }
    this.caption = ''
    this.discardCount = 0
  }

  reset() {
    this.gen++
    this.tl.clear()
    this.group.clear()
    this._blank()
    this.rig.hands.L.tip.copy(HAND_REST.L)
    this.rig.hands.R.tip.copy(HAND_REST.R)
    this.rig.look.copy(CAMERA_POS)
    this._ui()
  }

  update(dt) {
    this.tl.update(dt)
  }

  async play(events, { loop = false } = {}) {
    this.reset()
    const gen = this.gen
    do {
      for (const ev of events) {
        await this.handle(ev)
        if (gen !== this.gen) return
      }
      await this.tl.wait(2.2)
      if (gen !== this.gen) return
    } while (loop)
  }

  // ── event dispatch ───────────────────────────────────────────────
  handle(ev) {
    switch (ev.type) {
      case 'round_start': return this.roundStart(ev)
      case 'card_dealt': return this.cardDealt(ev)
      case 'player_action': return this.playerAction(ev)
      case 'hole_card_revealed': return this.revealHole(ev)
      case 'hand_paid': return this.handPaid(ev)
      case 'round_end': return this.roundEnd(ev)
      default: console.warn('unknown event', ev)
    }
  }

  // ── helpers ──────────────────────────────────────────────────────
  _ui() {
    this.onUi?.({
      caption: this.caption,
      seats: this.seats.map((s) => ({
        total: s.cards.length ? handTotal(s.cards.map((c) => c.userData.code)) : null,
        status: s.status,
        amount: s.amount,
      })),
      dealer: { total: this.dealer.cards.length ? handTotal(this.dealer.cards.map((c) => c.userData.code)) : null },
    })
  }
  say(key) {
    this.caption = LINES[key]
    this.sfx.say(this.caption)
    this._ui()
    const gen = this.gen
    this.tl.wait(2.4).then(() => {
      if (gen === this.gen && this.caption === LINES[key]) { this.caption = ''; this._ui() }
    })
  }
  // Move a hand's fingertip target; a newer move for the same hand wins.
  moveHand(side, to, dur = 0.3, lift = 0.035) {
    const token = ++this.handToken[side]
    const tip = this.rig.hands[side].tip
    const from = tip.clone()
    return this.tl.tween(dur, (k) => {
      if (token !== this.handToken[side]) return
      tip.lerpVectors(from, to, k)
      tip.y += Math.sin(k * Math.PI) * lift
    })
  }
  // Hand follows a moving prop (call from that prop's tween).
  carry(side, pos, up = 0.012) {
    this.handToken[side]++
    this.rig.hands[side].tip.set(pos.x, pos.y + up, pos.z)
  }
  restHand(side, dur = 0.38) {
    return this.moveHand(side, HAND_REST[side], dur, 0.03)
  }
  lookAt(p) {
    this.rig.look.copy(p)
    this.focus.copy(p)
  }
  lookUp() {
    this.rig.look.copy(CAMERA_POS)
    this.focus.set(0, TABLE_Y, 0.3)
  }
  sideFor(p) {
    return p.x >= -0.05 ? 'L' : 'R'
  }

  // ── choreography ─────────────────────────────────────────────────
  async roundStart(ev) {
    this.say('bets')
    await this.tl.wait(0.5)
    // players push their bets in from the rail
    await Promise.all(ev.bets.map(async ({ seat, amount }, i) => {
      await this.tl.wait(i * 0.22)
      const stack = makeChipStack(amount)
      const from = railSpot(seat), to = betSpot(seat)
      stack.position.copy(from)
      this.group.add(stack)
      this.seats[seat].bet = stack
      this.seats[seat].amount = amount
      this.sfx.chips(2)
      await this.tl.tween(0.45, (k) => stack.position.lerpVectors(from, to, k), ease.out)
      this._ui()
    }))
    await this.tl.wait(0.5)
    this.say('noMore')
    // a small "table is closed" sweep of the right hand
    const a = new THREE.Vector3(-0.3, TABLE_Y + 0.05, 0.42), b = new THREE.Vector3(0.3, TABLE_Y + 0.05, 0.42)
    await this.moveHand('R', a, 0.35)
    await this.moveHand('R', b, 0.5, 0.02)
    this.restHand('R', 0.45)
    await this.tl.wait(0.35)
  }

  async cardDealt(ev) {
    const toDealer = ev.to === 'dealer'
    const pile = toDealer ? this.dealer.cards : this.seats[ev.seat].cards
    const n = pile.length
    const target = toDealer
      ? DEALER_CARD_ORIGIN.clone().add(new THREE.Vector3(n * DEALER_CARD_STEP, 0, 0))
      : cardSpot(ev.seat).add(new THREE.Vector3(n * 0.026, 0, -n * 0.022))
    target.y = TABLE_Y + 0.0012 + n * 0.0012
    const faceUp = !ev.faceDown

    const card = makeCard(ev.card)
    card.position.copy(SHOE_MOUTH)
    card.rotation.set(0, SHOE_YAW + Math.PI / 2, Math.PI)
    card.visible = false
    this.group.add(card)
    pile.push(card)
    if (toDealer && ev.faceDown) this.dealer.revealed = false

    // 1. left hand to the shoe
    this.lookAt(SHOE_MOUTH)
    await this.moveHand('L', SHOE_MOUTH, 0.2, 0.03)
    card.visible = true
    this.sfx.cardSlide()
    this.lookAt(target)

    // 2. draw the card out and carry it to its spot, turning it over on the way
    const from = SHOE_MOUTH.clone()
    const yaw0 = card.rotation.y
    const dist = from.distanceTo(target)
    await this.tl.tween(0.3 + dist * 0.28, (k) => {
      card.position.lerpVectors(from, target, k)
      const arc = Math.sin(k * Math.PI)
      card.position.y += arc * (faceUp ? 0.06 : 0.02)
      card.rotation.y = yaw0 * (1 - ease.out(Math.min(1, k * 1.6)))
      if (faceUp) card.rotation.z = Math.PI * (1 - ease.inOut(THREE.MathUtils.clamp((k - 0.2) / 0.55, 0, 1)))
      this.carry('L', card.position)
    }, ease.inOut)
    this.sfx.cardLand()
    this._ui()
    this.restHand('L')
    await this.tl.wait(0.1)
  }

  async playerAction(ev) {
    const seat = this.seats[ev.seat]
    seat.status = ev.action.toUpperCase()
    this.lookAt(cardSpot(ev.seat).setY(TABLE_Y + 0.25))
    this._ui()
    if (ev.action === 'hit') this.sfx.knock()
    await this.tl.wait(0.75)
    if (ev.action === 'stand') this.rig.nod = 1
    await this.tl.wait(0.25)
    seat.status = ''
    this._ui()
  }

  async revealHole(ev) {
    const card = this.dealer.cards.find((c) => !c.userData.code)
    if (!card) return
    const p = card.position.clone()
    this.lookAt(p)
    await this.moveHand('R', p.clone().add(new THREE.Vector3(-0.03, 0.01, 0)), 0.35)
    setCardFace(card, ev.card)
    this.sfx.cardFlip()
    await this.tl.tween(0.42, (k) => {
      card.position.y = p.y + Math.sin(k * Math.PI) * 0.065
      card.rotation.z = Math.PI * (1 - k)
      this.carry('R', card.position)
    })
    card.position.copy(p)
    this.dealer.revealed = true
    this.sfx.cardLand()
    this._ui()
    this.restHand('R')
    await this.tl.wait(0.55)
  }

  async handPaid(ev) {
    const seat = this.seats[ev.seat]
    const bet = seat.bet
    const bp = betSpot(ev.seat)
    seat.status = ev.result.toUpperCase()
    this._ui()
    this.lookAt(bp)

    if (ev.result === 'bust' || ev.result === 'lose') {
      if (ev.result === 'bust') this.say('bust')
      const side = this.sideFor(bp)
      // take the chips
      await this.moveHand(side, bp.clone().setY(TABLE_Y + CHIP_H * 3), 0.34)
      this.sfx.chips(3)
      const from = bet.position.clone(), to = TRAY_POS.clone().setY(TABLE_Y + 0.03)
      await this.tl.tween(0.5, (k) => {
        bet.position.lerpVectors(from, to, k)
        bet.scale.setScalar(1 - 0.5 * Math.max(0, k - 0.7) / 0.3)
        this.carry(side, bet.position, 0.02)
      })
      this.group.remove(bet)
      seat.bet = null
      seat.amount = 0
      this.sfx.chips(4)
      this.restHand(side)
      // and the cards
      await this.sweepCards([seat.cards])
      seat.cards = []
      seat.status = ''
      this._ui()
      return
    }

    if (ev.result === 'push') {
      this.say('push')
      const side = this.sideFor(bp)
      const tap = cardSpot(ev.seat).add(new THREE.Vector3(0, 0.004, 0.11))
      for (let i = 0; i < 2; i++) {
        await this.moveHand(side, tap, i ? 0.14 : 0.3, 0.05)
        this.sfx.knock()
      }
      this.restHand(side)
      await this.tl.wait(0.5)
      return
    }

    // win / blackjack: fetch a stack from the tray and set it beside the bet
    this.say(ev.result === 'blackjack' ? 'blackjack' : 'win')
    if (ev.result === 'blackjack') this.rig.nod = 1
    const side = this.sideFor(bp)
    const trayTop = TRAY_POS.clone().add(new THREE.Vector3(side === 'L' ? 0.12 : -0.12, 0.035, 0.02))
    await this.moveHand(side, trayTop, 0.32)
    this.sfx.chips(3)
    const pay = makeChipStack(ev.amount)
    pay.position.copy(trayTop).setY(TABLE_Y + 0.02)
    this.group.add(pay)
    const from = pay.position.clone()
    const to = bp.clone().add(new THREE.Vector3(bp.x > 0.05 ? -0.062 : 0.062, 0, -0.012))
    await this.tl.tween(0.6, (k) => {
      pay.position.lerpVectors(from, to, k)
      pay.position.y += Math.sin(k * Math.PI) * 0.03
      this.carry(side, pay.position, CHIP_H * pay.children.length + 0.012)
    })
    this.sfx.chips(5)
    seat.amount += ev.amount
    this._ui()
    this.restHand(side)
    this.lookUp()
    await this.tl.wait(0.7)
    // the player takes the winnings
    const rail = railSpot(ev.seat)
    const stacks = [bet, pay].map((s) => ({ s, from: s.position.clone() }))
    this.sfx.chips(3)
    this.tl.tween(0.5, (k) => {
      for (const { s, from } of stacks) {
        s.position.lerpVectors(from, rail, k)
        s.scale.setScalar(1 - k * 0.6)
      }
    }, ease.in).then(() => stacks.forEach(({ s }) => this.group.remove(s)))
    seat.bet = null
    await this.tl.wait(0.3)
    seat.amount = 0
    seat.status = ev.result === 'blackjack' ? 'BLACKJACK' : ''
    this._ui()
  }

  // Right hand gathers piles of cards and drops them in the discard holder.
  async sweepCards(piles) {
    piles = piles.filter((p) => p.length)
    if (!piles.length) return
    const held = []
    const carrier = new THREE.Vector3().copy(this.rig.hands.R.tip)
    const follow = () => {
      held.forEach((c, i) => c.position.set(carrier.x, TABLE_Y + 0.004 + i * 0.0012, carrier.z))
      this.carry('R', carrier, 0.006 + held.length * 0.0012)
    }
    const go = async (to, dur) => {
      const from = carrier.clone()
      await this.tl.tween(dur, (k) => {
        carrier.lerpVectors(from, to, k)
        carrier.y = TABLE_Y + 0.01 + Math.sin(k * Math.PI) * 0.03
        follow()
      })
    }
    for (const pile of piles) {
      const at = pile[0].position.clone()
      this.lookAt(at)
      await go(at, 0.22 + carrier.distanceTo(at) * 0.35)
      this.sfx.cardSlide()
      // square the pile up, face down, under the hand
      const starts = pile.map((c) => ({ c, p: c.position.clone(), rz: c.rotation.z }))
      await this.tl.tween(0.2, (k) => {
        for (const { c, p, rz } of starts) {
          c.position.lerpVectors(p, at, k)
          c.position.y = at.y + Math.sin(k * Math.PI) * 0.04
          c.rotation.z = rz + (Math.PI - rz) * k
        }
      })
      held.push(...pile)
    }
    const drop = DISCARD_POS.clone()
    this.lookAt(drop)
    await go(drop, 0.3 + carrier.distanceTo(drop) * 0.35)
    this.sfx.cardLand()
    held.forEach((c) => {
      c.position.set(drop.x, TABLE_Y + 0.008 + this.discardCount++ * 0.0012, drop.z)
      c.rotation.y = -0.3
    })
    this.restHand('R')
    this.lookUp()
  }

  async roundEnd() {
    await this.tl.wait(0.4)
    const piles = this.seats.map((s) => s.cards)
    piles.push(this.dealer.cards)
    await this.sweepCards(piles)
    for (const s of this.seats) {
      s.cards = []
      s.status = ''
      if (s.bet) { this.group.remove(s.bet); s.bet = null; s.amount = 0 }
    }
    this.dealer.cards = []
    this._ui()
    this.lookUp()
  }
}
