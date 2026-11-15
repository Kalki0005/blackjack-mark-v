// One scripted round as an ORDERED EVENT LIST: the shape ROADMAP.md Phase 6
// says the engine should emit next to the snapshot. The presentation layer
// knows nothing about blackjack rules beyond adding up card values for the
// on-screen badges. Swap this array for a live socket stream and the same
// director plays a real game.
//
// Cards are rank+suit ('TH' = ten of hearts). The hole card has no identity
// until `hole_card_revealed`, exactly like a server that does not leak it.
export const SCRIPTED_ROUND = [
  { type: 'round_start', bets: [{ seat: 0, amount: 25 }, { seat: 2, amount: 50 }, { seat: 3, amount: 100 }, { seat: 4, amount: 15 }] },

  { type: 'card_dealt', to: 'seat', seat: 0, card: 'TS' },
  { type: 'card_dealt', to: 'seat', seat: 2, card: 'AH' },
  { type: 'card_dealt', to: 'seat', seat: 3, card: '9D' },
  { type: 'card_dealt', to: 'seat', seat: 4, card: 'TC' },
  { type: 'card_dealt', to: 'dealer', card: '6S' },
  { type: 'card_dealt', to: 'seat', seat: 0, card: '6H' },
  { type: 'card_dealt', to: 'seat', seat: 2, card: 'KS' },
  { type: 'card_dealt', to: 'seat', seat: 3, card: '2C' },
  { type: 'card_dealt', to: 'seat', seat: 4, card: '8D' },
  { type: 'card_dealt', to: 'dealer', faceDown: true },

  { type: 'hand_paid', seat: 2, result: 'blackjack', amount: 75 },

  { type: 'player_action', seat: 0, action: 'hit' },
  { type: 'card_dealt', to: 'seat', seat: 0, card: '9C' },
  { type: 'hand_paid', seat: 0, result: 'bust', amount: 0 },

  { type: 'player_action', seat: 3, action: 'hit' },
  { type: 'card_dealt', to: 'seat', seat: 3, card: '8H' },
  { type: 'player_action', seat: 3, action: 'stand' },
  { type: 'player_action', seat: 4, action: 'stand' },

  { type: 'hole_card_revealed', card: 'QD' },
  { type: 'card_dealt', to: 'dealer', card: '2H' },

  { type: 'hand_paid', seat: 3, result: 'win', amount: 100 },
  { type: 'hand_paid', seat: 4, result: 'push', amount: 0 },
  { type: 'round_end' },
]
