import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Auth, ClientMsg, EmoteEvent, RoomRequest, RoomResponse, RoomView } from '@monopoly-vn/engine'

// Keep in sync with HEARTBEAT_MS / REJOIN_FAILED in packages/engine/src/room.ts (not imported: browser bundle stays engine-only).
const HEARTBEAT_MS = 15_000
const REJOIN_FAILED = 'Không thể vào lại phòng'
const SESSION_KEY = 'monopoly-vn-session'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null!

// sessionStorage is per tab, so two tabs can be two players (handy for testing).
function loadSession(): Auth | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

function saveSession(s: Auth | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable: reload loses the seat, play continues
  }
}

async function call(req: RoomRequest): Promise<RoomResponse> {
  try {
    const res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    return await res.json()
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ' }
  }
}

/**
 * Requests go to POST /api/room; room updates arrive by Supabase Realtime broadcast.
 * Heartbeats keep the seat alive (F10) and ticks let the server enforce deadlines (F8).
 */
export function useConnection() {
  const [session, setSession] = useState<Auth | null>(loadSession)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [error, setError] = useState<{ message: string; at: number } | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [clockSkew, setClockSkew] = useState(0)
  const [lastEmote, setLastEmote] = useState<(EmoteEvent & { at: number }) | null>(null)
  const version = useRef(-1)

  const reset = useCallback(() => {
    saveSession(null)
    setSession(null)
    setRoom(null)
    version.current = -1
  }, [])

  const applyRoom = useCallback((view: RoomView) => {
    if (view.version < version.current) return // stale / out of order
    version.current = view.version
    setRoom(view)
    setClockSkew(Date.now() - view.now)
  }, [])

  const handle = useCallback(
    (res: RoomResponse) => {
      if (!res.ok) {
        if (res.error === REJOIN_FAILED) reset()
        else setError({ message: res.error, at: Date.now() })
        return
      }
      if (res.welcome) {
        const w = res.welcome
        saveSession(w)
        setSession((prev) => (prev?.id === w.id && prev.code === w.code ? prev : w))
        history.replaceState(null, '', location.pathname)
      }
      if (res.room) applyRoom(res.room)
      else reset() // room deleted
    },
    [applyRoom, reset],
  )

  // Realtime channel + heartbeat while seated.
  useEffect(() => {
    if (!session) return
    call({ t: 'rejoin', ...session }).then(handle)
    const channel = supabase
      .channel(`room:${session.code}`, { config: { private: true } })
      .on('broadcast', { event: 'room' }, ({ payload }) => applyRoom(payload as RoomView))
      .on('broadcast', { event: 'emote' }, ({ payload }) => setLastEmote({ ...(payload as EmoteEvent), at: Date.now() }))
      .subscribe((status) => {
        setSubscribed(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') call({ t: 'rejoin', ...session }).then(handle) // resync after (re)connect
      })
    const beat = setInterval(() => call({ t: 'heartbeat', ...session }).then(handle), HEARTBEAT_MS)
    return () => {
      clearInterval(beat)
      supabase.removeChannel(channel)
    }
  }, [session, applyRoom, handle])

  // Ask the server to enforce the next deadline once it passes (turn timer, game time limit).
  const nextDeadline = Math.min(room?.turnDeadline ?? Infinity, room?.gameDeadline ?? Infinity)
  useEffect(() => {
    if (!session || nextDeadline === Infinity) return
    const jitter = 300 + Math.random() * 700 // spread simultaneous ticks from all clients
    const t = setTimeout(() => call({ t: 'tick', ...session }).then(handle), nextDeadline + clockSkew + jitter - Date.now())
    return () => clearTimeout(t)
  }, [session, nextDeadline, clockSkew, handle])

  const send = useCallback(
    async (msg: ClientMsg) => {
      if (msg.t === 'create' || msg.t === 'join') return handle(await call(msg))
      if (session) handle(await call({ ...msg, ...session }))
    },
    [session, handle],
  )

  const leave = useCallback(() => {
    if (session) call({ t: 'leave', ...session })
    reset()
  }, [session, reset])

  return {
    room: session ? room : null,
    me: session?.id ?? null,
    error,
    online: !session || subscribed,
    clockSkew,
    lastEmote,
    send,
    leave,
  }
}

export type Connection = ReturnType<typeof useConnection>
