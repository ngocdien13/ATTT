# Seruchat

Ứng dụng chat cá nhân, nhóm và tệp mã hóa đầu cuối. Bản này dùng bố cục và thao tác theo hướng Telegram Web, giữ tên Seruchat: danh sách hội thoại thống nhất, menu, ghim, lưu trữ, trả lời, sửa, thu hồi và cảm xúc.

## Chạy trên Windows

Cần **Node.js 24 LTS** (đã kèm npm) và **MySQL 8.0.16 trở lên** đang chạy.

1. Giải nén vào thư mục mới. Nếu đang nâng cấp, chép nguyên `server/.env` và dữ liệu tệp cũ sang đúng vị trí; giữ nguyên database MySQL. Thư mục tệp mặc định là **`server/.data/encrypted-files`**; nếu đã đặt `ATTACHMENT_DIR` thì giữ đúng đường dẫn đó. Không import SQL lại.
2. Mở `START.cmd`, hoặc mở terminal ở thư mục có `start.js` và chạy:

```powershell
node start.js
```

3. Mở **http://localhost:3000**. Giữ cửa sổ server chạy; `Ctrl+C` để dừng.

Lần đầu chưa có cấu hình, chương trình hỏi thông tin MySQL, tự cài thư viện, tạo database `seruchat` nếu chưa có và cập nhật các bảng. Những lần sau vẫn dùng cùng lệnh. **Chỉ một database ứng dụng**, không chạy migration/SQL bằng tay. Bản này không tự xóa database khác đang có trên máy.

Nếu báo `node` hoặc `npm` không được nhận diện: cài Node.js 24 LTS, mở lại terminal rồi kiểm tra `node -v` và `npm -v`.

## Các thao tác chính

- Nút **☰**: tài khoản, Thêm tài khoản, Hồ sơ của tôi, Tin nhắn đã lưu, Danh bạ, Cài đặt và Khác. Trong **Khác** có nhóm/lời mời, tìm bạn, lọc chưa đọc/nhóm, giao diện và đăng xuất. Nút bút ở góc dưới để bắt đầu chat/tạo nhóm.
- Chat riêng và nhóm cùng một danh sách. Thư mục **Cuộc trò chuyện đã lưu trữ** hiện khi có chat được lưu trữ; dùng nút quay lại ở đầu để về tất cả. Chuột phải hoặc **⋮** ở dòng chat để mở tab mới, xem nhanh, ghim, đánh dấu chưa đọc, tắt/bật thông báo, lưu trữ hoặc xóa khỏi danh sách riêng.
- Enter gửi; Shift+Enter xuống dòng. Nhấn vào tin hoặc chuột phải để sao chép, lưu, trả lời, cảm xúc; tin của bạn có sửa và thu hồi. Ghim tin trong nhóm dành cho chủ/quản trị nhóm.
- Nhấn tên cuộc trò chuyện để xem thông tin, ảnh, tệp và liên kết **trong lịch sử đã tải**. Có nút tải lịch sử cũ trong chat. Không gửi nội dung tìm kiếm này cho server.
- **Thêm tài khoản** mở luồng đăng nhập để chuyển tài khoản đang dùng; mỗi trình duyệt vẫn có một phiên đang hoạt động. Đăng nhập sai giữ nguyên tài khoản hiện tại. Khi chuyển thành công, các tab khác đang giữ tài khoản cũ được đưa về đăng nhập. Thiết bị chưa giữ khóa vẫn cần PIN/mã khôi phục.
- Ghi chú đã lưu được mã hóa bằng khóa của bạn. Bản nháp giữ trong bộ nhớ khi chuyển chat và xóa khi đăng xuất; chưa đồng bộ bản nháp giữa thiết bị hoặc qua tải lại trang.
- Thông báo trình duyệt cần cấp quyền, hoạt động khi trang đang mở. Nội dung xem trước mặc định tắt; chưa có push khi đóng trang.

## PIN và lịch sử

Đăng ký → đăng nhập lần đầu → tạo **PIN 8 số** → lưu mã khôi phục → vào chat. Tài khoản cũ được chuyển sang PIN nhưng giữ nguyên khóa/lịch sử.

Thiết bị mới hoặc ẩn danh: đăng nhập → nhập PIN hoặc mã khôi phục → mở lịch sử. Trình duyệt đã giữ khóa được coi là thiết bị tin cậy; tải lại không hỏi PIN. Đăng xuất không xóa khóa cục bộ. Đổi PIN/mã khôi phục tại Cài đặt, cần mật khẩu hiện tại và thiết bị còn khóa.

Sai PIN 5 lần: chờ 30 giây; tiếp theo 1 phút, 5 phút, 15 phút, 1 giờ, tối đa 6 giờ. Bộ đếm theo tài khoản trong database; mở phiên mới không bỏ qua được. Mã khôi phục có bộ đếm riêng. Quên cả PIN, mã khôi phục và mất mọi thiết bị giữ khóa thì không thể khôi phục lịch sử.

## Chữ ký và mô hình bảo mật

Tin mới được mã hóa và ký tự động trên thiết bị; người nhận tự kiểm tra chữ ký. **Không có bước đối chiếu fingerprint thủ công.** Server được tin cậy trong việc cung cấp danh tính/khóa; client đã biết khóa sẽ từ chối thay khóa âm thầm. Lịch sử v1 vẫn đọc được nhưng không được nâng thành tin có chữ ký chỉ bằng cách tải lại.

Đây là dự án học tập, chưa kiểm toán độc lập. Chưa có ratchet/forward secrecy, key transparency hay bảo đảm chống server bị chiếm quyền phát JavaScript độc hại. Admin không có API đọc nội dung rõ; server vẫn thấy tài khoản, quan hệ, thành viên, thời điểm/kích thước và các metadata vận hành. Thu hồi chỉ ẩn nội dung trong ứng dụng, không xóa bản sao người nhận đã giữ.

Java cũ giữ để đọc/test tương thích v1. Giao diện web mới gửi v2; Java cũ chưa giải mã v2. Gửi v1 chỉ mở bằng `ALLOW_LEGACY_SEND=true` khi phát triển; production cấm tùy chọn này.

## Admin và triển khai

Đã có Admin cơ bản ở `/admin`: phân quyền, OTP bắt buộc, thống kê, tìm tài khoản, khóa/mở khóa có xác nhận mật khẩu, xử lý báo cáo và audit có chuỗi HMAC. Không có tài khoản Admin mặc định. Cấp quyền cho tài khoản đã đăng ký, ở thư mục `server`:

```powershell
node tools/admin.js grant email-cua-ban@example.com admin
```

Đăng nhập lại ở `/admin`, thêm khóa thiết lập vào ứng dụng xác thực TOTP và nhập OTP. Phiên quyền quản trị nâng cao kéo dài 10 phút. Xem [hướng dẫn Admin và kiểm thử](docs/TELEGRAM_PHASE6_8.md).

Có tích hợp Turnstile khi cấu hình cả hai khóa; có Docker/Compose/Caddy HTTPS, công cụ backup mã hóa và hướng dẫn EC2. **Chưa triển khai AWS thật; Docker chưa được build/chạy trong môi trường nghiệm thu này.** Xem [triển khai và khôi phục](docs/DEPLOY_AWS.md) và [mô hình bảo mật](docs/SECURITY_MODEL.md).

Tài liệu các phase cũ là lịch sử; README và các tài liệu mới bên trên là hướng dẫn hiện hành. Không có cuộc gọi, stories, bot, kênh, push nền hay toàn bộ tính năng của Telegram.

Font Roboto và họa tiết nền đi kèm trong `client/fonts` và `client/assets`; mở local không cần tải font/nền từ CDN. Các nhãn dùng tiếng Việt; tên, avatar và hội thoại lấy từ dữ liệu tài khoản, không sao chép nội dung trong ảnh mẫu. Xem nguồn và giấy phép tài nguyên tại `docs/THIRD_PARTY.md`.
