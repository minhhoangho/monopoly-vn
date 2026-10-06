# Cờ Tỷ Phú Việt Nam — Tài liệu yêu cầu (v0.1)

## 1. Tổng quan

Game cờ tỷ phú (Monopoly) phiên bản Việt Nam, **3D**, chơi **online nhiều người** trên trình duyệt.
Bàn cờ dùng địa danh Việt Nam, tiền VNĐ, thẻ sự kiện mang văn hoá Việt.

- **Nền tảng:** Web (desktop + trình duyệt mobile), render bằng WebGL.
- **Client:** React + Three.js (React Three Fiber) + TypeScript. Giao diện 2D (sảnh, bảng người chơi, hộp thoại) là HTML/React phủ lên canvas 3D.
- **Server:** Vercel Functions (TypeScript), server-authoritative. Dữ liệu phòng lưu ở Supabase Postgres, cập nhật realtime qua Supabase Realtime broadcast. Chi tiết: [deploy.md](deploy.md).
- **Ngôn ngữ giao diện:** Tiếng Việt.

### Mục tiêu MVP
1. 2–6 người chơi cùng một phòng online qua mã phòng / link.
2. Đầy đủ luật cờ tỷ phú cơ bản (mua đất, thu tiền thuê, xây nhà, thế chấp, vào tù, phá sản).
3. Chơi trọn một ván không lỗi đồng bộ, có thể vào lại khi rớt mạng.

### Ngoài phạm vi MVP
Tài khoản/đăng nhập, bảng xếp hạng, đấu giá, chat thoại, in-app purchase, app native.

## 2. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Ô | Một vị trí trên bàn cờ (40 ô) |
| Đất | Ô có thể mua, thuộc một nhóm màu |
| Nhóm màu | Bộ đất cùng màu; sở hữu trọn bộ mới được xây nhà |
| Cơ hội / Khí vận | Hai chồng thẻ sự kiện (tương đương Chance / Community Chest) |
| Chủ phòng | Người tạo phòng, có quyền bắt đầu ván và cấu hình luật |

## 3. Bàn cờ

40 ô, bố cục theo Monopoly chuẩn. Giá = giá Monopoly chuẩn × 10.000đ.

| # | Ô | Loại | Giá |
|---|---|---|---|
| 0 | Xuất phát (nhận 2.000.000đ khi đi qua) | Góc | — |
| 1 | Hà Giang | Nâu | 600.000 |
| 2 | Khí vận | Thẻ | — |
| 3 | Cao Bằng | Nâu | 600.000 |
| 4 | Thuế thu nhập | Thuế | 2.000.000 |
| 5 | Sân bay Nội Bài | Sân bay | 2.000.000 |
| 6 | Mộc Châu | Xanh nhạt | 1.000.000 |
| 7 | Cơ hội | Thẻ | — |
| 8 | Sa Pa | Xanh nhạt | 1.000.000 |
| 9 | Điện Biên Phủ | Xanh nhạt | 1.200.000 |
| 10 | Nhà tù / Thăm tù | Góc | — |
| 11 | Cà Mau | Hồng | 1.400.000 |
| 12 | Công ty Điện lực | Tiện ích | 1.500.000 |
| 13 | Châu Đốc | Hồng | 1.400.000 |
| 14 | Cần Thơ | Hồng | 1.600.000 |
| 15 | Sân bay Đà Nẵng | Sân bay | 2.000.000 |
| 16 | Quy Nhơn | Cam | 1.800.000 |
| 17 | Khí vận | Thẻ | — |
| 18 | Phong Nha | Cam | 1.800.000 |
| 19 | Huế | Cam | 2.000.000 |
| 20 | Bãi đỗ xe miễn phí | Góc | — |
| 21 | Vũng Tàu | Đỏ | 2.200.000 |
| 22 | Cơ hội | Thẻ | — |
| 23 | Đà Lạt | Đỏ | 2.200.000 |
| 24 | Nha Trang | Đỏ | 2.400.000 |
| 25 | Sân bay Cam Ranh | Sân bay | 2.000.000 |
| 26 | Ninh Bình | Vàng | 2.600.000 |
| 27 | Hạ Long | Vàng | 2.600.000 |
| 28 | Công ty Cấp nước | Tiện ích | 1.500.000 |
| 29 | Hội An | Vàng | 2.800.000 |
| 30 | Vào tù | Góc | — |
| 31 | Phú Quốc | Xanh lá | 3.000.000 |
| 32 | Hải Phòng | Xanh lá | 3.000.000 |
| 33 | Khí vận | Thẻ | — |
| 34 | Đà Nẵng | Xanh lá | 3.200.000 |
| 35 | Sân bay Tân Sơn Nhất | Sân bay | 2.000.000 |
| 36 | Cơ hội | Thẻ | — |
| 37 | Hà Nội | Xanh dương | 3.500.000 |
| 38 | Thuế xa xỉ | Thuế | 1.000.000 |
| 39 | TP. Hồ Chí Minh | Xanh dương | 4.000.000 |

- Tiền thuê, giá nhà, giá thế chấp: theo tỷ lệ Monopoly chuẩn × 10.000đ. Dữ liệu chi tiết nằm trong file data của engine (nguồn sự thật duy nhất).
- Dùng tên địa danh du lịch, không dùng tên đơn vị hành chính (tránh lỗi thời khi sáp nhập tỉnh).

## 4. Luật chơi (MVP)

### 4.1 Bắt đầu
- R1. Mỗi người nhận **15.000.000đ**.
- R2. Thứ tự lượt được xáo ngẫu nhiên khi bắt đầu.

### 4.2 Lượt chơi
- R3. Đổ 2 xúc xắc, di chuyển theo tổng. Server là bên duy nhất sinh số ngẫu nhiên.
- R4. Đổ đôi → được đổ tiếp. Đôi 3 lần liên tiếp → vào tù ngay.
- R5. Đi qua hoặc dừng ở Xuất phát → nhận 2.000.000đ.
- R6. Hành động khi dừng:
  - Đất/sân bay/tiện ích chưa có chủ → được mua (hoặc bỏ qua; MVP không đấu giá).
  - Có chủ khác, không thế chấp → trả tiền thuê.
  - Thẻ → rút thẻ, thực hiện ngay.
  - Thuế → trả tiền.
  - Vào tù → đi thẳng vào tù, không nhận tiền Xuất phát.
- R7. Trong lượt của mình, người chơi được: xây/bán nhà, thế chấp/chuộc đất, đề nghị giao dịch.

### 4.3 Tiền thuê
- R8. Đất: theo bảng; sở hữu trọn nhóm màu và chưa xây → thuê ×2.
- R9. Sân bay: 250K / 500K / 1M / 2M theo số sân bay sở hữu (1–4).
- R10. Tiện ích: 4× tổng xúc xắc (sở hữu 1) hoặc 10× (sở hữu 2), đơn vị 10.000đ.

### 4.4 Xây dựng
- R11. Chỉ xây khi sở hữu trọn nhóm màu và không có ô nào trong nhóm bị thế chấp.
- R12. Xây đều: chênh lệch số nhà giữa các ô trong nhóm ≤ 1.
- R13. Tối đa 4 nhà → nâng lên 1 khách sạn. Bán lại nhà được 50% giá.
- R14. Giới hạn ngân hàng: 32 nhà, 12 khách sạn.

### 4.5 Thế chấp
- R15. Thế chấp nhận 50% giá đất; phải bán hết nhà trong nhóm trước.
- R16. Chuộc lại = giá thế chấp + 10%.
- R17. Đất thế chấp không thu tiền thuê.

### 4.6 Nhà tù
- R18. Ra tù bằng: trả 500.000đ, dùng thẻ "Ra tù miễn phí", hoặc đổ đôi (tối đa 3 lượt).
- R19. Hết 3 lượt không ra được → bắt buộc trả 500.000đ rồi đi.

### 4.7 Giao dịch
- R20. Người chơi đề nghị trao đổi đất, tiền, thẻ ra tù với người khác; bên kia chấp nhận / từ chối.
- R21. Không giao dịch đất đang có nhà trong nhóm.

### 4.8 Phá sản & kết thúc
- R22. Không đủ tiền trả → phải bán nhà / thế chấp. Vẫn thiếu → phá sản.
- R23. Phá sản vì nợ người chơi → tài sản chuyển cho chủ nợ. Vì nợ ngân hàng → tài sản trả về ngân hàng.
- R24. Thắng: người cuối cùng còn lại. Tuỳ chọn giới hạn thời gian: hết giờ, ai tổng tài sản cao nhất thắng.

### 4.9 Thẻ Cơ hội / Khí vận
Cơ hội 16 thẻ, Khí vận 30 thẻ (16 thẻ thường + 14 thẻ "troll" đời thường: sinh nhật bồ nhí, có con riêng, vợ phát hiện quỹ đen, mẹ vợ lên chơi, khoe trúng số bị đòi khao...). Xáo khi bắt đầu, rút thẻ cuối thì đặt xuống đáy chồng. Thẻ có thể: nhận/trả tiền ngân hàng, đi tới ô, lùi ô, vào tù, giữ thẻ ra tù, sửa nhà, **trả mỗi người chơi** hoặc **nhận từ mỗi người chơi** (ai thiếu tiền thì đưa hết số đang có). Nội dung mang văn hoá Việt, ví dụ:
- "Lì xì Tết — nhận 1.000.000đ"
- "Bị phạt nguội vượt đèn đỏ — trả 500.000đ"
- "Trúng Vietlott — nhận 2.000.000đ"
- "Đi du lịch Đà Lạt — di chuyển đến Đà Lạt"
- "Tắc đường giờ cao điểm — lùi 3 ô"
- "Đóng tiền sửa nhà — 250.000đ/nhà, 1.000.000đ/khách sạn"
- "Ra tù miễn phí"

## 5. Yêu cầu chức năng online

### 5.1 Phòng chơi
- F1. Nhập tên hiển thị (không cần tài khoản), chọn quân cờ.
- F2. Tạo phòng → nhận mã 6 ký tự + link mời.
- F3. Vào phòng bằng mã/link. Phòng 2–6 người.
- F4. Chủ phòng cấu hình: số tiền khởi đầu, giới hạn thời gian ván, thời gian mỗi lượt; bấm Bắt đầu.
- F5. Không cho vào phòng khi ván đã bắt đầu (trừ người chơi cũ vào lại).

### 5.2 Trong ván
- F6. Mọi thay đổi trạng thái do server quyết định; client chỉ gửi ý định (đổ xúc xắc, mua, xây...).
- F7. Server kiểm tra hợp lệ mọi hành động; hành động sai lượt / sai luật bị từ chối kèm lý do.
- F8. Đồng hồ lượt (mặc định 60 giây). Hết giờ → tự động thực hiện hành động mặc định (đổ xúc xắc, bỏ qua mua, kết thúc lượt).
- F9. Nhật ký sự kiện hiển thị cho mọi người (ai đổ bao nhiêu, mua gì, trả ai bao nhiêu).

### 5.3 Mất kết nối
- F10. Rớt mạng → giữ chỗ 120 giây, vào lại nhận đầy đủ trạng thái hiện tại.
- F11. Quá hạn không vào lại → người chơi bị loại, tài sản trả về ngân hàng.
- F12. Đang tới lượt người rớt mạng → áp dụng F8.

### 5.4 Chơi với máy
- F13. Nút "Chơi với máy" ở trang chủ tạo phòng có sẵn 3 máy. Trong sảnh, chủ phòng thêm/bỏ máy (tổng tối đa 6 ghế).
- F14. Máy chạy trên server và đi từng bước để người chơi theo dõi (~2,5 giây sau mỗi lần đổ, ~0,8 giây sau thao tác khác). Máy mua đất khi còn tiền dự phòng, xây nhà khi đủ nhóm màu, bán nhà/thế chấp khi nợ, trả lời đề nghị giao dịch ngay. Máy chỉ chủ động giao dịch với máy khác để gom đủ nhóm màu, không gửi đề nghị cho người.
- F15. Khi không còn người nào đang chơi (phá sản, rời ván hoặc rớt mạng), ván kết thúc ngay và ai giàu nhất thắng. Phòng bị xoá khi mọi người đã rời đi.

## 6. Giao diện (UI/UX)
- U1. Màn hình: Trang chủ → Sảnh chờ phòng → Bàn cờ → Kết quả. Trang chủ/sảnh là HTML; bàn cờ là cảnh 3D.
- U2. Bàn cờ 3D: 40 ô, quân cờ 3D, nhà/khách sạn 3D, chủ sở hữu (cờ/viền màu người chơi trên ô).
- U3. Bảng người chơi (HTML overlay): tên, tiền, tài sản, trạng thái (lượt hiện tại, trong tù, mất kết nối).
- U4. Click/chạm một ô → xem chi tiết: giá, bảng thuê, chủ, số nhà.
- U5. Animation: xúc xắc 3D lăn, quân nhảy từng ô, nhà mọc lên khi xây, tiền cộng/trừ.
- U6. Hiển thị tiền dạng `2.000.000đ` hoặc rút gọn `2Tr`.
- U7. Responsive: dùng được trên màn hình ≥ 360px chiều ngang.
- U8. Âm thanh bật/tắt được.

### 6.1 Camera
- U9. Góc nhìn mặc định nghiêng ~45° toàn bàn cờ.
- U10. Người chơi xoay (kéo), zoom (cuộn/pinch) trong giới hạn; nút "về góc mặc định".
- U11. Camera tự bám theo quân đang di chuyển, trả về góc trước đó khi xong (tắt được).

### 6.2 Xúc xắc 3D
- U12. Kết quả xúc xắc do **server** quyết định (R3). Client chỉ diễn hoạt cảnh lăn sao cho mặt trên khớp kết quả server gửi về — không dùng kết quả từ mô phỏng vật lý.
- U13. Mọi client thấy cùng kết quả; hoạt cảnh có thể khác nhau, không ảnh hưởng luật.

### 6.3 Tài nguyên 3D
- U14. Mô hình dạng glTF/GLB, low-poly, phong cách thống nhất.
- U15. Mỗi nhóm màu có điểm nhấn kiến trúc địa phương (vd. Hà Nội: Chùa Một Cột; Huế: Ngọ Môn; Hội An: Chùa Cầu) — giai đoạn P2, MVP dùng ô phẳng có hình minh hoạ.
- U16. Quân cờ mang chủ đề Việt: nón lá, xích lô, áo dài, trống đồng, bánh chưng, xe máy.

## 7. Yêu cầu phi chức năng
- N1. Độ trễ hành động → mọi client thấy kết quả < 300ms (cùng khu vực).
- N2. Hệ thống chịu ≥ 100 phòng đồng thời (serverless tự co giãn; giới hạn chính là quota Supabase Realtime).
- N3. Chống gian lận: client không bao giờ tự quyết kết quả (xúc xắc, tiền, thẻ).
- N4. Engine luật chơi là logic thuần (không I/O), có unit test cho mọi luật ở mục 4.
- N5. Trạng thái ván có thể serialize/khôi phục (phục vụ vào lại và debug).
- N6. Không lưu dữ liệu cá nhân ngoài tên hiển thị.
- N7. Hiệu năng 3D: ≥ 60 FPS trên desktop tầm trung, ≥ 30 FPS trên điện thoại tầm trung (~3 năm tuổi).
- N8. Tổng dung lượng tải lần đầu ≤ 15MB (nén Draco/KTX2); tải dần mô hình chi tiết sau.
- N9. Có tuỳ chọn chất lượng đồ hoạ (Thấp/Cao): tắt bóng đổ, giảm độ phân giải trên máy yếu.
- N10. Trình duyệt không hỗ trợ WebGL2 → hiện thông báo rõ ràng.

## 8. Lộ trình

| Giai đoạn | Nội dung |
|---|---|
| P0 — Engine | Engine luật thuần TS + unit test đầy đủ mục 4 |
| P1 — MVP online | Server phòng + client 3D (bàn cờ, quân cờ, xúc xắc, nhà đơn giản), chơi trọn ván, vào lại khi rớt mạng |
| P2 — Mở rộng | Mô hình địa danh 3D chi tiết, đấu giá, chat, máy thay người rớt mạng, mức độ khó của máy, luật nhà (house rules) |
| P3 — Cộng đồng | Tài khoản, lịch sử ván, bảng xếp hạng, sự kiện Tết theo mùa |

## 9. Câu hỏi mở
- Q1. Có dùng thương hiệu thật (Vietlott, EVN, tên sân bay) không, hay đổi tên chung để tránh vấn đề bản quyền/thương hiệu?
- Q2. Hosting server ở đâu (VPS Việt Nam / Singapore)?
- Q3. Có cần chế độ khán giả (xem không chơi) không?
- Q4. Mô hình 3D tự làm (Blender), mua asset, hay thuê ngoài?
