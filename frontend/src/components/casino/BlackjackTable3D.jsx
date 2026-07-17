import { Suspense, useMemo, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

// Force the renderer size from the window (preview browsers don't always fire ResizeObserver).
function ForceResize() {
  const setSize = useThree((s) => s.setSize)
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    const apply = () => { setSize(window.innerWidth, window.innerHeight); setDpr(Math.min(window.devicePixelRatio || 1, 2)) }
    apply()
    const t = setTimeout(apply, 60)
    window.addEventListener('resize', apply)
    return () => { clearTimeout(t); window.removeEventListener('resize', apply) }
  }, [setSize, setDpr])
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// Procedural recreation of the reference blackjack table.
// Felt is a half-disk; flat edge = dealer (back, +Z), curve = players (front).
// Units are meters. Table radius R ≈ 1.5m (≈3m across).
// ─────────────────────────────────────────────────────────────────────────
const R = 1.5              // felt radius
const FELT_Y = 0           // tabletop height
const RAIL_MAJOR = R + 0.05
const RAIL_TUBE = 0.07

function FeltTop() {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(R, 0)
    s.absarc(0, 0, R, 0, Math.PI, false) // arc through +Y (=> +Z after rotate)
    s.lineTo(R, 0)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)      // lay flat: shape +Y -> world +Z
    g.translate(0, FELT_Y, 0)
    return g
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#0f7d46" roughness={0.95} metalness={0} />
    </mesh>
  )
}

// Curved wooden/leather rail hugging the player edge + a bar along the flat edge.
function Rail() {
  return (
    <group>
      {/* curved rail (front half) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.02, 0]} castShadow>
        <torusGeometry args={[RAIL_MAJOR, RAIL_TUBE, 20, 80, Math.PI]} />
        <meshStandardMaterial color="#4a3324" roughness={0.45} metalness={0.05} />
      </mesh>
      {/* straight rail along the dealer (flat) edge */}
      <mesh position={[0, FELT_Y + 0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[RAIL_TUBE, RAIL_TUBE, RAIL_MAJOR * 2, 20]} />
        <meshStandardMaterial color="#4a3324" roughness={0.45} metalness={0.05} />
      </mesh>
    </group>
  )
}

// Thin wooden apron under the felt (the visible table edge thickness).
function Apron() {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(R + 0.02, 0)
    s.absarc(0, 0, R + 0.02, 0, Math.PI, false)
    s.lineTo(R + 0.02, 0)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, FELT_Y - 0.14, 0)
    return g
  }, [])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#3a281b" roughness={0.6} />
    </mesh>
  )
}

// Central metal pedestal.
function Pedestal() {
  return (
    <group>
      <mesh position={[0, FELT_Y - 0.55, 0.2]}>
        <cylinderGeometry args={[0.22, 0.34, 0.95, 32]} />
        <meshStandardMaterial color="#b7bec4" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, FELT_Y - 1.02, 0.2]}>
        <cylinderGeometry args={[0.5, 0.55, 0.08, 32]} />
        <meshStandardMaterial color="#9aa1a7" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  )
}

function ChipStack({ position, color, count = 6, r = 0.045 }) {
  return (
    <group position={position}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[0, i * 0.013, 0]}>
          <cylinderGeometry args={[r, r, 0.012, 24]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

// Dealer chip tray (bank) at the flat edge with rows of coloured chips.
function ChipTray() {
  const rows = ['#e8e8e8', '#c0392b', '#2471a3', '#27ae60', '#8e44ad', '#e67e22', '#111']
  return (
    <group position={[0, FELT_Y + 0.02, -0.15]}>
      <mesh>
        <boxGeometry args={[0.62, 0.05, 0.24]} />
        <meshStandardMaterial color="#20232a" roughness={0.3} metalness={0.6} />
      </mesh>
      {rows.map((c, i) => (
        <group key={i} position={[-0.27 + i * 0.09, 0.03, 0]}>
          {[-0.06, 0.06].map((z, j) => (
            <ChipStack key={j} position={[0, 0, z]} color={c} count={5} r={0.038} />
          ))}
        </group>
      ))}
    </group>
  )
}

// Transparent acrylic card shoe to the dealer's side.
function CardShoe() {
  return (
    <group position={[0.62, FELT_Y + 0.02, -0.05]} rotation={[0, -0.25, 0]}>
      <mesh rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.2, 0.16, 0.28]} />
        <meshPhysicalMaterial color="#dff" transparent opacity={0.28} roughness={0.1} metalness={0} transmission={0.6} />
      </mesh>
      <mesh position={[0, 0.02, 0.12]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.17, 0.1, 0.02]} />
        <meshStandardMaterial color="#c0392b" roughness={0.5} />
      </mesh>
    </group>
  )
}

// A betting spot ring on the felt.
function BetSpot({ angleDeg, radius, ringR = 0.12, color = '#eef3ee', chips }) {
  const a = (angleDeg * Math.PI) / 180
  const x = Math.cos(a) * radius
  const z = Math.sin(a) * radius
  return (
    <group position={[x, FELT_Y + 0.031, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ringR, 0.006, 8, 40]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {chips && <ChipStack position={[0, 0, 0]} color={chips} count={4} r={0.05} />}
    </group>
  )
}

function TableText() {
  const common = { color: '#f3f3ea', anchorX: 'center', anchorY: 'middle', font: undefined }
  return (
    <group position={[0, FELT_Y + 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <Text {...common} position={[0, 0.62, 0.001]} fontSize={0.14} curveRadius={-0.7} letterSpacing={0.02}
        fontWeight="bold">BLACKJACK PAYS 3 TO 2</Text>
      <Text {...common} position={[0, 0.44, 0.001]} fontSize={0.075} curveRadius={-0.52}>
        Dealer must stand on 17 and must draw to 16</Text>
      <Text {...common} position={[0, 0.30, 0.001]} fontSize={0.085} curveRadius={-0.42} letterSpacing={0.01}>
        INSURANCE PAYS 2 TO 1</Text>
    </group>
  )
}

export function BlackjackTable3D() {
  // 6 main betting spots along the front arc
  const spots = [30, 54, 78, 102, 126, 150]
  return (
    <group>
      <Apron />
      <FeltTop />
      <Rail />
      <Pedestal />
      <ChipTray />
      <CardShoe />
      <TableText />
      {/* main bet spots */}
      {spots.map((a, i) => (
        <BetSpot key={a} angleDeg={a} radius={R * 0.66} ringR={0.13}
          chips={i === 2 ? '#27ae60' : i === 3 ? '#c0392b' : null} />
      ))}
      {/* side-bet + bet-behind small circles near the two outer spots */}
      {spots.map((a) => (
        <BetSpot key={'s' + a} angleDeg={a - 6} radius={R * 0.88} ringR={0.05} color="#8fd6a8" />
      ))}
    </group>
  )
}

// Standalone viewer for iterating on the look.
export default function BlackjackTable3DViewer() {
  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#07130d' }}>
      <Canvas shadows style={{ width: '100vw', height: '100vh' }}
        camera={{ position: [0, 2.2, 3.4], fov: 42, near: 0.1, far: 100 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <ForceResize />
        <color attach="background" args={['#0a1a12']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 4, 2]} intensity={1.1} color="#fff3e0" castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#4fd08a" />
        <pointLight position={[0, 2.5, 1]} intensity={0.6} color="#eaffe0" />
        <Suspense fallback={null}>
          <BlackjackTable3D />
        </Suspense>
        <OrbitControls target={[0, 0, 0.3]} />
      </Canvas>
    </div>
  )
}
