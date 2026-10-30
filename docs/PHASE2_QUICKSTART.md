# Chạy bản tài khoản/profile và giao diện mới

Đây là bản tiếp nối Phase 1, không phải dự án mới. Xem `IMPLEMENTATION_STATUS.md` để biết những giai đoạn còn lại. Node.js 24 và MySQL 8.0.16+; đã chạy kiểm thử bằng Node 24/MySQL 8.0.46. Không cần Docker để thử tại máy.

## 1. Giữ dữ liệu trước khi cập nhật

**Trên máy đang chạy bản cũ:** dừng Node bằng Ctrl+C. Giữ file `server/.env`, database MySQL và dữ liệu trình duyệt/IndexedDB. Không xóa site data, không tạo lại database cũ bằng schema.sql, không thay khóa chat. Giữ mật khẩu cũ đang mã hóa backup.

**PowerShell/Terminal trên máy có MySQL:** sao lưu database bằng lệnh sau (thay user và database đúng máy bạn). Lệnh hỏi mật khẩu tại terminal, không đặt mật khẩu trong câu lệnh.

```sh
mysqldump -u YOUR_DB_USER -p --single-transaction --routines --triggers --hex-blob --result-file=seruchat-before-phase2.sql seruchat
```

Giữ backup ở nơi riêng tư. File này chứa dữ liệu tài khoản, bản mã và backup khóa đã mã hóa; vẫn phải bảo vệ file.

Giải nén bản mới vào thư mục riêng, ví dụ `D:\ATTT-phase2`. Chép **chính file `.env` cũ** vào `ATTT/server/.env` của bản mới và giữ nguyên DB_NAME/SESSION_SECRET. Nếu chưa từng chạy dự án thì dùng `database/schema.sql` đúng một lần để tạo database mới, rồi copy `.env.example` thành `.env` và tự điền secrets.

## 2. Cài dependencies và migration

**Windows PowerShell — thư mục backend:**

```powershell
cd D:\ATTT-phase2\ATTT\server
node --version
npm --version
npm ci
npm run migrate -- status
npm run migrate -- up
npm run migrate -- check
npm start
```

**Ubuntu Terminal — thư mục backend:**

```bash
cd /duong-dan/ATTT/server
node --version
npm --version
npm ci
npm run migrate -- status
npm run migrate -- up
npm run migrate -- check
npm start
```

Nếu chưa có `node`/`npm`, cài Node.js 24 từ https://nodejs.org/en/download rồi mở terminal mới. Npm đi cùng bộ cài Node; không cần cài npm riêng. Trên Ubuntu dùng phương thức cài Node chính thức/phù hợp hệ điều hành, không sao chép node_modules từ Windows.

Migration `001_profile_foundation` và `002_accounts` phải ở trạng thái applied. Không sửa migration đã applied. Lỗi failed/checksum cần đọc hướng dẫn Phase 1, không xóa ledger để chạy lại. Migration 002 chỉ thêm dữ liệu cấu trúc; không viết lại messages hay khóa X25519.

**Trình duyệt trên cùng máy:** mở http://localhost:3000. Phiên đăng nhập cũ trước Phase 2 cần đăng nhập lại vì có cơ chế thu hồi phiên mới. Đây không phải mất khóa chat. Máy khác cần HTTPS; HTTP bằng IP LAN không đáp ứng secure context của Web Crypto.

## 3. Các bước thử trực tiếp

1. Đăng nhập tài khoản cũ, mở chat và đọc tin cũ trước.
2. Mở **Hồ sơ & cài đặt**, chọn handle dễ nhớ, thêm ngày sinh còn thiếu, đổi tên, giới thiệu, ảnh. Handle mặc định của tài khoản cũ là `u_` + UUID, vẫn có thể giữ nguyên. ID và khóa chat không đổi.
3. Dùng tài khoản khác → tab **Tìm người** → nhập ít nhất 3 ký tự handle → xem hồ sơ → kết bạn → chấp nhận → mở chat.
4. Thử emoji, tìm trong tin đã tải, sáng/tối. Lịch sử tải mỗi trang 50 tin; **Tải tin cũ hơn** để đọc tiếp. Tìm tin chỉ tìm nội dung đã tải ở thiết bị, không gửi plaintext lên server.
5. Trong cài đặt, xem danh sách phiên; thu hồi một phiên trên trình duyệt khác. Phiên đó bị từ chối ở request tiếp theo.
6. Đổi mật khẩu trong cài đặt khi còn mở được khóa. Client mã hóa lại đúng private key cũ, server cập nhật mật khẩu và backup trong cùng transaction rồi thu hồi các phiên. Dùng cửa sổ trình duyệt mới đăng nhập bằng mật khẩu mới, mở lại lịch sử.

## 4. Email thật: SMTP

Trong `server/.env`, bổ sung (không gửi những giá trị bí mật vào chat):

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
SMTP_HOST=YOUR_PROVIDER_SMTP_HOST
SMTP_PORT=587
SMTP_FROM=Seruchat <YOUR_VERIFIED_SENDER_EMAIL>
SMTP_USER=YOUR_SMTP_USERNAME
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
SMTP_ALLOW_INSECURE_TEST=false
REQUIRE_EMAIL_VERIFICATION=false
MIN_AGE=13
PHONE_REQUIRED=false
```

Dùng host, port và tài khoản SMTP do nhà cung cấp email cấp. Mật khẩu SMTP có thể là app password/SMTP credential, không mặc định là mật khẩu đăng nhập email. Cần xác minh sender/domain theo nhà cung cấp; kiểm tra spam. Tài liệu SMTP: https://nodemailer.com/smtp/ . Port 465 dùng TLS trực tiếp; cổng khác bắt STARTTLS. Không tắt kiểm tra chứng chỉ.

Khởi động lại Node sau khi sửa `.env`. Tại đăng nhập → **Xác minh email** → nhập email → mở liên kết trong thư → bấm **Tiếp tục**. Token hết hạn 10 phút, dùng một lần; gửi lại cần đợi ít nhất 60 giây và bị giới hạn theo tài khoản/IP. Liên kết chứa token trong fragment, không đưa token vào HTTP query/access log; không chia sẻ liên kết.

Sau khi đã kiểm tra email thật hoạt động, đặt `REQUIRE_EMAIL_VERIFICATION=true` rồi restart để bắt buộc xác minh khi đăng nhập. Áp dụng cả tài khoản cũ chưa xác minh: hãy cho người dùng biết trước. Không tự đánh dấu email cũ là đã xác minh. Bản mặc định false cho việc thử local/Java không có SMTP; giao diện vẫn thể hiện trạng thái chưa xác minh.

Nếu chưa cấu hình SMTP, chức năng gửi email/reset báo chưa cấu hình, không giả vờ đã gửi. Khi đã cấu hình, API request email/reset dùng thông báo chung cho cả email không tồn tại, cooldown và lỗi gửi để tránh tiết lộ tài khoản qua nội dung phản hồi; thông báo chung không phải bằng chứng email đã tới hộp thư. Kiểm tra cấu hình nhà cung cấp nếu không nhận được thư. Chưa kiểm thử gửi tới hộp thư Internet thật trong đợt này.

## 5. SMS thật: Twilio Programmable Messaging

Tạo tài khoản tại https://www.twilio.com/ và cấu hình số gửi/dịch vụ có quyền gửi tới Việt Nam theo chính sách nhà cung cấp. Lấy Account SID/Auth Token ở console. Kiểm tra quyền vùng, đăng ký sender và giới hạn trial; SMS có thể phát sinh phí của nhà cung cấp.

```dotenv
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_AUTH_TOKEN
TWILIO_FROM=YOUR_TWILIO_SENDER
```

Restart server. Trong hồ sơ lưu số Việt Nam, sau đó **Gửi mã SMS**, nhập mã 6 số, bấm xác minh. Mã 10 phút, tối đa 5 lần thử; số được chuẩn hóa E.164 bằng libphonenumber-js/max. Chỉ xác minh nếu số trong challenge vẫn khớp số đang lưu. Đổi số sẽ hủy trạng thái xác minh; số chưa xác minh không được công khai dù bật hiện SĐT.

Không có credentials thì SMS trả 503. Đợt này kiểm thử adapter và quy tắc OTP; **chưa gửi SMS thật tới mạng di động**. Tham khảo endpoint chính thức: https://www.twilio.com/docs/messaging/api/message-resource .

## 6. Quên mật khẩu và giới hạn recovery

Tại màn hình đăng nhập → **Quên mật khẩu** → nhận liên kết email → đặt mật khẩu mới. Tất cả phiên bị thu hồi. Public key, private key backup và tin cũ được giữ nguyên.

Reset qua email **không có mật khẩu cũ nên không giải mã/mã hóa lại backup khóa**. Nếu đăng nhập máy mới không mở được lịch sử, vào cài đặt → **Mở lại backup khóa cũ**, nhập mật khẩu từng dùng mã hóa backup. Mật khẩu này chỉ dùng tại client. Hoặc dùng máy còn private key trong IndexedDB. Nếu mất cả máy có khóa và mật khẩu backup cũ thì không tự giải mã được lịch sử. Recovery key độc lập/PIN là Phase 6, chưa nằm trong bản này.

## 7. Vận hành và rollback

```sh
npm run cleanup
```

Lệnh dọn rate buckets hết hạn >1 ngày và metadata challenge/session hết hạn >30 ngày, mỗi loại tối đa 10.000 bản ghi/lượt. Không xóa users/messages/keys. Nên chạy hằng ngày bằng lịch của máy chủ; chưa tự cài cron lên máy bạn.

Để rollback ứng dụng: dừng Node, dùng source Phase 1 và giữ nguyên database/`.env`; không DROP các bảng/cột mới. Vì migration runner cũ từ chối ledger có migration không có trong source, **giữ nguyên thư mục database/migrations mới** khi chạy lại mã Phase 1. Phase 1 sẽ không hiểu quản lý phiên và các biện pháp mới nên chỉ rollback tạm trong môi trường kiểm soát. Không tiếp tục đổi mật khẩu bằng cả hai phiên bản cùng lúc. Muốn rollback database chính xác phải restore backup trước nâng cấp vào database riêng và đánh giá dữ liệu mới trước khi chuyển; không ghi đè database đang hoạt động.

Chưa deploy AWS, chưa có admin/nhóm/file/recovery key độc lập trong bản này. Không mở trực tiếp cổng MySQL hay backend ra Internet chỉ để thử UI.
