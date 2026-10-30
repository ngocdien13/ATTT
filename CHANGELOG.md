> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## UI + PIN / 2026-10-30

- Giao diện vàng/đen theo hướng Snapchat, desktop/mobile, bỏ nhãn kỹ thuật trong chat.
- Cập nhật DOM khi dữ liệu đổi, giữ bản nháp/scroll và sửa trạng thái gửi liên tiếp; Enter gửi, Shift+Enter xuống dòng.
- PIN 8 số + mã khôi phục, chuyển đổi khóa cũ, thiết bị mới bắt buộc khôi phục, rate limit theo tài khoản tăng đến 6 giờ.
- Chống lời mời nhóm đang chờ bị gửi trùng, xử lý bản ghi trùng cũ.
- Một lệnh khởi động và một database; bỏ các file SQL entry trùng, tự cập nhật schema.


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# Changelog

## Phase 1 — 29/10/2026

Baseline: ngocdien13/ATTT @ 7f2894fcceb1b960e47613b561eac200b78cb58b.

- Thêm migration runner/CLI, checksum, advisory lock, fail-closed và explicit resume.
- Migration 001 thêm profile foundation, giữ tên/account/key/ciphertext cũ, hỗ trợ blocked_previous_status thiếu ở schema trước và khôi phục Safe Updates.
- Thêm /health/live, /health/ready; production startup yêu cầu migration đã applied.
- Sửa plaintext cache khi ciphertext cùng ID bị sửa và khi logout còn tác vụ giải mã đang chạy.
- Kiểm tra private/public X25519 tương ứng trước lưu/publish key trong adapter.
- Giữ nguyên byte ba file crypto browser so với baseline. Sửa mốc test hash bị cũ, giữ provenance/historical hash thay vì che lỗi.
- Cập nhật dependency lock để vá advisory đã phát hiện, không downgrade session store; override mysql2 lồng dùng dependency của app.
- Bổ sung regression, migration, health và browser/Java E2E; workflow CI chưa chạy trên GitHub vì chưa push.
- Thêm phân tích, kiến trúc đích, schema/API/protocol/recovery/threat model và tiến độ theo giai đoạn.

Chưa có các tính năng account verification/profile UI, group/file v2, PIN/recovery mới, Admin/MFA hoặc triển khai AWS. Các tài liệu mô tả chúng là thiết kế đích, không phải tính năng đã chạy.

## Tiếp nối — tài khoản/profile và UI nền Phase 3

Migration002 additive; VN phone/email/DOB/unique handle, profile/privacy/processed avatar; SMTP verify/reset and Twilio SMS adapter/OTP; password change atomic rewrap cùng X25519 identity; session revoke và durable account throttles. CSRF token cho account/profile mới, CSP/headers và UTC pool sessions. Giao diện mới light/dark/mobile, account/settings, bạn bè/tìm handle, emoji/client search và history pages50 tin. Không thêm nhóm/file E2EE/admin/independent recovery/AWS. Các API đăng ký mới yêu cầu nhiều field hơn; phiên legacy cần login lại.

## Phase4–5 — nhóm E2EE và binary file

Thêm migrations003/004 additive; signed/versioned roster, invitations/accept/reject, owner/admin/member/transfer/leave, metadata/avatar; HPKE Key Wrap one-content-ciphertext + Ed25519/JCS; immutable signing identity vault và TOFU/head pins. Nhóm history recipient-filtered, stale revision/replay checks. File nhóm/1–1 binary encryption/upload/download, encrypted metadata, quota lifecycle, safe image preview/progress/local storage/cleanup. Tests crypto3/10/20, HTTP/MySQL/storage10MB/quota, browsergroup/files/key tamper và Java regression. Chưa Phase6–8.
