# Phân tích baseline Seruchat trước nâng cấp

Ngày: 29/10/2026. Nguồn duy nhất: `ngocdien13/ATTT`, nhánh main, commit `7f2894fcceb1b960e47613b561eac200b78cb58b`. Nhánh công việc: `upgrade/phase-1-foundation`. Không đưa mã từ các bản ZIP/draft khác vào baseline.

## Hiện trạng đọc từ code

- Web HTML/CSS/JS được Express phục vụ cùng origin. Không có React/Vite/build frontend.
- `app.js` quản lý đăng ký, đăng nhập, quan hệ, chat 1–1, Yes/No, polling toàn bộ lịch sử mỗi 2,5 giây.
- `authController.js`: username/email/password; email lowercase; Argon2 hash/verify; tái tạo session khi login. Username chưa duy nhất; chưa có display_name riêng, DOB/phone, email verification, reset, MFA hoặc RBAC.
- `keyIntegration.js` thay luồng I/O của getOrCreateKeyPair: giữ khóa local, từ chối API lỗi, giữ identity cũ. Khóa browser là CryptoKey trong IndexedDB. Backup PKCS8 dùng PBKDF2-SHA256 600000 vòng từ mật khẩu đăng nhập → AES256-GCM.
- `encryption.js`: lấy public X25519 từ server; tạo cặp tạm riêng cho recipient và self; X25519 → HKDF-SHA256, zero salt 32 byte, info e2ee-chat-v1 → AES256-GCM, IV12/tag128. Mỗi tin thêm một dòng với hai bản mã.
- `decryption.js`: private X25519 dài hạn + public tạm tương ứng → HKDF → GCM. Chưa có AAD ứng dụng, chữ ký hoặc xác thực public key độc lập. Không có forward secrecy khi private key người nhận bị lộ.
- Server kiểm tra session, UUID/Base64/SPKI, thành viên đúng hai người và quan hệ accepted; SQL dùng tham số. Giao thức Java có alias HTTP, public key local lưu PKCS8/SPKI rõ trên đĩa; Java chưa mở backup của browser.
- Block/remove không xóa lịch sử; chỉ blocker được unblock. Unique pair và transaction dùng khi xử lý quan hệ/conversation.
- Rate limit chỉ ở RAM; Origin/SameSite có nhưng chưa có CSRF token. Body 128KB. Chưa có CSP, Redis, upload, group hoặc phân trang.
- MySQL có users, public_keys, friendships, conversations, conversation_members, messages, sessions. Chưa có bảng role/device/profile/recovery v2.

## Phát hiện và quyết định

| ID | Phát hiện | Xử lý trong Giai đoạn 1 / kế tiếp |
|---|---|---|
| B01 | Hash được ghi trong test/manifest không khớp byte nguồn ngay ở commit baseline; đây là lỗi test sẵn có | Ghi rõ hash lịch sử và hash của commit làm việc; khóa provenance theo commit. Giữ nguyên byte ba file crypto; giữ test chức năng và bổ sung kiểm tra thực tế |
| B02 | Cache plaintext chỉ theo ID, sửa ciphertext cùng ID vẫn hiện plaintext cũ | Đã sửa: cache theo toàn bộ row; xóa khi đổi row/cuộc trò chuyện/logout; có giới hạn và chặn nạp lại sau logout |
| B03 | Khôi phục ghép public key server với private key mở từ backup nhưng chưa kiểm tra chúng khớp | Đã sửa: kiểm tra X25519 hai phía trước lưu/publish; mismatch không ghi và không tạo identity mới |
| B04 | Chưa có migration ledger/checksum, script upgrade-friends không idempotent | Đã thêm runner có lock, trạng thái lỗi, explicit resume; migration additive có kiểm tra cột và Safe Updates |
| B05 | Dependency audit baseline có body-parser/qs và mysql2 lồng trong session store bị cảnh báo | Cập nhật lock trong giới hạn package.json; override session store dùng mysql2 của app; audit lại, xem TESTING.md |
| B06 | Backup phụ thuộc password; server nhận password khi login, có thể chủ động lấy bí mật mở backup | Giai đoạn 6: recovery key entropy cao; đổi/reset password không đổi identity và không ngụ ý khôi phục E2EE |
| B07 | Public key tin server, không chữ ký/AAD ứng dụng | Giai đoạn 4/6: protocol v2, signing identity, TOFU và cảnh báo đổi khóa; không chặn mọi chat chỉ vì chưa so mã thủ công |
| B08 | Chưa token CSRF/CSP, user enumeration, weak password/OTP/role controls | Giai đoạn 2/7; không quảng cáo bản phase1 an toàn production |
| B09 | Java private key rõ; browser IndexedDB không chống malware/XSS | Migration vault/recovery ở Giai đoạn 6; giữ khả năng đọc khóa cũ |
| B10 | Full-history polling, replay nhận UUID mới, timestamp/metadata không ký | Giai đoạn 3/4/7: cursor, client message ID, signed metadata; legacy vẫn có giới hạn cũ |

## Các phần đã đọc để xác định phạm vi

README; HTML/CSS/app; ba file Web Crypto và adapter; server routes/config/controllers/middleware/utils; schema và các migration SQL; tests; Sender/Receiver/ApiClient Java; docs về API, luồng, nâng local và kết quả lịch sử. Tài liệu cũ chỉ là ghi nhận lịch sử, không phải bằng chứng các test vừa chạy.

## Giới hạn kiểm chứng

Kết nối GitHub hiện chỉ có quyền đọc. Thay đổi nằm trên nhánh local của chính repo; chưa push, tạo PR hoặc triển khai AWS. Chỉ báo cáo kết quả trong TESTING.md khi lệnh thực sự chạy. Main không bị thay đổi.
