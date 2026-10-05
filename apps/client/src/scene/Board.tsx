import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { BOARD, GO_SALARY, GROUP_COLORS, type GameState, type RoomView, type Square } from '@monopoly-vn/engine'
import { formatShort, LANDMARKS, landmarkPhoto, playerColor } from '../util'

// --- layout (world units, board top at y = 0, GO at the bottom-right like the classic board) ---
export const CORNER = 1.6
export const W = 2 * CORNER + 9
const HALF = W / 2

/** Centre of square i and the Y rotation that makes local -z point to the board centre. */
export function squareFrame(i: number) {
  const side = Math.floor(i / 10)
  const k = i % 10
  const d = k === 0 ? CORNER / 2 : CORNER + k - 0.5
  const edge = HALF - CORNER / 2
  switch (side) {
    case 0:
      return { x: HALF - d, z: edge, angle: 0 }
    case 1:
      return { x: -edge, z: HALF - d, angle: -Math.PI / 2 }
    case 2:
      return { x: -HALF + d, z: -edge, angle: Math.PI }
    default:
      return { x: edge, z: -HALF + d, angle: Math.PI / 2 }
  }
}

const cellWidth = (i: number) => (i % 10 === 0 ? CORNER : 1)

// --- board texture, drawn once on a 2D canvas so Vietnamese text renders with the UI font ---
const S = 2048
const U = S / W
const FONT = '"Be Vietnam Pro", system-ui, sans-serif'
const INK = '#2b1d0e'

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines.at(-1)
    if (last && ctx.measureText(`${last} ${word}`).width <= max) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

/** Draw a photo into a local-units box, cropped to fill it (like CSS object-fit: cover). */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const box = w / h
  let [sx, sy, sw, sh] = [0, 0, img.width, img.height]
  if (img.width / img.height > box) {
    sw = img.height * box
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / box
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x * U, y * U, w * U, h * U)
  ctx.strokeStyle = 'rgba(59, 42, 26, 0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(x * U, y * U, w * U, h * U)
}

type Photos = Map<number, HTMLImageElement>

function drawCell(ctx: CanvasRenderingContext2D, sq: Square, i: number, photos: Photos) {
  const photo = photos.get(i)
  const f = squareFrame(i)
  const w = cellWidth(i) * U
  const d = CORNER * U
  ctx.save()
  ctx.translate((f.x + HALF) * U, (f.z + HALF) * U)
  ctx.rotate(-f.angle)
  ctx.fillStyle = '#f7efdc'
  ctx.fillRect(-w / 2, -d / 2, w, d)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  /** Text centred at local y (world units), wrapped to the cell width. */
  const text = (s: string, y: number, size: number, weight = 600, color = INK) => {
    ctx.font = `${weight} ${size * U}px ${FONT}`
    ctx.fillStyle = color
    const lines = wrap(ctx, s, w * 0.86)
    lines.forEach((line, k) => ctx.fillText(line, 0, (y + (k - (lines.length - 1) / 2) * size * 1.15) * U))
  }

  switch (sq.kind) {
    case 'property':
      ctx.fillStyle = GROUP_COLORS[sq.group]
      ctx.fillRect(-w / 2, -d / 2, w, 0.36 * U)
      if (photo) {
        text(sq.name, -0.3, 0.12, 700)
        drawPhoto(ctx, photo, -0.45, -0.15, 0.9, 0.62)
        text(formatShort(sq.price), 0.64, 0.13, 600)
      } else {
        text(sq.name, -0.1, 0.15, 700)
        text(formatShort(sq.price), 0.6, 0.14, 500)
      }
      break
    case 'airport':
    case 'utility':
      if (photo) {
        text(sq.name, -0.6, 0.11, 700)
        drawPhoto(ctx, photo, -0.45, -0.42, 0.9, 0.88)
        text(formatShort(sq.price), 0.64, 0.13, 600)
      } else {
        text(sq.name, -0.5, 0.12, 700)
        text(sq.kind === 'airport' ? '✈' : i === 12 ? '⚡' : '💧', 0.12, 0.42, 400, '#1f4e9e')
        text(formatShort(sq.price), 0.6, 0.14, 500)
      }
      break
    case 'chance':
      text('CƠ HỘI', -0.5, 0.14, 800)
      text('?', 0.15, 0.75, 800, '#e67e22')
      break
    case 'chest':
      text('KHÍ VẬN', -0.5, 0.14, 800)
      // lì xì envelope
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(-0.24 * U, -0.18 * U, 0.48 * U, 0.66 * U)
      ctx.fillStyle = '#f4d03f'
      ctx.beginPath()
      ctx.arc(0, 0.12 * U, 0.1 * U, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'tax':
      text(sq.name, -0.45, 0.14, 800)
      text('₫', 0.1, 0.5, 700, '#b8860b')
      text(`Nộp ${formatShort(sq.amount)}`, 0.6, 0.13, 600)
      break
    case 'go':
      text('XUẤT PHÁT', -0.25, 0.24, 800, '#c0392b')
      text(`Nhận ${formatShort(GO_SALARY)} khi đi qua`, 0.12, 0.12, 600)
      text('⟵', 0.5, 0.5, 800, '#c0392b')
      break
    case 'jail':
      ctx.strokeStyle = INK
      ctx.lineWidth = 0.03 * U
      for (let x = -0.4; x <= 0.41; x += 0.2) {
        ctx.beginPath()
        ctx.moveTo(x * U, -0.55 * U)
        ctx.lineTo(x * U, 0.15 * U)
        ctx.stroke()
      }
      text('NHÀ TÙ', -0.2, 0.2, 800, '#c0392b')
      text('Chỉ thăm tù', 0.5, 0.13, 600)
      break
    case 'parking':
      ctx.fillStyle = '#1f4e9e'
      ctx.fillRect(-0.3 * U, -0.45 * U, 0.6 * U, 0.6 * U)
      text('P', -0.15, 0.45, 800, '#fff')
      text('BÃI ĐỖ XE', 0.45, 0.17, 800)
      break
    case 'goToJail':
      text('🚔', -0.15, 0.55, 400)
      text('VÀO TÙ', 0.45, 0.2, 800, '#c0392b')
      break
  }
  ctx.strokeStyle = '#3b2a1a'
  ctx.lineWidth = 3
  ctx.strokeRect(-w / 2, -d / 2, w, d)
  ctx.restore()
}

function drawBoard(ctx: CanvasRenderingContext2D, photos: Photos) {
  ctx.fillStyle = '#efe4c8'
  ctx.fillRect(0, 0, S, S)

  // Centre: Đông Sơn drum motif + title
  ctx.save()
  ctx.translate(S / 2, S / 2)
  ctx.strokeStyle = 'rgba(150, 100, 40, 0.35)'
  ctx.lineWidth = 6
  for (const r of [3.3, 2.9, 2.1, 1.3, 0.55]) {
    ctx.beginPath()
    ctx.arc(0, 0, r * U, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(150, 100, 40, 0.25)'
  ctx.beginPath()
  for (let k = 0; k < 28; k++) {
    const r = (k % 2 ? 0.2 : 0.55) * U
    const a = (k / 28) * Math.PI * 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.fill()
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(Math.cos(a) * 2.5 * U, Math.sin(a) * 2.5 * U, 0.06 * U, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.rotate(-Math.PI / 4)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c0392b'
  ctx.font = `800 ${0.82 * U}px ${FONT}`
  ctx.fillText('CỜ TỶ PHÚ', 0, -0.35 * U)
  ctx.fillStyle = '#b8860b'
  ctx.font = `700 ${0.5 * U}px ${FONT}`
  ctx.fillText('VIỆT NAM', 0, 0.5 * U)
  ctx.restore()

  BOARD.forEach((sq, i) => drawCell(ctx, sq, i, photos))
}

function useBoardTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = S
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
  useEffect(() => {
    let alive = true
    const photos: Photos = new Map()
    const draw = () => {
      if (!alive) return
      drawBoard((texture.image as HTMLCanvasElement).getContext('2d')!, photos)
      texture.needsUpdate = true
    }
    draw()
    // Photos are same-origin (public/landmarks) so the canvas stays untainted for WebGL. A missing photo just keeps the plain cell.
    const loads = LANDMARKS.map(
      ({ square }) =>
        new Promise<void>((done) => {
          const img = new Image()
          img.onload = () => {
            photos.set(square, img)
            done()
          }
          img.onerror = () => done()
          img.src = landmarkPhoto(square)
        }),
    )
    Promise.all([document.fonts.ready, ...loads]).then(draw) // redraw once font and photos are in
    return () => {
      alive = false
    }
  }, [texture])
  return texture
}

function labelTexture(title: string, bg: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 352
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 352)
  ctx.strokeStyle = '#fff6'
  ctx.lineWidth = 12
  ctx.strokeRect(20, 20, 472, 312)
  ctx.fillStyle = '#fff'
  ctx.font = `800 72px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, 256, 176)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

// --- 3D pieces ---

/** Grows from zero when it first appears (U5). */
function GrowIn({ children, ...props }: React.ComponentProps<'group'>) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (g && g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 3))
  })
  return (
    <group ref={ref} scale={0.01} {...props}>
      {children}
    </group>
  )
}

function House({ x, hotel }: { x: number; hotel?: boolean }) {
  const [w, h] = hotel ? [0.5, 0.2] : [0.16, 0.13]
  return (
    <GrowIn position={[x, 0, -CORNER / 2 + 0.18]}>
      <mesh castShadow position-y={h / 2}>
        <boxGeometry args={[w, h, 0.18]} />
        <meshStandardMaterial color={hotel ? '#c0392b' : '#2e8b3e'} />
      </mesh>
      {hotel ? (
        <mesh castShadow position-y={h + 0.025}>
          <boxGeometry args={[w + 0.04, 0.05, 0.22]} />
          <meshStandardMaterial color="#8e2a1f" />
        </mesh>
      ) : (
        <mesh castShadow position-y={h + 0.05} rotation-y={Math.PI / 4}>
          <coneGeometry args={[0.14, 0.1, 4]} />
          <meshStandardMaterial color="#1f6b2e" />
        </mesh>
      )}
    </GrowIn>
  )
}

interface CellProps {
  i: number
  game: GameState
  room: RoomView
  selected: boolean
  onSelect: (i: number) => void
}

function Cell({ i, game, room, selected, onSelect }: CellProps) {
  const [hover, setHover] = useState(false)
  const f = squareFrame(i)
  const w = cellWidth(i)
  const o = game.squares[i]
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.angle}>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.004}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(i)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[w, CORNER]} />
        <meshBasicMaterial
          color={o?.mortgaged ? '#000' : '#ffd54a'}
          transparent
          opacity={selected ? 0.45 : hover ? 0.25 : o?.mortgaged ? 0.4 : 0}
          depthWrite={false}
        />
      </mesh>
      {o?.owner && (
        <mesh castShadow position={[0, 0.02, CORNER / 2 - 0.1]}>
          <boxGeometry args={[w * 0.86, 0.04, 0.12]} />
          <meshStandardMaterial color={playerColor(room, o.owner)} />
        </mesh>
      )}
      {o && o.houses === 5 && <House x={0} hotel />}
      {o && o.houses > 0 && o.houses < 5 && Array.from({ length: o.houses }, (_, k) => <House key={k} x={-0.3 + k * 0.2} />)}
    </group>
  )
}

function CardPiles() {
  const [chance, chest] = useMemo(() => [labelTexture('CƠ HỘI', '#e67e22'), labelTexture('KHÍ VẬN', '#c0392b')], [])
  return (
    <>
      {[
        { map: chance, pos: [-2.1, -2.1] },
        { map: chest, pos: [2.1, 2.1] },
      ].map(({ map, pos }, k) => (
        <mesh key={k} castShadow position={[pos[0], 0.08, pos[1]]} rotation-y={-Math.PI / 4}>
          <boxGeometry args={[1.5, 0.16, 1.03]} />
          {[0, 1, 2, 3, 4, 5].map((face) => (
            <meshStandardMaterial key={face} attach={`material-${face}`} color={face === 2 ? '#fff' : '#f0e6d0'} map={face === 2 ? map : null} />
          ))}
        </mesh>
      ))}
    </>
  )
}

interface BoardProps {
  room: RoomView
  selected: number | null
  onSelect: (i: number) => void
}

export function Board({ room, selected, onSelect }: BoardProps) {
  const texture = useBoardTexture()
  const game = room.game!
  return (
    <group>
      <mesh receiveShadow position-y={-0.16}>
        <boxGeometry args={[W + 0.5, 0.3, W + 0.5]} />
        <meshStandardMaterial color="#7a4a24" roughness={0.7} />
      </mesh>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[W, W]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
      {BOARD.map((_, i) => (
        <Cell key={i} i={i} game={game} room={room} selected={selected === i} onSelect={onSelect} />
      ))}
      <CardPiles />
    </group>
  )
}
