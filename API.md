> **Bản cập nhật Phase4–5:** nhóm E2EE và file mã hóa đã có code. Đọc [hướng dẫn chạy](docs/PHASE4_5_QUICKSTART.md), [bàn giao](docs/PHASE4_5_DELIVERY.md), [giao thức v2](E2EE_PROTOCOL.md) và [tiến độ](docs/IMPLEMENTATION_STATUS.md). Mốc Phase1/2 bên dưới được giữ để đối chiếu lịch sử.

## Bổ sung UI + PIN

Recovery API (session + CSRF cho writes): `GET /api/recovery/status`, `POST /api/recovery/prepare`, `POST /api/recovery/configure`, `POST /api/recovery/unlock`. Cơ chế PIN, schema request và giới hạn được mô tả trong [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md). Sau enrollment, `/api/keys/private` trả 403 và không cho ghi lại backup bằng mật khẩu.


> **Bản tiếp nối Phase 2 + UI nền Phase 3:** xem [hướng dẫn chạy](docs/PHASE2_QUICKSTART.md), [tiến độ](docs/IMPLEMENTATION_STATUS.md) và [bàn giao](docs/PHASE2_DELIVERY.md). Các mục Phase 1 bên dưới là mốc trước nâng cấp.

# API Seruchat: hiện hành và phần sẽ bổ sung

## Đã có, giữ tương thích

POST /api/auth/register, /login, /logout; GET /api/auth/me. GET /api/users/:id. Friendships: request/accept/reject/cancel/block/unblock/remove và các danh sách. POST/GET /api/conversations. POST /api/messages; GET /api/messages/:conversationId. GET /api/keys/public/:userId; POST /api/keys/public; GET /api/keys/private (chỉ owner).

Java alias /users/:id/public-key, /messages, /messages/:id vẫn theo session user. UUID là user ID, không phải username tùy ý. Chi tiết hợp đồng v1 giữ tại docs/api.md; các request body/ciphertext chưa đổi.

## Mới ở phase1

| Method/path | Kết quả |
|---|---|
| GET /health/live | 200 {status: alive}; không truy vấn DB hoặc khởi tạo session |
| GET /health/ready | 200 {status: ready} khi ledger/version/checksum hợp lệ; 503 {status: not_ready} khi cần nâng cấp/lỗi; không lộ schema/credentials |

Migration là CLI có quyền quản trị DB, không có HTTP endpoint chạy SQL. Startup production yêu cầu migration đã applied; development không tự chạy migration.

## Thiết kế API theo giai đoạn — CHƯA tồn tại trong bản phase1

| Nhóm | API dự kiến | Chính sách |
|---|---|---|
| 2 Account | /api/account/profile, /email-verification, /phone-verification, /password, /password-reset | CSRF/reauth cho writes nhạy cảm, token hash/expiry/attempts/resend cooldown, response chống enumeration |
| 2 Devices | /api/account/devices, /sessions/:id/revoke, /sessions/revoke-all | owner-only, không nhận role/user ID tùy ý để cấp quyền |
| 3 Messages | /api/v2/conversations/:id/messages?cursor=...&limit=... | cursor keyset có created_at/id, bounded limit, member-only, không tải full history vô hạn |
| 4 Groups | /api/groups, /:id/invitations, /:id/members, /:id/roster, /:id/messages | owner/admin/member; membership version, signed roster, lock/transaction chống race |
| 5 Attachments | /api/attachments, /:id/content, /:id/complete | binary ciphertext, quota, id opaque, member/key revision gating, không path người dùng |
| 6 Recovery | /api/recovery/vault, /policy | versioned ciphertext/proof, không nhận recovery key plaintext, không giả PIN6 đủ mạnh |
| 7 Admin | /api/admin/metrics, /users, /reports, /audit, /config | backend RBAC+TOTP+reauth; whitelist config; không plaintext E2EE |
| 7 Challenges | /api/security/csrf, /challenge | token session/rotation, Siteverify backend, hostname/action/expiry/replay và provider timeout |

Tên/schema cuối cùng được chốt khi triển khai từng nhóm và phải có integration tests. Không gọi các route dự kiến trên để kiểm tra bản phase1.

## API bổ sung Phase 2 và history pages

JSON error có `message`, HTTP 400/401/403/404/409/413/415/429/503 phù hợp. Rate limit trả Retry-After ở các endpoint báo 429. Không trả token email/OTP trong JSON, chỉ ID challenge SMS cho chủ tài khoản.

| Method / endpoint | Payload / kết quả | Quyền |
|---|---|---|
| GET /api/config | minAge, phoneRequired, requireEmailVerification, emailConfigured, smsConfigured; không secrets | Public |
| POST /api/auth/register | `{displayName,handle,email,password,dateOfBirth,phone?,acceptTerms:true}` → user | Public; thông tin mới bắt buộc |
| POST /api/auth/email/request | `{email}` → thông báo chung | Public/rate |
| POST /api/auth/email/confirm | `{id,token}` → xác minh một lần | Challenge |
| POST /api/auth/password/request | `{email}` → thông báo chung | Public/rate |
| POST /api/auth/password/reset | `{id,token,password}` → revoke mọi phiên, giữ backup cũ | Challenge |
| GET /api/auth/csrf | `{token}` | Session; không cache |
| POST /api/auth/password/change | `{currentPassword,password,backup:{publicKey,encryptedPrivateKey,salt,iv}}` → revoke mọi phiên | Session + CSRF; backup cần nếu đã có backup cũ |
| POST /api/auth/phone/request | `{}` → `{id,message}` | Session + CSRF; số lấy từ hồ sơ |
| POST /api/auth/phone/confirm | `{id,token}` → verified | Session + CSRF |
| GET /api/auth/sessions | `{sessions:[{id,label,created_at,last_seen_at,expires_at,current}]}` | Session; ID hash không phải cookie |
| POST /api/auth/sessions/:id/revoke | `{}` → revoke phiên thuộc chủ tài khoản | Session + CSRF |
| GET /api/profiles/me | `{profile}` có email, DOB/phone/privacy của chính mình | Session |
| PATCH /api/profiles/me | `{displayName,handle,dateOfBirth,phone,bio,showPhone,showBirthday}` | Session + CSRF; full editable fields |
| GET /api/profiles/search?q=prefix | `{users:[{id,handle,displayName}]}` tối đa20, prefix ít nhất3 ký tự | Session/rate |
| GET /api/profiles/:id | public projection; SĐT chỉ nếu verified+showPhone; sinh nhật chỉ MM-DD nếu showBirthday | Session |
| PUT /api/profiles/me/avatar | Binary PNG/JPEG/WebP ≤2MB → profile; **không JSON/Base64** | Session + CSRF |
| DELETE /api/profiles/me/avatar | `{}` JSON → profile | Session + CSRF |
| GET /api/profiles/:id/avatar | Binary WebP đã xử lý, private cache5 phút; 404 nếu chưa có | Session |
| GET /api/history/:conversationId?before=cursor | `{messages:[…],next:cursor\|null}`, ≤50 tin tăng dần trong trang; cursor không phải quyền truy cập | Thành viên; legacy API /api/messages/:id không đổi |

Email normalize trim/lowercase theo semantics đăng nhập cũ; giữ nguyên dots/+alias. Không coi alias là cùng một danh tính đã xác minh. Handle lowercase3–40 a-z0-9_; prefix `u_`+32hex dành cho profile migrate cũ. DOB ISO YYYY-MM-DD, date thực từ1900 và tuổi≥MIN_AGE. Mật khẩu mới12–128 ký tự; login vẫn chấp nhận mật khẩu cũ của tài khoản legacy. Phone VN chuẩn hóa E.164 hoặc null khi không bắt buộc. Quyền riêng tư yêu cầu boolean thật, không chuỗi.

## API nhóm/file v2 đã triển khai

Các write mới cần session + X-CSRF-Token. Lấy token tại GET `/api/auth/csrf`. JSON128KB trừ binary upload; origin cùng host/protocol. UUID lowercase. Payload mật mã nên tạo bằng SeruchatV2 từ bundle, không tự sửa JSON đã ký.

| Method / path | Nội dung / quyền |
|---|---|
| POST /api/v2/identities | `{record}` self-signed identity+encrypted signing vault; chính user, immutable, X25519 phải khớp key legacy |
| GET /api/v2/identities/:id | Authenticated directory, record self-signature và vault đã mã hóa; không private plaintext |
| POST /api/groups | `{event}` signed genesis owner-only →201 groupId |
| GET /api/groups | Tối đa200 nhóm từng tham gia, active/role |
| GET /api/groups/:id | `{events}` full signed chain≤1000; ever member hoặc pending invitee |
| POST /api/groups/:id/events | `{event}` version/prevHash đúng, actor session, signature/transition hợp lệ;409 stale |
| POST /api/groups/:id/invitations | `{invitation:{document,signature}}`; owner/admin, accepted friend, identity đã có, expiry≤7ngày |
| GET /api/groups/invitations | Lời mời pending chưa hết hạn của user, tối đa100 |
| POST /api/groups/invitations/:inviteId/reject | `{}`, chỉ invitee; join dùng signed event action join ở endpoint events |
| PUT /api/groups/:id/avatar | Binary PNG/JPEG/WebP≤2MB, owner/admin →avatarId/hash, chưa thay metadata tới khi ký update |
| GET /api/groups/:id/avatar/:avatarId | WebP đã xử lý, member/ever member/pending invitee; client kiểm tra hash trong signed roster |
| GET /api/v2/direct/:id/context | Context hai identities của conversation1–1; thành viên chat |
| POST /api/v2/messages | `{envelope}`; sender=session, đúng context/version, signature/exact wraps; group active hoặc direct accepted; text/file |
| GET /api/v2/history/:scope/:id?before=cursor | scope group/direct; `{messages:[{id,envelope,created_at}],next}` tối đa50, chỉ rows có recipient=user; old member giữ lịch sử được wrap |
| GET /api/v2/file-policy | maxFileBytes/userQuotaBytes/globalQuotaBytes/allowedExtensions, không secrets |
| POST /api/attachments | `{id,scope,scopeId,membershipVersion,rosterHash,bytes,hash}` giữ quota, UUID do client tạo trước encrypt; bytes=ciphertext bytes, hash=SHA256ciphertext;201 |
| PUT /api/attachments/:id/content | application/octet-stream; uploader/pending/not expired, exact length/hash stream;200 ready, không publish tin |
| GET /api/attachments/:id/content | Binary encrypted-ID.bin; attached recipient hoặc uploader ready; không file name/MIME gốc |
| DELETE /api/attachments/:id | `{}` JSON; hủy pending/ready chính user, không xóa file đã attach/đang upload |

Text payload/file descriptor và canonical signature/AAD ở E2EE_PROTOCOL.md. File chỉ publish sau khi POST/v2/messages bind attachment ready→attached trong cùng transaction; failure trước đó không coi là tin đã gửi. Duplicate message/invitation UUID409, invalid signature/schema400, wrong actor/permission403, not found404, size/quota413, type415, throttle429, missing-v2-identity409. Bản mã v1/các endpoint Java không đổi.
