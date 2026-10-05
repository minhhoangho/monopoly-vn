# Monopoly VN

Vietnamese-themed 3D Monopoly, online multiplayer in the browser.
Full requirements: [docs/requirements.md](docs/requirements.md) (Vietnamese). Rule IDs (R1, F3, N4...) there are the source of truth.
Deploy/setup: [docs/deploy.md](docs/deploy.md).

## Status
- P0 rules engine: done, tested.
- P1 MVP: room logic, Vercel API, 3D client done. Verified locally against the real Supabase project (rooms, broadcast, RLS spoof rejection, turn timeout). Not yet deployed to Vercel.

## Stack
- TypeScript (strict) everywhere, pnpm workspaces, Vitest
- Client: React + Three.js via React Three Fiber (+ drei), Vite. HTML overlay for 2D UI.
- Hosting: Vercel (static client + `apps/client/api/*.ts` Vercel Functions)
- Data + realtime: Supabase Postgres (`rooms` table) + Supabase Realtime broadcast
- 3D models: procedural placeholders in `scene/Tokens.tsx`; real art later as glTF/GLB in `apps/client/public/models`

## Layout
```
packages/engine/src/engine.ts  # pure game rules (R1-R24) + board/card data re-export
packages/engine/src/room.ts    # pure room rules (F1-F12): join, start, timeouts, drops. Import via @monopoly-vn/engine/room
packages/engine/src/protocol.ts# request/response/view types shared by API and client
apps/client/api/room.ts        # Vercel Function POST /api/room: load doc -> reduceRoom -> save (optimistic lock) -> broadcast
apps/client/src/net.ts         # client transport: fetch /api/room + Supabase channel `room:<code>` + heartbeat/tick
apps/client/src/scene/         # R3F scene (board, tokens, dice)
supabase/migrations/           # SQL schema + RLS
```

## Architecture rules
- Server-authoritative: only the API rolls dice, shuffles cards, moves money. Client sends intents, renders `RoomView`.
- No long-running server. Deadlines (turn timer, game limit, disconnect drop) are stored in the room doc and enforced inside `reduceRoom` on any request; clients send `tick` at deadlines and `heartbeat` every 15s.
- All rules live in `packages/engine` as pure functions; the API is thin I/O. Never put rule logic in the API or UI.
- Engine is deterministic: RNG and `now` are injected, so tests control them.
- `roomView` is the only thing clients receive: never leak seat secrets or deck order (N3).
- `rooms` table has RLS with no policies (service role only). Clients may only receive broadcasts on private `room:*` channels.
- Board/card/price data lives in `packages/engine/src/data.ts`. Do not hardcode prices elsewhere.
- Money is integer VND. No floats.
- Dice result comes from the server. Client animates dice to land on that result; never read results from physics.
- Keep 3D scene state derived from game state; no game logic inside components or render loops.
- Engine source uses `.js` import suffixes (works in Vite, Vitest and Node ESM on Vercel).

## Language
- Talk to the user in Vietnamese.
- Code, identifiers, comments, commits, branches, PRs: English.
- In-game UI text: Vietnamese.

## Commands
```
pnpm install
pnpm test        # engine + room tests
pnpm typecheck
pnpm dev         # client + /api/room via Vite middleware (needs apps/client/.env.local)
pnpm build
```
