// Procedural dealer animation on top of the 21-bone rig in dealer_animated.glb.
//
// The baked clips in that file are not used (see PROTOTYPE_VERDICT.md): the
// dealer has to reach a different point on the table for every card, so each
// arm is driven by two-bone IK toward a fingertip target, and the torso leans
// and twists to extend the reach. Breathing, sway, head-look and blinking are
// layered on top. Everything is stateless per frame: reset to the bind pose,
// then apply world-space rotations.
import * as THREE from 'three'
import { HAND_REST, TABLE_Y } from './layout.js'

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3()
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion()
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1)
const DOWN = new THREE.Vector3(0, -1, 0)
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt))

// Pre-multiply a world-space rotation onto a bone.
function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(q2)
  q3.copy(q2).multiply(bone.quaternion) // bone world
  q3.premultiply(q)
  bone.quaternion.copy(q2.invert().multiply(q3))
}
const rotateWorldAxis = (bone, axis, angle) => rotateWorld(bone, q1.setFromAxisAngle(axis, angle))
const wp = (bone, out) => bone.getWorldPosition(out)

export class DealerRig {
  constructor(root, { armScale = 1.1, handLength = 0.16 } = {}) {
    this.root = root
    this.handLength = handLength
    this.bones = {}
    this.eyes = []
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o
      if (o.isSkinnedMesh) {
        o.frustumCulled = false
        o.castShadow = true
        if (/eye/i.test(o.name)) this.eyes.push(o)
        if (/skin/i.test(o.name)) this.skinMat = o.material
        if (o.material.name === 'suit') { o.material.color.set('#101116'); o.material.roughness = 0.62 }
      } else if (o.isMesh) o.visible = false // the GLB ships a floor plane
    })
    const b = this.bones
    b.L_UpperArm.scale.setScalar(armScale)
    b.R_UpperArm.scale.setScalar(armScale)
    this.rest = new Map(Object.values(b).map((bone) => [bone, bone.quaternion.clone()]))
    this.eyeMats = this.eyes.map((e) => e.material)

    root.updateMatrixWorld(true)
    // Palm normals in hand-local space (bind pose: arms down, palms facing the thighs).
    this.palmLocal = {
      L: new THREE.Vector3(-1, 0, 0).applyQuaternion(b.L_Hand.getWorldQuaternion(new THREE.Quaternion()).invert()),
      R: new THREE.Vector3(1, 0, 0).applyQuaternion(b.R_Hand.getWorldQuaternion(new THREE.Quaternion()).invert()),
    }
    this.hands = {
      L: { tip: HAND_REST.L.clone(), upper: b.L_UpperArm, fore: b.L_Forearm, hand: b.L_Hand, pole: new THREE.Vector3(0.42, -0.62, -0.66) },
      R: { tip: HAND_REST.R.clone(), upper: b.R_UpperArm, fore: b.R_Forearm, hand: b.R_Hand, pole: new THREE.Vector3(-0.42, -0.62, -0.66) },
    }
    this.look = new THREE.Vector3(0, 1.5, 1.5) // world point the dealer looks at
    this._look = this.look.clone()
    this.lean = 0.1
    this.twist = 0
    this.nod = 0 // set >0 for a small acknowledging nod, decays by itself
    this.smile = 0
    this.time = Math.random() * 10
    this.blinkIn = 2
    this.blinkT = -1
  }

  update(dt) {
    const b = this.bones
    this.time += dt
    const t = this.time
    for (const [bone, q] of this.rest) bone.quaternion.copy(q)

    // How far do the hands have to go? Decide lean and twist from that.
    this.root.updateMatrixWorld(true)
    let wantLean = 0.07, wantTwist = 0
    for (const side of ['L', 'R']) {
      const h = this.hands[side]
      wp(h.upper, v1)
      const dx = h.tip.x - v1.x, dz = h.tip.z - v1.z
      const horiz = Math.hypot(dx, dz)
      const over = Math.max(0, horiz - 0.34)
      wantLean = Math.max(wantLean, 0.07 + over * 1.45)
      wantTwist += THREE.MathUtils.clamp(over * 2.2, 0, 1) * Math.atan2(h.tip.x - v1.x * 0.4, 0.55) * 0.55
    }
    this.lean = damp(this.lean, Math.min(wantLean, 0.52), 9, dt)
    this.twist = damp(this.twist, THREE.MathUtils.clamp(wantTwist, -0.5, 0.5), 9, dt)

    // torso: sway + breathing + lean + twist
    const breath = Math.sin(t * 1.5)
    rotateWorldAxis(b.Hips, Y, Math.sin(t * 0.37) * 0.018)
    rotateWorldAxis(b.Spine1, X, this.lean * 0.55 + Math.sin(t * 0.23) * 0.008)
    rotateWorldAxis(b.Spine1, Z, Math.sin(t * 0.31) * 0.01)
    rotateWorldAxis(b.Spine2, X, this.lean * 0.45 - breath * 0.008)
    rotateWorldAxis(b.Spine2, Y, this.twist * 0.5)
    rotateWorldAxis(b.Chest, Y, this.twist * 0.5)
    b.Chest.scale.setScalar(1 + breath * 0.006)

    // head: stay upright against the lean, then look at the target
    this._look.x = damp(this._look.x, this.look.x, 7, dt)
    this._look.y = damp(this._look.y, this.look.y, 7, dt)
    this._look.z = damp(this._look.z, this.look.z, 7, dt)
    wp(b.Head, v1)
    v2.copy(this._look).sub(v1)
    const yaw = THREE.MathUtils.clamp(Math.atan2(v2.x, v2.z), -0.9, 0.9) - this.twist * 0.8
    const pitch = THREE.MathUtils.clamp(-Math.atan2(v2.y, Math.hypot(v2.x, v2.z)), -0.3, 0.5)
    this.nod = damp(this.nod, 0, 5, dt)
    const nodA = Math.sin(Math.min(this.nod, 1) * Math.PI) * 0.16
    rotateWorldAxis(b.Neck, X, -this.lean * 0.55 + pitch * 0.4 + nodA)
    rotateWorldAxis(b.Neck, Y, yaw * 0.4)
    rotateWorldAxis(b.Head, X, -this.lean * 0.25 + pitch * 0.45 + nodA * 0.6)
    rotateWorldAxis(b.Head, Y, yaw * 0.5 + Math.sin(t * 0.5) * 0.015)

    this._solveArm(this.hands.L, 'L')
    this._solveArm(this.hands.R, 'R')
    this._blink(dt)
  }

  // Two-bone IK: place the elbow on the pole side, aim upper arm then forearm,
  // then flatten the hand over the felt with the palm down.
  _solveArm(h, side) {
    const S = wp(h.upper, v1)
    const E = wp(h.fore, v2)
    const W = wp(h.hand, v3)
    const a = S.distanceTo(E), bLen = E.distanceTo(W)

    // wrist target sits behind and slightly above the fingertip target
    const hdir = v4.set(h.tip.x - S.x, 0, h.tip.z - S.z)
    if (hdir.lengthSq() < 1e-6) hdir.set(0, 0, 1)
    hdir.normalize()
    const lift = Math.max(0.028, (h.tip.y - TABLE_Y) * 0.5 + 0.028)
    const T = new THREE.Vector3().copy(h.tip).addScaledVector(hdir, -this.handLength * 0.92)
    T.y = h.tip.y + lift
    const handDir = new THREE.Vector3().copy(h.tip).sub(T).normalize()

    const toT = new THREE.Vector3().subVectors(T, S)
    const d = THREE.MathUtils.clamp(toT.length(), 0.08, (a + bLen) * 0.995)
    const dir = toT.normalize()
    const pole = new THREE.Vector3().copy(h.pole).addScaledVector(dir, -h.pole.dot(dir)).normalize()
    const cosS = THREE.MathUtils.clamp((a * a + d * d - bLen * bLen) / (2 * a * d), -1, 1)
    const sinS = Math.sqrt(1 - cosS * cosS)
    const E2 = new THREE.Vector3().copy(S).addScaledVector(dir, a * cosS).addScaledVector(pole, a * sinS)
    const W2 = new THREE.Vector3().copy(S).addScaledVector(dir, d)

    rotateWorld(h.upper, q1.setFromUnitVectors(E.sub(S).normalize(), new THREE.Vector3().subVectors(E2, S).normalize()))
    const En = wp(h.fore, v2), Wn = wp(h.hand, v3)
    rotateWorld(h.fore, q1.setFromUnitVectors(Wn.sub(En).normalize(), new THREE.Vector3().subVectors(W2, En).normalize()))

    // hand: point along handDir, then roll so the palm faces the felt
    const foreDir = wp(h.hand, v3).sub(wp(h.fore, v2)).normalize()
    rotateWorld(h.hand, q1.setFromUnitVectors(foreDir, handDir))
    const palm = v2.copy(this.palmLocal[side]).applyQuaternion(h.hand.getWorldQuaternion(q3))
    palm.addScaledVector(handDir, -palm.dot(handDir)).normalize()
    const want = v3.copy(DOWN).addScaledVector(handDir, -DOWN.dot(handDir)).normalize()
    let ang = Math.acos(THREE.MathUtils.clamp(palm.dot(want), -1, 1))
    if (v1.crossVectors(palm, want).dot(handDir) < 0) ang = -ang
    rotateWorldAxis(h.hand, handDir, ang)
  }

  _blink(dt) {
    if (!this.skinMat || !this.eyes.length) return
    if (this.blinkT >= 0) {
      this.blinkT += dt
      if (this.blinkT > 0.11) {
        this.eyes.forEach((e, i) => (e.material = this.eyeMats[i]))
        this.blinkT = -1
        this.blinkIn = 2.2 + Math.random() * 3.5
      }
    } else if ((this.blinkIn -= dt) <= 0) {
      this.eyes.forEach((e) => (e.material = this.skinMat))
      this.blinkT = 0
    }
  }

}
