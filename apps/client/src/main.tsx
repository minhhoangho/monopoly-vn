import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Home, Lobby } from './Home'
import { Game } from './Hud'
import { configured, useConnection } from './net'
import './styles.css'

function ErrorToast({ error }: { error: { message: string; at: number } | null }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!error) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(t)
  }, [error])
  return visible && error ? <div className="toast">{error.message}</div> : null
}

function App() {
  const conn = useConnection()
  const { room, me } = conn
  return (
    <>
      {!room || !me ? (
        <Home conn={conn} />
      ) : room.game ? (
        <Game conn={conn} room={room} me={me} />
      ) : (
        <Lobby conn={conn} room={room} me={me} />
      )}
      {!conn.online && room && <div className="banner">Mất kết nối, đang kết nối lại…</div>}
      <ErrorToast error={conn.error} />
    </>
  )
}

// N10: no WebGL2, no game.
function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

createRoot(document.getElementById('root')!).render(
  !configured ? (
    <div className="screen">
      <div className="card">
        <h2>Chưa cấu hình Supabase</h2>
        <p>Tạo file apps/client/.env.local theo .env.example (xem docs/deploy.md).</p>
      </div>
    </div>
  ) : hasWebGL2() ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <div className="screen">
      <div className="card">
        <h2>Trình duyệt không hỗ trợ WebGL2</h2>
        <p>Vui lòng dùng phiên bản mới của Chrome, Edge, Firefox hoặc Safari để chơi Cờ Tỷ Phú 3D.</p>
      </div>
    </div>
  ),
)
