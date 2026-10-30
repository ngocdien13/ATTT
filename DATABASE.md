> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## Hướng dẫn hiện hành

Chạy `node start.js`: chương trình tự dùng **một database**, tạo nền nếu mới rồi cập nhật migrations 001–005. Không import các SQL cũ theo phần lịch sử bên dưới. Migration 005 thêm recovery vault/counters và xử lý lời mời trùng; không đổi khóa/tin cũ. Chi tiết mới: [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md).


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# Database và migration

## Phần đã triển khai

`server/src/migrations/runner.js`, `server/tools/migrate.js`, `database/migrations/001_profile_foundation.js`.

Runner không tạo lại database và không chạy schema khởi tạo trên dữ liệu có sẵn. Nó kiểm tra bảy bảng/cột legacy tối thiểu, giữ advisory lock theo database, ghi checksum SHA256 của mỗi migration và trạng thái running/applied/failed trong seruchat_schema_migrations. File đã chạy bị sửa, bị mất hoặc thứ tự lệch sẽ bị từ chối. CLI status chỉ đọc, không tạo ledger.

Migration 001:

- Bổ sung blocked_previous_status nếu bản bảy bảng cũ chưa có; giữ trạng thái accepted trước block theo dấu conversation sẵn có. Lưu/khôi phục sql_safe_updates kể cả có lỗi.
- Tạo user_profiles (user_id FK/PK, handle unique, display_name, DOB/phone nullable, phone_verified_at, avatar_key, bio, quyền hiển thị và timestamps).
- Backfill display_name từ username cũ. Handle kỹ thuật `u_` + UUID không dấu gạch, không đổi username cũ và không tự quyết ai được lấy handle của tên trùng.
- DOB, phone và xác minh để NULL; privacy tắt mặc định. Chưa có API/UI profile trong phase1. Các account tạo sau migration chưa được app cũ tạo profile; luồng account ở Giai đoạn 2 sẽ đảm nhiệm việc này.
- Không UPDATE/DELETE khóa hoặc messages, không thay ciphertext; không DROP TABLE/TRUNCATE.

## Chạy trên Windows PowerShell

Dừng server, giữ bản sao dự án và export database bằng Workbench. Giữ cả dữ liệu trình duyệt và encryption/keys; backup SQL không thay thế private key local.

```powershell
cd D:\ATTT\server
npm.cmd ci
npm.cmd run migrate -- status
npm.cmd run migrate -- up
npm.cmd run migrate -- check
npm.cmd start
```

Dùng .env hiện có, DB_NAME đúng database cần nâng. Máy chưa có bảy bảng mới chạy database/seruchat_full.sql cho database mới, sau đó migrate up. Không chạy schema đó lên DB đang dùng.

## Khi migration lỗi

MySQL DDL implicit commit. Runner đánh dấu failed và không tự retry để tránh hiểu nhầm đã rollback mọi thứ. Xem status và trạng thái schema trong Workbench, đối chiếu log không chứa secrets, giữ nguyên file migration đã ghi checksum.

Sau khi kiểm tra rằng các bước đã chạy phù hợp và phần còn lại có thể chạy lại (migration 001 có kiểm tra trước CREATE/ALTER và backfill):

```powershell
npm.cmd run migrate -- status
# Chỉ dùng version/checksum thật mà lệnh status trả về, sau khi đã kiểm tra schema:
npm.cmd run migrate -- resume 001_profile_foundation CHECKSUM_SHA256_THUC_TE
npm.cmd run migrate -- check
```

Checksum sai/không có migration lỗi không được resume. Không xóa dòng ledger hoặc chỉnh checksum để che drift. Chương trình chỉ log mã lỗi, không log SQL chứa dữ liệu người dùng.

## Rollback không phá dữ liệu

Phase1 không có down migration xóa bảng/cột. Có thể quay code về commit baseline và giữ các bảng/cột additive; app cũ không dùng chúng. Đây là rollback ứng dụng, không phải undo schema. Trường hợp schema/data hỏng phải phục hồi bản sao đã kiểm tra vào database riêng, xác nhận rồi mới đổi DB_NAME; không ghi đè dữ liệu đang cần giữ. Nếu lưu lượng phát sinh sau snapshot, cần kế hoạch đối soát/PITR trước khi chuyển về snapshot.

## Các migration dự kiến (chưa có code tính năng)

| Giai đoạn | Dữ liệu bổ sung |
|---|---|
| 2 | account_security (role/status/email verified), verification tokens dạng hash/expiry/attempts, devices và session links; handle/profile APIs |
| 4 | signing identities/key revisions; groups, invitations, signed roster versions; encrypted_messages_v2, wrapped_message_keys; message IDs client và replay index |
| 5 | attachment metadata/quota/storage references; nội dung và metadata nhạy cảm vẫn ở ciphertext |
| 6 | versioned recovery vault, recovery policy và device trust; giữ backup v1 để chuyển tiếp có kiểm soát |
| 7 | security events, admin audit, reports/config có whitelist; retention và quyền truy cập |

V2 sẽ dùng bảng riêng hoặc trường nullable additive; các cột NOT NULL của messages v1 không bị ép dùng cho group ciphertext mới. Legacy schema và dữ liệu user không bị seed hoặc đặt lại bằng tài khoản mẫu.

## Bổ sung Phase 2

`002_accounts` thêm `email_verified_at`, `auth_version`, `terms_accepted_at` vào users. Thêm account_sessions, account_challenges, account_rate_limits, profile_avatars với FK/index và timestamp. Bảng avatar giữ binary WebP đã reencode (không E2EE). Không xóa profile/messages/public_keys.

Mỗi connection pool app SET SESSION time_zone='+00:00' trước query để NOW()/TIMESTAMP và driver thống nhất UTC. `account_sessions.id` là SHA-256 SID; express-mysql-session vẫn giữ session cookie data trong sessions như trước. `auth_version` tăng khi đổi/reset mật khẩu; middleware kiểm tra version+revoked_at ở mỗi request. Không lưu password/OTP/private key plaintext ở bảng mới. Dọn metadata bằng `npm run cleanup`; không xóa ledger migration.

## Migration003/004

003 thêm v2_identities, chat_groups, group_events, group_participants, group_invitations, group_avatars, v2_messages, v2_message_recipients. V2 message group_id/conversation_id nullable có CHECK chỉ một scope và FKs; recipients PK(message_id,user_id). Group events PK(group_id,version), head hash/version ở chat_groups. Historical participants giữ active=false để đọc đúng phần history đã được wrap, không cấp quyền gửi.

004 thêm encrypted_attachments (owner/scope/version/hash/expected bytes/storage UUID/state/expiry/message FK unique) và attachment_quota_lock(id=1). Transaction khóa mutex row, kiểm tra tổng bytes và insert reservation, tránh quota oversubscription. Row lifecycle pending→uploading→ready→attached; error upload về pending, attached giữ mãi tới khi có chính sách retention rõ. Không xóa file đã attach qua cleanup.

Binary ciphertext ở ATTACHMENT_DIR; database chỉ trỏ storage_key. Không có filename/MIME/file key plaintext ở bảng attachments. Tên/MIME/size plaintext nằm trong payload được mã hóa của envelope. Group name/description/processed avatar là metadata không E2EE; avatar BLOB trong MySQL được hash ký bởi roster.

Backup cần dump MySQL và copy ciphertext đồng nhất khi Node dừng. Migration không tự chuyển text legacy, không rotate public/private keys và không chạy schema init lại. Group/file data không nằm trong các schema SQL cũ; init legacy schema một lần rồi chạy đủ versioned migrations.
