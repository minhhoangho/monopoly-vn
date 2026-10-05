import { useState } from 'react'
import { TOKENS, type RoomConfig, type RoomView } from '@monopoly-vn/engine'
import type { Connection } from './net'
import { load, playerColor, save, TOKEN_ICONS } from './util'

export function Home({ conn }: { conn: Connection }) {
  const [name, setName] = useState<string>(() => load('name', ''))
  const [token, setToken] = useState(0)
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '')
  const ready = name.trim().length > 0 && conn.online

  const go = (msg: 'create' | 'join') => {
    save('name', name.trim())
    if (msg === 'create') conn.send({ t: 'create', name, token })
    else conn.send({ t: 'join', code, name, token })
  }

  return (
    <div className="screen">
      <div className="card">
        <h1>
          Cờ Tỷ Phú <span>Việt Nam</span>
        </h1>
        <label className="field">
          Tên hiển thị
          <input maxLength={20} value={name} placeholder="Ví dụ: Minh" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">Chọn quân cờ</div>
        <div className="tokens">
          {TOKENS.map((t, i) => (
            <button key={t} className={`token ${i === token ? 'active' : ''}`} onClick={() => setToken(i)}>
              <span>{TOKEN_ICONS[i]}</span>
              {t}
            </button>
          ))}
        </div>
        <button className="primary big" disabled={!ready} onClick={() => go('create')}>
          Tạo phòng mới
        </button>
        <div className="join">
          <input
            placeholder="Mã phòng"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button disabled={!ready || code.length !== 6} onClick={() => go('join')}>
            Vào phòng
          </button>
        </div>
        {!conn.online && <p className="hint">Đang kết nối máy chủ…</p>}
      </div>
    </div>
  )
}

const MONEY_OPTIONS = [10, 15, 20, 30].map((m) => m * 1_000_000)
const TURN_OPTIONS = [30, 60, 90, 120]
const GAME_OPTIONS = [0, 30, 60, 90]

export function Lobby({ conn, room, me }: { conn: Connection; room: RoomView; me: string }) {
  const isHost = room.hostId === me
  const [copied, setCopied] = useState(false)
  const link = `${location.origin}${location.pathname}?room=${room.code}`
  const setConfig = (patch: Partial<RoomConfig>) => conn.send({ t: 'config', config: { ...room.config, ...patch } })

  return (
    <div className="screen">
      <div className="card">
        <h2>
          Phòng <span className="code">{room.code}</span>
        </h2>
        <button
          onClick={() =>
            navigator.clipboard
              ?.writeText(link)
              .then(() => setCopied(true))
              .catch(() => prompt('Sao chép link mời:', link))
          }
        >
          {copied ? '✓ Đã sao chép link mời' : '🔗 Sao chép link mời'}
        </button>

        <ul className="lobby-players">
          {room.players.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: playerColor(room, p.id) }} />
              {TOKEN_ICONS[p.token]} {p.name}
              {p.id === room.hostId && <small> · chủ phòng</small>}
              {p.id === me && <small> · bạn</small>}
              {!p.connected && <small className="warn-text"> · mất kết nối</small>}
            </li>
          ))}
        </ul>

        <fieldset disabled={!isHost}>
          <label className="field">
            Tiền khởi đầu
            <select value={room.config.startMoney} onChange={(e) => setConfig({ startMoney: Number(e.target.value) })}>
              {MONEY_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m / 1_000_000} triệu
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Thời gian mỗi lượt
            <select value={room.config.turnSeconds} onChange={(e) => setConfig({ turnSeconds: Number(e.target.value) })}>
              {TURN_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} giây
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Giới hạn thời gian ván
            <select value={room.config.gameMinutes} onChange={(e) => setConfig({ gameMinutes: Number(e.target.value) })}>
              {GAME_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Không giới hạn' : `${m} phút`}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {isHost ? (
          <button className="primary big" disabled={room.players.length < 2} onClick={() => conn.send({ t: 'start' })}>
            Bắt đầu ({room.players.length}/6)
          </button>
        ) : (
          <p className="hint">Đang chờ chủ phòng bắt đầu…</p>
        )}
        <button className="link" onClick={conn.leave}>
          Rời phòng
        </button>
      </div>
    </div>
  )
}
