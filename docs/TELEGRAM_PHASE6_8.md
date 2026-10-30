# Bản Telegram + Phase 6–8

Đọc README để chạy local. Không cần chọn nhiều bản SQL, tạo database khác hay chạy migration thủ công.

## Kiểm tra bằng ba cửa sổ riêng

Chrome thường = A; Chrome ẩn danh = B; Edge = C. Các tab thường trong cùng profile dùng chung cookie/khóa nên không dùng làm ba tài khoản.

1. Đăng ký/đăng nhập từng người, tạo PIN 8 số và cất mã khôi phục. Tài khoản cũ: khôi phục khóa cũ trước khi tạo PIN, không tạo danh tính mới thay thế.
2. ☰ → Khác → Tìm bạn, tìm tên người dùng; kết bạn và chấp nhận. Mở chat từ Bạn bè. Hội thoại xuất hiện ở danh sách chung.
3. A gửi 10 tin liên tiếp bằng Enter. B đọc được; thử Shift+Enter. Không cần xác minh fingerprint/mã qua app khác. Thử đổi chat khi đang gõ, quay lại vẫn có bản nháp; đừng reload để kiểm bản nháp vì bản nháp chưa lưu bền.
4. ⋮ ở dòng chat: ghim, lưu trữ, mở tab Lưu trữ rồi đưa ra ngoài, tắt/bật thông báo, đánh dấu chưa đọc. A đổi thiết lập không làm thay đổi của B. Ẩn danh sách không xóa lịch sử; mở từ Bạn bè hoặc tin mới sẽ hiện lại.
5. Chuột phải/nhấn bubble: reply, reaction, lưu tin; A sửa/thu hồi tin A. B không được sửa/thu hồi tin A. Ghim tin và kiểm tra thanh trên chat. Thu hồi không xóa được bản sao đã lưu/chụp trước đó.
6. ☰ → Tin nhắn đã lưu: xem tin đã lưu, thêm ghi chú, sao chép, xóa. Đăng nhập ở thiết bị mới và nhập PIN để đọc lại ghi chú. Không dùng server Admin để đọc nội dung.
7. Tạo nhóm, gửi một tin trước khi mời B; B tham gia không thấy tin trước đó. Mời C; gửi văn bản/TXT/ảnh, tải về đối chiếu bytes. Nhấn tên nhóm để mở thông tin hoặc Quản lý để đổi tên/quyền/thành viên. Chủ/admin nhóm ghim, thành viên thường không ghim. Loại C rồi gửi tin mới: C chỉ đọc được phần cũ từng nhận.
8. Nhấn tên cuộc trò chuyện, xem tab ảnh/tệp/link. Các tab này dựa trên phần lịch sử đã tải; tải cũ trong chat trước nếu cần. Link chỉ mở http/https bằng cửa sổ mới.
9. Ở cửa sổ ẩn danh mới: đăng nhập chưa mở chat ngay, phải nhập PIN/mã. Sai 5 lần thấy chờ; reload/đăng nhập lại không bỏ được chờ. Mã khôi phục vẫn là lựa chọn độc lập. Tải lại profile đã có khóa không hỏi lại PIN.
10. Dừng/chạy lại server, kiểm tra người dùng/nhóm/tin/tệp và các tùy chọn hội thoại còn nguyên. Giữ đúng `.env`, DB và thư mục ciphertext.

## Admin

Đăng ký trước rồi cấp quyền bằng CLI; xem README. `/admin` dùng session tài khoản và bắt buộc TOTP. Cần xác nhận mật khẩu khi tạo OTP, rồi thêm secret vào ứng dụng xác thực (theo thời gian, 6 số, 30 giây). Không gửi secret vào chat. OTP dùng lại bị từ chối; đồng hồ máy chủ cần đúng giờ.

Dashboard: thống kê, tìm user, phân trang, khóa/mở khóa có mật khẩu lại, đọc lý do báo cáo và đánh dấu xử lý/bỏ qua, xem kiểm tra audit-chain. Không có plaintext messages, nút lấy khóa người dùng hay tự cấp quyền qua UI. Tài khoản thường gọi API Admin nhận403; tài khoản bị khóa mất mọi phiên và không đăng nhập được.

CLI ở thư mục server:

```bash
node tools/admin.js grant email@example.com admin
node tools/admin.js revoke email@example.com
node tools/admin.js reset-mfa email@example.com
node tools/admin.js verify-audit
```

`super_admin` là vai trò vận hành bổ sung; giao diện hiện cung cấp cùng phạm vi xử lý cơ bản như admin. Cấp/thu hồi/reset MFA vẫn qua CLI host. Không phải hệ thống IAM nhiều cấp hoàn chỉnh.

## Các chi tiết nâng cấp

Migration006 chỉ thêm cột/bảng và bỏ trạng thái prepare PIN cũ; giữ nguyên users, keys, messages, groups, files. Migration001–005 giữ checksum, không sửa hay import lại. Nếu đang ở màn hình thiết lập PIN khi server được nâng cấp, thực hiện thiết lập lại vì trạng thái chuẩn bị cũ bị vô hiệu.

Tin mới gửi v2 và chữ ký tự động. Lịch sử v1 vẫn hiện, tooltip cho biết chưa có chữ ký; không cho sửa/thu hồi lịch sử cũ bằng sự kiện mới. Các thao tác chat mới dùng nội dung sự kiện mã hóa, client kiểm tra quyền từ chữ ký/roster. Không có API Admin sửa plaintext.

Kiểm thử API/crypto: `npm test --prefix server`; các bài MySQL cần `RUN_MYSQL_TESTS=1` và thông tin DB phù hợp. Chỉ chạy với tài khoản MySQL dành cho kiểm thử: chúng tạo/xóa database tên ngẫu nhiên. Không dùng database vận hành làm nơi thử phá dữ liệu.

Kiểm thử trình duyệt trong `server/e2e`: cài `npm ci` ở đó và Playwright Chromium (hoặc `E2E_BROWSER_PATH`); `npm test --prefix server/e2e`. Test sử dụng MySQL riêng tên ngẫu nhiên và có phần biên dịch Java cần JDK21. `ALLOW_LEGACY_SEND=true` chỉ được mở trong fixture để kiểm tra adapter Java cũ; composer web vẫn gửi v2. Kết quả nghiệm thu bản này nằm trong `docs/verification/release-telegram.txt`.

Phần Docker/AWS là cấu hình/hướng dẫn cần chạy thật trên host triển khai, không phải bằng chứng đã đưa dịch vụ lên Internet. Các mục chưa làm ghi rõ trong IMPLEMENTATION_STATUS.md.
