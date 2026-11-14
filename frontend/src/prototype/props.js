// Procedural props: cards, chips, table, shoe, tray. Every texture is drawn
// on a 2D canvas at start-up, so the prototype ships no card/chip/table art.
import * as THREE from 'three'
import {
  TABLE_Y, FELT_R, SEAT_COUNT, CARD_W, CARD_H, CHIP_R, CHIP_H,
  cardSpot, betSpot, SHOE_POS, SHOE_YAW, DISCARD_POS, TRAY_POS, DEALER_CARD_ORIGIN,
} from './layout.js'

const canvasTex = (w, h, draw, { aniso = 8 } = {}) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  return t
}

// ───────────────────────── cards ─────────────────────────
const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const faceCache = new Map()

function faceTexture(code) {
  if (faceCache.has(code)) return faceCache.get(code)
  const rank = code[0] === 'T' ? '10' : code[0]
  const suit = SUITS[code[1]]
  const red = code[1] === 'H' || code[1] === 'D'
  const tex = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#fbfaf6'
    g.fillRect(0, 0, w, h)
    g.fillStyle = red ? '#c4122b' : '#15151a'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const corner = () => {
      g.font = `700 ${rank === '10' ? 78 : 92}px Georgia, "Times New Roman", serif`
      g.fillText(rank, 52, 58)
      g.font = '70px "Segoe UI Symbol", "Arial Unicode MS", serif'
      g.fillText(suit, 52, 132)
    }
    corner()
    g.save()
    g.translate(w, h)
    g.rotate(Math.PI)
    corner()
    g.restore()
    if ('JQK'.includes(rank)) {
      g.strokeStyle = g.fillStyle
      g.lineWidth = 4
      g.strokeRect(96, 96, 64, 168)
      g.font = '700 84px Georgia, serif'
      g.fillText(rank, 128, 182)
    } else {
      g.font = `${rank === 'A' ? 170 : 120}px "Segoe UI Symbol", "Arial Unicode MS", serif`
      g.fillText(suit, 128 + (rank === 'A' ? 0 : 22), 186)
    }
  })
  faceCache.set(code, tex)
  return tex
}

let backTex
function backTexture() {
  backTex ??= canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#f6f3ea'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#8e1322'
    g.fillRect(14, 14, w - 28, h - 28)
    g.strokeStyle = 'rgba(255,220,170,0.55)'
    g.lineWidth = 2
    for (let i = -h; i < w + h; i += 18) {
      g.beginPath(); g.moveTo(i, 14); g.lineTo(i + h, h - 14); g.stroke()
      g.beginPath(); g.moveTo(i + h, 14); g.lineTo(i, h - 14); g.stroke()
    }
    g.fillStyle = '#f6f3ea'
    g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h)
    g.strokeStyle = '#d9b46a'
    g.lineWidth = 4
    g.strokeRect(24, 24, w - 48, h - 48)
  })
  return backTex
}

let cardGeo
function cardGeometry() {
  if (cardGeo) return cardGeo
  const w = CARD_W / 2, h = CARD_H / 2, r = 0.0065
  const s = new THREE.Shape()
  s.moveTo(-w + r, -h)
  s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r)
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h)
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r)
  s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h)
  cardGeo = new THREE.ShapeGeometry(s, 5)
  const pos = cardGeo.attributes.position, uv = cardGeo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5)
  cardGeo.rotateX(-Math.PI / 2) // lie flat, face up, top of the card toward the dealer
  return cardGeo
}

const blankFace = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.6 })
let backMat

// A card is a Group: rotation.z = PI means face down, 0 means face up.
export function makeCard(code) {
  backMat ??= new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.55 })
  const card = new THREE.Group()
  card.rotation.order = 'YXZ'
  const front = new THREE.Mesh(cardGeometry(), blankFace)
  front.position.y = 0.0005
  const back = new THREE.Mesh(cardGeometry(), backMat)
  back.rotation.z = Math.PI
  back.position.y = -0.0005
  front.castShadow = back.castShadow = true
  front.receiveShadow = back.receiveShadow = true
  card.add(front, back)
  card.userData = { code: null, front }
  if (code) setCardFace(card, code)
  return card
}

export function setCardFace(card, code) {
  card.userData.code = code
  card.userData.front.material = new THREE.MeshStandardMaterial({ map: faceTexture(code), roughness: 0.5 })
}

// ───────────────────────── chips ─────────────────────────
const DENOMS = [
  { v: 500, c: '#5b2a86' }, { v: 100, c: '#17171b' }, { v: 25, c: '#12703c' },
  { v: 5, c: '#b3202a' }, { v: 1, c: '#e9e6dc' },
]
const chipMats = new Map()
let chipGeo

function chipMaterials(d) {
  if (chipMats.has(d.v)) return chipMats.get(d.v)
  const side = canvasTex(256, 16, (g, w, h) => {
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 2 ? '#f3efe4' : d.c
      g.fillRect((i * w) / 12, 0, w / 12 + 1, h)
    }
  })
  const top = canvasTex(128, 128, (g) => {
    g.translate(64, 64)
    g.fillStyle = d.c
    g.beginPath(); g.arc(0, 0, 64, 0, 7); g.fill()
    g.fillStyle = '#f3efe4'
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3)
      g.fillRect(-9, -64, 18, 15)
    }
    g.strokeStyle = '#f3efe4'
    g.lineWidth = 3
    g.beginPath(); g.arc(0, 0, 42, 0, 7); g.stroke()
    g.fillStyle = d.v === 1 ? '#222' : '#f6f2e6'
    g.font = `700 ${d.v >= 100 ? 34 : 42}px Georgia, serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(d.v), 0, 3)
  })
  const mats = [
    new THREE.MeshStandardMaterial({ map: side, roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ map: top, roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: d.c, roughness: 0.6 }),
  ]
  chipMats.set(d.v, mats)
  return mats
}

export function amountToChips(amount) {
  const out = []
  for (const d of DENOMS) while (amount >= d.v) { out.push(d); amount -= d.v }
  return out // largest denominations at the bottom of the stack
}

export function makeChipStack(amount) {
  chipGeo ??= new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 28)
  const stack = new THREE.Group()
  amountToChips(amount).forEach((d, i) => {
    const m = new THREE.Mesh(chipGeo, chipMaterials(d))
    m.position.set((Math.random() - 0.5) * 0.002, CHIP_H * (i + 0.5), (Math.random() - 0.5) * 0.002)
    m.rotation.y = Math.random() * 6.28
    m.castShadow = m.receiveShadow = true
    stack.add(m)
  })
  stack.userData.amount = amount
  return stack
}

// ───────────────────────── table ─────────────────────────
function feltTexture() {
  const PX = 1024 / FELT_R // pixels per metre; canvas = x:[-R,R] by z:[0,R]
  return canvasTex(2048, 1024, (g, w, h) => {
    const grd = g.createRadialGradient(1024, 260, 80, 1024, 200, 1150)
    grd.addColorStop(0, '#0f7350')
    grd.addColorStop(0.6, '#0a5540')
    grd.addColorStop(1, '#053126')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    // felt fibre noise
    const img = g.getImageData(0, 0, w, h)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
    }
    g.putImageData(img, 0, 0)

    const gold = 'rgba(236,205,140,0.9)'
    const arcText = (text, radius, size, spacing = 1) => {
      g.font = `600 ${size}px Georgia, "Times New Roman", serif`
      g.fillStyle = gold
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      const widths = [...text].map((ch) => g.measureText(ch).width * spacing)
      const total = widths.reduce((a, b) => a + b, 0)
      let a = Math.PI / 2 + total / 2 / radius
      ;[...text].forEach((ch, i) => {
        a -= widths[i] / 2 / radius
        g.save()
        g.translate(1024 + radius * Math.cos(a), radius * Math.sin(a))
        g.rotate(a - Math.PI / 2)
        g.fillText(ch, 0, 0)
        g.restore()
        a -= widths[i] / 2 / radius
      })
    }
    // insurance band
    g.strokeStyle = gold
    g.lineWidth = 3
    for (const r of [0.375, 0.435]) {
      g.beginPath(); g.arc(1024, 0, r * PX, Math.PI * 0.14, Math.PI * 0.86); g.stroke()
    }
    arcText('BLACKJACK PAYS 3 TO 2', 0.635 * PX, 40, 1.25)
    arcText('INSURANCE PAYS 2 TO 1', 0.405 * PX, 27, 1.5)

    // dealer card boxes
    g.lineWidth = 3
    g.strokeStyle = 'rgba(236,205,140,0.55)'
    for (let i = 0; i < 2; i++) {
      const cx = 1024 + (DEALER_CARD_ORIGIN.x + i * 0.1) * PX, cz = DEALER_CARD_ORIGIN.z * PX
      g.strokeRect(cx - (CARD_W / 2 + 0.004) * PX, cz - (CARD_H / 2 + 0.004) * PX, (CARD_W + 0.008) * PX, (CARD_H + 0.008) * PX)
    }
    // bet circles
    for (let s = 0; s < SEAT_COUNT; s++) {
      const p = betSpot(s)
      const cx = 1024 + p.x * PX, cz = p.z * PX
      g.strokeStyle = gold
      g.lineWidth = 5
      g.beginPath(); g.arc(cx, cz, 0.062 * PX, 0, 7); g.stroke()
      g.lineWidth = 1.5
      g.beginPath(); g.arc(cx, cz, 0.052 * PX, 0, 7); g.stroke()
      const c = cardSpot(s)
      g.strokeStyle = 'rgba(236,205,140,0.28)'
      g.lineWidth = 2
      g.strokeRect(1024 + (c.x - CARD_W / 2 - 0.004) * PX, (c.z - CARD_H / 2 - 0.004) * PX, (CARD_W + 0.008) * PX, (CARD_H + 0.008) * PX)
    }
  }, { aniso: 16 })
}

export function buildTable() {
  const table = new THREE.Group()

  // felt: half disc, UVs straight from table coordinates
  const s = new THREE.Shape()
  s.moveTo(-FELT_R, 0)
  s.absarc(0, 0, FELT_R, Math.PI, 2 * Math.PI, false)
  s.lineTo(-FELT_R, 0)
  const feltGeo = new THREE.ShapeGeometry(s, 64)
  const pos = feltGeo.attributes.position, uv = feltGeo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + FELT_R) / (2 * FELT_R), 1 + pos.getY(i) / FELT_R)
  feltGeo.rotateX(-Math.PI / 2)
  const felt = new THREE.Mesh(feltGeo, new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.96 }))
  felt.position.y = TABLE_Y
  felt.receiveShadow = true
  table.add(felt)

  // padded leather rail around the players' arc
  const leather = new THREE.MeshStandardMaterial({ color: '#241812', roughness: 0.42 })
  const railGeo = new THREE.TorusGeometry(FELT_R + 0.05, 0.062, 18, 96, Math.PI)
  railGeo.rotateX(Math.PI / 2)
  const rail = new THREE.Mesh(railGeo, leather)
  rail.scale.y = 0.62
  rail.position.y = TABLE_Y + 0.006
  rail.castShadow = rail.receiveShadow = true
  table.add(rail)

  const wood = new THREE.MeshStandardMaterial({ color: '#3b2415', roughness: 0.38, metalness: 0.05 })
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a455', roughness: 0.3, metalness: 0.9 })
  // dealer-side trim
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2 * FELT_R + 0.22, 0.05, 0.07), wood)
  trim.position.set(0, TABLE_Y - 0.012, -0.035)
  trim.castShadow = true
  table.add(trim)
  // apron + pedestal
  const ap = new THREE.Shape()
  ap.moveTo(-(FELT_R + 0.09), 0)
  ap.absarc(0, 0, FELT_R + 0.09, Math.PI, 2 * Math.PI, false)
  ap.lineTo(-(FELT_R + 0.09), 0)
  const apronGeo = new THREE.ExtrudeGeometry(ap, { depth: 0.13, bevelEnabled: false, curveSegments: 48 })
  apronGeo.rotateX(-Math.PI / 2)
  const apron = new THREE.Mesh(apronGeo, wood)
  apron.position.y = TABLE_Y - 0.145
  table.add(apron)
  const band = new THREE.Mesh(new THREE.TorusGeometry(FELT_R + 0.092, 0.006, 8, 96, Math.PI).rotateX(Math.PI / 2), gold)
  band.position.y = TABLE_Y - 0.085
  table.add(band)
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, TABLE_Y - 0.14, 32, 1, false, 0, Math.PI).rotateY(-Math.PI / 2), wood)
  ped.position.set(0, (TABLE_Y - 0.14) / 2, 0.02)
  table.add(ped)

  table.add(buildTray(), buildShoe(), buildDiscard())
  return table
}

function buildTray() {
  const g = new THREE.Group()
  g.position.copy(TRAY_POS)
  const metal = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.35, metalness: 0.7 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.15), metal)
  base.position.y = 0.006
  base.receiveShadow = true
  g.add(base)
  for (const [x, z, w, d] of [[0, -0.078, 0.51, 0.008], [0, 0.078, 0.51, 0.008], [-0.253, 0, 0.008, 0.15], [0.253, 0, 0.008, 0.15]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), metal)
    wall.position.set(x, 0.015, z)
    wall.castShadow = true
    g.add(wall)
  }
  const cols = ['#e9e6dc', '#b3202a', '#b3202a', '#12703c', '#12703c', '#17171b', '#17171b', '#5b2a86']
  cols.forEach((c, i) => {
    const tex = canvasTex(64, 512, (ctx, w, h) => {
      const n = 26
      for (let k = 0; k < n; k++) {
        const y = (k * h) / n, off = Math.floor(Math.random() * 6)
        for (let j = 0; j < 12; j++) {
          ctx.fillStyle = (j + off) % 6 === 0 ? '#f3efe4' : c
          ctx.fillRect((j * w) / 12, y, w / 12 + 1, h / n)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, y, w, 1.6)
      }
    })
    const len = 0.085 + (i % 3) * 0.018
    const row = new THREE.Mesh(new THREE.CylinderGeometry(CHIP_R, CHIP_R, len, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }))
    row.rotation.x = Math.PI / 2
    row.position.set(-0.21 + i * 0.06, 0.012 + CHIP_R * 0.8, 0.07 - len / 2)
    row.castShadow = true
    g.add(row)
  })
  return g
}

function buildShoe() {
  const g = new THREE.Group()
  g.position.copy(SHOE_POS)
  g.rotation.y = SHOE_YAW
  // local -X is the mouth (points at the table centre once yawed)
  const black = new THREE.MeshStandardMaterial({ color: '#0d0d10', roughness: 0.3, metalness: 0.2 })
  const acrylic = new THREE.MeshPhysicalMaterial({ color: '#30080c', roughness: 0.08, transparent: true, opacity: 0.55, clearcoat: 1 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.014, 0.125), black)
  base.position.y = 0.007
  const sideGeo = new THREE.BoxGeometry(0.25, 0.1, 0.006)
  const l = new THREE.Mesh(sideGeo, acrylic), r = new THREE.Mesh(sideGeo, acrylic)
  l.position.set(0.01, 0.06, 0.058); r.position.set(0.01, 0.06, -0.058)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.1, 0.116), black)
  backWall.position.set(0.132, 0.06, 0)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.17, CARD_H * 0.72, CARD_W), new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.8 }))
  deck.position.set(0.03, 0.058, 0)
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.116), black)
  lip.position.set(-0.115, 0.075, 0)
  lip.rotation.z = -0.5
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.122), acrylic)
  top.position.set(0.035, 0.111, 0)
  for (const m of [base, l, r, backWall, deck, lip, top]) { m.castShadow = true; g.add(m) }
  return g
}

function buildDiscard() {
  const g = new THREE.Group()
  g.position.copy(DISCARD_POS)
  g.rotation.y = -0.3
  const acrylic = new THREE.MeshPhysicalMaterial({ color: '#5a0c12', roughness: 0.1, transparent: true, opacity: 0.6, clearcoat: 1 })
  const w = CARD_W + 0.02, d = CARD_H + 0.02
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), acrylic)
  base.position.y = 0.003
  g.add(base)
  for (const [x, z, sx, sz] of [[-w / 2, 0, 0.005, d], [w / 2, 0, 0.005, d], [0, -d / 2, w, 0.005]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), acrylic)
    wall.position.set(x, 0.03, z)
    wall.castShadow = true
    g.add(wall)
  }
  return g
}
