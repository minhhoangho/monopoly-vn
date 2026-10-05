import { useEffect, useRef, useState } from 'react'
import {
  AIRPORT_RENT,
  BOARD,
  formatMoney,
  GROUP_COLORS,
  JAIL_FINE,
  netWorth,
  TOKENS,
  unmortgageCost,
  type Action,
  type GameState,
  type Ownable,
  type RoomView,
  type Trade,
} from '@monopoly-vn/engine'
import type { Connection } from './net'
import { Scene, type Controls, type Quality } from './scene/Scene'
import { formatShort, load, playerColor, save, TOKEN_ICONS } from './util'

interface Props {
  conn: Connection
  room: RoomView
  me: string
}

type Act = (action: Action) => void

/** False for a moment after each roll so prompts appear after the dice and token animation. */
function useSettled(rollCount: number) {
  const [settled, setSettled] = useState(true)
  const first = useRef(rollCount)
  useEffect(() => {
    if (rollCount === first.current) return
    setSettled(false)
    const t = setTimeout(() => setSettled(true), 1800)
    return () => clearTimeout(t)
  }, [rollCount])
  return settled
}

export function Game({ conn, room, me }: Props) {
  const game = room.game!
  const [selected, setSelected] = useState<number | null>(null)
  const [quality, setQuality] = useState<Quality>(() => load<Quality>('quality', 'high'))
  const [tradeOpen, setTradeOpen] = useState(false)
  const controls = useRef<Controls>(null)
  const settled = useSettled(game.rollCount)
  const act: Act = (action) => conn.send({ t: 'action', action })

  const toggleQuality = () => {
    const next = quality === 'high' ? 'low' : 'high'
    setQuality(next)
    save('quality', next)
  }

  return (
    <div className="game">
      <Scene room={room} selected={selected} onSelect={setSelected} quality={quality} controls={controls} />

      <div className="topbar">
        <span className="pill">
          Phòng <b>{room.code}</b>
        </span>
        <Countdown room={room} skew={conn.clockSkew} />
        <span className="spacer" />
        <button title="Về góc nhìn mặc định" onClick={() => controls.current?.reset()}>
          🎥
        </button>
        <button title="Chất lượng đồ hoạ" onClick={toggleQuality}>
          {quality === 'high' ? 'Đồ hoạ: Cao' : 'Đồ hoạ: Thấp'}
        </button>
        <button
          onClick={() => {
            if (game.phase === 'ended' || confirm('Rời ván sẽ bị xử thua. Bạn chắc chứ?')) conn.leave()
          }}
        >
          Rời ván
        </button>
      </div>

      <PlayerPanel room={room} me={me} onSelect={setSelected} />
      <LogPanel lines={game.log} />
      <ActionBar game={game} room={room} me={me} act={act} settled={settled} onTrade={() => setTradeOpen(true)} />
      {selected !== null && <SquarePanel i={selected} room={room} me={me} act={act} onClose={() => setSelected(null)} />}
      {tradeOpen && <TradeDialog room={room} me={me} act={act} onClose={() => setTradeOpen(false)} />}
      {game.trade?.to === me && <IncomingTrade room={room} trade={game.trade} act={act} />}
      {settled && <CardToast game={game} />}
      {game.phase === 'ended' && <Result room={room} onLeave={conn.leave} />}
    </div>
  )
}

function Countdown({ room, skew }: { room: RoomView; skew: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const left = (deadline: number | null) => (deadline === null ? null : Math.max(0, deadline - (now - skew)))
  const turn = left(room.turnDeadline)
  const total = left(room.gameDeadline)
  const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`
  return (
    <>
      {turn !== null && <span className={`pill ${turn < 10_000 ? 'warn' : ''}`}>⏱ {Math.ceil(turn / 1000)}s</span>}
      {total !== null && <span className="pill">Còn {mmss(total)}</span>}
    </>
  )
}

function PlayerPanel({ room, me, onSelect }: { room: RoomView; me: string; onSelect: (i: number) => void }) {
  const game = room.game!
  return (
    <div className="panel players-panel">
      {game.players.map((p, idx) => {
        const conn = room.players.find((x) => x.id === p.id)
        const owned = game.squares.flatMap((o, i) => (o?.owner === p.id ? [i] : []))
        return (
          <div key={p.id} className={`player ${idx === game.current ? 'current' : ''} ${p.bankrupt ? 'out' : ''}`}>
            <div className="player-head">
              <span className="dot" style={{ background: playerColor(room, p.id) }} />
              <span className="name" title={TOKENS[p.token]}>
                {TOKEN_ICONS[p.token]} {p.name}
                {p.id === me && <small> (bạn)</small>}
              </span>
              <span className="money">{p.bankrupt ? 'Phá sản' : formatMoney(p.money)}</span>
            </div>
            <div className="badges">
              {idx === game.current && game.phase !== 'ended' && <span className="badge turn">Đang đi</span>}
              {p.inJail && <span className="badge">Trong tù</span>}
              {p.jailCards.length > 0 && <span className="badge">Thẻ ra tù ×{p.jailCards.length}</span>}
              {conn && !conn.connected && !p.bankrupt && <span className="badge warn">Mất kết nối</span>}
            </div>
            {owned.length > 0 && (
              <div className="chips">
                {owned.map((i) => {
                  const sq = BOARD[i]
                  return (
                    <button
                      key={i}
                      className={`chip ${game.squares[i]!.mortgaged ? 'mortgaged' : ''}`}
                      style={{ background: sq.kind === 'property' ? GROUP_COLORS[sq.group] : '#666' }}
                      title={sq.name}
                      onClick={() => onSelect(i)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LogPanel({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`panel log-panel ${open ? '' : 'closed'}`}>
      <button className="log-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Ẩn nhật ký' : 'Nhật ký'}
      </button>
      {open && (
        <ul>
          {lines
            .slice(-8)
            .reverse()
            .map((line, k) => (
              <li key={lines.length - k}>{line}</li>
            ))}
        </ul>
      )}
    </div>
  )
}

interface ActionBarProps {
  game: GameState
  room: RoomView
  me: string
  act: Act
  settled: boolean
  onTrade: () => void
}

function ActionBar({ game, room, me, act, settled, onTrade }: ActionBarProps) {
  if (game.phase === 'ended') return null
  const current = game.players[game.current]
  const p = game.players.find((x) => x.id === me)
  if (current.id !== me || !p) {
    return (
      <div className="actionbar">
        <span>
          Đang chờ <b style={{ color: playerColor(room, current.id) }}>{current.name}</b>…
        </span>
      </div>
    )
  }
  if (!settled) return <div className="actionbar">🎲 …</div>

  const square = BOARD[p.position]
  const debt = game.debts.reduce((sum, d) => sum + d.amount, 0)
  const outgoing = game.trade?.from === me ? game.players.find((x) => x.id === game.trade!.to) : null
  const canTrade = !game.trade && ['roll', 'buy', 'done'].includes(game.phase)

  return (
    <div className="actionbar">
      {game.phase === 'roll' && (
        <>
          <button className="primary big" onClick={() => act({ type: 'roll' })}>
            🎲 Đổ xúc xắc
          </button>
          {p.inJail && <button onClick={() => act({ type: 'payJail' })}>Nộp {formatMoney(JAIL_FINE)} ra tù</button>}
          {p.inJail && p.jailCards.length > 0 && <button onClick={() => act({ type: 'useJailCard' })}>Dùng thẻ ra tù</button>}
        </>
      )}
      {game.phase === 'buy' && (
        <>
          <span>
            Mua <b>{square.name}</b> giá <b>{formatMoney((square as Ownable).price)}</b>?
          </span>
          <button className="primary" onClick={() => act({ type: 'buy' })}>
            Mua
          </button>
          <button onClick={() => act({ type: 'skipBuy' })}>Bỏ qua</button>
        </>
      )}
      {game.phase === 'debt' && (
        <>
          <span className="warn-text">
            Bạn nợ <b>{formatMoney(debt)}</b>. Bán nhà hoặc thế chấp đất (chọn ô trên bàn cờ) để trả.
          </span>
          <button className="primary" onClick={() => act({ type: 'payDebt' })}>
            Trả nợ
          </button>
          <button className="danger" onClick={() => confirm('Tuyên bố phá sản?') && act({ type: 'bankrupt' })}>
            Phá sản
          </button>
        </>
      )}
      {game.phase === 'done' && (
        <button className="primary big" onClick={() => act({ type: 'endTurn' })}>
          Kết thúc lượt
        </button>
      )}
      {canTrade && <button onClick={onTrade}>🤝 Giao dịch</button>}
      {outgoing && (
        <span>
          Chờ {outgoing.name} trả lời giao dịch… <button onClick={() => act({ type: 'rejectTrade' })}>Huỷ</button>
        </span>
      )}
    </div>
  )
}

const RENT_LABELS = ['Đất trống', '1 nhà', '2 nhà', '3 nhà', '4 nhà', 'Khách sạn']

function SquarePanel({ i, room, me, act, onClose }: { i: number; room: RoomView; me: string; act: Act; onClose: () => void }) {
  const game = room.game!
  const sq = BOARD[i]
  const o = game.squares[i]
  const owner = o?.owner ? game.players.find((p) => p.id === o.owner) : null
  const mine = o?.owner === me && game.players[game.current].id === me && game.phase !== 'ended'

  return (
    <div className="panel square-panel">
      <div className="square-head" style={{ background: sq.kind === 'property' ? GROUP_COLORS[sq.group] : '#3b2a1a' }}>
        <b>{sq.name}</b>
        <button className="close" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className="square-body">
        {'price' in sq && <Row label="Giá mua" value={formatMoney(sq.price)} />}
        {sq.kind === 'property' && (
          <>
            {sq.rent.map((r, k) => (
              <Row key={k} label={RENT_LABELS[k]} value={formatMoney(r)} strong={o?.houses === k && !!owner} />
            ))}
            <p className="hint">Sở hữu trọn nhóm màu: tiền thuê đất trống ×2</p>
            <Row label="Giá mỗi nhà" value={formatMoney(sq.houseCost)} />
          </>
        )}
        {sq.kind === 'airport' &&
          AIRPORT_RENT.map((r, k) => <Row key={k} label={`Sở hữu ${k + 1} sân bay`} value={formatMoney(r)} />)}
        {sq.kind === 'utility' && <p className="hint">Tiền thuê: tổng xúc xắc × 40.000đ (1 công ty) hoặc × 100.000đ (2 công ty)</p>}
        {sq.kind === 'tax' && <Row label="Phải nộp" value={formatMoney(sq.amount)} />}
        {'price' in sq && (
          <>
            <Row label="Giá thế chấp" value={formatMoney(sq.price / 2)} />
            <Row label="Chủ sở hữu" value={owner ? owner.name : 'Chưa có chủ'} />
            {o?.mortgaged && <p className="warn-text">Đang thế chấp — không thu tiền thuê</p>}
          </>
        )}
        {mine && (
          <div className="square-actions">
            {sq.kind === 'property' && !o!.mortgaged && (
              <>
                <button onClick={() => act({ type: 'build', square: i })}>Xây nhà</button>
                {o!.houses > 0 && <button onClick={() => act({ type: 'sellHouse', square: i })}>Bán nhà</button>}
              </>
            )}
            {o!.mortgaged ? (
              <button onClick={() => act({ type: 'unmortgage', square: i })}>
                Chuộc lại ({formatMoney(unmortgageCost((sq as Ownable).price))})
              </button>
            ) : (
              <button onClick={() => act({ type: 'mortgage', square: i })}>Thế chấp</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`row ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function SquareCheckboxes({ squares, picked, onChange }: { squares: number[]; picked: number[]; onChange: (v: number[]) => void }) {
  if (squares.length === 0) return <p className="hint">Không có đất</p>
  return (
    <div className="checks">
      {squares.map((i) => {
        const sq = BOARD[i]
        return (
          <label key={i}>
            <input
              type="checkbox"
              checked={picked.includes(i)}
              onChange={(e) => onChange(e.target.checked ? [...picked, i] : picked.filter((x) => x !== i))}
            />
            <span className="swatch" style={{ background: sq.kind === 'property' ? GROUP_COLORS[sq.group] : '#666' }} />
            {sq.name}
          </label>
        )
      })}
    </div>
  )
}

function TradeDialog({ room, me, act, onClose }: { room: RoomView; me: string; act: Act; onClose: () => void }) {
  const game = room.game!
  const others = game.players.filter((p) => !p.bankrupt && p.id !== me)
  const [to, setTo] = useState(others[0]?.id ?? '')
  const [give, setGive] = useState<number[]>([])
  const [get, setGet] = useState<number[]>([])
  const [giveMoney, setGiveMoney] = useState(0)
  const [getMoney, setGetMoney] = useState(0)
  const ownedBy = (id: string) => game.squares.flatMap((o, i) => (o?.owner === id ? [i] : []))
  const money = (v: string) => Math.max(0, Math.round(Number(v) || 0))

  const submit = () => {
    const trade: Omit<Trade, 'from'> = { to, giveSquares: give, getSquares: get, giveMoney, getMoney, giveJailCards: 0, getJailCards: 0 }
    act({ type: 'proposeTrade', trade })
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Đề nghị giao dịch</h3>
        <label className="field">
          Với
          <select
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setGet([])
            }}
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="trade-cols">
          <div>
            <h4>Bạn đưa</h4>
            <SquareCheckboxes squares={ownedBy(me)} picked={give} onChange={setGive} />
            <label className="field">
              Tiền (đ)
              <input type="number" min={0} step={100_000} value={giveMoney} onChange={(e) => setGiveMoney(money(e.target.value))} />
            </label>
          </div>
          <div>
            <h4>Bạn nhận</h4>
            <SquareCheckboxes squares={ownedBy(to)} picked={get} onChange={setGet} />
            <label className="field">
              Tiền (đ)
              <input type="number" min={0} step={100_000} value={getMoney} onChange={(e) => setGetMoney(money(e.target.value))} />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Huỷ</button>
          <button className="primary" disabled={!to} onClick={submit}>
            Gửi đề nghị
          </button>
        </div>
      </div>
    </div>
  )
}

function IncomingTrade({ room, trade, act }: { room: RoomView; trade: Trade; act: Act }) {
  const from = room.game!.players.find((p) => p.id === trade.from)!
  const describe = (squares: number[], money: number, cards: number) =>
    [...squares.map((i) => BOARD[i].name), money > 0 && formatMoney(money), cards > 0 && `${cards} thẻ ra tù`].filter(Boolean).join(', ') ||
    'Không có gì'
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{from.name} đề nghị giao dịch</h3>
        <p>
          <b>Bạn nhận:</b> {describe(trade.giveSquares, trade.giveMoney, trade.giveJailCards)}
        </p>
        <p>
          <b>Bạn đưa:</b> {describe(trade.getSquares, trade.getMoney, trade.getJailCards)}
        </p>
        <div className="modal-actions">
          <button onClick={() => act({ type: 'rejectTrade' })}>Từ chối</button>
          <button className="primary" onClick={() => act({ type: 'acceptTrade' })}>
            Đồng ý
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shows the card drawn in the latest roll, if any. */
function CardToast({ game }: { game: GameState }) {
  const lastRoll = game.log.findLastIndex((l) => l.includes(' đổ được '))
  const line = game.log.slice(lastRoll).find((l) => l.includes(' rút thẻ '))
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!line) return
    setShown(game.rollCount)
    const t = setTimeout(() => setShown(null), 4500)
    return () => clearTimeout(t)
  }, [line, game.rollCount])
  if (!line || shown !== game.rollCount) return null
  const [who, text] = line.split(': ')
  return (
    <div className={`card-toast ${line.includes('Cơ hội') ? 'chance' : 'chest'}`}>
      <small>{who}</small>
      <div>{text}</div>
    </div>
  )
}

function Result({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const game = room.game!
  const winner = game.players.find((p) => p.id === game.winner)
  const ranking = [...game.players].sort((a, b) => netWorth(game, b.id) - netWorth(game, a.id))
  return (
    <div className="modal-backdrop">
      <div className="modal result">
        <div className="trophy">🏆</div>
        <h2>{winner?.name} chiến thắng!</h2>
        <ol>
          {ranking.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: playerColor(room, p.id) }} /> {p.name}
              <span>{p.bankrupt ? 'Phá sản' : formatShort(netWorth(game, p.id))}</span>
            </li>
          ))}
        </ol>
        <button className="primary" onClick={onLeave}>
          Về trang chủ
        </button>
      </div>
    </div>
  )
}
