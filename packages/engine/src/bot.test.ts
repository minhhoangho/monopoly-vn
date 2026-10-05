import { describe, expect, it } from 'vitest'
import { botAcceptsTrade, botAction } from './bot.js'
import { applyAction, createGame, type GameState, type Trade } from './engine.js'

/** Deterministic rng (mulberry32) so a failing game can be replayed. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BOTS = ['a', 'b', 'c', 'd']

function playBotsOnly(seed: number, maxSteps = 20_000) {
  const rng = seeded(seed)
  let s: GameState = createGame(
    BOTS.map((id, token) => ({ id, name: id, token })),
    rng,
  )
  let steps = 0
  while (s.phase !== 'ended' && steps++ < maxSteps) {
    const id = s.players[s.current].id
    const action = botAction(s, id, BOTS)
    const r = applyAction(s, id, action, rng)
    if (!r.ok) throw new Error(`seed ${seed} step ${steps}: bot chose illegal ${JSON.stringify(action)}: ${r.error}`)
    s = r.state
    if (s.trade) {
      // the room answers for the receiving bot right away
      const answer = botAcceptsTrade(s, s.trade) ? 'acceptTrade' : 'rejectTrade'
      const t = applyAction(s, s.trade.to, { type: answer }, rng)
      if (!t.ok) throw new Error(`seed ${seed}: trade answer failed: ${t.error}`)
      s = t.state
    }
    for (const p of s.players) if (p.money < 0) throw new Error(`seed ${seed}: negative money for ${p.id}`)
  }
  return { s, steps }
}

describe('bot', () => {
  it('only ever picks legal actions and bot-only games finish', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = playBotsOnly(seed)
      expect(s.phase, `seed ${seed} did not finish`).toBe('ended')
      expect(s.winner).not.toBeNull()
    }
  })

  it('buys when it can afford it with a cash reserve', () => {
    const s = createGame(
      ['a', 'b'].map((id, token) => ({ id, name: id, token })),
      () => 0.99,
    )
    const a = s.players.find((p) => p.id === 'a')!
    s.current = s.players.indexOf(a)
    Object.assign(a, { position: 3 })
    s.phase = 'buy'
    expect(botAction(s, 'a', ['a', 'b'])).toEqual({ type: 'buy' })
    a.money = 1_000_000
    expect(botAction(s, 'a', ['a', 'b'])).toEqual({ type: 'skipBuy' })
  })

  it('accepts generous trades, refuses to break its colour group', () => {
    const s = createGame(
      ['a', 'b'].map((id, token) => ({ id, name: id, token })),
      () => 0.99,
    )
    s.squares[1]!.owner = 'b'
    s.squares[3]!.owner = 'b' // b owns the full brown group
    s.squares[39]!.owner = 'a'
    const base: Trade = { from: 'a', to: 'b', giveSquares: [], getSquares: [], giveMoney: 0, getMoney: 0, giveJailCards: 0, getJailCards: 0 }
    expect(botAcceptsTrade(s, { ...base, giveSquares: [39], getSquares: [1] })).toBe(false) // breaks brown group
    s.squares[3]!.owner = null
    expect(botAcceptsTrade(s, { ...base, giveSquares: [39], getSquares: [1] })).toBe(true) // 4M for 600K
    expect(botAcceptsTrade(s, { ...base, giveMoney: 600_000, getSquares: [1] })).toBe(false) // not 25% better
  })
})
