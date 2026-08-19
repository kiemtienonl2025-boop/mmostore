# PROTUBE.STORE

Web bán YouTube Premium: đăng ký/đăng nhập, ví nội bộ, mua hàng, trang admin quản lý sản phẩm + xem đơn hàng.

## Chạy trên hosting của bạn

Cần hosting hỗ trợ **Node.js** (VPS, hoặc dịch vụ như Render/Railway/VPS cPanel có Node). Trang web thuần HTML tĩnh (Shared hosting kiểu chỉ có PHP) sẽ KHÔNG chạy được vì cần server Node xử lý đăng nhập/database.

```bash
# 1. Giải nén / upload toàn bộ thư mục lên hosting
# 2. Cài thư viện
npm install

# 3. (Khuyến nghị) đặt secret riêng cho session, không dùng mặc định
export SESSION_SECRET="chuoi-ngau-nhien-cua-ban"

# 4. Chạy server
npm start
# hoặc chạy nền bằng pm2:
# pm2 start server.js --name protube-store
```

Mặc định server chạy ở cổng 3000 — trỏ domain/reverse proxy (Nginx) về cổng này, hoặc set biến môi trường `PORT`.

## Tài khoản admin mặc định

Lần đầu chạy, hệ thống tự tạo:
- Email: `admin@protube.store`
- Mật khẩu: `admin123`

**Đổi mật khẩu này ngay** (hiện tại chưa có màn đổi mật khẩu trong giao diện — cách nhanh nhất là xoá dòng user admin trong `data.db` bằng một công cụ SQLite rồi đăng ký lại một tài khoản mới, sau đó tự sửa `role` của tài khoản đó thành `admin` trong bảng `users`. Nếu bạn muốn, tôi có thể làm thêm màn "Đổi mật khẩu" trong trang tài khoản.)

## Cấu trúc

```
protube-store/
├── server.js          # điểm khởi động
├── db.js              # schema + seed dữ liệu SQLite (file data.db tự tạo)
├── middleware/auth.js # requireAuth / requireAdmin
├── routes/
│   ├── auth.js         # đăng ký / đăng nhập / đăng xuất / /me
│   ├── products.js      # danh sách công khai + CRUD (admin)
│   ├── orders.js        # mua hàng (trừ ví) + danh sách đơn (khách/admin)
│   └── wallet.js        # nạp ví — HIỆN ĐANG LÀ DEMO, xem cảnh báo bên dưới
└── public/
    ├── index.html    # trang chủ / danh sách sản phẩm
    ├── login.html
    ├── register.html
    ├── account.html  # ví, nạp tiền demo, link admin
    ├── orders.html   # đơn hàng của tôi
    └── admin.html    # quản lý sản phẩm + xem tất cả đơn hàng
```

## ⚠️ Việc quan trọng nhất còn thiếu: thanh toán thật

`routes/wallet.js` hiện chỉ cộng tiền vào ví ngay khi bấm nút — **không kiểm tra thanh toán thật**. Đây là để bạn test luồng mua hàng, KHÔNG được để nguyên khi public trang web, vì bất kỳ ai đăng nhập cũng tự nạp tiền miễn phí được.

Để có auto nạp tiền thật qua MoMo / ZaloPay / ngân hàng:

1. Đăng ký tài khoản merchant với MoMo hoặc ZaloPay (cần giấy tờ doanh nghiệp/cá nhân tuỳ chính sách của họ), hoặc dùng dịch vụ trung gian như **Casso** / **SePay** để tự động nhận diện biến động số dư ngân hàng.
2. Họ sẽ cấp cho bạn API key/secret.
3. Sửa `routes/wallet.js`: khi khách bấm "Nạp tiền", gọi API của MoMo/ZaloPay để tạo yêu cầu thanh toán, trả về link/QR cho khách quét.
4. Sau khi khách thanh toán xong, MoMo/ZaloPay/Casso sẽ gọi ngược lại **webhook** trên server của bạn để báo "đã thanh toán thành công". Chỉ cộng tiền vào ví **trong webhook đó** — không bao giờ cộng tiền chỉ vì client-side báo "đã trả tiền", vì như vậy ai cũng có thể giả mạo.

Nếu bạn cho tôi biết bạn chọn cổng nào (MoMo, ZaloPay, hay Casso/SePay) và đã có tài khoản merchant/API key chưa, tôi sẽ viết tiếp phần tích hợp thật cho đúng cổng đó.

## Bảo mật cần làm trước khi public

- Đổi mật khẩu admin mặc định.
- Đặt `SESSION_SECRET` riêng (biến môi trường), không dùng giá trị mặc định trong code.
- Bật HTTPS trên domain, rồi bỏ comment dòng `secure: true` trong `server.js`.
- Thay route demo trong `wallet.js` bằng tích hợp thanh toán thật trước khi cho khách dùng.
