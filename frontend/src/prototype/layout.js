// Shared scene measurements (metres, Y up). Dealer stands at -Z facing +Z; the
// camera is a seated player at +Z. Seat 0 is first base (dealer's left = +X).
import * as THREE from 'three'

export const TABLE_Y = 1.02
export const FELT_R = 0.98
export const SEAT_COUNT = 5
export const CARD_W = 0.092
export const CARD_H = 0.129
export const CHIP_R = 0.024
export const CHIP_H = 0.0044

const seatAngle = (i) => THREE.MathUtils.degToRad(27 + i * 31.5)
const polar = (r, a, y = TABLE_Y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a))

export const cardSpot = (seat) => polar(0.5, seatAngle(seat))
export const betSpot = (seat) => polar(0.745, seatAngle(seat))
export const railSpot = (seat) => polar(1.02, seatAngle(seat))

export const DEALER_Z = -0.14
export const DEALER_CARD_ORIGIN = new THREE.Vector3(-0.1, TABLE_Y, 0.3)
export const DEALER_CARD_STEP = 0.1
export const SHOE_POS = new THREE.Vector3(0.66, TABLE_Y, 0.2)
export const SHOE_YAW = THREE.MathUtils.degToRad(35) // mouth points toward table centre
export const SHOE_MOUTH = new THREE.Vector3(0.575, TABLE_Y + 0.03, 0.26)
export const DISCARD_POS = new THREE.Vector3(-0.66, TABLE_Y, 0.2)
export const TRAY_POS = new THREE.Vector3(0, TABLE_Y, 0.1)
export const HAND_REST = {
  L: new THREE.Vector3(0.36, TABLE_Y + 0.012, 0.2),
  R: new THREE.Vector3(-0.36, TABLE_Y + 0.012, 0.2),
}
export const CAMERA_POS = new THREE.Vector3(0, 1.74, 2.08)
export const CAMERA_TARGET = new THREE.Vector3(0, 1.26, 0.1)
export const CAMERA_FOV = 38
