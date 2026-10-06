// Vercel Function: POST /api/room. Thin I/O around the pure room rules in @monopoly-vn/engine/room.
// State lives in Supabase Postgres (table rooms); updates are pushed with Supabase Realtime broadcast.
import { randomBytes, randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
// Relative source import on purpose: Vercel compiles these .ts files to .js but does not rewrite the
// engine package.json `exports` (which point at .ts), so `@monopoly-vn/engine/room` crashes at runtime.
import type { EmoteEvent, RoomRequest, RoomResponse, RoomView } from '../../../packages/engine/src/protocol.js'
import { cleanJoin, emoteFrom, newRoom, reduceRoom, REJOIN_FAILED, roomView, type RoomDoc } from '../../../packages/engine/src/room.js'

const MAX_BODY = 16 * 1024
const RETRIES = 5
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32
const newSeat = () => ({ id: randomBytes(8).toString('hex'), secret: randomBytes(16).toString('hex') })
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
const fail = (error: string): RoomResponse => ({ ok: false, error })

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return Response.json(fail('Yêu cầu quá lớn'), { status: 413 })
  let req: RoomRequest
  try {
    req = await request.json()
  } catch {
    return Response.json(fail('Yêu cầu không hợp lệ'), { status: 400 })
  }
  if (!req || typeof req !== 'object') return Response.json(fail('Yêu cầu không hợp lệ'), { status: 400 })
  try {
    return Response.json(req.t === 'create' ? await create(req) : await update(req))
  } catch (e) {
    console.error(e)
    return Response.json(fail('Lỗi máy chủ, vui lòng thử lại'), { status: 500 })
  }
}

async function create(req: Extract<RoomRequest, { t: 'create' }>): Promise<RoomResponse> {
  const player = cleanJoin(req.name, req.token)
  if (typeof player === 'string') return fail(player)
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const seat = newSeat()
    const now = Date.now()
    let doc = newRoom(newCode(), { ...seat, ...player }, now)
    const bots = Number.isInteger(req.bots) ? Math.min(Math.max(req.bots!, 0), 5) : 0
    for (let i = 0; i < bots; i++) {
      const r = reduceRoom(doc, { t: 'addBot', code: doc.code, ...seat }, { now, rng, newSeat })
      if (r.ok && r.doc) doc = r.doc
    }
    const { error } = await db.from('rooms').insert({ code: doc.code, doc, rev: 0 })
    if (!error) return { ok: true, room: roomView(doc, now), welcome: { code: doc.code, ...seat } }
    if (error.code !== '23505') throw error // anything but a code collision
  }
  throw new Error('Could not allocate a room code')
}

/** Read-modify-write with optimistic locking on `rev`; retries when another request wrote first. */
async function update(req: Exclude<RoomRequest, { t: 'create' }>): Promise<RoomResponse> {
  const code = String(req.code ?? '').trim().toUpperCase()
  if (req.t === 'emote') return emote(code, req)
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, error } = await db.from('rooms').select('doc, rev').eq('code', code).maybeSingle()
    if (error) throw error
    if (!data) return fail(req.t === 'rejoin' ? REJOIN_FAILED : 'Không tìm thấy phòng')

    const before = data.doc as RoomDoc
    const now = Date.now()
    const r = reduceRoom(before, req, { now, rng, newSeat })
    if (!r.ok) return r

    const write = r.doc
      ? db.from('rooms').update({ doc: r.doc, rev: data.rev + 1, updated_at: new Date(now).toISOString() })
      : db.from('rooms').delete()
    const { data: rows, error: writeError } = await write.eq('code', code).eq('rev', data.rev).select('code')
    if (writeError) throw writeError
    if (!rows?.length) continue

    const room = r.doc && roomView(r.doc, now)
    // Broadcast after responding: the caller already has the new state; others get it ~0.5s later.
    if (room && r.doc!.version !== before.version) waitUntil(broadcast(code, 'room', room))
    return { ok: true, room, welcome: r.seat && { code, id: r.seat.id, secret: r.seat.secret } }
  }
  return fail('Máy chủ đang bận, vui lòng thử lại')
}

/** F16: relay a quick reaction to the room. Read-only: nothing is written, the room version does not change. */
async function emote(code: string, req: Extract<RoomRequest, { t: 'emote' }>): Promise<RoomResponse> {
  const { data, error } = await db.from('rooms').select('doc').eq('code', code).maybeSingle()
  if (error) throw error
  if (!data) return fail('Không tìm thấy phòng')
  const event = emoteFrom(data.doc as RoomDoc, req)
  if (typeof event === 'string') return fail(event)
  await broadcast(code, 'emote', event)
  return { ok: true, room: roomView(data.doc as RoomDoc, Date.now()) }
}

async function broadcast(code: string, event: 'room' | 'emote', payload: RoomView | EmoteEvent) {
  const channel = db.channel(`room:${code}`, { config: { private: true } })
  try {
    await channel.httpSend(event, payload)
  } catch (e) {
    console.error('broadcast failed', e) // state is saved; clients resync on next heartbeat
  } finally {
    await db.removeChannel(channel)
  }
}
