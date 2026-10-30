# Giao thức đang chạy — legacy v1 và nhóm/file v2

## Recovery mới

PIN/mã khôi phục độc lập thay cơ chế tự mở backup bằng mật khẩu sau enrollment, không thay ciphertext/identity hay giao thức chat dưới đây. Giao thức recovery: [docs/RECOVERY_AND_POLISH.md](docs/RECOVERY_AND_POLISH.md).


## Legacy v1 được bảo toàn

Ba file client/js/encryption và các Java clients không đổi byte. X25519→HKDF-SHA256(salt32zero, info e2ee-chat-v1)→AES256GCM, IV12/tag128. Mỗi tin1–1 có bản mã recipient/self, mỗi bản dùng ephemeral X25519 riêng; SPKI DER Base64/PKCS8. Backup v1 dùng PBKDF2-SHA256600000/password/salt16 và AESGCM IV12. Legacy chưa có signature/AAD ứng dụng, ratchet hoặc xác minh khóa độc lập. Phase4–5 không tự nâng ciphertext cũ lên v2 hoặc làm private key mới.

## V2 đã triển khai cho nhóm và file

Source chuẩn: server/src/crypto/secure-v2.mjs; bundle client tạo bằng npm run build:v2. Suite `SC2-X25519-HKDFSHA256-AES256GCM-ED25519`:

- Content/file CEK32bytes ngẫu nhiên, AES256GCM IV12/tag128. Text chỉ có một ciphertext chung. File binary và metadata dùng cùng CEK, nonce độc lập được kiểm tra không trùng và AAD domain riêng.
- HPKE RFC9180 Base mode qua @hpke/core: DHKEM(X25519,HKDF-SHA256), KDF HKDF-SHA256, AEAD AES256GCM. Mỗi recipient có sender context mới/enc32bytes/wrapped CEK48bytes. HPKE quản lý nonce nội bộ; không tái dùng context.
- Ed25519 WebCrypto ký canonical JSON bằng json-canonicalize với prefix domain+NUL. KeyWrap base mode được xác thực ở tầng application signature bao phủ toàn manifest, không gọi HPKE Base là Auth mode.
- Identity Ed25519 tạo ngẫu nhiên, immutable, public proof gắn userId và public X25519 cũ. Private Ed PKCS8 mã hóa AESGCM bằng khóa HKDF-SHA256 từ PKCS8 private X25519, salt32zero/info seruchat/v2/signing-vault-key, AAD gồm userId và cả hai public key. Không lấy mật khẩu login làm khóa vault mới; muốn mở vault vẫn phải có private X25519 cũ.

## Roster và quyền thay đổi

Mỗi event `{document,signature}`: document có v2, id nhóm, version, prevHash, actorId, action, name, description, avatarId/hash, members sorted, invitation hoặc null. Member gồm id/role/encryptionKey/signingKey. Hash event là SHA256 canonical cả document+signature. Genesis đúng1 owner; mọi version sau nối đúng hash trước, chỉ tăng1. Member đã có không tự đổi encryption/signing keys.

Create chỉ owner. Join chỉ thêm actor ở role member, có invitation Ed25519 của owner/admin với group/invitee/issuedHash/expiry/UUID. Client xác minh inviter có quyền trong snapshot phát lời mời và trong head trước join; invite ID chỉ dùng một lần. Server kiểm tra pending,expiry và accepted friendship/block. Update metadata owner/admin; remove admin chỉ owner; owner không được remove; role/transfer chỉ owner; owner muốn leave phải transfer trước. Transition validator dùng ở server và browser.

Server khóa row chat_groups rồi kiểm tra head/version khi ghi event hoặc tin; kiểm tra wrapped recipient set đúng snapshot. Đổi member/role/metadata làm tin soạn với version cũ bị409; không tự wrap thêm người rồi gửi thay sender.

## Message envelope

```text
{header,iv,ciphertext,wraps,file,signature}
header = {id,v:2,suite,scope,scopeId,senderId,type,membershipVersion,rosterHash,attachmentId}
wraps[] = {recipientId,keyId,enc,ciphertext}
file = null | {id,iv,bytes,hash}
```

AAD payload = canonical `{domain:'seruchat/payload/v2',header}`. File binary dùng domain seruchat/file/v2. HPKE info và wrap AAD gồm domain seruchat/cek-wrap/v2, header, recipientId, SHA256 recipient SPKI. Chữ ký message dùng domain seruchat/message/v2 và body trừ signature, bao phủ mọi wraps/file descriptor. Unknown field/suite/version/room/sender/recipient mismatch bị từ chối, không fallback legacy.

Text payload `{text}`. File payload `{name,mime,size}` được mã hóa, file.hash là SHA256 ciphertext binary (không hash plaintext), binary size=plaintext+16. CEK không lên server. Key ID là hash public SPKI để binding thuật toán, không tạo bước bắt đối chiếu fingerprint thủ công.

Server unique message UUID + atomic message/recipient/attachment binding. Client verify ID so với signed header, đúng room/version/roster, signature, wraps, rồi decrypt metadata/content. Binary được kiểm tra byte count/ciphertext hash và GCM. Cache dựa toàn envelope; thay ciphertext/header không giữ plaintext cũ. Timestamp hiển thị do server cấp, không nằm trong signature và không được dùng làm bằng chứng thời gian tin cậy.

## Lịch sử và pin

v2_messages/v2_message_recipients tách khỏi messages v1. API mỗi trang50, chỉ trả row đã có wrap cho user. New member không có wrap/history/file trước join; former member vẫn đọc phần đã được wrap trước leave và không có wrap mới. Direct file dùng cùng v2 trên conversation1–1 với hai immutable identities; text1–1/Java vẫn v1.

TOFU encryption+signing key và head version/hash lưu trong IndexedDB seruchat-v2-trust theo tài khoản/peer/group, không auto-accept thay đổi. Client kiểm tra full signed chain; group ID nhận về phải khớp ID yêu cầu. Pin được giữ khi logout, nhưng mất khi xóa site data hoặc dùng máy mới. Chưa có transparency/gossip/checkpoint chống mọi server equivocation, chưa có forward secrecy hay post-compromise security. Khóa lần đầu/new device và JavaScript phát từ server vẫn có giới hạn tin cậy.

Nguồn thuật toán: https://www.rfc-editor.org/rfc/rfc9180.html ; https://www.rfc-editor.org/rfc/rfc8785.html ; implementation https://github.com/dajiaji/hpke-js . Bản application protocol này chưa audit độc lập; test roundtrip/âm không thay thế audit.
