// Pure room rules (F1-F12): the Vercel API loads a RoomDoc from Postgres, calls reduceRoom, saves it back.
// No timers live anywhere: deadlines are stored and enforced whenever any request (tick/heartbeat) arrives.
import { botAcceptsTrade, botAction } from './bot.js'
import { applyAction, createGame, EMOTES, endByTime, START_MONEY, timeoutAction, TOKENS, type GameState, type Rng } from './engine.js'
import type { Auth, EmoteEvent, RoomConfig, RoomRequest, RoomView } from './protocol.js'

export const HEARTBEAT_MS = 15_000
/** Shown as "mất kết nối" after missing ~2 heartbeats. */
export const OFFLINE_MS = 40_000
/** F10/F11: seat kept this long without heartbeat, then the player is dropped. */
export const DROP_MS = 120_000
export const REJOIN_FAILED = 'Không thể vào lại phòng'
export const DEFAULT_CONFIG: RoomConfig = { startMoney: START_MONEY, turnSeconds: 60, gameMinutes: 0 }
/** Pause between computer moves so people can follow them: longer after a roll (dice + token animation). */
export const BOT_STEP_MS = 800
export const BOT_ROLL_STEP_MS = 2500
const BOT_NAMES = ['Máy Tí', 'Máy Tèo', 'Máy Bờm', 'Máy Cuội', 'Máy Mít']

export interface Seat {
  id: string
  secret: string
  name: string
  token: number
  lastSeen: number
  /** Left or dropped mid-game: seat kept for the scoreboard, never counted as online. */
  left?: boolean
  /** Computer player (F13): acts on ticks, never drops, has no client. */
  bot?: boolean
}

export interface RoomDoc {
  code: string
  hostId: string
  config: RoomConfig
  seats: Seat[]
  game: GameState | null
  turnKey: string
  turnDeadline: number | null
  gameDeadline: number | null
  /** Bumped whenever what clients see changes; clients ignore older broadcasts. */
  version: number
  /** Ids shown as connected in the last version (so going offline also bumps the version). */
  online: string
}

export interface RoomContext {
  now: number
  rng: Rng
  newSeat: () => { id: string; secret: string }
}

/** doc null = room should be deleted. seat = credentials to hand back (join / rejoin). */
export type RoomResult = { ok: true; doc: RoomDoc | null; seat?: Seat } | { ok: false; error: string }

export function cleanJoin(name: unknown, token: unknown): { name: string; token: number } | string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 20) : ''
  if (!clean) return 'Tên không hợp lệ'
  if (!Number.isInteger(token) || (token as number) < 0 || (token as number) >= TOKENS.length) return 'Quân cờ không hợp lệ'
  return { name: clean, token: token as number }
}

export function newRoom(code: string, seat: Omit<Seat, 'lastSeen'>, now: number): RoomDoc {
  return {
    code,
    hostId: seat.id,
    config: { ...DEFAULT_CONFIG },
    seats: [{ ...seat, lastSeen: now }],
    game: null,
    turnKey: '',
    turnDeadline: null,
    gameDeadline: null,
    version: 1,
    online: seat.id,
  }
}

export function reduceRoom(doc: RoomDoc, req: RoomRequest, ctx: RoomContext): RoomResult {
  const d = structuredClone(doc)
  const before = JSON.stringify(roomView(doc, 0))
  let seat: Seat | undefined
  let reply = false

  if (!req || typeof req !== 'object') return { ok: false, error: 'Yêu cầu không hợp lệ' }
  if (req.t === 'join') {
    if (d.game) return { ok: false, error: 'Ván đấu đã bắt đầu' } // F5
    if (d.seats.length >= 6) return { ok: false, error: 'Phòng đã đủ 6 người' }
    const v = cleanJoin(req.name, req.token)
    if (typeof v === 'string') return { ok: false, error: v }
    if (d.seats.some((s) => s.token === v.token)) return { ok: false, error: 'Quân cờ này đã có người chọn' }
    seat = { ...ctx.newSeat(), ...v, lastSeen: ctx.now }
    d.seats.push(seat)
    reply = true
  } else if (req.t === 'create') {
    return { ok: false, error: 'Yêu cầu không hợp lệ' } // rooms are created with newRoom
  } else {
    seat = d.seats.find((s) => s.id === req.id && s.secret === req.secret)
    if (!seat) return { ok: false, error: req.t === 'rejoin' ? REJOIN_FAILED : 'Bạn không ở trong phòng này' }
    seat.lastSeen = ctx.now
    const error = handle(d, seat, req, ctx)
    if (error) return { ok: false, error }
    reply = req.t === 'rejoin'
  }

  housekeeping(d, ctx)
  // No people left (lobby: none seated; game: everyone left or dropped) -> delete the room
  if (!d.seats.some((s) => !s.bot && !s.left)) return { ok: true, doc: null }
  const online = roomView(d, ctx.now).players.filter((p) => p.connected).map((p) => p.id).join(',')
  if (JSON.stringify(roomView(d, 0)) !== before || online !== d.online) {
    d.online = online
    d.version++
  }
  return { ok: true, doc: d, seat: reply && d.seats.includes(seat) ? seat : undefined }
}

function handle(d: RoomDoc, seat: Seat, req: Exclude<RoomRequest, { t: 'create' | 'join' }>, ctx: RoomContext) {
  switch (req.t) {
    case 'rejoin':
    case 'heartbeat':
    case 'tick':
      return
    case 'config': {
      if (d.hostId !== seat.id || d.game) return 'Chỉ chủ phòng được cấu hình trước khi bắt đầu'
      const config = cleanConfig(req.config)
      if (!config) return 'Cấu hình không hợp lệ'
      d.config = config
      return
    }
    case 'addBot': {
      if (d.hostId !== seat.id || d.game) return 'Chỉ chủ phòng được thêm máy trước khi bắt đầu'
      if (d.seats.length >= 6) return 'Phòng đã đủ 6 người'
      const token = TOKENS.findIndex((_, t) => !d.seats.some((s) => s.token === t))
      const name = BOT_NAMES.find((n) => !d.seats.some((s) => s.name === n)) ?? 'Máy'
      d.seats.push({ ...ctx.newSeat(), name, token, lastSeen: ctx.now, bot: true })
      return
    }
    case 'removeBot': {
      if (d.hostId !== seat.id || d.game) return 'Chỉ chủ phòng được bớt máy trước khi bắt đầu'
      const bot = d.seats.find((s) => s.bot && s.id === req.botId)
      if (!bot) return 'Không tìm thấy máy'
      d.seats = d.seats.filter((s) => s !== bot)
      return
    }
    case 'start':
      if (d.hostId !== seat.id) return 'Chỉ chủ phòng được bắt đầu'
      if (d.game) return 'Ván đấu đã bắt đầu'
      if (d.seats.length < 2) return 'Cần ít nhất 2 người chơi'
      d.game = createGame(
        d.seats.map(({ id, name, token }) => ({ id, name, token })),
        ctx.rng,
        d.config.startMoney,
      )
      d.gameDeadline = d.config.gameMinutes > 0 ? ctx.now + d.config.gameMinutes * 60_000 : null
      return
    case 'action': {
      if (!d.game) return 'Ván đấu chưa bắt đầu'
      const r = applyAction(d.game, seat.id, req.action, ctx.rng)
      if (!r.ok) return r.error
      d.game = r.state
      return
    }
    case 'leave':
      removeSeat(d, seat, ctx)
      return
    default:
      return 'Yêu cầu không hợp lệ'
  }
}

const botIds = (d: RoomDoc) => d.seats.filter((s) => s.bot).map((s) => s.id)

/** Enforce everything time-based: dropped players, game time limit, turn timeout, computer moves. */
function housekeeping(d: RoomDoc, ctx: RoomContext) {
  for (const s of [...d.seats]) if (!s.bot && !s.left && ctx.now - s.lastSeen > DROP_MS) removeSeat(d, s, ctx) // F11

  if (d.game && d.game.phase !== 'ended' && d.gameDeadline !== null && ctx.now >= d.gameDeadline) d.game = endByTime(d.game) // R24
  // F15: only computers left playing -> stop now, richest wins
  const humanPlaying = d.game?.players.some((p) => !p.bankrupt && !botIds(d).includes(p.id))
  if (d.game && d.game.phase !== 'ended' && !humanPlaying) d.game = endByTime(d.game)

  let botStep = 0 // ms until the computer's next move, 0 = no computer moved
  const g = d.game
  if (g && g.phase !== 'ended' && d.turnDeadline !== null && ctx.now >= d.turnDeadline) {
    // F8 timeout (F12: offline players too), or the computer's next step (F14)
    const id = g.players[g.current].id
    const isBot = botIds(d).includes(id)
    const action = isBot ? botAction(g, id, botIds(d)) : timeoutAction(g)
    if (isBot) botStep = action?.type === 'roll' ? BOT_ROLL_STEP_MS : BOT_STEP_MS
    const r = action && applyAction(g, id, action, ctx.rng)
    if (r && r.ok) d.game = r.state
  }
  answerBotTrade(d, ctx)
  scheduleTurn(d, ctx.now, botStep)
}

/** A trade offered to a computer is answered immediately. */
function answerBotTrade(d: RoomDoc, ctx: RoomContext) {
  const t = d.game?.trade
  if (!d.game || !t || !botIds(d).includes(t.to)) return
  const r = applyAction(d.game, t.to, { type: botAcceptsTrade(d.game, t) ? 'acceptTrade' : 'rejectTrade' }, ctx.rng)
  if (r.ok) d.game = r.state
}

/** Restart the turn timer whenever the turn, phase or roll changes; computers get a short step timer. */
function scheduleTurn(d: RoomDoc, now: number, botStep = 0) {
  const g = d.game
  if (!g || g.phase === 'ended') {
    d.turnDeadline = null
    if (g) d.gameDeadline = null
    return
  }
  const key = `${g.current}:${g.phase}:${g.rollCount}`
  if (key === d.turnKey && !botStep) return
  d.turnKey = key
  const botTurn = botIds(d).includes(g.players[g.current].id)
  d.turnDeadline = now + (botTurn ? botStep || BOT_STEP_MS : d.config.turnSeconds * 1000)
}

function removeSeat(d: RoomDoc, seat: Seat, ctx: RoomContext) {
  if (!d.game) d.seats = d.seats.filter((s) => s !== seat)
  else {
    const p = d.game.players.find((x) => x.id === seat.id)
    if (p && !p.bankrupt && d.game.phase !== 'ended') {
      const r = applyAction(d.game, seat.id, { type: 'resign' }, ctx.rng)
      if (r.ok) d.game = r.state
    }
    seat.left = true
  }
  if (d.hostId === seat.id) {
    const humans = d.seats.filter((s) => s !== seat && !s.bot && !s.left)
    const next = humans.find((s) => ctx.now - s.lastSeen < OFFLINE_MS) ?? humans[0]
    if (next) d.hostId = next.id
  }
}

/** F16: a quick reaction is relayed only for a seated player and only from the EMOTES list. Nothing is stored. */
export function emoteFrom(doc: RoomDoc, req: Auth & { emote: unknown }): EmoteEvent | string {
  const seat = doc.seats.find((s) => s.id === req.id && s.secret === req.secret && !s.left)
  if (!seat) return 'Bạn không ở trong phòng này'
  if (typeof req.emote !== 'string' || !EMOTES.includes(req.emote)) return 'Biểu cảm không hợp lệ'
  return { from: seat.id, emote: req.emote }
}

export function cleanConfig(c: Partial<RoomConfig> | undefined): RoomConfig | null {
  const ok = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max
  if (!c || !ok(c.startMoney, 5_000_000, 50_000_000) || !ok(c.turnSeconds, 15, 180) || !ok(c.gameMinutes, 0, 240))
    return null
  return { startMoney: c.startMoney!, turnSeconds: c.turnSeconds!, gameMinutes: c.gameMinutes! }
}

/** What clients may see: no seat secrets, no card deck order (N3). */
export function roomView(d: RoomDoc, now: number): RoomView {
  return {
    code: d.code,
    hostId: d.hostId,
    config: d.config,
    players: d.seats.map((s) => ({
      id: s.id,
      name: s.name,
      token: s.token,
      connected: !!s.bot || (!s.left && now - s.lastSeen < OFFLINE_MS),
      bot: !!s.bot,
    })),
    game: d.game && { ...d.game, decks: { chance: [], chest: [] } },
    turnDeadline: d.turnDeadline,
    gameDeadline: d.gameDeadline,
    now,
    version: d.version,
  }
}
