import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { LatheGeometry, Vector2, Vector3, type Group } from 'three'
import { BOARD, type Player, type RoomView } from '@monopoly-vn/engine'
import { play } from '../sound'
import { playerColor, timeline } from '../util'
import { squareFrame } from './Board'

// Procedural placeholder models (U16). Swap for GLB files in public/models when real art exists.

const Mat = (p: { color: string; metal?: boolean }) => (
  <meshStandardMaterial color={p.color} metalness={p.metal ? 0.6 : 0} roughness={p.metal ? 0.35 : 0.7} />
)

function NonLa() {
  return (
    <group>
      <mesh castShadow position-y={0.1}>
        <coneGeometry args={[0.24, 0.17, 32]} />
        <Mat color="#d9b56c" />
      </mesh>
      <mesh position-y={0.02} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.235, 0.012, 8, 32]} />
        <Mat color="#a8803c" />
      </mesh>
    </group>
  )
}

function TrongDong() {
  const geometry = useMemo(
    () =>
      new LatheGeometry(
        [
          [0, 0],
          [0.15, 0],
          [0.13, 0.06],
          [0.12, 0.1],
          [0.17, 0.2],
          [0, 0.2],
        ].map(([x, y]) => new Vector2(x, y)),
        32,
      ),
    [],
  )
  return (
    <group>
      <mesh castShadow geometry={geometry}>
        <Mat color="#b08d57" metal />
      </mesh>
      <mesh position-y={0.202} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.07, 14]} />
        <Mat color="#f4d03f" metal />
      </mesh>
    </group>
  )
}

function BanhChung() {
  return (
    <group position-y={0.07}>
      <mesh castShadow>
        <boxGeometry args={[0.26, 0.13, 0.26]} />
        <Mat color="#3f7d3a" />
      </mesh>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} rotation-y={r}>
          <boxGeometry args={[0.27, 0.135, 0.02]} />
          <Mat color="#e8d9a8" />
        </mesh>
      ))}
    </group>
  )
}

function XichLo() {
  const wheel = (x: number, z: number) => (
    <mesh key={`${x}${z}`} position={[x, 0.08, z]} rotation-y={Math.PI / 2}>
      <torusGeometry args={[0.07, 0.015, 8, 20]} />
      <Mat color="#222" />
    </mesh>
  )
  return (
    <group>
      {wheel(0.1, -0.1)}
      {wheel(0.1, 0.1)}
      {wheel(-0.17, 0)}
      <mesh castShadow position={[0.08, 0.17, 0]}>
        <boxGeometry args={[0.16, 0.08, 0.2]} />
        <Mat color="#c0392b" />
      </mesh>
      <mesh castShadow position={[0.0, 0.25, 0]}>
        <boxGeometry args={[0.03, 0.16, 0.2]} />
        <Mat color="#c0392b" />
      </mesh>
      <mesh position={[-0.08, 0.14, 0]} rotation-z={0.5}>
        <boxGeometry args={[0.22, 0.02, 0.02]} />
        <Mat color="#555" metal />
      </mesh>
    </group>
  )
}

function HoaSen() {
  const petals = (n: number, tilt: number, scale: number, color: string) =>
    Array.from({ length: n }, (_, k) => (
      <group key={`${n}-${k}`} rotation-y={(k / n) * Math.PI * 2}>
        <mesh castShadow position={[0, 0.09, 0.08 * scale]} rotation-x={tilt} scale={[0.06 * scale, 0.025, 0.12 * scale]}>
          <sphereGeometry args={[1, 12, 8]} />
          <Mat color={color} />
        </mesh>
      </group>
    ))
  return (
    <group>
      {petals(8, -0.5, 1.15, '#f48fb1')}
      {petals(6, -0.9, 0.8, '#f8bbd0')}
      <mesh position-y={0.12}>
        <cylinderGeometry args={[0.045, 0.04, 0.05, 16]} />
        <Mat color="#f4d03f" />
      </mesh>
    </group>
  )
}

function XeMay() {
  return (
    <group>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.08, 0]}>
          <torusGeometry args={[0.065, 0.02, 8, 20]} />
          <Mat color="#222" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[0.26, 0.08, 0.09]} />
        <Mat color="#1d7fe0" />
      </mesh>
      <mesh position={[-0.04, 0.19, 0]}>
        <boxGeometry args={[0.14, 0.03, 0.08]} />
        <Mat color="#222" />
      </mesh>
      <mesh position={[0.13, 0.22, 0]}>
        <boxGeometry args={[0.02, 0.02, 0.18]} />
        <Mat color="#aaa" metal />
      </mesh>
    </group>
  )
}

const MODELS = [NonLa, TrongDong, BanhChung, XichLo, HoaSen, XeMay]

/** Spot for the k-th token sharing a square, in world space. */
function slotPosition(square: number, k: number, out = new Vector3()) {
  const f = squareFrame(square)
  const spread = square % 10 === 0 ? 1.6 : 1
  const lx = (k % 2 ? 0.22 : -0.22) * spread
  const lz = -0.15 + Math.floor(k / 2) * 0.4
  const cos = Math.cos(f.angle)
  const sin = Math.sin(f.angle)
  return out.set(f.x + lx * cos + lz * sin, 0, f.z - lx * sin + lz * cos)
}

const STEP_SECONDS = 0.2
const MAX_STEPS = 12 // longer moves (cards, jail) glide straight there

function Token({ player, color, slot, emote }: { player: Player; color: string; slot: number; emote?: string }) {
  const ref = useRef<Group>(null)
  const anim = useRef({ square: player.position, from: new Vector3(), to: new Vector3(), t: 1, duration: 1, height: 0 })
  const target = useMemo(() => new Vector3(), [])
  const Model = MODELS[player.token] ?? NonLa

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const a = anim.current
    if (a.t < 1) {
      a.t = Math.min(1, a.t + dt / a.duration)
      g.position.lerpVectors(a.from, a.to, a.t)
      g.position.y = Math.sin(Math.PI * a.t) * a.height
      return
    }
    if (a.square !== player.position && performance.now() >= timeline.diceSettledAt) {
      const distance = (player.position - a.square + BOARD.length) % BOARD.length
      const direct = distance > MAX_STEPS || player.inJail
      a.square = direct ? player.position : (a.square + 1) % BOARD.length
      a.from.copy(g.position)
      slotPosition(a.square, slot, a.to)
      Object.assign(a, { t: 0, duration: direct ? 0.7 : STEP_SECONDS, height: direct ? 1.2 : 0.35 })
      g.rotation.y = squareFrame(a.square).angle
      if (!direct) play('step')
      return
    }
    // settle into the slot (slots shift when other tokens arrive or leave)
    g.position.lerp(slotPosition(a.square, slot, target), Math.min(1, dt * 8))
  })

  return (
    <group ref={ref} position={slotPosition(player.position, slot)} rotation-y={squareFrame(player.position).angle} scale={1.15}>
      <mesh castShadow receiveShadow position-y={0.02}>
        <cylinderGeometry args={[0.2, 0.21, 0.04, 32]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <group position-y={0.04}>
        <Model />
      </group>
      {emote && (
        // F16: speech bubble that follows the token while it moves
        <Html position={[0, 0.95, 0]} center zIndexRange={[5, 0]}>
          <div className={`emote-bubble ${[...emote].length <= 2 ? 'big' : ''}`} style={{ borderColor: color }}>
            {emote}
          </div>
        </Html>
      )}
    </group>
  )
}

export function Tokens({ room, emotes }: { room: RoomView; emotes: Record<string, string> }) {
  const players = room.game!.players.filter((p) => !p.bankrupt)
  return (
    <>
      {players.map((p) => (
        <Token
          key={p.id}
          player={p}
          color={playerColor(room, p.id)}
          slot={players.filter((x) => x.position === p.position).indexOf(p)}
          emote={emotes[p.id]}
        />
      ))}
    </>
  )
}
