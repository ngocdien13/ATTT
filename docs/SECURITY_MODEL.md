# Mô hình bảo mật và giới hạn

## Chữ ký tự động, tin server ở mức nào?

Client tạo/khôi phục danh tính X25519 và Ed25519; khóa ký riêng nằm trong bản sao danh tính được mã hóa bằng khóa X25519 vốn có. Mỗi nội dung mới có CEK ngẫu nhiên, AES-GCM, HPKE bọc CEK cho đúng người nhận và Ed25519 ký toàn bộ envelope chuẩn hóa. Chữ ký ràng buộc người gửi, phòng, phiên thành viên, nội dung mã hóa và các bản bọc khóa. Server kiểm tra envelope/quyền trước khi lưu; client kiểm tra lại trước khi hiện nội dung. Giao diện không yêu cầu quét mã/đối chiếu fingerprint.

Server cung cấp danh bạ và khóa ban đầu. Khóa đã biết được ghi nhận ở IndexedDB; thay khóa âm thầm sẽ bị từ chối. Đây là tin server ở lần nhận khóa đầu tiên và ghi nhớ khóa sau đó, không phải key transparency có nhân chứng độc lập. Thiết bị mới chưa có bản ghi tin cậy vẫn phụ thuộc server. Nếu toàn bộ webserver bị kiểm soát, kẻ tấn công có thể thay JavaScript để lấy khóa/nội dung khi người dùng mở app; chữ ký tự động, HTTPS hay KMS không tự giải quyết nguy cơ này.

Lịch sử v1 giữ nguyên để đọc và kiểm thử Java. V1 không ký người gửi/phòng; dữ liệu cũ không được coi là đã ký. API gửi v1 mặc định đóng và production cấm mở. V2 chưa có Double Ratchet/forward secrecy: lộ khóa dài hạn có thể ảnh hưởng lịch sử đã bọc cho khóa đó.

## PIN và backup

PIN 8 số đi qua PBKDF2 600.000 vòng, tách vật liệu mã hóa và bằng chứng xác thực. Bản sao PIN còn cần gate ngẫu nhiên từ server; gate được mã hóa bằng master key. Proof được pepper rồi Argon2. Server áp dụng chờ theo tài khoản, không chỉ theo cookie/IP. Mã khôi phục ngẫu nhiên 256 bit có bản bọc độc lập và bộ đếm riêng.

Bản này sửa trạng thái `recoveryPrepare`: gate/challenge không còn là JSON rõ trong bảng sessions; cả cấu trúc được AES-GCM với khóa dẫn xuất riêng và AAD gắn user+session. Migration 006 xóa prepare cũ để người đang thiết lập thử lại. Nếu database/session cũ từng bị lấy trước khi sửa, việc nâng cấp không thu hồi bản sao đã bị đánh cắp: người vận hành cần điều tra và hướng dẫn đổi PIN/mã trên thiết bị tin cậy. Không tự đổi master key vì sẽ làm hỏng vault/OTP/audit đang có.

Mất DB đơn lẻ khi không có master key không được thiết kế để đủ brute-force PIN trực tiếp. Mất DB **và** master key làm suy yếu bảo vệ này; ứng dụng đang bị kiểm soát có thể đọc gate hợp lệ. Đây không phải thiết kế PAKE/HSM đã kiểm toán. Giữ master key ngoài bản dump DB và cất bản phục hồi offline.

## Các thao tác chat

Reply/edit/delete/react/pin là sự kiện được mã hóa/ký, không phải cột plaintext để Admin sửa. Client chỉ cho tác giả sửa/thu hồi tin của họ; chủ/admin nhóm mới ghim được. Sự kiện không hợp lệ về quyền bị bỏ qua khi dựng giao diện. Lịch sử phải tải đến tin gốc để dựng đủ trạng thái. Server vẫn có thể trì hoãn, che giấu hoặc sắp xếp dữ liệu; chưa có chứng minh đầy đủ tính nhất quán lịch sử độc lập.

Thu hồi là yêu cầu ẩn trong ứng dụng. Ciphertext/sự kiện và các bản sao/ảnh chụp có thể vẫn tồn tại. Không tuyên bố xóa mật mã. Tin đã lưu là bản riêng của người lưu; thu hồi tin gốc không tự xóa bản đã lưu. Ghi chú tối đa 200, mỗi ghi chú 12KB plaintext; server chỉ lưu IV/ciphertext.

## Admin, chống lạm dụng và vận hành

Quyền user/admin/super_admin cấp bằng CLI của người vận hành, không đọc từ form đăng ký. Mỗi API Admin kiểm tra quyền từ DB; cần TOTP đã bật và phiên nâng quyền 10 phút. TOTP chặn dùng lại counter, giới hạn số lần thử; secret OTP được mã hóa với domain/AAD riêng. Khóa tài khoản đòi mật khẩu hiện tại, tăng auth_version và thu hồi mọi phiên. Admin không có endpoint cung cấp khóa riêng hay nội dung chat rõ.

Audit dùng HMAC-chain có khóa tách domain, tuần tự hóa ghi bằng mutex DB. Kiểm tra phát hiện sửa payload, cột actor/action/target và sửa chain. Không có điểm neo bên ngoài nên không chứng minh được chống xóa đoạn cuối/rollback toàn DB; operator cần cất checkpoint độc lập. Log chỉ các hành động quản trị cơ bản, không phải bộ giám sát xâm nhập hoàn chỉnh.

Turnstile là tích hợp tùy chọn. Khi cấu hình, các luồng đăng ký/đăng nhập/gửi email xác minh/reset cần token. Server kiểm tra success, hostname, action, tuổi token, chống replay và đóng khi nhà cung cấp lỗi; không tin kiểm tra frontend. Dùng chế độ Managed để giảm thao tác cho người dùng. Chưa triển khai CAPTCHA thích ứng theo điểm rủi ro. Rate limit vẫn áp dụng độc lập.

Cookie HttpOnly/SameSite; production Secure và PUBLIC_ORIGIN HTTPS. CSRF cho API nhạy cảm, Origin check, CSP, quotas/file hash/AEAD và lưu file ngoài static. Reverse proxy chỉ được tin theo subnet cấu hình; không mở cổng app/DB ra Internet. Không dùng DEBUG_API ở production. CSP không ngăn được JavaScript hợp lệ bị server độc hại thay thế.

## Server vẫn thấy gì?

Email, profile, avatar, ngày sinh/SĐT theo chính sách, quan hệ bạn bè, tên/thành viên nhóm, phiên/IP ở tầng mạng/log, người nhận/gửi, thời điểm, kích thước, trạng thái đọc/mute/archive/pin hội thoại, lý do báo cáo. Tên/metadata tệp nằm trong phần mã hóa; payload nội dung chat/ghi chú không được lưu dạng rõ. Server biết số lượng và dung lượng bản mã. Thiết bị nhiễm mã độc hoặc XSS thực thi trong app có thể đọc nội dung/khóa đang sử dụng.

Chưa có audit độc lập, chứng nhận hay bảo đảm production. Xem runbook sự cố và các mục chưa nghiệm thu trong DEPLOY_AWS.md.
