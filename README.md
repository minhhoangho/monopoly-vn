# Cờ Tỷ Phú Việt Nam 🇻🇳

> Vietnamese-themed 3D Monopoly — play online with friends or against the computer, right in the browser.

Cờ tỷ phú phiên bản Việt Nam: bàn cờ 3D với địa danh từ Hà Giang tới Cà Mau, tiền VNĐ, thẻ Cơ hội / Khí vận đậm chất đời thường, chơi online nhiều người hoặc đấu với máy.

**▶ Chơi ngay: [monopoly-vn.vercel.app](https://monopoly-vn.vercel.app)**

![Bàn cờ 3D giữa ván](docs/screenshots/board.jpg)

## Tính năng

- **Bàn cờ 3D** (React Three Fiber): xoay, zoom, xúc xắc 3D lăn và dừng đúng mặt server trả về, quân cờ nhảy từng ô, nhà và khách sạn mọc lên khi xây.
- **Địa danh Việt Nam thật**: 22 ô đất và 4 sân bay mang ảnh Chùa Một Cột, Tháp Rùa, Chùa Cầu, Cầu Vàng, thác Bản Giốc, vịnh Hạ Long… (ảnh giấy phép tự do từ Wikimedia Commons, có ghi công tác giả).
- **Quân cờ Việt**: nón lá, trống đồng, bánh chưng, xích lô, hoa sen, xe máy.
- **Thẻ Cơ hội / Khí vận "troll"**: lì xì Tết, phạt nguội, sinh nhật bồ nhí, lộ chuyện có con riêng, mẹ vợ lên chơi, khoe trúng số bị cả làng đòi khao…
- **Online nhiều người**: tạo phòng, gửi link/mã 6 ký tự, 2–6 người, tự vào lại khi rớt mạng, đồng hồ lượt.
- **Chơi với máy**: một nút là có 3 máy để đấu; máy mua đất, xây nhà, thế chấp khi nợ, gom nhóm màu bằng giao dịch.
- **Đủ luật cờ tỷ phú**: mua đất, thuê theo nhóm màu, xây đều, thế chấp/chuộc, nhà tù, giao dịch, phá sản, giới hạn thời gian ván.
- **Chống gian lận**: server quyết định mọi kết quả (xúc xắc, thẻ, tiền); client chỉ gửi ý định và không thấy thứ tự bộ bài.

## Hình ảnh trong game

| Trang chủ | Phòng chờ với máy |
|---|---|
| ![Trang chủ](docs/screenshots/home.jpg) | ![Phòng chờ](docs/screenshots/lobby.jpg) |

| Chi tiết ô đất kèm ảnh địa danh | Cận cảnh 3D: quân cờ, nhà, địa danh |
|---|---|
| ![Chi tiết ô Cao Bằng](docs/screenshots/square.jpg) | ![Cận cảnh bàn cờ](docs/screenshots/closeup.jpg) |

<p align="center">
  <img src="docs/screenshots/mobile.jpg" alt="Giao diện điện thoại, đang hiện thẻ Cơ hội" width="300" /><br />
  <em>Trên điện thoại</em>
</p>

## Công nghệ

| Phần | Công nghệ |
|---|---|
| Client | React 19, Three.js + React Three Fiber + drei, Vite, TypeScript |
| Luật chơi | `packages/engine`: hàm thuần TypeScript, test bằng Vitest |
| Server | Vercel Functions (`POST /api/room`), không có server chạy liên tục |
| Dữ liệu & realtime | Supabase Postgres + Supabase Realtime (broadcast, kênh private + RLS) |

```
Trình duyệt ──POST /api/room──▶ Vercel Function ──đọc/ghi──▶ Supabase Postgres
     ▲                                   │
     └──────── Realtime broadcast ◀──────┘
```

Toàn bộ luật (game và phòng chơi: hẹn giờ lượt, rớt mạng, máy chơi) là hàm thuần trong `packages/engine`; API chỉ đọc trạng thái phòng, gọi engine rồi lưu lại. Hạn giờ được lưu trong phòng và xử lý ở request kế tiếp (client gửi `tick`/`heartbeat`), nên chạy được trên serverless.

## Chạy local

Cần Node.js 22+, pnpm và một project Supabase (xem [docs/deploy.md](docs/deploy.md) để tạo bảng và cấu hình).

```bash
pnpm install
```

```bash
cp apps/client/.env.example apps/client/.env.local
```

Điền Supabase URL, publishable key và secret key vào `apps/client/.env.local`, rồi:

```bash
pnpm dev
```

Mở http://localhost:5173 (mở 2 tab để thử 2 người chơi).

```bash
pnpm test
```

## Cấu trúc

```
packages/engine/   luật chơi (engine.ts), phòng chơi (room.ts), máy chơi (bot.ts), dữ liệu bàn cờ & thẻ (data.ts)
apps/client/       giao diện React + cảnh 3D (src/scene), Vercel Function (api/room.ts)
supabase/          migration SQL (bảng rooms + RLS)
docs/              tài liệu yêu cầu, hướng dẫn deploy, ảnh chụp màn hình
```

## Tài liệu

- [Tài liệu yêu cầu](docs/requirements.md): luật chơi (R1–R24), tính năng online (F1–F15), giao diện, yêu cầu phi chức năng.
- [Cài đặt & deploy](docs/deploy.md): Supabase, Vercel, biến môi trường.

## Nguồn ảnh

Ảnh địa danh lấy từ [Wikimedia Commons](https://commons.wikimedia.org) với giấy phép CC0, public domain, CC BY hoặc CC BY-SA. Tác giả, giấy phép và link gốc của từng ảnh nằm trong [`apps/client/src/landmarks.json`](apps/client/src/landmarks.json) và hiển thị trong game khi bấm vào ô.
