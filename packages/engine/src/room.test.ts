import { describe, expect, it } from 'vitest'
import type { RoomRequest } from './protocol.js'
import { BOT_ROLL_STEP_MS, BOT_STEP_MS, DROP_MS, newRoom, reduceRoom, REJOIN_FAILED, roomView, type RoomDoc, type Seat } from './room.js'

let ids = 0
const ctx = (now: number) => ({ now, rng: Math.random, newSeat: () => ({ id: `p${++ids}`, secret: `s${ids}` }) })

function ok(doc: RoomDoc, req: RoomRequest, now = 0) {
  const r = reduceRoom(doc, req, ctx(now))
  if (!r.ok) throw new Error(r.error)
  return r
}

function err(doc: RoomDoc, req: RoomRequest, now = 0) {
  const r = reduceRoom(doc, req, ctx(now))
  if (r.ok) throw new Error(`expected ${req.t} to fail`)
  return r.error
}

const auth = (doc: RoomDoc, s: Pick<Seat, 'id' | 'secret'>) => ({ code: doc.code, id: s.id, secret: s.secret })

/** Two-player room, started at t=0. */
function started() {
  const host = { id: 'host', secret: 'hs', name: 'An', token: 0 }
  let doc = newRoom('ABC123', host, 0)
  const joined = ok(doc, { t: 'join', code: 'ABC123', name: 'Bình', token: 1 })
  doc = joined.doc!
  const guest = joined.seat!
  doc = ok(doc, { t: 'start', ...auth(doc, host) }).doc!
  return { doc, host, guest }
}

it('F3/F5: join validates token, capacity and game state', () => {
  const doc = newRoom('ABC123', { id: 'host', secret: 'hs', name: 'An', token: 0 }, 0)
  expect(err(doc, { t: 'join', code: 'ABC123', name: 'Bình', token: 0 })).toBe('Quân cờ này đã có người chọn')
  expect(err(doc, { t: 'join', code: 'ABC123', name: '   ', token: 1 })).toBe('Tên không hợp lệ')
  const r = ok(doc, { t: 'join', code: 'ABC123', name: '  Bình  ', token: 1 })
  expect(r.seat).toMatchObject({ name: 'Bình', token: 1 })
  expect(r.doc!.version).toBe(doc.version + 1)

  const { doc: game } = started()
  expect(err(game, { t: 'join', code: 'ABC123', name: 'Chi', token: 2 })).toBe('Ván đấu đã bắt đầu')
})

it('F4: only the host configures and starts', () => {
  const host = { id: 'host', secret: 'hs', name: 'An', token: 0 }
  const doc = ok(newRoom('ABC123', host, 0), { t: 'join', code: 'ABC123', name: 'Bình', token: 1 })
  const guest = doc.seat!
  expect(err(doc.doc!, { t: 'start', ...auth(doc.doc!, guest) })).toBe('Chỉ chủ phòng được bắt đầu')
  const config = { startMoney: 20_000_000, turnSeconds: 30, gameMinutes: 0 }
  expect(err(doc.doc!, { t: 'config', config: { ...config, turnSeconds: 1 }, ...auth(doc.doc!, host) })).toBe('Cấu hình không hợp lệ')
  const configured = ok(doc.doc!, { t: 'config', config, ...auth(doc.doc!, host) }).doc!
  const s = ok(configured, { t: 'start', ...auth(configured, host) }).doc!
  expect(s.game!.players.every((p) => p.money === 20_000_000)).toBe(true)
  expect(s.turnDeadline).toBe(30_000)
})

it('F6/F7: actions go through the engine; wrong secret is rejected', () => {
  const { doc, host, guest } = started()
  const current = doc.game!.players[doc.game!.current].id === host.id ? host : guest
  const other = current === host ? guest : host
  expect(err(doc, { t: 'action', action: { type: 'roll' }, ...auth(doc, other) })).toBe('Chưa tới lượt của bạn')
  expect(err(doc, { t: 'action', action: { type: 'roll' }, ...auth(doc, { id: current.id, secret: 'x' }) })).toBe(
    'Bạn không ở trong phòng này',
  )
  const after = ok(doc, { t: 'action', action: { type: 'roll' }, ...auth(doc, current) }).doc!
  expect(after.game!.rollCount).toBe(1)
})

it('N3: view hides deck order and seat secrets', () => {
  const { doc } = started()
  const view = roomView(doc, 0)
  expect(view.game!.decks).toEqual({ chance: [], chest: [] })
  expect(JSON.stringify(view)).not.toContain('"secret"')
})

it('F10: rejoin returns the seat; unknown seat fails', () => {
  const { doc, guest } = started()
  expect(ok(doc, { t: 'rejoin', ...auth(doc, guest) }).seat?.id).toBe(guest.id)
  expect(err(doc, { t: 'rejoin', ...auth(doc, { id: guest.id, secret: 'nope' }) })).toBe(REJOIN_FAILED)
})

it('F8: a tick after the deadline applies the default action', () => {
  const { doc, host } = started()
  const deadline = doc.turnDeadline!
  expect(ok(doc, { t: 'tick', ...auth(doc, host) }, deadline - 1).doc!.game!.rollCount).toBe(0)
  const late = ok(doc, { t: 'tick', ...auth(doc, host) }, deadline).doc!
  expect(late.game!.rollCount).toBe(1) // auto roll
  expect(late.turnDeadline).toBeGreaterThan(deadline)
})

it('F11: a player silent past the drop window resigns', () => {
  const { doc, host, guest } = started()
  const now = DROP_MS + 1
  const r = ok(doc, { t: 'heartbeat', ...auth(doc, host) }, now).doc!
  expect(r.game!.players.find((p) => p.id === guest.id)!.bankrupt).toBe(true)
  expect(r.game!.winner).toBe(host.id)
  expect(roomView(r, now).players.find((p) => p.id === guest.id)!.connected).toBe(false)
})

it('going offline bumps the version so clients see it', () => {
  const { doc, host } = started()
  const quiet = ok(doc, { t: 'heartbeat', ...auth(doc, host) }, 1000).doc!
  const later = ok(quiet, { t: 'heartbeat', ...auth(quiet, host) }, 50_000).doc!
  expect(later.version).toBeGreaterThan(quiet.version)
})

it('leaving the lobby moves host; last one out deletes the room', () => {
  const host = { id: 'host', secret: 'hs', name: 'An', token: 0 }
  const joined = ok(newRoom('ABC123', host, 0), { t: 'join', code: 'ABC123', name: 'Bình', token: 1 })
  const guest = joined.seat!
  const left = ok(joined.doc!, { t: 'leave', ...auth(joined.doc!, host) }).doc!
  expect(left.hostId).toBe(guest.id)
  expect(ok(left, { t: 'leave', ...auth(left, guest) }).doc).toBeNull()
})

describe('computer players (F13-F15)', () => {
  const host = { id: 'host', secret: 'hs', name: 'An', token: 0 }
  /** One person + 2 computers, game started. */
  function vsBots() {
    let doc = newRoom('BOT123', host, 0)
    doc = ok(doc, { t: 'addBot', ...auth(doc, host) }).doc!
    doc = ok(doc, { t: 'addBot', ...auth(doc, host) }).doc!
    return ok(doc, { t: 'start', ...auth(doc, host) }).doc!
  }

  it('F13: host adds and removes bots in the lobby', () => {
    const doc = ok(newRoom('BOT123', host, 0), { t: 'addBot', ...auth(newRoom('BOT123', host, 0), host) }).doc!
    const bot = roomView(doc, 999_999).players[1]
    expect(bot).toMatchObject({ name: 'Máy Tí', token: 1, bot: true, connected: true })
    const removed = ok(doc, { t: 'removeBot', botId: bot.id, ...auth(doc, host) }).doc!
    expect(removed.seats).toHaveLength(1)
  })

  it('F14: a bot moves one step per tick at its short deadline', () => {
    const doc = vsBots()
    const botTurn = { ...doc, turnKey: '', game: { ...doc.game!, current: doc.game!.players.findIndex((p) => p.id !== host.id) } }
    const scheduled = ok(botTurn, { t: 'heartbeat', ...auth(botTurn, host) }, 10).doc!
    expect(scheduled.turnDeadline).toBe(10 + BOT_STEP_MS)
    const moved = ok(scheduled, { t: 'tick', ...auth(scheduled, host) }, 10 + BOT_STEP_MS).doc!
    expect(moved.game!.rollCount).toBe(1)
    expect(moved.turnDeadline).toBe(10 + BOT_STEP_MS + BOT_ROLL_STEP_MS) // longer pause after a roll
  })

  it('F14: trades offered to a bot are answered at once', () => {
    const doc = vsBots()
    const game = { ...doc.game!, current: doc.game!.players.findIndex((p) => p.id === host.id) }
    const bot = game.players.find((p) => p.id !== host.id)!.id
    game.squares = game.squares.map((o, i) => (o && i === 1 ? { ...o, owner: bot } : o))
    const d = { ...doc, game }
    const trade = { to: bot, giveSquares: [], getSquares: [1], giveMoney: 5_000_000, getMoney: 0, giveJailCards: 0, getJailCards: 0 }
    const r = ok(d, { t: 'action', action: { type: 'proposeTrade', trade }, ...auth(d, host) }).doc!
    expect(r.game!.trade).toBeNull()
    expect(r.game!.squares[1]!.owner).toBe(host.id)
  })

  it('F15: when the last person is out, the game ends; leaving deletes the room', () => {
    const doc = vsBots()
    const resigned = ok(doc, { t: 'action', action: { type: 'resign' }, ...auth(doc, host) }).doc!
    expect(resigned.game!.phase).toBe('ended')
    expect(resigned.game!.winner).not.toBe(host.id)
    expect(ok(resigned, { t: 'leave', ...auth(resigned, host) }).doc).toBeNull()

    const lobby = ok(newRoom('BOT123', host, 0), { t: 'addBot', ...auth(newRoom('BOT123', host, 0), host) }).doc!
    expect(ok(lobby, { t: 'leave', ...auth(lobby, host) }).doc).toBeNull()
  })
})
