import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DealerRig } from './dealerRig.js'
import { Director } from './director.js'
import { buildTable } from './props.js'
import { Sfx } from './audio.js'
import { SCRIPTED_ROUND } from './script.js'
import {
  TABLE_Y, SEAT_COUNT, cardSpot, betSpot, DEALER_Z, DEALER_CARD_ORIGIN,
  CAMERA_POS, CAMERA_TARGET, CAMERA_FOV,
} from './layout.js'

const params = new URLSearchParams(window.location.search)
const stats = (window.__protoStats = { fps: 0, low: 0, ttff: null, calls: 0, tris: 0 })

// ───────────────────────── scene ─────────────────────────
function Backdrop() {
  const tex = useTexture('/prototype/bg_teal.jpg')
  tex.colorSpace = THREE.SRGBColorSpace
  return (
    <mesh position={[0, 2.05, -3.4]}>
      <planeGeometry args={[10.4, 5.85]} />
      <meshBasicMaterial map={tex} color="#8f9aa0" toneMapped={false} />
    </mesh>
  )
}

function Lights({ shadows }) {
  const key = useRef()
  const { scene, gl } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.32
    return () => { scene.environment = null; env.dispose(); pmrem.dispose() }
  }, [scene, gl])
  useEffect(() => {
    key.current.target.position.set(0, TABLE_Y, 0.25)
    key.current.target.updateMatrixWorld()
  }, [])
  return (
    <>
      <hemisphereLight args={['#cfe6ff', '#2a1c12', 0.32]} />
      <spotLight
        ref={key} position={[0.5, 3.3, 1.5]} angle={0.62} penumbra={0.75} intensity={58} decay={2}
        color="#fff1dc" castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.00025} shadow-normalBias={0.012} shadow-radius={5}
        shadow-camera-near={1.2} shadow-camera-far={5}
      />
      {/* dealer fill from the camera side and a cool rim from behind */}
      <directionalLight position={[-0.9, 1.7, 2.6]} intensity={1.25} color="#ffe9d2" />
      <directionalLight position={[1.2, 2.6, -2.2]} intensity={1.6} color="#7fd6e6" />
    </>
  )
}

function Stage({ api, orbit, onUi }) {
  const { scene: dealerScene } = useGLTF('/dealer_animated.glb')
  const { camera, gl, size } = useThree()

  const { rig, director, table } = useMemo(() => {
    dealerScene.position.set(0, 0, DEALER_Z)
    dealerScene.scale.setScalar(1.06)
    const rig = new DealerRig(dealerScene)
    const sfx = new Sfx()
    const director = new Director({ rig, sfx, onUi })
    return { rig, director, table: buildTable() }
  }, [dealerScene, onUi])

  useEffect(() => {
    api.current = { director, rig }
    window.__proto = { director, rig, camera, gl }
    return () => director.reset()
  }, [api, director, rig, camera, gl])

  // keep the whole table in frame on narrow / portrait screens
  useEffect(() => {
    const aspect = size.width / size.height
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(33)) / aspect))
    camera.fov = THREE.MathUtils.clamp(fov, CAMERA_FOV, 82)
    camera.updateProjectionMatrix()
  }, [camera, size])

  const lookTarget = useRef(CAMERA_TARGET.clone())
  const acc = useRef({ frames: 0, time: 0, worst: 0, t: 0 })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    director.update(dt)
    rig.update(dt)

    if (!orbit) {
      const a = acc.current
      a.t += dt
      // handheld-free "locked off but alive" camera: tiny drift + a nudge toward the action
      camera.position.set(
        CAMERA_POS.x + Math.sin(a.t * 0.21) * 0.012,
        CAMERA_POS.y + Math.sin(a.t * 0.17) * 0.006,
        CAMERA_POS.z + Math.cos(a.t * 0.13) * 0.01,
      )
      const want = new THREE.Vector3().copy(CAMERA_TARGET).addScaledVector(
        new THREE.Vector3().subVectors(director.focus, CAMERA_TARGET), 0.1)
      lookTarget.current.lerp(want, 1 - Math.exp(-2.5 * dt))
      camera.lookAt(lookTarget.current)
    }

    // stats
    const a = acc.current
    if (stats.ttff == null) stats.ttff = Math.round(performance.now())
    a.frames++
    a.time += rawDt
    a.worst = Math.max(a.worst, rawDt)
    if (a.time >= 0.5) {
      stats.fps = Math.round(a.frames / a.time)
      stats.low = Math.round(1 / a.worst)
      stats.calls = gl.info.render.calls
      stats.tris = gl.info.render.triangles
      a.frames = 0; a.time = 0; a.worst = 0
    }
  })

  return (
    <>
      <primitive object={dealerScene} />
      <primitive object={table} />
      <primitive object={director.group} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#14100e" roughness={0.9} />
      </mesh>
    </>
  )
}

function Badges({ ui }) {
  if (!ui) return null
  return (
    <>
      {ui.seats.map((s, i) => {
        if (s.total == null && !s.amount && !s.status) return null
        const c = cardSpot(i), b = betSpot(i)
        return (
          <group key={i}>
            {s.total != null && (
              <Html center position={[c.x - 0.085, TABLE_Y + 0.02, c.z - 0.04]} zIndexRange={[5, 0]}>
                <div className={`badge ${s.total > 21 ? 'bust' : ''}`}>{s.total}</div>
              </Html>
            )}
            {s.status && (
              <Html center position={[b.x, TABLE_Y + 0.1, b.z]} zIndexRange={[5, 0]}>
                <div className={`status ${s.status.toLowerCase()}`}>{s.status}</div>
              </Html>
            )}
            {s.amount > 0 && (
              <Html center position={[b.x, TABLE_Y, b.z + 0.1]} zIndexRange={[5, 0]}>
                <div className="bet">{s.amount}</div>
              </Html>
            )}
          </group>
        )
      })}
      {ui.dealer.total != null && (
        <Html center position={[DEALER_CARD_ORIGIN.x - 0.085, TABLE_Y + 0.02, DEALER_CARD_ORIGIN.z - 0.04]} zIndexRange={[5, 0]}>
          <div className="badge dealer">{ui.dealer.total}</div>
        </Html>
      )}
    </>
  )
}

// ───────────────────────── page ─────────────────────────
function StatsPanel() {
  const ref = useRef()
  useEffect(() => {
    const id = setInterval(() => {
      if (!ref.current) return
      ref.current.textContent =
        `${stats.fps} fps (worst frame ${stats.low}) · ${stats.calls} draw calls · ${(stats.tris / 1000).toFixed(1)}k tris · first frame ${stats.ttff ?? '…'} ms`
    }, 500)
    return () => clearInterval(id)
  }, [])
  return <div className="stats" ref={ref} />
}

export default function PrototypeApp() {
  const api = useRef(null)
  const [ui, setUi] = useState(null)
  const [started, setStarted] = useState(false)
  const [sound, setSound] = useState(false)
  const [voice, setVoice] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [quality, setQuality] = useState(params.get('quality') || 'high')
  const [orbit, setOrbit] = useState(params.has('orbit'))
  const [ready, setReady] = useState(false)
  const loop = !params.has('once')

  const start = (withSound) => {
    const { director } = api.current
    if (withSound) director.sfx.unlock()
    director.sfx.enabled = withSound
    setSound(withSound)
    setStarted(true)
    director.play(SCRIPTED_ROUND, { loop })
  }
  useEffect(() => {
    if (ready && params.has('autoplay')) start(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
  useEffect(() => {
    const d = api.current?.director
    if (!d) return
    d.sfx.enabled = sound
    d.sfx.voice = voice
    d.tl.speed = speed
    if (sound) d.sfx.unlock()
  }, [sound, voice, speed, ready])

  const high = quality === 'high'
  return (
    <div className="proto">
      <Canvas
        shadows={high ? 'soft' : false}
        dpr={high ? [1, 2] : 1}
        camera={{ position: CAMERA_POS.toArray(), fov: CAMERA_FOV, near: 0.1, far: 30 }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shots') }}
        onCreated={({ gl }) => { gl.toneMappingExposure = 1.05 }}
      >
        <color attach="background" args={['#06080a']} />
        <Lights shadows={high} />
        <Suspense fallback={null}>
          <Backdrop />
          <Stage api={api} orbit={orbit} onUi={setUi} />
          <Ready onReady={() => setReady(true)} />
        </Suspense>
        <Badges ui={ui} />
        {orbit && <OrbitControls target={CAMERA_TARGET.toArray()} />}
      </Canvas>

      <div className="vignette" />
      {ui?.caption && <div className="caption"><span>Dealer</span>{ui.caption}</div>}

      {!started && (
        <div className="start">
          <h1>Live dealer prototype</h1>
          <p>One scripted round, played from an ordered event list. No backend.</p>
          <div>
            <button disabled={!ready} onClick={() => start(true)}>{ready ? 'Take a seat' : 'Loading…'}</button>
            <button disabled={!ready} className="ghost" onClick={() => start(false)}>Watch muted</button>
          </div>
        </div>
      )}

      <div className="controls">
        <button onClick={() => api.current?.director.play(SCRIPTED_ROUND, { loop })}>Replay</button>
        <button onClick={() => setSpeed(speed === 1 ? 0.4 : speed === 0.4 ? 2 : 1)}>Speed {speed}×</button>
        <button onClick={() => setSound(!sound)}>Sound {sound ? 'on' : 'off'}</button>
        <button onClick={() => setVoice(!voice)}>Voice {voice ? 'on' : 'off'}</button>
        <button onClick={() => setQuality(high ? 'low' : 'high')}>Quality {quality}</button>
        <button onClick={() => setOrbit(!orbit)}>{orbit ? 'Seat camera' : 'Free camera'}</button>
      </div>
      <StatsPanel />
    </div>
  )
}

function Ready({ onReady }) {
  useEffect(() => { onReady() }, [onReady])
  return null
}

useGLTF.preload('/dealer_animated.glb')
