# Bàn giao Phase 4–5

## Code thực thi

- `003_groups.js`: v2_identities, chat_groups, group_events, group_participants, group_invitations, group_avatars, v2_messages, v2_message_recipients. Roster snapshot có chữ ký/prevHash, lịch sử độc lập với chat1–1.
- `004_attachments.js`: encrypted_attachments và mutex row attachment_quota_lock; cộng quota trong transaction được serialize, không giữ DB transaction suốt thời gian upload.
- `server/src/crypto/secure-v2.mjs`: HPKE từ @hpke/core; Ed25519/WebCrypto; json-canonicalize; signing vault được dẫn xuất domain riêng từ private key X25519; schema/transition validator dùng chung Node/browser. Không sửa primitive v1.
- `groupsController.js`, `v2MessagesController.js`, `attachmentsController.js`, `services/v2.js`: identity immutable, lời mời/role/roster, kiểm tra signed envelope + exact recipients, row lock thành viên khi send/change, lịch sử lọc theo người từng được wrap khóa, lifecycle reserve→upload→ready→attached.
- `ciphertextStorage.js`: LocalCiphertextStorage stream/hash/size/opaque path, temp file riêng và atomic publication, no-overwrite, permissions; interface cho S3 tương lai. `attachmentMaintenance.js` và cleanup CLI giữ quota/dọn orphan, không xóa attachments đã công bố.
- `client/js/groups-files.js`, HTML/CSS: UI nhóm/invite/accept/reject, quản lý owner/admin/member, avatar, emoji, signed metadata, file nhóm và1–1, progress/download, preview bitmap an toàn; TOFU và head pins ở IndexedDB riêng, không localStorage plaintext.
- `client/js/vendor/secure-v2.js`: bundle build từ source/lockfile bằng esbuild, phục vụ self-hosted để giữ CSP. License đi kèm tại docs/licenses.
- Tests mới: v2Crypto, groupsFiles và browser groups-files. Migration tests mở rộng để chạy đủ001–004; GitHub CI có bước build bundle (chưa push/chạy GitHub).

## Chính sách và bảo mật

1. Tạo nhóm owner-only; người được mời ký việc thêm chính mình. Inviter cần quyền tại snapshot đã ký và tại head khi chấp nhận; server kiểm tra pending/expiry/friend/block. Replay invitation ID không được dùng lại.
2. Một content ciphertext, CEK mới256bit mỗi tin/file, HPKE-wrap cho exact member set gồm sender. AAD ràng buộc suite/version/room/sender/message/type/membership; context wrap thêm recipient/key hash. Chữ ký Ed25519 bao phủ ciphertext/nonce/wraps/file descriptor; canonical JSON, domain separation. Không có fallback v2→v1 khi lỗi.
3. Danh sách thành viên, role, title/description/avatar hash đều nằm trong signed roster chain. Server không được âm thầm thêm key vào danh sách client chấp nhận nếu không có chữ ký chuyển trạng thái hợp lệ; TOFU/head pins phát hiện thay đổi/rollback đã biết trên thiết bị. Chưa có Key Transparency/gossip để phát hiện tất cả fork hoặc first-contact substitution.
4. Tên nhóm/mô tả và avatar không E2EE. Avatar reencode, hash ký; file gửi trong chat có tên/MIME/metadata mã hóa. Public directory trả cả signing vault đã mã hóa để giữ identity proof tự nhất quán; không có private signing key plaintext. Vault cần static X25519 private key để mở.
5. File chỉ downloadable bởi recipient của message đã attach (hoặc chính uploader khi ready trước publish). Thành viên mới không có lịch sử cũ; former member giữ quyền tin/file trước khi rời. Block1–1 không tự thay roster nhóm.
6. Quota tính mọi reservation đến khi cleanup xóa thật. Ciphertext max bytes/hash được kiểm tra khi streaming, message chỉ được attach sau upload đủ và đúng phiên bản. Không nhận filename/path client làm path server. File nội dung mã hóa nên không có server-side plaintext malware scan; preview chống active content bằng magic/dimensions, decoder và canvas reencode, không iframe SVG/HTML/PDF.
7. Identity/public key immutable, dùng lại X25519 cũ. V2 signing identity tự khôi phục từ signing vault khi private key cũ mở được; không đồng nghĩa đã làm Phase6 recovery/PIN. Lộ static X25519 key có thể mở wraps lịch sử và signing vault: chưa forward secrecy/ratchet.
8. Chỉ tested modern Chromium; không có bảo đảm chống server thay JavaScript, thiết bị nhiễm malware, thành viên tự chia sẻ plaintext, hoặc server xóa dữ liệu. Bản giao thức ứng dụng cần audit độc lập trước triển khai nhạy cảm.

## Kiểm thử thực chạy

Log cuối ở `verification/phase45-tests.log`, `phase45-groups-e2e.log`, `phase45-legacy-e2e.log`, `phase45-audit.json`.

- Unit crypto: nhóm3/10/20 thành viên với chuỗi roster/lời mời ký hợp lệ; sender/self/recipients, sai private key, ciphertext/wrap/header/sender/room/version/field bị sửa; signing vault restore/mismatch; join/removal/fork/roles; encrypted file metadata/hash/GCM.
- HTTP/MySQL/storage: group genesis/invite/join/reject/roles/avatar/transfer/leave; IDOR/CSRF; new member không lấy file/tin cũ; former member không gửi/không lấy file mới; stale roster/file409; binary/hash/visibility/publish; direct file và legacy contract; boundary10MB; quota race; path traversal; cleanup orphan/temp và giữ attached file.
- Browser ba context thật: đăng nhập/restore old keys, nhóm/invite/join, textemoji, file download byte equality, PNG/JPEG/WebP preview và disguised SVG rejection, cache tamper/header sai, key substitution qua API bị pin chặn, signed rename/removal, former access, direct file, fresh browser signing restore, mobile390px, không page errors.
- Regression E2E Java/Web cũ và Phase2 UI/password/backup vẫn chạy đạt. Ba file crypto v1, Java, schema SQL gốc và migrations001/002 được giữ nguyên bytes.

Không tuyên bố đã test20 trình duyệt đồng thời hoặc email/SMS Internet/AWS/Docker/HTTPS production. Test20 thành viên là crypto/protocol, HTTP/browser integration dùng nhóm nhỏ; load test production còn cần thực hiện. Phạm vi Phase6–8 không bị gộp vào việc hoàn thành4–5.
