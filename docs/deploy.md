# Cài đặt & Deploy (Vercel + Supabase)

## Kiến trúc

```
Trình duyệt ──POST /api/room──▶ Vercel Function (apps/client/api/room.ts)
     ▲                              │ đọc/ghi bảng rooms (service role, khoá lạc quan theo rev)
     │                              ▼
     └──── Realtime broadcast ── Supabase (Postgres + Realtime, kênh private room:<mã>)
```

- Không có server chạy liên tục. Hẹn giờ lượt (F8), giới hạn thời gian ván (R24) và loại người rớt mạng (F11) được lưu thành deadline trong phòng, và được xử lý khi có request bất kỳ (client gửi `tick` khi tới hạn, `heartbeat` mỗi 15 giây).
- Client chỉ dùng publishable key để **nhận** broadcast. Chỉ API (secret key) mới ghi DB và gửi broadcast.

## 1. Supabase

1. Tạo project tại supabase.com (khu vực Singapore cho gần Việt Nam).
2. SQL Editor → chạy nội dung `supabase/migrations/0001_init.sql`.
3. Project Settings → Realtime → **tắt "Allow public access"** để chỉ kênh private (có RLS) hoạt động.
4. (Tuỳ chọn) Bật extension `pg_cron` và chạy lệnh dọn phòng cũ ở cuối file migration.
5. Lấy `Project URL` (Settings → Data API), publishable key `sb_publishable_...` và secret key `sb_secret_...` (Settings → API Keys).

## 2. Chạy local

```bash
cp apps/client/.env.example apps/client/.env.local
```

Điền 4 biến vào `apps/client/.env.local` (file này đã được gitignore), rồi:

```bash
pnpm install
```

```bash
pnpm dev
```

Mở http://localhost:5173 ở 2 tab để thử 2 người chơi (mỗi tab giữ một ghế riêng).

## 3. Vercel

1. Import repo vào Vercel.
2. **Root Directory**: `apps/client`. Framework: Vite (tự nhận). Install/Build giữ mặc định (pnpm workspace được nhận từ lockfile ở gốc repo).
3. Environment Variables: thêm đủ 4 biến như `.env.example`.
4. Deploy. Hàm `api/room.ts` tự thành endpoint `POST /api/room`.

## Lưu ý

- Độ trễ: người thao tác nhận kết quả sau 2 truy vấn Postgres; người khác nhận qua broadcast (gửi sau khi đã trả response, bằng `waitUntil`). Đo từ máy local tới Supabase: response ~400ms, broadcast tới client khác ~1,2s. Đặt Vercel Function region trùng khu vực Supabase (Project Settings → Functions → Region) để giảm mạnh con số này.
- Broadcast private cần partition ngày của bảng `realtime.messages`. Partition được Supabase tạo khi có client kết nối WebSocket, nên project mới chưa có ai mở game sẽ báo `Missing messages partition` cho tới khi có người chơi đầu tiên vào. Không cần xử lý thêm.
- Phòng bị bỏ dở (mọi người tắt tab) không tự xoá: bật `pg_cron` và chạy lệnh dọn ở cuối file migration.
- Nếu lần deploy đầu báo lỗi import `@monopoly-vn/engine` trong function: kiểm tra Vercel đã bật "Include source files outside of the Root Directory" (mặc định bật cho monorepo).
