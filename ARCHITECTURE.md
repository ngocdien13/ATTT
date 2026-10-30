> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## Cập nhật UI + PIN

Startup mới: `start.js` → locked dependency preparation → `server/tools/start.js` → một database + migrations tự động → Express. Recovery dùng `recovery_vaults` + secret riêng trong môi trường; PIN/mã mở cùng X25519 private key để giữ toàn bộ protocol v1/v2. Xem [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md).


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# Kiến trúc nâng cấp Seruchat

## Trạng thái

Giai đoạn 1 đã triển khai nền tảng bảo toàn/migration và sửa hai lỗi tương thích. Phần kiến trúc đích dưới đây là thiết kế cho Giai đoạn 2–8, chưa phải danh sách tính năng đang chạy. Toàn bộ yêu cầu được giữ trong docs/UPGRADE_REQUIREMENTS.md; tiến độ ở docs/IMPLEMENTATION_STATUS.md.

## Kiến trúc hiện tại

Trình duyệt/Java → HTTPS khi triển khai (localhost HTTP khi học) → Express phục vụ web/API → MySQL. Crypto diễn ra tại client. Server xác nhận session/quyền và lưu metadata/bản mã. Java và browser dùng chung v1 nhưng vòng đời khóa/backup khác nhau.

## Kiến trúc đích

- Giữ frontend JavaScript, chia thành module UI, account, conversation, group, attachments, crypto, storage/recovery. Bản cũ nhỏ, không cần đưa React/Vite vào chỉ để thay giao diện. Theme sáng/tối, layout responsive, reduced-motion và keyboard access thuộc Giai đoạn 3.
- Caddy là cửa vào HTTPS duy nhất; Express ở mạng nội bộ. MySQL cho dữ liệu/phiên bền vững; Redis cho rate limit, thử OTP/challenge và tác vụ có TTL. Không publish Express/MySQL/Redis.
- Schema hiện có được giữ cho legacy DM. Thêm bảng bên cạnh cho profile/account security/device, group roster và envelope v2. Không đưa group nhiều người vào truy vấn legacy vốn giả định đúng hai thành viên.
- Email/SMS/Turnstile qua provider adapter: production thiếu cấu hình thì báo chưa khả dụng/fail closed, không gửi OTP giả. Không đưa token vào log. Tài khoản mới cần email verification; account cũ có chính sách chuyển tiếp rõ, không tự đánh dấu đã xác minh.
- Attachment: binary ciphertext ngoài web root, ban đầu volume/EBS; interface storage cho S3. Metadata tên/MIME được đưa vào payload E2EE. Avatar là loại upload công khai riêng, kiểm tra magic bytes và re-encode/strip metadata.
- Chat mới: CEK ngẫu nhiên, mã hóa nội dung một lần, HPKE wrapping CEK cho từng recipient gồm cả sender; Ed25519 ký envelope. TOFU và lưu dấu khóa trên thiết bị, cảnh báo/duyệt thay đổi. Xem E2EE_PROTOCOL.md.
- Recovery chính: client tạo recovery key 256 bit, backup cùng X25519 cũ và khóa ký trong vault AEAD. PIN-only chưa được quảng cáo là an toàn khi chưa có cơ chế chống offline guessing. Xem BACKUP_RECOVERY.md.
- Admin cùng host tại /admin; RBAC backend, TOTP, re-auth, audit không chứa nội dung chat. Không có role do client tự chọn, không có mật khẩu admin mặc định.

## Tính tương thích và triển khai theo bước

1. Giữ ba file crypto v1 đúng byte của baseline, giữ endpoint legacy/Java. Tin cũ không được gắn nhãn signed/E2EE v2 giả.
2. Migration additive có ledger/checksum và single-writer lock; tiến hành khi app dừng. DDL MySQL không rollback cả chuỗi, vì vậy migration lỗi phải dừng và được xem xét trước resume.
3. Thêm profile/verification sau nền migration; tách handle duy nhất khỏi username lịch sử có thể trùng. Migration không đoán DOB hoặc quyền sở hữu số điện thoại.
4. Đưa UI mới lên trước khi bật gửi v2; đọc v1 và v2 theo version rõ, không fallback im lặng sau lỗi xác thực.
5. Bật group/file/recovery sau kiểm thử membership race, wrap recipient và restore. Thay đổi password/reset phải phối hợp vault, không làm mất khả năng đọc lịch sử.
6. Docker/AWS là bước cuối; cần domain, tài khoản AWS, provider email/SMS và Turnstile do chủ dự án cấu hình. Chưa có triển khai cloud trong bản này.

## Readiness hiện đã chạy được

/health/live trả trạng thái tiến trình. /health/ready kiểm tra ledger migration, trả 503 khi pending/failed/drift. Startup production từ chối chạy khi migration chưa hoàn thành; development vẫn dùng được luồng cũ để chuyển tiếp. Không tự chạy DDL trong startup.

## Nguồn thiết kế

RFC 9180: https://www.rfc-editor.org/rfc/rfc9180.html (HPKE; không tự có replay prevention hoặc forward secrecy trước lộ private key người nhận).
MySQL atomic DDL: https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html (atomic DDL khác transactional DDL).
Các lựa chọn thư viện cụ thể phải được khóa phiên bản và kiểm tra test vector/audit khi triển khai giao thức mới; hiện chưa thêm thư viện mật mã mới.

## Kiến trúc thực thi bổ sung Phase 2

Frontend vẫn vanilla JS + Web Crypto. `account.js` quản lý profile/verification/password/device cùng API thực; `theme.js` chỉ lưu lựa chọn sáng/tối trong localStorage, không lưu token/password/plaintext chat. HTTP mới có CSRF token cho account/profile, cùng session/Origin/content-type checks; `auth.js` kiểm tra auth_version và account_sessions của mỗi request. Metadata quản lý tài khoản riêng với tables/contract legacy chat.

Adapter email SMTP qua Nodemailer (TLS, timeout, không debug credentials); adapter SMS gọi Twilio Messages API với timeout. Challenge chỉ lưu HMAC, có transaction consume/attempts/expiry. Avatar decoded và reencoded binary WebP, không liên quan giao thức file E2EE tương lai. API history riêng để frontend tải50 tin và không poll full history. Chưa đổi sang React, WebSocket hay giao thức nhóm mới.

## Delta Phase4–5 đã chạy

Nhóm có tables/controller/validator/chain riêng, không đưa group3người vào conversation_members v1 vốn đúng2người. Crypto module shared server/browser, bundle self-hosted. Server serialize roster/send bằng group row; client verify canonical signatures và pin. V2 signing vault phụ thuộc legacy X25519, giữ khả năng restore mà không đổi khóa.

Binary files theo hai bước reserve/upload rồi signed message bind attachment. LocalCiphertextStorage stream xuống thư mục ngoài web root, no filename client; có port cho future S3 adapter, chưa S3 implementation. Plaintext tên/MIME nằm trong encrypted payload. Direct v2 files dùng conversation cũ nhưng v2_messages riêng; web merge cards cùng text v1, Java vẫn chỉ text1–1 v1.
