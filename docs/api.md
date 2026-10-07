# API và mapping bản ghép

Mọi route bên dưới, trừ register/login, yêu cầu session cookie do `/api/auth/login` cấp. Browser cùng origin tự gửi cookie; Java dùng CookieManager. Không lấy senderId/userId chủ sở hữu từ body.

| Method | Route | Request | Response thành công |
|---|---|---|---|
| POST | `/api/auth/register` | username, email, password | 201, `{message,user}` |
| POST | `/api/auth/login` | email, password | 200, `{message,user}`, session cookie |
| GET | `/api/auth/me` | — | 200, `{user}` |
| POST | `/api/auth/logout` | `{}` | 200, `{message}` |
| GET | `/api/users/:id` | UUID trong URL | 200, `{user,relationship}` |
| POST | `/api/friendships/request` | targetUserId | 201, `{message,friendshipId}` |
| GET | `/api/friendships/requests` | — | `{requests:[...]}` |
| GET | `/api/friendships/outgoing` | — | `{requests:[...]}`, lời mời do mình gửi |
| POST | `/api/friendships/:id/cancel` | `{}` | `{message}`, chỉ người gửi và pending |
| POST | `/api/friendships/:id/accept` | `{}` | `{message}` |
| POST | `/api/friendships/:id/reject` | `{}` | `{message}` |
| GET | `/api/friendships` | — | `{friends:[...]}` |
| POST | `/api/friendships/block` | targetUserId | `{message}` |
| POST | `/api/friendships/remove` | targetUserId | `{message}`, chỉ accepted, giữ lịch sử |
| POST | `/api/friendships/unblock` | targetUserId | `{message,friendshipRestored}`, chỉ blocked_by |
| GET | `/api/friendships/blocked` | — | `{users:[...]}`, những user chính mình đã block |
| POST | `/api/conversations` | friendId | 201 nếu mới, 200 nếu đã có; `{conversationId,message}` |
| GET | `/api/conversations` | — | Array: conversation_id, user_id, username, friendship_status, blocked_by, blocked_previous_status |
| POST | `/api/keys/public` | publicKey, algorithm, backup tùy chọn đủ bộ | `{message}` |
| GET | `/api/keys/public/:userId` | — | `{publicKey,algorithm}` |
| GET | `/api/keys/private` | — | Backup đã mã hóa của chính session user |
| POST | `/api/messages` | conversationId và 6 trường mã hóa | 201, `{message,messageId,conversationId}` |
| GET | `/api/messages/:conversationId` | — | Array tin nhắn cho thành viên conversation |

Các trường mã hóa trong POST messages: `ciphertext`, `nonce`, `senderPublicKey`, `selfCiphertext`, `selfNonce`, `selfPublicKey`. API lưu vào các cột snake_case tương ứng. GCM tag đã nằm trong ciphertext, không tách/thay đổi.

Backup key trong POST keys: `encryptedPrivateKey`, `salt`, `iv`, lưu thành `encrypted_private_key`, `encryption_salt`, `encryption_iv`. Nếu bỏ backup thì phải bỏ cả ba trường, dành cho Java giữ private key local. Cùng một public key được phép thêm backup; public key khác đang đăng ký trả 409. GET private không có backup trả 404.

## Route tương thích Java

| Method | Route | Mapping |
|---|---|---|
| GET | `/users/:id/public-key` | Public key; id là UUID |
| POST | `/users/:id/public-key` | `{publicKey}`; id phải là session user |
| POST | `/messages` | `{to,iv,ciphertext,senderPublicKey,selfCiphertext,selfNonce,selfPublicKey}`; to là UUID, iv → nonce; tự tìm/tạo chat nếu accepted |
| GET | `/messages/:id` | Chỉ inbox của session user, array `{id,iv,ciphertext,senderPublicKey}`, 204 nếu không có tin |

Receiver chuyển array inbox thành từng payload rồi gọi nguyên hàm receiveMessage. Không xóa tin khỏi server. Java nhớ ID các tin giải mã thành công, tránh bỏ sót tin khi các transaction commit khác thứ tự.

## Mã lỗi

| Mã | Trường hợp |
|---|---|
| 400 | Thiếu/sai kiểu, UUID/Base64/SPKI không hợp lệ, tự kết bạn/block/chat |
| 401 | Chưa đăng nhập hoặc phiên đã hết |
| 403 | Sai người nhận lời mời, không thuộc chat, chưa accepted, bị block, publish key của người khác, cross-origin write |
| 404 | User/key/lời mời không tồn tại, route không tồn tại |
| 409 | Trùng email/cặp bạn, lời mời không còn pending, public key khác, xung đột transaction cần thử lại |
| 413 | Body JSON vượt giới hạn 128 KB |
| 429 | Vượt giới hạn tần suất, có Retry-After |
| 500 | Lỗi hạ tầng/cấu hình không dự kiến; không lộ nội dung lỗi SQL cho client |

Giới hạn hiện tại: register/login 15/phút/IP; thao tác kết bạn/block 20/phút/user; send 30/10 giây/user; publish key 10/phút/user; tạo chat 30/phút/user. Browser giới hạn nội dung gửi 8192 byte UTF-8; API giới hạn từng ciphertext 32768 byte sau decode.

Accepted/pending/rejected/blocked giữ trong một dòng quan hệ. Một người chặn được lưu trong blocked_by. Có bỏ chặn do chính blocked_by thực hiện; chưa có hai chiều block độc lập. blocked_previous_status giữ accepted để bỏ chặn khôi phục bạn bè; người chưa là bạn cần lời mời mới. Xóa bạn/hủy lời mời xóa dòng quan hệ, không xóa chat/tin. Rejected được phép gửi lại pending, vẫn áp dụng rate limit. Các thao tác block, tạo chat và gửi tin đều khóa friendship trong transaction; tạo chat dùng locking read để không lấy snapshot cũ.
