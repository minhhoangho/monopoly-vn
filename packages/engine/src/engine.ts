// Pure rules engine: applyAction(state, playerId, action, rng) -> new state | error.
// Rule IDs (R1...) refer to docs/requirements.md §4.
import {
  AIRPORT_RENT,
  BOARD,
  CARDS,
  GO_SALARY,
  JAIL_FINE,
  JAIL_SQUARE,
  MAX_HOTELS,
  MAX_HOUSES,
  START_MONEY,
  UTILITY_MULTIPLIER,
  type Deck,
  type Group,
  type Ownable,
  type Property,
} from './data.js'

export * from './data.js'
export type * from './protocol.js'

export type Rng = () => number
export type Phase = 'roll' | 'buy' | 'debt' | 'done' | 'ended'

export interface Player {
  id: string
  name: string
  token: number
  money: number
  position: number
  inJail: boolean
  jailTurns: number
  jailCards: Deck[]
  bankrupt: boolean
}

export interface Ownership {
  owner: string | null
  /** 0-4 houses, 5 = hotel */
  houses: number
  mortgaged: boolean
}

export interface Trade {
  from: string
  to: string
  giveSquares: number[]
  getSquares: number[]
  giveMoney: number
  getMoney: number
  giveJailCards: number
  getJailCards: number
}

export interface GameState {
  players: Player[]
  current: number
  phase: Phase
  dice: [number, number] | null
  rollCount: number
  doubles: number
  extraRoll: boolean
  /** Unpaid charges of the current player. Creditor null = bank. */
  debts: { to: string | null; amount: number }[]
  /** Indexed by square; null = not ownable. */
  squares: (Ownership | null)[]
  decks: Record<Deck, number[]>
  lastCard: { deck: Deck; index: number } | null
  trade: Trade | null
  log: string[]
  winner: string | null
}

export type Action =
  | { type: 'roll' | 'buy' | 'skipBuy' | 'endTurn' | 'payJail' | 'useJailCard' | 'payDebt' | 'bankrupt' | 'resign' }
  | { type: 'build' | 'sellHouse' | 'mortgage' | 'unmortgage'; square: number }
  | { type: 'proposeTrade'; trade: Omit<Trade, 'from'> }
  | { type: 'acceptTrade' | 'rejectTrade' }

export type Result = { ok: true; state: GameState } | { ok: false; error: string }

export const formatMoney = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const LOG_LIMIT = 100
const DECK_NAME: Record<Deck, string> = { chance: 'Cơ hội', chest: 'Khí vận' }
const JAIL_CARD: Record<Deck, number> = {
  chance: CARDS.chance.findIndex((c) => c.effect.type === 'jailFree'),
  chest: CARDS.chest.findIndex((c) => c.effect.type === 'jailFree'),
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createGame(
  players: { id: string; name: string; token: number }[],
  rng: Rng,
  startMoney = START_MONEY,
): GameState {
  if (players.length < 2 || players.length > 6) throw new Error('Game needs 2-6 players')
  return {
    // R1, R2
    players: shuffle(players, rng).map((p) => ({
      ...p,
      money: startMoney,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [],
      bankrupt: false,
    })),
    current: 0,
    phase: 'roll',
    dice: null,
    rollCount: 0,
    doubles: 0,
    extraRoll: false,
    debts: [],
    squares: BOARD.map((sq) => ('price' in sq ? { owner: null, houses: 0, mortgaged: false } : null)),
    decks: {
      chance: shuffle([...CARDS.chance.keys()], rng),
      chest: shuffle([...CARDS.chest.keys()], rng),
    },
    lastCard: null,
    trade: null,
    log: ['Ván đấu bắt đầu!'],
    winner: null,
  }
}

export function applyAction(state: GameState, playerId: string, action: Action, rng: Rng): Result {
  if (state.phase === 'ended') return { ok: false, error: 'Ván đấu đã kết thúc' }
  const s = structuredClone(state)
  const p = s.players.find((x) => x.id === playerId)
  if (!p || p.bankrupt) return { ok: false, error: 'Người chơi không hợp lệ' }
  const error = handle(s, p, action, rng)
  return error ? { ok: false, error } : { ok: true, state: s }
}

/** Action the server applies when the current player's turn timer runs out (F8). */
export function timeoutAction(s: GameState): Action | null {
  switch (s.phase) {
    case 'roll':
      return { type: 'roll' }
    case 'buy':
      return { type: 'skipBuy' }
    case 'done':
      return { type: 'endTurn' }
    case 'debt':
      return { type: 'bankrupt' }
    default:
      return null
  }
}

export function netWorth(s: GameState, playerId: string): number {
  const p = player(s, playerId)
  let total = p.money
  s.squares.forEach((o, i) => {
    if (o?.owner !== playerId) return
    const sq = BOARD[i] as Ownable
    total += o.mortgaged ? sq.price / 2 : sq.price
    if (sq.kind === 'property') total += o.houses * sq.houseCost
  })
  return total
}

/** R24: game time limit reached, richest player wins. */
export function endByTime(state: GameState): GameState {
  const s = structuredClone(state)
  if (s.phase === 'ended') return s
  const alive = s.players.filter((p) => !p.bankrupt)
  const winner = alive.reduce((a, b) => (netWorth(s, b.id) > netWorth(s, a.id) ? b : a))
  s.winner = winner.id
  s.phase = 'ended'
  log(s, `Hết giờ! ${winner.name} giàu nhất và giành chiến thắng`)
  return s
}

export function rentFor(s: GameState, square: number): number {
  const sq = BOARD[square]
  const o = s.squares[square]
  if (!o?.owner || o.mortgaged) return 0
  const owned = (kind: string) => BOARD.filter((b, i) => b.kind === kind && s.squares[i]?.owner === o.owner).length
  switch (sq.kind) {
    case 'property': // R8
      if (o.houses > 0) return sq.rent[o.houses]
      return ownsGroup(s, o.owner, sq.group) ? sq.rent[0] * 2 : sq.rent[0]
    case 'airport': // R9
      return AIRPORT_RENT[owned('airport') - 1]
    case 'utility': // R10
      return ((s.dice?.[0] ?? 0) + (s.dice?.[1] ?? 0)) * UTILITY_MULTIPLIER[owned('utility') - 1]
    default:
      return 0
  }
}

export function groupSquares(group: Group): number[] {
  return BOARD.flatMap((sq, i) => (sq.kind === 'property' && sq.group === group ? [i] : []))
}

function handle(s: GameState, p: Player, a: Action, rng: Rng): string | undefined {
  if (!a || typeof a !== 'object') return 'Hành động không hợp lệ'
  switch (a.type) {
    case 'resign':
      return bankrupt(s, p, null)
    case 'acceptTrade':
      return acceptTrade(s, p)
    case 'rejectTrade':
      return rejectTrade(s, p)
  }
  if (cur(s) !== p) return 'Chưa tới lượt của bạn' // R7
  switch (a.type) {
    case 'roll':
      return roll(s, p, rng)
    case 'buy':
      return buy(s, p)
    case 'skipBuy':
      if (s.phase !== 'buy') return 'Không có gì để bỏ qua'
      log(s, `${p.name} không mua ${BOARD[p.position].name}`)
      return settle(s)
    case 'endTurn':
      if (s.phase !== 'done') return 'Chưa thể kết thúc lượt'
      return nextTurn(s)
    case 'payJail':
      return payJail(s, p)
    case 'useJailCard':
      return useJailCard(s, p)
    case 'build':
      return build(s, p, a.square)
    case 'sellHouse':
      return sellHouse(s, p, a.square)
    case 'mortgage':
      return mortgage(s, p, a.square)
    case 'unmortgage':
      return unmortgage(s, p, a.square)
    case 'payDebt':
      return payDebt(s, p)
    case 'bankrupt':
      if (s.phase !== 'debt') return 'Bạn không đang nợ'
      return bankrupt(s, p, s.debts.find((d) => d.to)?.to ?? null)
    case 'proposeTrade':
      return proposeTrade(s, p, a.trade)
    default:
      return 'Hành động không hợp lệ'
  }
}

// --- turn flow ---

function roll(s: GameState, p: Player, rng: Rng): string | undefined {
  if (s.phase !== 'roll') return 'Không thể đổ xúc xắc lúc này'
  const d1 = 1 + Math.floor(rng() * 6)
  const d2 = 1 + Math.floor(rng() * 6)
  const isDouble = d1 === d2
  s.dice = [d1, d2]
  s.rollCount++
  log(s, `${p.name} đổ được ${d1} + ${d2}`)

  if (p.inJail) {
    // R18, R19
    if (isDouble) {
      log(s, `${p.name} đổ đôi và ra tù`)
    } else if (++p.jailTurns >= 3) {
      log(s, `${p.name} hết 3 lượt, nộp ${formatMoney(JAIL_FINE)} để ra tù`)
      charge(s, p, JAIL_FINE, null)
    } else {
      s.phase = 'done'
      return
    }
    p.inJail = false
    p.jailTurns = 0
    s.extraRoll = false
  } else {
    // R4
    s.doubles = isDouble ? s.doubles + 1 : 0
    if (s.doubles === 3) {
      log(s, `${p.name} đổ đôi 3 lần liên tiếp`)
      sendToJail(s, p)
      return settle(s)
    }
    s.extraRoll = isDouble
  }
  advance(s, p, d1 + d2)
  land(s, p)
  if ((s.phase as Phase) !== 'buy') settle(s) // land() may have changed it
}

/** Decide the phase after a move is fully resolved. */
function settle(s: GameState) {
  s.phase = s.debts.length ? 'debt' : s.extraRoll && !cur(s).inJail ? 'roll' : 'done'
  return undefined
}

function nextTurn(s: GameState) {
  s.debts = []
  s.trade = null
  s.doubles = 0
  s.extraRoll = false
  s.phase = 'roll'
  do s.current = (s.current + 1) % s.players.length
  while (s.players[s.current].bankrupt)
  log(s, `Lượt của ${cur(s).name}`)
  return undefined
}

function advance(s: GameState, p: Player, steps: number) {
  if (p.position + steps >= BOARD.length) collectSalary(s, p) // R5
  p.position = (p.position + steps) % BOARD.length
}

function moveTo(s: GameState, p: Player, square: number) {
  if (square <= p.position) collectSalary(s, p)
  p.position = square
}

function collectSalary(s: GameState, p: Player) {
  p.money += GO_SALARY
  log(s, `${p.name} qua Xuất phát, nhận ${formatMoney(GO_SALARY)}`)
}

function sendToJail(s: GameState, p: Player) {
  p.position = JAIL_SQUARE
  p.inJail = true
  p.jailTurns = 0
  s.extraRoll = false
  log(s, `${p.name} bị vào tù`)
}

/** R6: resolve the square the player stands on. May set phase 'buy'. */
function land(s: GameState, p: Player) {
  const sq = BOARD[p.position]
  switch (sq.kind) {
    case 'property':
    case 'airport':
    case 'utility': {
      const o = s.squares[p.position]!
      if (!o.owner) {
        s.phase = 'buy'
        return
      }
      if (o.owner === p.id) return
      const rent = rentFor(s, p.position) // R17: 0 when mortgaged
      if (rent === 0) return
      log(s, `${p.name} trả ${formatMoney(rent)} tiền thuê ${sq.name} cho ${player(s, o.owner).name}`)
      charge(s, p, rent, o.owner)
      return
    }
    case 'tax':
      log(s, `${p.name} nộp ${sq.name} ${formatMoney(sq.amount)}`)
      charge(s, p, sq.amount, null)
      return
    case 'chance':
    case 'chest':
      drawCard(s, p, sq.kind)
      return
    case 'goToJail':
      sendToJail(s, p)
      return
  }
}

function drawCard(s: GameState, p: Player, deck: Deck) {
  const index = s.decks[deck].shift()!
  const card = CARDS[deck][index]
  s.lastCard = { deck, index }
  log(s, `${p.name} rút thẻ ${DECK_NAME[deck]}: ${card.text}`)
  const e = card.effect
  if (e.type === 'jailFree') {
    p.jailCards.push(deck) // kept out of the deck until used
    return
  }
  s.decks[deck].push(index)
  switch (e.type) {
    case 'money':
      if (e.amount >= 0) p.money += e.amount
      else charge(s, p, -e.amount, null)
      return
    case 'moveTo':
      moveTo(s, p, e.square)
      return land(s, p)
    case 'moveBy':
      p.position = (p.position + e.steps + BOARD.length) % BOARD.length
      return land(s, p)
    case 'goToJail':
      return sendToJail(s, p)
    case 'repairs': {
      const { houses, hotels } = buildings(s, p.id)
      return charge(s, p, houses * e.perHouse + hotels * e.perHotel, null)
    }
    case 'payEach':
      for (const other of s.players) if (other !== p && !other.bankrupt) charge(s, p, e.amount, other.id)
      return
    case 'collectEach':
      // ponytail: others pay what they can (no debt), since only the current player can carry debts
      for (const other of s.players) {
        if (other === p || other.bankrupt) continue
        const paid = Math.min(e.amount, other.money)
        other.money -= paid
        p.money += paid
      }
      return
  }
}

/** Pay now if possible, otherwise record a debt (R22). */
function charge(s: GameState, p: Player, amount: number, to: string | null) {
  if (amount <= 0) return
  if (s.debts.length === 0 && p.money >= amount) {
    p.money -= amount
    if (to) player(s, to).money += amount
  } else {
    s.debts.push({ to, amount })
  }
}

// --- actions ---

function buy(s: GameState, p: Player) {
  if (s.phase !== 'buy') return 'Không có gì để mua'
  if (s.debts.length) return 'Phải trả nợ trước'
  const sq = BOARD[p.position] as Ownable
  if (p.money < sq.price) return 'Không đủ tiền để mua'
  p.money -= sq.price
  s.squares[p.position]!.owner = p.id
  log(s, `${p.name} mua ${sq.name} giá ${formatMoney(sq.price)}`)
  return settle(s)
}

function payJail(s: GameState, p: Player) {
  if (s.phase !== 'roll' || !p.inJail) return 'Bạn không ở trong tù'
  if (p.money < JAIL_FINE) return 'Không đủ tiền'
  p.money -= JAIL_FINE
  p.inJail = false
  p.jailTurns = 0
  log(s, `${p.name} nộp ${formatMoney(JAIL_FINE)} để ra tù`)
}

function useJailCard(s: GameState, p: Player) {
  if (s.phase !== 'roll' || !p.inJail) return 'Bạn không ở trong tù'
  const deck = p.jailCards.pop()
  if (!deck) return 'Bạn không có thẻ ra tù'
  s.decks[deck].push(JAIL_CARD[deck])
  p.inJail = false
  p.jailTurns = 0
  log(s, `${p.name} dùng thẻ ra tù miễn phí`)
}

const MANAGE_PHASES: Phase[] = ['roll', 'buy', 'done']

function ownedProperty(s: GameState, p: Player, square: number): Property | string {
  if (!isSquare(square)) return 'Ô không hợp lệ'
  const sq = BOARD[square]
  if (sq.kind !== 'property') return 'Ô này không xây được nhà'
  if (s.squares[square]!.owner !== p.id) return 'Bạn không sở hữu ô này'
  return sq
}

function build(s: GameState, p: Player, square: number) {
  if (!MANAGE_PHASES.includes(s.phase)) return 'Không thể xây lúc này'
  const sq = ownedProperty(s, p, square)
  if (typeof sq === 'string') return sq
  const group = groupSquares(sq.group).map((i) => s.squares[i]!)
  const o = s.squares[square]!
  if (!ownsGroup(s, p.id, sq.group)) return 'Cần sở hữu trọn nhóm màu' // R11
  if (group.some((g) => g.mortgaged)) return 'Nhóm màu có ô đang thế chấp'
  if (o.houses >= 5) return 'Ô này đã có khách sạn'
  if (o.houses > Math.min(...group.map((g) => g.houses))) return 'Phải xây đều các ô trong nhóm' // R12
  const bank = buildings(s) // R14
  if (o.houses === 4 ? bank.hotels >= MAX_HOTELS : bank.houses >= MAX_HOUSES) return 'Ngân hàng đã hết nhà'
  if (p.money < sq.houseCost) return 'Không đủ tiền'
  p.money -= sq.houseCost
  o.houses++
  log(s, `${p.name} xây ${o.houses === 5 ? 'khách sạn' : 'nhà'} ở ${sq.name}`)
}

function sellHouse(s: GameState, p: Player, square: number) {
  const sq = ownedProperty(s, p, square)
  if (typeof sq === 'string') return sq
  const o = s.squares[square]!
  if (o.houses === 0) return 'Ô này không có nhà'
  if (o.houses < Math.max(...groupSquares(sq.group).map((i) => s.squares[i]!.houses))) return 'Phải bán đều các ô trong nhóm'
  if (o.houses === 5 && buildings(s).houses + 4 > MAX_HOUSES) return 'Ngân hàng không đủ nhà để đổi khách sạn'
  p.money += sq.houseCost / 2 // R13
  o.houses--
  log(s, `${p.name} bán ${o.houses === 4 ? 'khách sạn' : 'nhà'} ở ${sq.name}`)
}

function mortgage(s: GameState, p: Player, square: number) {
  if (!isSquare(square) || s.squares[square]?.owner !== p.id) return 'Bạn không sở hữu ô này'
  const sq = BOARD[square] as Ownable
  const o = s.squares[square]!
  if (o.mortgaged) return 'Ô này đã thế chấp'
  if (sq.kind === 'property' && groupSquares(sq.group).some((i) => s.squares[i]!.houses > 0))
    return 'Phải bán hết nhà trong nhóm trước' // R15
  o.mortgaged = true
  p.money += sq.price / 2
  log(s, `${p.name} thế chấp ${sq.name}, nhận ${formatMoney(sq.price / 2)}`)
}

export const unmortgageCost = (price: number) => (price * 55) / 100 // R16

function unmortgage(s: GameState, p: Player, square: number) {
  if (!MANAGE_PHASES.includes(s.phase)) return 'Không thể chuộc lúc này'
  if (!isSquare(square) || s.squares[square]?.owner !== p.id) return 'Bạn không sở hữu ô này'
  const sq = BOARD[square] as Ownable
  const o = s.squares[square]!
  if (!o.mortgaged) return 'Ô này không bị thế chấp'
  const cost = unmortgageCost(sq.price)
  if (p.money < cost) return 'Không đủ tiền'
  p.money -= cost
  o.mortgaged = false
  log(s, `${p.name} chuộc lại ${sq.name}`)
}

function payDebt(s: GameState, p: Player) {
  if (s.phase !== 'debt') return 'Bạn không đang nợ'
  const total = s.debts.reduce((sum, d) => sum + d.amount, 0)
  if (p.money < total) return `Cần ${formatMoney(total)}, hãy bán nhà hoặc thế chấp`
  for (const d of s.debts) {
    p.money -= d.amount
    if (d.to) player(s, d.to).money += d.amount
  }
  s.debts = []
  log(s, `${p.name} đã trả hết nợ`)
  return settle(s)
}

/** R22, R23. Also used for resign / disconnect timeout (F11) with creditor = bank. */
function bankrupt(s: GameState, p: Player, to: string | null): string | undefined {
  const creditor = to ? player(s, to) : null
  s.squares.forEach((o, i) => {
    if (o?.owner !== p.id) return
    const sq = BOARD[i]
    if (sq.kind === 'property') p.money += (o.houses * sq.houseCost) / 2
    o.houses = 0
    if (creditor) o.owner = creditor.id
    else Object.assign(o, { owner: null, mortgaged: false })
  })
  if (creditor) {
    creditor.money += Math.max(p.money, 0)
    creditor.jailCards.push(...p.jailCards)
  } else {
    for (const d of p.jailCards) s.decks[d].push(JAIL_CARD[d])
  }
  p.money = 0
  p.jailCards = []
  p.bankrupt = true
  if (s.trade && (s.trade.from === p.id || s.trade.to === p.id)) s.trade = null
  log(s, `${p.name} phá sản${creditor ? `, tài sản thuộc về ${creditor.name}` : ''}`)

  const alive = s.players.filter((x) => !x.bankrupt)
  if (alive.length === 1) {
    // R24
    s.winner = alive[0].id
    s.phase = 'ended'
    s.debts = []
    log(s, `${alive[0].name} giành chiến thắng!`)
    return
  }
  if (cur(s) === p) nextTurn(s)
}

// --- trade (R20, R21) ---

function validateTrade(s: GameState, t: Trade): string | undefined {
  const from = s.players.find((x) => x.id === t.from)
  const to = s.players.find((x) => x.id === t.to)
  if (!from || !to || to.bankrupt || from === to) return 'Người nhận không hợp lệ'
  const counts = [t.giveMoney, t.getMoney, t.giveJailCards, t.getJailCards]
  if (!counts.every((n) => Number.isSafeInteger(n) && n >= 0)) return 'Số liệu không hợp lệ'
  if (!Array.isArray(t.giveSquares) || !Array.isArray(t.getSquares)) return 'Số liệu không hợp lệ'
  const all = [...t.giveSquares, ...t.getSquares]
  if (new Set(all).size !== all.length) return 'Ô bị trùng'
  if (all.length === 0 && counts.every((n) => n === 0)) return 'Giao dịch trống'
  if (from.money < t.giveMoney || to.money < t.getMoney) return 'Không đủ tiền'
  if (from.jailCards.length < t.giveJailCards || to.jailCards.length < t.getJailCards) return 'Không đủ thẻ ra tù'
  for (const [squares, owner] of [
    [t.giveSquares, from.id],
    [t.getSquares, to.id],
  ] as const) {
    for (const i of squares) {
      if (!isSquare(i) || s.squares[i]?.owner !== owner) return 'Ô không hợp lệ'
      const sq = BOARD[i]
      if (sq.kind === 'property' && groupSquares(sq.group).some((j) => s.squares[j]!.houses > 0))
        return `Không thể giao dịch ${sq.name} khi nhóm màu có nhà`
    }
  }
}

function proposeTrade(s: GameState, p: Player, input: Partial<Trade> | undefined) {
  if (!MANAGE_PHASES.includes(s.phase)) return 'Không thể giao dịch lúc này'
  if (s.trade) return 'Đang có một đề nghị giao dịch'
  const x = input ?? {}
  const t: Trade = {
    from: p.id,
    to: String(x.to),
    giveSquares: x.giveSquares ?? [],
    getSquares: x.getSquares ?? [],
    giveMoney: x.giveMoney ?? 0,
    getMoney: x.getMoney ?? 0,
    giveJailCards: x.giveJailCards ?? 0,
    getJailCards: x.getJailCards ?? 0,
  }
  const error = validateTrade(s, t)
  if (error) return error
  s.trade = t
  log(s, `${p.name} đề nghị giao dịch với ${player(s, t.to).name}`)
}

function acceptTrade(s: GameState, p: Player) {
  const t = s.trade
  if (!t || t.to !== p.id) return 'Không có đề nghị giao dịch'
  const error = validateTrade(s, t)
  if (error) return error
  const from = player(s, t.from)
  for (const i of t.giveSquares) s.squares[i]!.owner = p.id
  for (const i of t.getSquares) s.squares[i]!.owner = from.id
  from.money += t.getMoney - t.giveMoney
  p.money += t.giveMoney - t.getMoney
  p.jailCards.push(...from.jailCards.splice(0, t.giveJailCards))
  from.jailCards.push(...p.jailCards.splice(0, t.getJailCards))
  s.trade = null
  log(s, `${p.name} chấp nhận giao dịch với ${from.name}`)
}

function rejectTrade(s: GameState, p: Player) {
  const t = s.trade
  if (!t || (t.to !== p.id && t.from !== p.id)) return 'Không có đề nghị giao dịch'
  s.trade = null
  log(s, t.from === p.id ? `${p.name} huỷ đề nghị giao dịch` : `${p.name} từ chối giao dịch`)
}

// --- helpers ---

const cur = (s: GameState) => s.players[s.current]
const player = (s: GameState, id: string) => s.players.find((x) => x.id === id)!
const isSquare = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < BOARD.length

function ownsGroup(s: GameState, owner: string, group: Group) {
  return groupSquares(group).every((i) => s.squares[i]!.owner === owner)
}

/** Houses/hotels in play, optionally for one owner. */
function buildings(s: GameState, owner?: string) {
  let houses = 0
  let hotels = 0
  for (const o of s.squares) {
    if (!o || (owner && o.owner !== owner)) continue
    if (o.houses === 5) hotels++
    else houses += o.houses
  }
  return { houses, hotels }
}

function log(s: GameState, line: string) {
  s.log.push(line)
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT)
}
