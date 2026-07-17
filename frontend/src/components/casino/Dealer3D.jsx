import { useRef, useEffect, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'

// Animation name → action name in the GLB
const ANIM_MAP = {
  idle:       'Idle',
  deal:       'Deal',
  takeChips:  'TakeChips',
  nod:        'Nod',
  payWinner:  'PayWinner',
  shuffle:    'Shuffle',
}

// Blink timing (driven in useFrame since we have no shape keys — we scale eyelid bones)
const BLINK_INTERVAL = 3.5  // seconds between blinks
const BLINK_DURATION = 0.12 // seconds a blink takes

function DealerMesh({ animation = 'idle' }) {
  const group   = useRef()
  const { scene, animations } = useGLTF('/dealer_animated.glb')
  const { actions, mixer }    = useAnimations(animations, group)

  // Blink state
  const blinkRef = useRef({ timer: BLINK_INTERVAL, blinking: false, t: 0 })

  // Switch animation whenever prop changes
  useEffect(() => {
    if (!actions) return
    const targetName = ANIM_MAP[animation] || 'Idle'

    // Fade out all currently running actions
    Object.values(actions).forEach(a => {
      if (a.isRunning()) a.fadeOut(0.25)
    })

    const next = actions[targetName]
    if (!next) return

    next.reset()
    next.setLoop(
      animation === 'idle' || animation === 'shuffle'
        ? THREE.LoopRepeat
        : THREE.LoopOnce,
      Infinity
    )
    next.clampWhenFinished = true
    next.fadeIn(0.25).play()

    // After non-looping anim ends, fade back to idle
    if (animation !== 'idle' && animation !== 'shuffle') {
      const onFinish = () => {
        next.fadeOut(0.3)
        const idle = actions['Idle']
        if (idle) idle.reset().fadeIn(0.3).play()
        mixer.removeEventListener('finished', onFinish)
      }
      mixer.addEventListener('finished', onFinish)
      return () => mixer.removeEventListener('finished', onFinish)
    }
  }, [animation, actions, mixer])

  // Start idle on mount
  useEffect(() => {
    const idle = actions?.['Idle']
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play()
    }
  }, [actions])

  // Blink: find eye-related objects and scale their Y slightly on blink
  useFrame((_, delta) => {
    const b = blinkRef.current
    b.timer -= delta
    if (b.timer <= 0 && !b.blinking) {
      b.blinking = true
      b.t = 0
      b.timer = BLINK_INTERVAL + (Math.random() * 1.5 - 0.75)
    }
    if (b.blinking) {
      b.t += delta / BLINK_DURATION
      const progress = Math.sin(b.t * Math.PI) // 0→1→0
      // Find eye meshes and squash them vertically
      scene.traverse(obj => {
        if (obj.isMesh && (obj.name.includes('eye') || obj.name.includes('Eye'))) {
          obj.scale.y = 1 - progress * 0.88
        }
      })
      if (b.t >= 1) {
        b.blinking = false
        scene.traverse(obj => {
          if (obj.isMesh && (obj.name.includes('eye') || obj.name.includes('Eye'))) {
            obj.scale.y = 1
          }
        })
      }
    }
  })

  return (
    <primitive
      ref={group}
      object={scene}
      scale={[1, 1, 1]}
      position={[0, -0.9, 0]}
      rotation={[0, 0, 0]}
    />
  )
}

useGLTF.preload('/dealer_animated.glb')

export default function Dealer3D({ animation = 'idle', className = '' }) {
  return (
    <div className={`dealer-3d-wrap ${className}`}
         style={{ width: '160px', height: '200px', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 0.3, 2.2], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[1.5, 2, 1.5]} intensity={1.2} color="#fff8ee" castShadow />
        <directionalLight position={[-1.5, 1, 0.5]} intensity={0.35} color="#c8d8ff" />
        <pointLight position={[0, 2, -1]} intensity={0.25} color="#fff0cc" />
        <Suspense fallback={null}>
          <DealerMesh animation={animation} />
        </Suspense>
      </Canvas>
    </div>
  )
}
