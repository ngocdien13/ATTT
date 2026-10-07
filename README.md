# Seruchat — bản đã ghép client, server, database và Java

## 1. Có gì trong bản này?

| Thư mục | Nội dung |
|---|---|
| `client/` | Giao diện HTML/CSS; đăng ký, đăng nhập, tìm user, kết bạn, mở chat, block, tự lấy tin mới |
| `server/` | Express, session MySQL, các controller và xử lý lỗi API |
| `database/` | Schema đầy đủ và migration từ bản SQL 7 bảng đã gửi trước |
| `encryption/` | Sender.java, Receiver.java và ApiClient.java nối HTTP/session/lưu khóa local |
| `server/test/` | Kiểm tra giao thức, bảo toàn code mã hóa và kiểm thử API với MySQL |
| `docs/` | Mapping API, trường dữ liệu, kiểm chứng và giới hạn |

Giữ nguyên các thư viện trong package.json/package-lock.json của server. Chỉ cập nhật trường `main` và lệnh test. Không đưa node_modules, mật khẩu thật, khóa cá nhân hay file .class vào bộ dự án.

Ba file `client/js/encryption/keyManager.js`, `encryption.js`, `decryption.js` giữ nguyên từng byte. Các phương thức mật mã Java giữ nguyên sau khi bỏ escape do Markdown: X25519, HKDF-SHA256, info `e2ee-chat-v1`, AES-256-GCM, IV 12 byte, tag 128 bit, Base64 SPKI. `ApiClient.java` và `client/js/keyIntegration.js` chỉ nối I/O, đăng nhập, lưu/khôi phục khóa và gọi lại các hàm có sẵn.

## 2. Chuẩn bị

- Node.js hỗ trợ các phiên bản dependency đã có; bản ghép được kiểm thử với Node.js 24.
- MySQL 8.0.16 trở lên; dùng MySQL Workbench để chạy SQL.
- Nếu kiểm thử Java: JDK 21 là phiên bản đã dùng để biên dịch và chạy bản ghép.
- Trình duyệt hỗ trợ Web Crypto X25519. Mở trên `http://localhost:3000`; khi truy cập từ thiết bị khác cần HTTPS để Web Crypto hoạt động.

Giải nén ZIP. Bên trong là thư mục `seruchat`. Đặt thư mục này tại `D:\seruchat` để đúng các lệnh bên dưới. Nếu máy bạn đã có dự án ở đường dẫn đó, giữ bản cũ riêng trước khi dùng bộ đã ghép; không ghi đè cấu hình và dữ liệu cá nhân.

## 3. Database: chọn đúng một trường hợp

**A. Chưa tạo bảng:** mở `database/seruchat_full.sql` trong Workbench và chạy toàn bộ. Script tạo database `seruchat_full` và 7 bảng (schema.sql là bản tương đương dùng tên seruchat). Không xóa dữ liệu hay chèn account mẫu. Nếu đã tồn tại bảng cùng tên thì dừng, không bỏ qua lỗi.

**B. Đã chạy bản SQL 7 bảng trước khi ghép server/web:** chạy `database/migrate-from-previous-schema.sql`, không chạy schema mới thêm lần nữa. Migration giữ dữ liệu, cho phép bộ backup private key NULL đồng bộ với Receiver Java giữ key local. Browser vẫn lưu đủ backup đã mã hóa. Migration này dành riêng cho bản schema 7 bảng trước đó, không phải bảng friendships-only cũ. Sau migration này, chạy thêm upgrade-friends.sql cho database đúng tên theo docs/upgrade-local.md. Nếu đã dùng bản ghép chạy web hiện tại thì chỉ cần upgrade-friends.sql, không chạy lại migration backup key.

**C. Đã có database khác với các bản trên:** cần kiểm tra `SHOW CREATE TABLE` trước khi migration; không tự xóa database.

Kiểm tra:

```sql
USE seruchat_full;
SHOW TABLES;
SHOW CREATE TABLE public_keys;
SHOW CREATE TABLE friendships;
SHOW CREATE TABLE messages;
```

Phải có `users`, `public_keys`, `friendships`, `conversations`, `conversation_members`, `messages`, `sessions`.

## 4. Chạy server trên Windows

Mở **Command Prompt**, chạy:

```bat
cd /d D:\seruchat\server
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Mở `server\.env`, sửa theo MySQL của bạn:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=MAT_KHAU_MYSQL_CUA_BAN
DB_NAME=seruchat_full
SESSION_SECRET=DAN_CHUOI_NGAU_NHIEN_VUA_TAO_VAO_DAY
PORT=3000
NODE_ENV=development
```

Nếu MySQL root không có mật khẩu thì `DB_PASSWORD=` để trống. Giữ mật khẩu thật trên máy, không gửi lên chat/Git. `SESSION_SECRET` cần ít nhất 32 ký tự, dùng kết quả lệnh tạo ở trên.

Tiếp tục trong thư mục server:

```bat
npm ci
npm start
```

Khi thấy `Seruchat: http://localhost:3000`, mở địa chỉ đó. Server đã dùng đường dẫn client tuyệt đối từ vị trí file, không phụ thuộc bạn đang đứng ở thư mục nào.

Nếu dùng PowerShell, thay `cd /d` bằng `Set-Location D:\seruchat\server`, thay lệnh copy bằng `Copy-Item .env.example .env`.

## 5. Kiểm thử web với hai người dùng

1. Mở một cửa sổ trình duyệt thường cho tài khoản A, một cửa sổ ẩn danh cho B. Không dùng hai tab trong cùng một profile: chúng chia sẻ session đăng nhập.
2. Đăng ký và đăng nhập cả hai tài khoản. Chờ dòng `Encryption keys ready.`.
3. Ở tài khoản B, copy User ID. Tại A, nhập ID vào Find User, nhấn tìm và Kết bạn.
4. Ở B, lời mời xuất hiện trong khoảng 2,5 giây; nhấn Chấp nhận.
5. Tại danh sách Friends của A/B, nhấn Mở chat. Server tạo một conversation cho hai user.
6. Gửi `Xin chào Quân, đây là tin nhắn bí mật!`. B phải thấy đúng tiếng Việt; A cũng đọc lại được tin của mình nhờ bản mã self.
7. Gửi phản hồi từ B sang A; A tự nhận trong khoảng 2,5 giây khi tab đang mở.
8. Tải lại trang. Session và khóa local được dùng lại. Đăng nhập cùng account trên profile mới sẽ khôi phục backup bằng mật khẩu; không tự thay public key.
9. Nhấn Chặn ở danh sách Bạn bè hoặc người tìm được; hộp Yes / No hỏi trước khi thực hiện. Quan hệ chuyển thành blocked, danh sách Friends cập nhật. Tin mới và lời mời giữa hai user bị từ chối; lịch sử cũ vẫn đọc được nếu còn key.

Bản cập nhật thêm xóa bạn, bỏ chặn, hủy lời mời và gửi lại lời mời bị từ chối. Chỉ người đã chặn được bỏ chặn. Người từng là bạn được khôi phục accepted; người chưa là bạn cần lời mời mới. Xóa bạn giữ lịch sử chat và yêu cầu kết bạn lại trước khi gửi tin mới. Các thao tác chủ động có hộp Yes / No; No/Esc hủy thao tác. Máy đã tạo database 7 bảng cần chạy database/upgrade-friends.sql một lần theo docs/upgrade-local.md trước khi bật server mới.

## 6. Kiểm tra database sau khi dùng

```sql
SELECT id, username, email FROM users;
SELECT user_id, algorithm,
       (encrypted_private_key IS NOT NULL) AS has_encrypted_backup
FROM public_keys;
SELECT id, user1_id, user2_id, requested_by, status, blocked_by FROM friendships;
SELECT * FROM conversation_members;
SELECT id, conversation_id, sender_id, nonce,
       CHAR_LENGTH(ciphertext) AS ciphertext_length,
       CHAR_LENGTH(self_ciphertext) AS self_ciphertext_length
FROM messages ORDER BY created_at, id;
```

Không có cột plaintext hay AES key trong messages. `ciphertext` đã chứa GCM tag; `nonce` là IV Base64. Khóa riêng browser chỉ lên server dưới dạng backup đã mã hóa; khóa riêng Java nằm local trong thư mục `encryption/keys/`.

## 7. Kiểm thử Java với 3 terminal

**Chuẩn bị account Java:** tạo hai tài khoản A và B bằng form Create Account trên web, nhưng chưa đăng nhập web các account này. Tránh cho browser và Java Receiver tự tạo hai bộ khóa khác nhau cho cùng account.

**Terminal 1 — server:** giữ `npm start` như trên.

**Terminal 2 — Receiver B:**

```bat
cd /d D:\seruchat\encryption
chcp 65001
javac -encoding UTF-8 ApiClient.java Sender.java Receiver.java
java -Dfile.encoding=UTF-8 Receiver http://localhost:3000
```

Nhập email/mật khẩu của B khi được hỏi. Receiver lưu bộ key local, đăng ký public key và in User ID của B. Giữ terminal này chạy.

**Terminal 3 — chuẩn bị Sender A:**

```bat
cd /d D:\seruchat\encryption
chcp 65001
java ApiClient setup http://localhost:3000
```

Nhập email/mật khẩu A. Lệnh setup dùng hàm sinh key hiện có, lưu key local và đăng ký public key A để A có bản mã self. Nó in User ID A.

Trong terminal 3, gửi lời mời (thay `USER_ID_B` bằng UUID Receiver B vừa in):

```bat
java ApiClient request USER_ID_B http://localhost:3000
```

Nhập email/mật khẩu **A**. Sau đó đọc lời mời của B:

```bat
java ApiClient requests http://localhost:3000
```

Lần này nhập email/mật khẩu **B**. Kết quả JSON chứa `requests[].id`. Copy ID đó và chấp nhận:

```bat
java ApiClient accept FRIENDSHIP_ID http://localhost:3000
```

Nhập email/mật khẩu **B**. Cuối cùng gửi tin:

```bat
java -Dfile.encoding=UTF-8 Sender USER_ID_B "Xin chào Quân, đây là tin nhắn bí mật!" http://localhost:3000
```

Nhập email/mật khẩu **A**. Terminal 2 phải in JSON mã hóa và `[RECEIVER] DECRYPTED: ...`.

Các ID trên là UUID tài khoản/quan hệ, không phải username. Dùng `Ctrl + C` để dừng Receiver/server. Khi Receiver B chạy lại từ cùng thư mục, nó dùng lại khóa local và nhớ ID các tin đã giải mã thành công, không tự sinh bộ khóa mới.

**Web ↔ Java:** tài khoản web có thể gửi cho Receiver Java sau khi accepted. Java Sender có thể đăng nhập account đã có public key (kể cả account web) để gửi cho web; các bản mã tuân theo cùng giao thức. Java Receiver chưa có luồng mở backup PBKDF2 của browser: nếu account đã có key ở browser nhưng không có key Java local tương ứng, nó từ chối thay key. Ngược lại browser trên máy mới không thể tự khôi phục account Java chỉ có public key và chưa có backup. Dùng các account riêng cho lần test Java như hướng dẫn.

File `keys/<userId>/private.pkcs8` của Java là private key local, chưa được mã hóa khi lưu trên đĩa. Không gửi/commit thư mục `keys`; giữ nó để đọc tin cũ. Mất key local của account Java không có backup sẽ mất khả năng giải mã tin cũ. API từ chối thay key khác để tránh vô tình làm hỏng lịch sử.

## 8. Kiểm thử tự động

Trong server:

```bat
npm test
```

Lệnh này kiểm tra hash giữ nguyên ba file mã hóa, validation, mã hóa/giải mã tiếng Việt và từ chối bản mã bị sửa. Bộ kiểm thử MySQL được skip mặc định.

Để chạy bộ HTTP/MySQL đầy đủ bằng tài khoản MySQL được cấu hình trong .env:

```bat
set RUN_MYSQL_TESTS=1
npm test
set RUN_MYSQL_TESTS=
```

PowerShell dùng `$env:RUN_MYSQL_TESTS = '1'` rồi `npm test`, sau đó `Remove-Item Env:RUN_MYSQL_TESTS`.

Test tạo database tạm tên `seruchat_test_<random>`, chạy kiểm tra và xóa database tạm khi kết thúc. Tài khoản MySQL cần quyền CREATE/DROP database. Test không xóa database `seruchat` của ứng dụng. Dùng môi trường development.

## 9. Xử lý lỗi thường gặp

| Thông báo | Kiểm tra |
|---|---|
| Access denied for user | DB_USER/DB_PASSWORD trong .env |
| Unknown database | Chạy schema hoặc sửa DB_NAME |
| ECONNREFUSED | MySQL chưa chạy hoặc sai DB_HOST/DB_PORT |
| Table already exists khi chạy SQL | Đã tạo database; chọn đúng migration, không xóa bảng |
| Set SESSION_SECRET... | Thêm chuỗi ngẫu nhiên đủ dài trong .env |
| EADDRINUSE | Cổng 3000 đang dùng; dừng server cũ hoặc đổi PORT và URL Java |
| Public key not found | Người nhận chưa đăng nhập web/setup Receiver Java để đăng ký key |
| Cannot unlock / key on another device | Dùng mật khẩu và thiết bị giữ khóa gốc; không tự thay key |
| Not authenticated | Đăng nhập lại; web dùng session cookie, Java dùng CookieManager |
| Too many requests | Chờ Retry-After, không lặp liên tục |
| Unable to decrypt | Kiểm tra đúng account và bộ private key; tin bị sửa cũng bị từ chối |

## 10. Phạm vi hiện tại

Đây là bản ghép để chạy thử với MySQL và kiểm tra chức năng. Vẫn giữ giao thức mật mã bạn cung cấp; không bổ sung ratchet, cơ chế xác thực public key ngoài server, hoặc đổi thuật toán. Rate limiter nằm trong bộ nhớ một tiến trình; nếu chạy nhiều server cần cơ chế giới hạn chung. Lịch sử/inbox hiện tải đầy đủ, phù hợp prototype; phân trang cần làm khi dữ liệu lớn.

Trạng thái kiểm chứng cụ thể được ghi trong `docs/validation.md`.

## 11. Quan sát hoạt động trong terminal

Trong CMD tại thư mục server, chạy `set DEBUG_API=1` rồi `npm start` để hiện tên thao tác, route, HTTP status và thời gian xử lý. Log không in body, cookie, mật khẩu hay nội dung tin nhắn. Trong CMD thứ hai, chạy `node tools/watchDatabase.js` để theo dõi số bản ghi và bản mã của các tin gần nhất mỗi 3 giây, chỉ đọc database cấu hình trong .env.

Hướng dẫn cài bản cập nhật nhỏ, lệnh chạy và truy vấn xem dữ liệu trong Workbench có ở `docs/terminal-debug.md`. Các hàm mật mã và thư viện giữ nguyên; bản nâng cấp quan hệ thêm API và cột blocked_previous_status. Xem docs/upgrade-local.md để nâng database đang dùng, docs/chuc-nang-va-luong.md để hiểu từng file và luồng dữ liệu.
