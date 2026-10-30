# Sao lưu và khôi phục Seruchat

Hướng dẫn hiện hành cho bản UI + PIN; thay thế cơ chế chỉ dùng mật khẩu đăng nhập ở các bản trước.

## Người sử dụng

Sau đăng nhập lần đầu, tạo PIN 8 số riêng, nhập lại PIN, lưu mã khôi phục rồi mới vào chat. Tài khoản cũ giữ nguyên khóa và lịch sử khi chuyển sang PIN. Nếu chưa chuyển và từng reset mật khẩu, dùng thiết bị còn khóa hoặc mật khẩu backup cũ để mở khóa trước.

Thiết bị mới/ẩn danh đăng nhập bằng mật khẩu tài khoản nhưng cần **PIN hoặc mã khôi phục** để mở lịch sử. Trình duyệt đã lưu khóa có thể dùng lại sau đăng nhập; đây là thiết bị tin cậy. Đăng xuất không xóa khóa IndexedDB. Không hiển thị/lưu PIN dưới dạng rõ.

Mất PIN: dùng mã khôi phục hoặc vào thiết bị còn khóa → Hồ sơ & cài đặt → Đổi PIN & mã khôi phục. Cần mật khẩu hiện tại. Mã cũ vô hiệu sau khi hoàn tất đổi. Không có phê duyệt thiết bị mới qua push trong bản này.

Mất cả PIN, mã và mọi bản khóa cục bộ: không thể đọc lại lịch sử. Đặt lại mật khẩu đăng nhập không thay thế việc khôi phục khóa. Ứng dụng không tự đổi khóa của tài khoản để che lỗi khôi phục.

## Người vận hành

Sao lưu nhất quán khi server đã dừng:

1. Database MySQL đang cấu hình trong `.env` (mặc định `seruchat`).
2. Thư mục `ATTT/.data/encrypted-files` hoặc đường dẫn `ATTACHMENT_DIR`.
3. File `server/.env`, giữ nguyên `RECOVERY_MASTER_KEY` và `SESSION_SECRET`, trong kho bí mật tách biệt với database dump.

Dùng lại cả ba khi chuyển máy server. Mất khóa hỗ trợ PIN phải khôi phục đúng khóa từ bản sao; chương trình từ chối tự sinh thay thế nếu đã có vault. Không đưa cấu hình bí mật vào Git, ZIP phân phối hay chat.

Nâng cấp: giải nén bản mới, chép `.env` và `.data` từ bản cũ, dùng cùng database rồi `node start.js`. Không import schema lần nữa. Không chỉ chép database dump mà bỏ qua tệp binary.

Bản sao database cũ trước khi chuyển sang PIN vẫn có thể chứa backup mở bằng mật khẩu cũ. Bảo vệ/xử lý chúng theo chính sách lưu trữ backup. Việc chuyển sang PIN không sửa được những bản sao đã tồn tại bên ngoài ứng dụng.

Chi tiết thuật toán, giới hạn trước server bị chiếm quyền và quy trình kiểm tra: [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md). Chưa kiểm tra restore trên production/AWS trong phiên này.
