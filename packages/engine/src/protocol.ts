// Client <-> server messages (JSON). Types only.
// Requests: POST /api/room (Vercel). Updates: Supabase Realtime broadcast, channel `room:<code>`, event 'room'.
import type { Action, GameState } from './engine.js'

export interface RoomConfig {
  startMoney: number
  turnSeconds: number
  /** 0 = no time limit (R24) */
  gameMinutes: number
}

export interface RoomView {
  code: string
  hostId: string
  config: RoomConfig
  players: { id: string; name: string; token: number; connected: boolean; bot: boolean }[]
  /** Card deck order is hidden from clients (N3). */
  game: GameState | null
  turnDeadline: number | null
  gameDeadline: number | null
  /** Server clock when built, so clients can correct deadline skew. */
  now: number
  /** Increases with every visible change; clients drop out-of-order updates. */
  version: number
}

/** Seat credentials returned on create/join/rejoin. */
export interface Auth {
  code: string
  id: string
  secret: string
}

/** What the UI asks for; the client adds Auth before sending. */
export type ClientMsg =
  | { t: 'create'; name: string; token: number; bots?: number }
  | { t: 'join'; code: string; name: string; token: number }
  | { t: 'config'; config: RoomConfig }
  | { t: 'start' | 'addBot' | 'leave' }
  | { t: 'removeBot'; botId: string }
  | { t: 'action'; action: Action }

export type RoomRequest =
  /** bots: computer players to seat right away (F13) */
  | { t: 'create'; name: string; token: number; bots?: number }
  | { t: 'join'; code: string; name: string; token: number }
  | (Auth &
      (
        | { t: 'rejoin' | 'heartbeat' | 'tick' | 'start' | 'leave' | 'addBot' }
        | { t: 'removeBot'; botId: string }
        | { t: 'config'; config: RoomConfig }
        | { t: 'action'; action: Action }
      ))

export type RoomResponse = { ok: true; room: RoomView | null; welcome?: Auth } | { ok: false; error: string }
