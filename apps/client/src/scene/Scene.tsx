import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react'
import { CanvasTexture, Euler, Quaternion, SRGBColorSpace, Vector3, type Mesh } from 'three'
import type { RoomView } from '@monopoly-vn/engine'
import { timeline } from '../util'
import { Board, W } from './Board'
import { Tokens } from './Tokens'

export type Controls = ComponentRef<typeof OrbitControls>
export type Quality = 'high' | 'low'

// --- dice (U12, U13): the server picks the value, we only animate onto it ---

const DIE = 0.5
const ROLL_SECONDS = 1.1
/** Value shown on each BoxGeometry face, in three.js material order: +x, -x, +y, -y, +z, -z. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5]
/** Rotation that brings the face with value v to the top (+y). */
const FACE_UP: Record<number, Euler> = {
  1: new Euler(0, 0, 0),
  6: new Euler(Math.PI, 0, 0),
  2: new Euler(-Math.PI / 2, 0, 0),
  5: new Euler(Math.PI / 2, 0, 0),
  3: new Euler(0, 0, Math.PI / 2),
  4: new Euler(0, 0, -Math.PI / 2),
}
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

function faceTexture(value: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fbf8f0'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = value === 1 || value === 4 ? '#c0392b' : '#1a1a1a' // Asian dice: red 1 and 4
  for (const [x, y] of PIPS[value]) {
    ctx.beginPath()
    ctx.arc(64 + x * 32, 64 + y * 32, value === 1 ? 20 : 12, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

function Die({ value, rollCount, rest }: { value: number; rollCount: number; rest: [number, number] }) {
  const ref = useRef<Mesh>(null)
  const textures = useMemo(() => FACE_VALUES.map(faceTexture), [])
  const shownRoll = useRef(rollCount)
  const anim = useRef({
    start: -1,
    final: new Quaternion(),
    axis: new Vector3(1, 0, 0),
    spin: 0,
    from: new Vector3(),
    to: new Vector3(rest[0], DIE / 2, rest[1]),
  })

  useEffect(() => {
    const mesh = ref.current!
    const a = anim.current
    if (rollCount === shownRoll.current) {
      if (a.start < 0) {
        // initial render or rejoin: no animation
        a.final.setFromEuler(new Euler(0, Math.random() * Math.PI * 2, 0)).multiply(new Quaternion().setFromEuler(FACE_UP[value]))
        mesh.quaternion.copy(a.final)
        mesh.position.copy(a.to)
      }
      return
    }
    shownRoll.current = rollCount
    a.final.setFromEuler(new Euler(0, Math.random() * Math.PI * 2, 0)).multiply(new Quaternion().setFromEuler(FACE_UP[value]))
    a.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    a.spin = Math.PI * (4 + Math.random() * 2)
    a.from.set(rest[0] + (Math.random() - 0.5) * 2, 2.5, rest[1] + 3)
    a.start = performance.now()
    timeline.diceSettledAt = a.start + ROLL_SECONDS * 1000
  }, [rollCount, value, rest])

  useFrame(() => {
    const a = anim.current
    const mesh = ref.current
    if (a.start < 0 || !mesh) return
    const t = Math.min(1, (performance.now() - a.start) / (ROLL_SECONDS * 1000))
    const ease = 1 - (1 - t) ** 3
    mesh.position.lerpVectors(a.from, a.to, ease)
    mesh.position.y = DIE / 2 + Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) ** 2 * 2.5
    mesh.quaternion.copy(a.final).multiply(new Quaternion().setFromAxisAngle(a.axis, a.spin * (1 - ease)))
    if (t >= 1) a.start = -1
  })

  return (
    <mesh ref={ref} castShadow position={[rest[0], DIE / 2, rest[1]]}>
      <boxGeometry args={[DIE, DIE, DIE]} />
      {textures.map((map, k) => (
        <meshStandardMaterial key={k} attach={`material-${k}`} map={map} roughness={0.4} />
      ))}
    </mesh>
  )
}

const REST: [number, number][] = [
  [-0.45, 1.1],
  [0.45, 1.35],
]

function Dice({ room }: { room: RoomView }) {
  const { dice, rollCount } = room.game!
  if (!dice) return null
  return (
    <>
      {dice.map((v, k) => (
        <Die key={k} value={v} rollCount={rollCount} rest={REST[k]} />
      ))}
    </>
  )
}

// --- scene ---

/** U9: default ~45° view that fits the whole board for the current aspect ratio. */
function FitCamera({ controls }: { controls: RefObject<Controls | null> }) {
  const { camera, size } = useThree()
  useEffect(() => {
    // Landscape: fixed distance. Portrait: back off until the board width fits the horizontal field of view.
    const halfFovX = Math.tan((45 / 2) * (Math.PI / 180)) * (size.width / size.height)
    const distance = Math.max(13.5, 7.4 / halfFovX)
    camera.position.set(0, distance * 0.74, distance * 0.67)
    camera.lookAt(0, 0, 0)
    controls.current?.saveState()
  }, [camera, size.width, size.height, controls])
  return null
}

interface SceneProps {
  room: RoomView
  selected: number | null
  onSelect: (i: number | null) => void
  quality: Quality
  controls: RefObject<Controls | null>
  /** playerId -> emote currently shown above their token */
  emotes: Record<string, string>
}

export function Scene({ room, selected, onSelect, quality, controls, emotes }: SceneProps) {
  const high = quality === 'high'
  return (
    <Canvas
      shadows={high}
      dpr={high ? [1, 2] : 1}
      camera={{ position: [0, 11, 10.5], fov: 45 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#16322e']} />
      <fog attach="fog" args={['#16322e', 25, 45]} />
      <hemisphereLight args={['#fff6e0', '#3a2a1a', 0.7]} />
      <directionalLight
        position={[6, 14, 5]}
        intensity={1.8}
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-W / 2 - 1}
        shadow-camera-right={W / 2 + 1}
        shadow-camera-top={W / 2 + 1}
        shadow-camera-bottom={-W / 2 - 1}
        shadow-bias={-0.0005}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.32} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1f4a3c" roughness={1} />
      </mesh>
      <Board room={room} selected={selected} onSelect={onSelect} />
      <Tokens room={room} emotes={emotes} />
      <Dice room={room} />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={6}
        maxDistance={30}
        minPolarAngle={0.1}
        maxPolarAngle={1.25}
      />
      <FitCamera controls={controls} />
    </Canvas>
  )
}
