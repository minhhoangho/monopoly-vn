import { PLAYER_COLORS, type RoomView } from '@monopoly-vn/engine'
import landmarks from './landmarks.json'

export const TOKEN_ICONS = ['👒', '🥁', '🟩', '🛺', '🪷', '🛵']

/** Landmark photos from Wikimedia Commons (free licences); CC BY/BY-SA require showing author + licence. */
export interface Landmark {
  square: number
  landmark: string
  author: string
  license: string
  source: string
}
export const LANDMARKS: Landmark[] = landmarks
export const landmarkOf = (square: number) => LANDMARKS.find((l) => l.square === square)
export const landmarkPhoto = (square: number) => `${import.meta.env.BASE_URL}landmarks/${square}.jpg`

/** U6 short money format: 2.000.000 -> "2Tr", 600.000 -> "600K". */
export function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${String(Math.round(n / 10_000) / 100).replace('.', ',')}Tr`
  return `${Math.round(n / 1000)}K`
}

/** Colours follow lobby seat order so they stay stable for the whole game. */
export function playerColor(room: RoomView, id: string) {
  return PLAYER_COLORS[Math.max(0, room.players.findIndex((p) => p.id === id)) % PLAYER_COLORS.length]
}

/** Shared animation clock: tokens wait for the dice to settle before moving. */
export const timeline = { diceSettledAt: 0 }

export function load<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable (private mode): ignore
  }
}
