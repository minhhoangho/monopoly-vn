import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  endByTime,
  GO_SALARY,
  JAIL_FINE,
  rentFor,
  START_MONEY,
  timeoutAction,
  type Action,
  type GameState,
} from './engine.js'

/** Rng that yields the given die faces in order. */
const dice =
  (...faces: number[]) =>
  () => {
    const v = faces.shift() ?? 1
    return (v - 1) / 6 + 0.01
  }

function game(n = 2): GameState {
  const ids = ['a', 'b', 'c'].slice(0, n)
  const s = createGame(
    ids.map((id, token) => ({ id, name: id.toUpperCase(), token })),
    Math.random,
  )
  s.players.sort((x, y) => x.id.localeCompare(y.id))
  return s
}

function act(s: GameState, id: string, action: Action, rng = dice(1, 2)) {
  const r = applyAction(s, id, action, rng)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

function fail(s: GameState, id: string, action: Action, rng = dice(1, 2)) {
  const r = applyAction(s, id, action, rng)
  if (r.ok) throw new Error(`expected ${action.type} to fail`)
  return r.error
}

const pl = (s: GameState, id: string) => s.players.find((x) => x.id === id)!
const own = (s: GameState, id: string, ...squares: number[]) => squares.forEach((i) => (s.squares[i]!.owner = id))
const roll: Action = { type: 'roll' }

describe('start', () => {
  it('R1: every player starts with 15.000.000đ', () => {
    expect(game(3).players.every((p) => p.money === START_MONEY)).toBe(true)
  })

  it('R2: turn order is shuffled with the rng', () => {
    const players = [
      { id: 'a', name: 'A', token: 0 },
      { id: 'b', name: 'B', token: 1 },
    ]
    expect(createGame(players, () => 0).players.map((p) => p.id)).toEqual(['b', 'a'])
    expect(createGame(players, () => 0.99).players.map((p) => p.id)).toEqual(['a', 'b'])
  })
})

describe('turn', () => {
  it('R3: moves by the dice total', () => {
    const s = act(game(), 'a', roll, dice(1, 2))
    expect(pl(s, 'a').position).toBe(3)
    expect(s.dice).toEqual([1, 2])
  })

  it('R4: doubles give another roll, third double goes to jail', () => {
    let s = act(game(), 'a', roll, dice(3, 3)) // lands on 6, unowned
    s = act(s, 'a', { type: 'skipBuy' })
    expect(s.phase).toBe('roll')

    s.doubles = 2
    s = act(s, 'a', roll, dice(1, 1))
    expect(pl(s, 'a')).toMatchObject({ position: 10, inJail: true })
    expect(s.phase).toBe('done')
  })

  it('R5: passing Xuất phát pays salary', () => {
    const s0 = game()
    pl(s0, 'a').position = 38
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a')).toMatchObject({ position: 1, money: START_MONEY + GO_SALARY })
  })

  it('R6: buy or skip an unowned square', () => {
    const s = act(game(), 'a', roll, dice(1, 2))
    expect(s.phase).toBe('buy')
    const bought = act(s, 'a', { type: 'buy' })
    expect(bought.squares[3]!.owner).toBe('a')
    expect(pl(bought, 'a').money).toBe(START_MONEY - 600_000)
    expect(bought.phase).toBe('done')
    const skipped = act(s, 'a', { type: 'skipBuy' })
    expect(skipped.squares[3]!.owner).toBeNull()
  })

  it('R6: tax and go-to-jail squares', () => {
    const s = act(game(), 'a', roll, dice(1, 3))
    expect(pl(s, 'a').money).toBe(START_MONEY - 2_000_000)

    const s0 = game()
    pl(s0, 'a').position = 27
    const jailed = act(s0, 'a', roll, dice(1, 2))
    expect(pl(jailed, 'a')).toMatchObject({ position: 10, inJail: true })
    expect(pl(jailed, 'a').money).toBe(START_MONEY) // no salary
  })

  it('R7: only the current player can act', () => {
    expect(fail(game(), 'b', roll)).toBe('Chưa tới lượt của bạn')
  })

  it('end turn passes to the next player', () => {
    let s = act(game(), 'a', roll, dice(1, 3))
    s = act(s, 'a', { type: 'endTurn' })
    expect(s.current).toBe(1)
    expect(s.phase).toBe('roll')
  })
})

describe('rent', () => {
  it('R8: full colour group doubles bare land rent', () => {
    const s0 = game()
    own(s0, 'b', 1, 3)
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a').money).toBe(START_MONEY - 80_000)
    expect(pl(s, 'b').money).toBe(START_MONEY + 80_000)
  })

  it('R9: airport rent scales with airports owned', () => {
    const s = game()
    own(s, 'b', 5)
    expect(rentFor(s, 5)).toBe(250_000)
    own(s, 'b', 15, 25, 35)
    expect(rentFor(s, 5)).toBe(2_000_000)
  })

  it('R10: utility rent is dice total × 4 or × 10', () => {
    const s0 = game()
    own(s0, 'b', 12)
    pl(s0, 'a').position = 9
    let s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a').money).toBe(START_MONEY - 3 * 40_000)

    own(s0, 'b', 28)
    s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a').money).toBe(START_MONEY - 3 * 100_000)
  })

  it('R17: mortgaged squares collect no rent', () => {
    const s0 = game()
    own(s0, 'b', 3)
    s0.squares[3]!.mortgaged = true
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a').money).toBe(START_MONEY)
  })
})

describe('building', () => {
  it('R11: needs the full colour group', () => {
    const s = game()
    own(s, 'a', 1)
    expect(fail(s, 'a', { type: 'build', square: 1 })).toBe('Cần sở hữu trọn nhóm màu')
  })

  it('R12: houses must be built evenly', () => {
    const s0 = game()
    own(s0, 'a', 1, 3)
    const s = act(s0, 'a', { type: 'build', square: 1 })
    expect(fail(s, 'a', { type: 'build', square: 1 })).toBe('Phải xây đều các ô trong nhóm')
    expect(act(s, 'a', { type: 'build', square: 3 }).squares[3]!.houses).toBe(1)
  })

  it('R13: max 4 houses then a hotel; selling returns half', () => {
    const s0 = game()
    own(s0, 'a', 1, 3)
    s0.squares[1]!.houses = 4
    s0.squares[3]!.houses = 4
    let s = act(s0, 'a', { type: 'build', square: 1 })
    expect(s.squares[1]!.houses).toBe(5)
    expect(fail(s, 'a', { type: 'build', square: 1 })).toBe('Ô này đã có khách sạn')
    const before = pl(s, 'a').money
    s = act(s, 'a', { type: 'sellHouse', square: 1 })
    expect(pl(s, 'a').money).toBe(before + 250_000)
  })

  it('R14: bank has 32 houses', () => {
    const s = game()
    own(s, 'a', 1, 3)
    own(s, 'b', 6, 8, 9, 11, 13, 14, 16, 18)
    for (const i of [6, 8, 9, 11, 13, 14, 16, 18]) s.squares[i]!.houses = 4
    expect(fail(s, 'a', { type: 'build', square: 1 })).toBe('Ngân hàng đã hết nhà')
  })
})

describe('mortgage', () => {
  it('R15: pays half price, blocked while the group has houses', () => {
    const s0 = game()
    own(s0, 'a', 1, 3)
    const s = act(s0, 'a', { type: 'mortgage', square: 1 })
    expect(pl(s, 'a').money).toBe(START_MONEY + 300_000)
    s0.squares[3]!.houses = 1
    expect(fail(s0, 'a', { type: 'mortgage', square: 1 })).toBe('Phải bán hết nhà trong nhóm trước')
  })

  it('R16: unmortgage costs mortgage value + 10%', () => {
    const s0 = game()
    own(s0, 'a', 1)
    s0.squares[1]!.mortgaged = true
    const s = act(s0, 'a', { type: 'unmortgage', square: 1 })
    expect(pl(s, 'a').money).toBe(START_MONEY - 330_000)
    expect(s.squares[1]!.mortgaged).toBe(false)
  })
})

describe('jail', () => {
  const jailed = () => {
    const s = game()
    Object.assign(pl(s, 'a'), { position: 10, inJail: true })
    return s
  }

  it('R18: leave by paying, card, or doubles', () => {
    const paid = act(jailed(), 'a', { type: 'payJail' })
    expect(pl(paid, 'a')).toMatchObject({ inJail: false, money: START_MONEY - JAIL_FINE })

    const withCard = jailed()
    pl(withCard, 'a').jailCards = ['chance']
    const used = act(withCard, 'a', { type: 'useJailCard' })
    expect(pl(used, 'a')).toMatchObject({ inJail: false, jailCards: [] })
    expect(used.decks.chance).toHaveLength(withCard.decks.chance.length + 1)

    const doubled = act(jailed(), 'a', roll, dice(2, 2))
    expect(pl(doubled, 'a')).toMatchObject({ inJail: false, position: 14 })
    expect(doubled.phase).not.toBe('roll') // no extra roll after leaving jail
  })

  it('R18: failed roll stays in jail', () => {
    const s = act(jailed(), 'a', roll, dice(1, 2))
    expect(pl(s, 'a')).toMatchObject({ inJail: true, position: 10, jailTurns: 1 })
    expect(s.phase).toBe('done')
  })

  it('R19: third failed roll forces the fine and moves', () => {
    const s0 = jailed()
    pl(s0, 'a').jailTurns = 2
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a')).toMatchObject({ inJail: false, position: 13, money: START_MONEY - JAIL_FINE })
  })
})

describe('trade', () => {
  it('R20: propose and accept swaps squares and money', () => {
    const s0 = game()
    own(s0, 'a', 1)
    own(s0, 'b', 3)
    let s = act(s0, 'a', {
      type: 'proposeTrade',
      trade: { to: 'b', giveSquares: [1], getSquares: [3], giveMoney: 100_000, getMoney: 0, giveJailCards: 0, getJailCards: 0 },
    })
    expect(s.trade?.to).toBe('b')
    s = act(s, 'b', { type: 'acceptTrade' })
    expect(s.squares[1]!.owner).toBe('b')
    expect(s.squares[3]!.owner).toBe('a')
    expect(pl(s, 'a').money).toBe(START_MONEY - 100_000)
    expect(pl(s, 'b').money).toBe(START_MONEY + 100_000)
    expect(s.trade).toBeNull()
  })

  it('R21: cannot trade a square whose group has houses', () => {
    const s = game()
    own(s, 'a', 1, 3)
    s.squares[3]!.houses = 1
    const error = fail(s, 'a', {
      type: 'proposeTrade',
      trade: { to: 'b', giveSquares: [1], getSquares: [], giveMoney: 0, getMoney: 0, giveJailCards: 0, getJailCards: 0 },
    })
    expect(error).toContain('khi nhóm màu có nhà')
  })

  it('rejects malformed trade input', () => {
    const s = game()
    const error = fail(s, 'a', { type: 'proposeTrade', trade: { to: 'b', giveMoney: -5 } as never })
    expect(error).toBe('Số liệu không hợp lệ')
  })
})

describe('debt and bankruptcy', () => {
  /** a has 100.000đ and lands on b's Cao Bằng with 1 house (rent 200.000đ). */
  const broke = (players = 2) => {
    const s = game(players)
    pl(s, 'a').money = 100_000
    own(s, 'a', 6)
    own(s, 'b', 3)
    s.squares[3]!.houses = 1
    return s
  }

  it('R22: unpaid rent enters debt, pay after raising money', () => {
    let s = act(broke(), 'a', roll, dice(1, 2))
    expect(s.phase).toBe('debt')
    expect(fail(s, 'a', { type: 'payDebt' })).toContain('Cần 200.000đ')
    expect(fail(s, 'a', { type: 'endTurn' })).toBe('Chưa thể kết thúc lượt')
    s = act(s, 'a', { type: 'mortgage', square: 6 })
    s = act(s, 'a', { type: 'payDebt' })
    expect(pl(s, 'a').money).toBe(100_000 + 500_000 - 200_000)
    expect(pl(s, 'b').money).toBe(START_MONEY + 200_000)
    expect(s.phase).toBe('done')
  })

  it('R23: bankrupt to a player transfers assets', () => {
    let s = act(broke(3), 'a', roll, dice(1, 2))
    s = act(s, 'a', { type: 'bankrupt' })
    expect(pl(s, 'a').bankrupt).toBe(true)
    expect(s.squares[6]!.owner).toBe('b')
    expect(pl(s, 'b').money).toBe(START_MONEY + 100_000)
    expect(s.players[s.current].id).toBe('b')
  })

  it('R23: bankrupt to the bank returns squares unowned', () => {
    const s0 = game(3)
    own(s0, 'a', 6)
    s0.squares[6]!.mortgaged = true
    const s = act(s0, 'a', { type: 'resign' })
    expect(s.squares[6]).toEqual({ owner: null, houses: 0, mortgaged: false })
  })

  it('R24: last player standing wins', () => {
    const s = act(game(), 'b', { type: 'resign' })
    expect(s.phase).toBe('ended')
    expect(s.winner).toBe('a')
    expect(fail(s, 'a', roll)).toBe('Ván đấu đã kết thúc')
  })

  it('R24: time limit ends with the richest player', () => {
    const s0 = game()
    own(s0, 'b', 39)
    expect(endByTime(s0).winner).toBe('b')
  })
})

describe('cards', () => {
  it('moveTo card collects salary when passing Xuất phát', () => {
    const s0 = game()
    pl(s0, 'a').position = 33
    s0.decks.chance = [0, ...s0.decks.chance.filter((i) => i !== 0)] // Đà Lạt
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a')).toMatchObject({ position: 23, money: START_MONEY + GO_SALARY })
    expect(s.phase).toBe('buy')
    expect(s.decks.chance.at(-1)).toBe(0)
  })

  it('jail-free card stays with the player', () => {
    const s0 = game()
    pl(s0, 'a').position = 4
    s0.decks.chance = [9, ...s0.decks.chance.filter((i) => i !== 9)]
    const s = act(s0, 'a', roll, dice(1, 2))
    expect(pl(s, 'a').jailCards).toEqual(['chance'])
    expect(s.decks.chance).not.toContain(9)
  })
})

describe('server helpers', () => {
  it('F8: timeout picks a safe default per phase', () => {
    const s = game()
    expect(timeoutAction(s)).toEqual({ type: 'roll' })
    s.phase = 'buy'
    expect(timeoutAction(s)).toEqual({ type: 'skipBuy' })
    s.phase = 'done'
    expect(timeoutAction(s)).toEqual({ type: 'endTurn' })
  })

  it('rejects out-of-range squares from clients', () => {
    expect(fail(game(), 'a', { type: 'build', square: 99 })).toBe('Ô không hợp lệ')
    expect(fail(game(), 'a', { type: 'mortgage', square: 'x' as never })).toBe('Bạn không sở hữu ô này')
  })
})
