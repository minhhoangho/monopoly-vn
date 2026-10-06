// Single source of truth for board, prices and cards (docs/requirements.md §3, §4.9).
// Prices = classic Monopoly × 10,000 VND.
const K = 10_000

export const START_MONEY = 1500 * K
export const GO_SALARY = 200 * K
export const JAIL_FINE = 50 * K
export const JAIL_SQUARE = 10
export const MAX_HOUSES = 32
export const MAX_HOTELS = 12
export const AIRPORT_RENT = [25, 50, 100, 200].map((n) => n * K)
export const UTILITY_MULTIPLIER = [4 * K, 10 * K]

export type Group = 'brown' | 'lightBlue' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'blue'

export interface Property {
  kind: 'property'
  name: string
  group: Group
  price: number
  houseCost: number
  /** rent[0] = bare land, rent[1..4] = houses, rent[5] = hotel */
  rent: number[]
}
export type Square =
  | Property
  | { kind: 'airport' | 'utility'; name: string; price: number }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'go' | 'jail' | 'parking' | 'goToJail' | 'chance' | 'chest'; name: string }
export type Ownable = Extract<Square, { price: number }>

const prop = (name: string, group: Group, price: number, houseCost: number, rent: number[]): Property => ({
  kind: 'property',
  name,
  group,
  price: price * K,
  houseCost: houseCost * K,
  rent: rent.map((r) => r * K),
})

export const BOARD: Square[] = [
  { kind: 'go', name: 'Xuất phát' },
  prop('Hà Giang', 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: 'chest', name: 'Khí vận' },
  prop('Cao Bằng', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: 'tax', name: 'Thuế thu nhập', amount: 200 * K },
  { kind: 'airport', name: 'Sân bay Nội Bài', price: 200 * K },
  prop('Mộc Châu', 'lightBlue', 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: 'chance', name: 'Cơ hội' },
  prop('Sa Pa', 'lightBlue', 100, 50, [6, 30, 90, 270, 400, 550]),
  prop('Điện Biên Phủ', 'lightBlue', 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: 'jail', name: 'Nhà tù' },
  prop('Cà Mau', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  { kind: 'utility', name: 'Công ty Điện lực', price: 150 * K },
  prop('Châu Đốc', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  prop('Cần Thơ', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  { kind: 'airport', name: 'Sân bay Đà Nẵng', price: 200 * K },
  prop('Quy Nhơn', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: 'chest', name: 'Khí vận' },
  prop('Phong Nha', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  prop('Huế', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: 'parking', name: 'Bãi đỗ xe' },
  prop('Vũng Tàu', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: 'chance', name: 'Cơ hội' },
  prop('Đà Lạt', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  prop('Nha Trang', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  { kind: 'airport', name: 'Sân bay Cam Ranh', price: 200 * K },
  prop('Ninh Bình', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  prop('Hạ Long', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  { kind: 'utility', name: 'Công ty Cấp nước', price: 150 * K },
  prop('Hội An', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: 'goToJail', name: 'Vào tù' },
  prop('Phú Quốc', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  prop('Hải Phòng', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: 'chest', name: 'Khí vận' },
  prop('Đà Nẵng', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { kind: 'airport', name: 'Sân bay Tân Sơn Nhất', price: 200 * K },
  { kind: 'chance', name: 'Cơ hội' },
  prop('Hà Nội', 'blue', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: 'tax', name: 'Thuế xa xỉ', amount: 100 * K },
  prop('TP. Hồ Chí Minh', 'blue', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
]

export const GROUP_COLORS: Record<Group, string> = {
  brown: '#8B5A2B',
  lightBlue: '#7EC8E3',
  pink: '#D9479B',
  orange: '#F28C28',
  red: '#D7263D',
  yellow: '#F4D03F',
  green: '#1E9E5A',
  blue: '#1F4E9E',
}

export const TOKENS = ['Nón lá', 'Trống đồng', 'Bánh chưng', 'Xích lô', 'Hoa sen', 'Xe máy']
export const PLAYER_COLORS = ['#E63946', '#1D7FE0', '#2A9D4B', '#F4A261', '#8E44AD', '#16A3A3']

export type Deck = 'chance' | 'chest'
export type CardEffect =
  | { type: 'money'; amount: number } // positive = receive from bank, negative = pay bank
  | { type: 'moveTo'; square: number } // forward, collects GO salary when passing
  | { type: 'moveBy'; steps: number } // negative = backwards, no GO salary
  | { type: 'goToJail' }
  | { type: 'jailFree' }
  | { type: 'repairs'; perHouse: number; perHotel: number }
  | { type: 'payEach'; amount: number } // pay every other player still in the game
  | { type: 'collectEach'; amount: number } // every other player pays you (as much as they have)
export interface Card {
  text: string
  effect: CardEffect
}

const money = (text: string, amount: number): Card => ({ text, effect: { type: 'money', amount: amount * K } })
const moveTo = (text: string, square: number): Card => ({ text, effect: { type: 'moveTo', square } })

export const CARDS: Record<Deck, Card[]> = {
  chance: [
    moveTo('Đi du lịch Đà Lạt — tiến đến Đà Lạt', 23),
    moveTo('Bay vào TP. Hồ Chí Minh — tiến đến TP. Hồ Chí Minh', 39),
    moveTo('Về vạch Xuất phát — nhận 2.000.000đ', 0),
    moveTo('Ra Hà Nội công tác — tiến đến Hà Nội', 37),
    moveTo('Khởi hành từ Nội Bài — tiến đến Sân bay Nội Bài', 5),
    moveTo('Tham quan cố đô — tiến đến Huế', 19),
    moveTo('Du thuyền vịnh Hạ Long — tiến đến Hạ Long', 27),
    { text: 'Tắc đường giờ cao điểm — lùi 3 ô', effect: { type: 'moveBy', steps: -3 } },
    { text: 'Bị bắt quả tang trốn thuế — vào tù', effect: { type: 'goToJail' } },
    { text: 'Ra tù miễn phí — giữ thẻ này đến khi dùng', effect: { type: 'jailFree' } },
    { text: 'Đóng tiền sửa nhà — 250.000đ/nhà, 1.000.000đ/khách sạn', effect: { type: 'repairs', perHouse: 25 * K, perHotel: 100 * K } },
    money('Ngân hàng trả cổ tức — nhận 500.000đ', 50),
    money('Trúng xổ số — nhận 1.500.000đ', 150),
    money('Quên đội mũ bảo hiểm — nộp phạt 150.000đ', -15),
    money('Bị phạt nguội vượt đèn đỏ — nộp phạt 500.000đ', -50),
    money('Bán đất được giá — nhận 1.000.000đ', 100),
  ],
  chest: [
    money('Lì xì Tết — nhận 1.000.000đ', 100),
    moveTo('Về vạch Xuất phát — nhận 2.000.000đ', 0),
    money('Ngân hàng nhầm lẫn có lợi cho bạn — nhận 2.000.000đ', 200),
    money('Đi khám bệnh — trả 500.000đ', -50),
    money('Đóng học phí cho con — trả 1.000.000đ', -100),
    money('Bán hàng online chốt đơn — nhận 500.000đ', 50),
    { text: 'Ra tù miễn phí — giữ thẻ này đến khi dùng', effect: { type: 'jailFree' } },
    { text: 'Bị bắt vì đua xe — vào tù', effect: { type: 'goToJail' } },
    money('Hoàn thuế thu nhập — nhận 200.000đ', 20),
    money('Thắng cuộc thi nấu phở — nhận 100.000đ', 10),
    money('Nhận thừa kế — nhận 1.000.000đ', 100),
    money('Thưởng tháng 13 — nhận 1.000.000đ', 100),
    money('Mừng cưới bạn thân — trả 500.000đ', -50),
    { text: 'Sửa đường trước nhà — 400.000đ/nhà, 1.150.000đ/khách sạn', effect: { type: 'repairs', perHouse: 40 * K, perHotel: 115 * K } },
    money('Đóng phí bảo hiểm xe — trả 500.000đ', -50),
    money('Lãi tiết kiệm — nhận 250.000đ', 25),
    // Troll cards. Append only: running games store deck order as indices into this list.
    money('Sinh nhật bồ nhí — mua túi hiệu hết 1.500.000đ', -150),
    money('Lộ chuyện có con riêng — chu cấp nuôi con 2.000.000đ', -200),
    money('Vợ phát hiện quỹ đen giấu trong ốp điện thoại — nộp lại 1.000.000đ', -100),
    money('Bồ nhí đòi chia tay — được trả lại quà 500.000đ', 50),
    { text: 'Bị vợ đuổi ra khỏi nhà — vào tù ngủ tạm', effect: { type: 'goToJail' } },
    money('Đám cưới người yêu cũ — mừng cưới 500.000đ cho đỡ quê', -50),
    money('Mẹ vợ lên chơi một tuần — bao ăn bao ở 800.000đ', -80),
    { text: 'Hôm nay sinh nhật bạn — mỗi người chơi mừng bạn 200.000đ', effect: { type: 'collectEach', amount: 20 * K } },
    { text: 'Khoe trúng số trên Facebook — cả làng đòi khao, trả mỗi người 300.000đ', effect: { type: 'payEach', amount: 30 * K } },
    money('Bị lừa "con đang cấp cứu" — chuyển khoản mất 1.000.000đ', -100),
    money('Bán hàng online bị bom hàng — lỗ 300.000đ', -30),
    { text: 'Đi nhậu say, tỉnh dậy thấy mình ở Bãi đỗ xe', effect: { type: 'moveTo', square: 20 } },
    { text: 'Crush nhắn "anh ngủ chưa?" — bối rối lùi 3 ô', effect: { type: 'moveBy', steps: -3 } },
    money('Nhặt được ví của sếp, trả lại — được thưởng 300.000đ', 30),
  ],
}
