import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'

function TableModel() {
  const { scene } = useGLTF('/blackjack_table.glb')
  return <primitive object={scene} />
}
useGLTF.preload('/blackjack_table.glb')

// Temporary full-screen viewer to inspect the table model, its orientation,
// scale, and the 6 betting-spot positions before integrating into the game.
export default function TableViewer() {
  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#0b0f14' }}>
      <Canvas frameloop="demand"
        camera={{ position: [0, 470, -980], fov: 40, near: 1, far: 6000 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[300, 700, -200]} intensity={1.3} />
        <directionalLight position={[-300, 400, -600]} intensity={0.4} />
        <Suspense fallback={null}>
          <TableModel />
        </Suspense>
        <OrbitControls target={[0, 15, -120]} />
      </Canvas>
    </div>
  )
}
