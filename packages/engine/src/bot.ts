// Computer player: returns one action per call. Candidate moves are checked with applyAction, so the bot
// never re-implements game rules; it only decides which legal move it prefers.
import { applyAction, BOARD, groupSquares, JAIL_FINE, unmortgageCost, type Action, type GameState, type Ownable, type Trade } from './engine.js'

/** Cash the bot tries to keep for rent and taxes. */
const RESERVE = 2_000_000

const priceOf = (i: number) => (BOARD[i] as Ownable).price

/**
 * Offer cash for the land that completes one of our colour groups, but only to another bot and only when
 * that bot would accept (so a refusal can never loop). Humans are never spammed with offers.
 */
function groupDeal(s: GameState, id: string, bots: string[]): Action | undefined {
  const me = s.players.find((x) => x.id === id)!
  for (const group of ['blue', 'green', 'yellow', 'red', 'orange', 'pink', 'lightBlue', 'brown'] as const) {
    const squares = groupSquares(group)
    const missing = squares.filter((i) => s.squares[i]!.owner !== id)
    const sellers = new Set(missing.map((i) => s.squares[i]!.owner))
    const seller = [...sellers][0]
    if (missing.length === squares.length || missing.length === 0 || sellers.size !== 1 || !seller || !bots.includes(seller)) continue
    const offer = Math.ceil((1.3 * missing.reduce((sum, i) => sum + priceOf(i), 0)) / 100_000) * 100_000
    if (me.money - offer < RESERVE) continue
    const trade = { to: seller, giveSquares: [], getSquares: missing, giveMoney: offer, getMoney: 0, giveJailCards: 0, getJailCards: 0 }
    if (botAcceptsTrade(s, { ...trade, from: id })) return { type: 'proposeTrade', trade }
  }
}

/** `bots` = ids of all computer players in the game. */
export function botAction(s: GameState, id: string, bots: string[]): Action {
  const p = s.players.find((x) => x.id === id)!
  const legal = (a: Action) => applyAction(s, id, a, () => 0).ok // only non-random actions are tried
  const firstLegal = (actions: Action[]) => actions.find(legal)
  const owned = s.squares.flatMap((o, i) => (o?.owner === id ? [i] : []))
  const priciest = [...owned].sort((a, b) => priceOf(b) - priceOf(a))

  if (s.phase === 'debt') {
    // sell buildings first, then mortgage cheapest land, pay as soon as possible
    return (
      firstLegal([
        { type: 'payDebt' },
        ...priciest.map((square): Action => ({ type: 'sellHouse', square })),
        ...[...priciest].reverse().map((square): Action => ({ type: 'mortgage', square })),
      ]) ?? { type: 'bankrupt' }
    )
  }

  if (s.phase === 'buy') {
    const sq = BOARD[p.position] as Ownable
    const completesGroup =
      sq.kind === 'property' && groupSquares(sq.group).every((i) => i === p.position || s.squares[i]!.owner === id)
    const wants = p.money - sq.price >= RESERVE || (completesGroup && p.money >= sq.price)
    return (wants && firstLegal([{ type: 'buy' }])) || { type: 'skipBuy' }
  }

  // roll / done: get out of jail, complete a group, unmortgage, build (one step per call), then roll or end the turn
  const deal = s.trade ? undefined : groupDeal(s, id, bots)
  const improve = firstLegal([
    { type: 'useJailCard' },
    ...(deal ? [deal] : []),
    ...(p.money >= JAIL_FINE + 2 * RESERVE ? [{ type: 'payJail' } as Action] : []),
    ...priciest
      .filter((i) => p.money - unmortgageCost(priceOf(i)) >= 2 * RESERVE)
      .map((square): Action => ({ type: 'unmortgage', square })),
    ...priciest
      .filter((i) => {
        const sq = BOARD[i]
        return sq.kind === 'property' && p.money - sq.houseCost >= RESERVE
      })
      .map((square): Action => ({ type: 'build', square })),
  ])
  return improve ?? { type: s.phase === 'roll' ? 'roll' : 'endTurn' }
}

/** Accept only clearly good deals, and never break up a colour group the bot already owns. */
export function botAcceptsTrade(s: GameState, t: Trade): boolean {
  const value = (squares: number[], money: number, cards: number) =>
    squares.reduce((sum, i) => sum + priceOf(i), 0) + money + cards * JAIL_FINE
  const givesUpGroup = t.getSquares.some((i) => {
    const sq = BOARD[i]
    return sq.kind === 'property' && groupSquares(sq.group).every((j) => s.squares[j]!.owner === t.to)
  })
  return !givesUpGroup && value(t.giveSquares, t.giveMoney, t.giveJailCards) >= 1.25 * value(t.getSquares, t.getMoney, t.getJailCards)
}
